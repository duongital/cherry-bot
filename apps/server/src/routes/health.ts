import { Hono } from "hono";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { createDb, type Db } from "../db";
import {
  healthConversation,
  healthMessage,
  symptomLog,
  symptomLogEntry,
} from "../schema";
import {
  analyzeSymptoms,
  HealthAnalysisError,
} from "../health/analyze";
import {
  analyzeRequestSchema,
  createConversationSchema,
  createLogSchema,
  normalizeSymptomName,
  toHealthConversation,
  toHealthMessage,
} from "../lib/health";
import {
  decodeCursor,
  encodeCursor,
  formatZodError,
} from "../lib/items";
import { logError, logInfo } from "../lib/logger";
import type { AppEnv } from "../types";

const health = new Hono<AppEnv>();

const listLimitSchema = z.coerce.number().int().min(1).max(100).default(30);
const statsDaysSchema = z.coerce.number().int().min(1).max(365).default(30);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header("Cache-Control", "no-store");
}

function validationResponse(c: any, error: z.ZodError) {
  return c.json(
    { error: { code: "VALIDATION_ERROR", message: formatZodError(error) } },
    422,
  );
}

async function readJsonBody(c: any): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: Response }
> {
  try {
    return { ok: true, data: await c.req.json() };
  } catch {
    return {
      ok: false,
      response: c.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid JSON",
          },
        },
        400,
      ),
    };
  }
}

async function findOwnedConversation(
  db: Db,
  userId: string,
  conversationId: string,
) {
  const [row] = await db
    .select()
    .from(healthConversation)
    .where(
      and(
        eq(healthConversation.id, conversationId),
        eq(healthConversation.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function conversationTitle(message: string): string {
  const title = message.trim().replace(/\s+/g, " ").slice(0, 60).trim();
  return title || "Health conversation";
}

health.post("/analyze", async (c) => {
  const userId = c.get("user").id;
  const body = await readJsonBody(c);
  if (!body.ok) return body.response;

  let input: z.infer<typeof analyzeRequestSchema>;
  try {
    input = analyzeRequestSchema.parse(body.data);
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(c, error);
    throw error;
  }

  const apiKey = c.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return c.json(
      {
        error: {
          code: "LLM_NOT_CONFIGURED",
          message: "The health assistant is not configured",
        },
      },
      503,
    );
  }

  const db = createDb(c.env.DATABASE_URL);
  const now = new Date();

  let conversation = input.conversationId
    ? await findOwnedConversation(db, userId, input.conversationId)
    : null;

  if (!conversation) {
    const id = crypto.randomUUID();
    [conversation] = await db
      .insert(healthConversation)
      .values({
        id,
        userId,
        title: conversationTitle(input.message),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  } else {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(healthMessage)
      .where(eq(healthMessage.conversationId, conversation.id));

    if (count === 0) {
      [conversation] = await db
        .update(healthConversation)
        .set({ title: conversationTitle(input.message), updatedAt: now })
        .where(eq(healthConversation.id, conversation.id))
        .returning();
    }
  }

  const userMessageId = crypto.randomUUID();
  const [userMessage] = await db
    .insert(healthMessage)
    .values({
      id: userMessageId,
      conversationId: conversation.id,
      userId,
      role: "user",
      content: input.message,
      createdAt: now,
    })
    .returning();

  let form;
  const analysisStartedAt = Date.now();
  try {
    form = await analyzeSymptoms(input.message, {
      apiKey,
      model: c.env.HEALTH_AGENT_MODEL,
    });
  } catch (error) {
    logError("health.analyze.failed", {
      requestId: c.get("requestId"),
      userId,
      conversationId: conversation.id,
      durationMs: Date.now() - analysisStartedAt,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });

    if (error instanceof HealthAnalysisError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        502,
      );
    }
    return c.json(
      {
        error: {
          code: "LLM_UNAVAILABLE",
          message: "The health assistant is temporarily unavailable",
        },
      },
      502,
    );
  }

  logInfo("health.analyze.completed", {
    requestId: c.get("requestId"),
    userId,
    conversationId: conversation.id,
    durationMs: Date.now() - analysisStartedAt,
    symptomCount: form.items.length,
  });

  const assistantNow = new Date();
  const [assistantMessage] = await db
    .insert(healthMessage)
    .values({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      userId,
      role: "assistant",
      content: form.message,
      form,
      createdAt: assistantNow,
    })
    .returning();

  await db
    .update(healthConversation)
    .set({ updatedAt: assistantNow })
    .where(eq(healthConversation.id, conversation.id));

  noStore(c);
  return c.json({
    conversationId: conversation.id,
    userMessage: toHealthMessage(userMessage),
    assistantMessage: toHealthMessage(assistantMessage),
  });
});

health.get("/conversations", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DATABASE_URL);

  let limit: number;
  try {
    limit = listLimitSchema.parse(c.req.query("limit") ?? "30");
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(c, error);
    throw error;
  }
  const cursor = decodeCursor(c.req.query("cursor") ?? "");

  const conditions = [eq(healthConversation.userId, userId)];
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(healthConversation.updatedAt, cursorDate),
        and(
          eq(healthConversation.updatedAt, cursorDate),
          lt(healthConversation.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(healthConversation)
    .where(and(...conditions))
    .orderBy(desc(healthConversation.updatedAt), desc(healthConversation.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  noStore(c);
  return c.json({
    conversations: page.map(toHealthConversation),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: last.updatedAt.toISOString(),
            id: last.id,
          })
        : null,
  });
});

health.post("/conversations", async (c) => {
  const userId = c.get("user").id;
  const body = await readJsonBody(c);
  if (!body.ok) return body.response;

  let input: z.infer<typeof createConversationSchema>;
  try {
    input = createConversationSchema.parse(body.data ?? {});
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(c, error);
    throw error;
  }

  const db = createDb(c.env.DATABASE_URL);
  const now = new Date();
  const [conversation] = await db
    .insert(healthConversation)
    .values({
      id: crypto.randomUUID(),
      userId,
      title: input.title ?? "New conversation",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  noStore(c);
  return c.json(toHealthConversation(conversation), 201);
});

health.get("/conversations/:id/messages", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DATABASE_URL);
  const conversation = await findOwnedConversation(
    db,
    userId,
    c.req.param("id"),
  );

  if (!conversation) {
    return c.json(
      {
        error: { code: "NOT_FOUND", message: "Conversation not found" },
      },
      404,
    );
  }

  const messages = await db
    .select()
    .from(healthMessage)
    .where(
      and(
        eq(healthMessage.conversationId, conversation.id),
        eq(healthMessage.userId, userId),
      ),
    )
    .orderBy(asc(healthMessage.createdAt), asc(healthMessage.id));

  noStore(c);
  return c.json({
    conversation: toHealthConversation(conversation),
    messages: messages.map(toHealthMessage),
  });
});

health.delete("/conversations/:id", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DATABASE_URL);

  const deleted = await db
    .delete(healthConversation)
    .where(
      and(
        eq(healthConversation.id, c.req.param("id")),
        eq(healthConversation.userId, userId),
      ),
    )
    .returning({ id: healthConversation.id });

  if (deleted.length === 0) {
    return c.json(
      {
        error: { code: "NOT_FOUND", message: "Conversation not found" },
      },
      404,
    );
  }

  c.header("Cache-Control", "no-store");
  return c.body(null, 204);
});

health.post("/logs", async (c) => {
  const userId = c.get("user").id;
  const body = await readJsonBody(c);
  if (!body.ok) return body.response;

  let input: z.infer<typeof createLogSchema>;
  try {
    input = createLogSchema.parse(body.data);
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(c, error);
    throw error;
  }

  const db = createDb(c.env.DATABASE_URL);

  const [message] = await db
    .select()
    .from(healthMessage)
    .where(
      and(
        eq(healthMessage.id, input.messageId),
        eq(healthMessage.userId, userId),
        eq(healthMessage.conversationId, input.conversationId),
      ),
    )
    .limit(1);

  if (!message) {
    return c.json(
      {
        error: { code: "NOT_FOUND", message: "Health message not found" },
      },
      404,
    );
  }

  if (message.logId) {
    return c.json(
      {
        error: {
          code: "ALREADY_SUBMITTED",
          message: "This symptom form has already been saved",
        },
      },
      409,
    );
  }

  const seen = new Set<string>();
  const entries = [];
  for (const entry of input.entries) {
    const symptom = normalizeSymptomName(entry.symptom);
    if (!symptom || seen.has(symptom)) continue;
    seen.add(symptom);
    entries.push({
      id: crypto.randomUUID(),
      symptom,
      present: entry.present,
      severity: entry.present ? (entry.severity ?? null) : null,
      note: entry.note?.trim() ? entry.note.trim() : null,
    });
  }

  const [previousUserMessage] = await db
    .select({ content: healthMessage.content })
    .from(healthMessage)
    .where(
      and(
        eq(healthMessage.conversationId, input.conversationId),
        eq(healthMessage.userId, userId),
        eq(healthMessage.role, "user"),
        lte(healthMessage.createdAt, message.createdAt),
      ),
    )
    .orderBy(desc(healthMessage.createdAt))
    .limit(1);

  const now = new Date();
  const logId = crypto.randomUUID();
  // Once saved, the message form reflects what the user actually submitted so
  // reopening the conversation shows an accurate read-only record.
  const submittedForm = {
    message:
      (message.form as { message?: string } | null)?.message ?? message.content,
    items: entries.map((entry) => ({
      symptom: entry.symptom,
      present: entry.present,
      suggested: false,
      ...(entry.severity ? { severity: entry.severity } : {}),
    })),
  };

  const insertLog = db.insert(symptomLog).values({
    id: logId,
    userId,
    conversationId: input.conversationId,
    messageId: message.id,
    logDate: input.logDate,
    rawInput: previousUserMessage?.content ?? message.content,
    createdAt: now,
  });

  const updateMessage = db
    .update(healthMessage)
    .set({ logId, form: submittedForm })
    .where(
      and(
        eq(healthMessage.id, message.id),
        eq(healthMessage.userId, userId),
        isNull(healthMessage.logId),
      ),
    );

  const updateConversation = db
    .update(healthConversation)
    .set({ updatedAt: now })
    .where(eq(healthConversation.id, input.conversationId));

  if (entries.length > 0) {
    const insertEntries = db.insert(symptomLogEntry).values(
      entries.map((entry) => ({
        ...entry,
        logId,
      })),
    );
    await db.batch([
      insertLog,
      insertEntries,
      updateMessage,
      updateConversation,
    ] as const);
  } else {
    await db.batch([insertLog, updateMessage, updateConversation] as const);
  }

  noStore(c);
  return c.json(
    {
      log: {
        id: logId,
        conversationId: input.conversationId,
        messageId: message.id,
        logDate: input.logDate,
        rawInput: previousUserMessage?.content ?? message.content,
        createdAt: now.toISOString(),
        entries,
      },
    },
    201,
  );
});

health.get("/logs", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DATABASE_URL);

  let limit: number;
  let from: string | undefined;
  let to: string | undefined;
  try {
    limit = listLimitSchema.parse(c.req.query("limit") ?? "30");
    from = c.req.query("from")
      ? dateSchema.parse(c.req.query("from"))
      : undefined;
    to = c.req.query("to") ? dateSchema.parse(c.req.query("to")) : undefined;
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(c, error);
    throw error;
  }
  const cursor = decodeCursor(c.req.query("cursor") ?? "");

  const conditions = [eq(symptomLog.userId, userId)];
  if (from) conditions.push(gte(symptomLog.logDate, from));
  if (to) conditions.push(lte(symptomLog.logDate, to));
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(symptomLog.createdAt, cursorDate),
        and(
          eq(symptomLog.createdAt, cursorDate),
          lt(symptomLog.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(symptomLog)
    .where(and(...conditions))
    .orderBy(desc(symptomLog.createdAt), desc(symptomLog.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const entries = page.length
    ? await db
        .select()
        .from(symptomLogEntry)
        .where(
          inArray(
            symptomLogEntry.logId,
            page.map((row) => row.id),
          ),
        )
        .orderBy(desc(symptomLogEntry.present), asc(symptomLogEntry.symptom))
    : [];

  const entriesByLog = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByLog.get(entry.logId) ?? [];
    list.push(entry);
    entriesByLog.set(entry.logId, list);
  }

  const last = page.at(-1);

  noStore(c);
  return c.json({
    logs: page.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      messageId: row.messageId,
      logDate: row.logDate,
      rawInput: row.rawInput,
      createdAt: row.createdAt.toISOString(),
      entries: entriesByLog.get(row.id) ?? [],
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
  });
});

health.delete("/logs/:id", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DATABASE_URL);

  const deleted = await db
    .delete(symptomLog)
    .where(
      and(eq(symptomLog.id, c.req.param("id")), eq(symptomLog.userId, userId)),
    )
    .returning({ id: symptomLog.id });

  if (deleted.length === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Symptom log not found" } },
      404,
    );
  }

  c.header("Cache-Control", "no-store");
  return c.body(null, 204);
});

health.get("/symptoms/stats", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DATABASE_URL);

  let days: number;
  try {
    days = statsDaysSchema.parse(c.req.query("days") ?? "30");
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(c, error);
    throw error;
  }

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startDate = start.toISOString().slice(0, 10);

  const rows = await db
    .select({
      symptom: symptomLogEntry.symptom,
      count: sql<number>`count(*)::int`,
    })
    .from(symptomLogEntry)
    .innerJoin(symptomLog, eq(symptomLogEntry.logId, symptomLog.id))
    .where(
      and(
        eq(symptomLog.userId, userId),
        eq(symptomLogEntry.present, true),
        gte(symptomLog.logDate, startDate),
      ),
    )
    .groupBy(symptomLogEntry.symptom)
    .orderBy(desc(sql`count(*)`), asc(symptomLogEntry.symptom))
    .limit(50);

  noStore(c);
  return c.json({ days, stats: rows });
});

export default health;
