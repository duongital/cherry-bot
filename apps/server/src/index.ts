import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { swaggerUI } from "@hono/swagger-ui";
import { routePath } from "hono/route";
import { getAuth } from "./auth";
import { openApiDocument } from "./openapi";
import {
  configureLogging,
  logError,
  logInfo,
  logWarn,
  serializeError,
} from "./lib/logger";
import { requireSession } from "./lib/session";
import {
  getTraceIds,
  recordRootException,
  setRootSpanAttributes,
  setRootSpanName,
  setRootSpanStatus,
} from "./lib/tracing";
import itemsRoutes from "./routes/items";
import tagsRoutes from "./routes/tags";
import healthRoutes from "./routes/health";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Remove high-cardinality path params so span names stay grouped in the trace
 * UI (for example `GET /api/items/:id` instead of one name per item id).
 *
 * `c.req.routePath` inside a `*` middleware is the middleware's own path (`*`),
 * so use the last matched route (index -1) to get the actual handler. Falls back
 * to the concrete path for unmatched requests (404).
 */
function routeName(c: Context<AppEnv>): string {
  const matched = routePath(c, -1);
  return matched && matched !== "*" && matched !== "/*" ? matched : c.req.path;
}

// Log one structured line per request. This runs before any other middleware so
// every response, including CORS rejections and unhandled errors, is covered.
app.use("*", async (c, next) => {
  // Configure the standard log collector before any handler can log.
  configureLogging({
    host: c.env.HOSTNAME ?? new URL(c.req.url).host,
  });

  const startedAt = Date.now();
  const requestId =
    c.req.header("cf-ray") ??
    c.req.header(REQUEST_ID_HEADER) ??
    crypto.randomUUID();

  c.set("requestId", requestId);
  c.header(REQUEST_ID_HEADER, requestId);

  try {
    await next();
  } finally {
    let status = 500;
    try {
      status = c.res.status;
    } catch {
      // The response was never finalized (for example the handler threw before
      // a response was created); the error handler logs the details.
    }

    const user = c.get("user");
    const route = routeName(c);

    // Native Cloudflare tracing owns the invocation root span (and its export to
    // OTLP destinations). Decorate it here, after routing has resolved; the
    // runtime ends it when the handler returns.
    setRootSpanName(`${c.req.method} ${route}`);
    setRootSpanAttributes({
      "http.request.method": c.req.method,
      "http.route": route,
      "http.response.status_code": status,
      "url.path": c.req.path,
      "url.scheme": new URL(c.req.url).protocol.replace(":", ""),
      "server.address": new URL(c.req.url).host,
      "request.id": requestId,
      "cloudflare.ray_id": c.req.header("cf-ray"),
      ...(user ? { "user.id": user.id } : {}),
    });
    // 4xx is a client problem and stays unset, per OTel HTTP conventions.
    setRootSpanStatus(status >= 500 ? "error" : status < 400 ? "ok" : "unset");

    const fields = {
      requestId,
      ...(getTraceIds() ?? {}),
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Date.now() - startedAt,
      ...(user ? { userId: user.id } : {}),
    };

    if (status >= 500) {
      logError("request.failed", fields);
    } else if (status >= 400) {
      logWarn("request.rejected", fields);
    } else {
      logInfo("request.completed", fields);
    }
  }
});

app.onError((error, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  const fields = {
    requestId,
    method: c.req.method,
    path: c.req.path,
    error: serializeError(error),
  };

  recordRootException(error);

  if (error instanceof HTTPException) {
    logWarn("request.http_exception", { ...fields, status: error.status });
    return error.getResponse();
  }

  logError("request.unhandled_error", fields);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    },
    500,
  );
});

app.notFound((c) => {
  logWarn("request.not_found", {
    requestId: c.get("requestId") ?? "unknown",
    method: c.req.method,
    path: c.req.path,
  });
  return c.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    404,
  );
});

/**
 * Browser requests must come from the web client. Native Expo requests have no
 * Origin header, so they identify themselves with the Expo app scheme through
 * the `expo-origin` header used by `@better-auth/expo`.
 */
function isTrustedRequestOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header("origin");
  if (origin === c.env.CLIENT_URL) return true;

  const expoOrigin = c.req.header("expo-origin");
  if (!expoOrigin) return false;

  const scheme = c.env.MOBILE_APP_SCHEME ?? "botcherry";
  if (expoOrigin === `${scheme}://`) return true;

  return (
    !c.env.BETTER_AUTH_URL.startsWith("https://") &&
    expoOrigin.startsWith("exp://")
  );
}

// CORS must be handled explicitly: better-auth's `trustedOrigins` only covers
// CSRF protection, not the Access-Control-* response headers the browser needs
// for cross-origin requests with credentials. The origin is read per-request
// from the env binding (only available inside the handler).
app.use("/api/*", (c, next) =>
  cors({
    origin: c.env.CLIENT_URL,
    allowHeaders: ["Content-Type", "Authorization", "expo-origin"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })(c, next),
);

// CORS alone does not stop a cross-site request from executing. Reject
// state-changing item/tag requests from origins other than the client.
app.use("/api/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const isProtectedApi =
    c.req.path.startsWith("/api/items") ||
    c.req.path.startsWith("/api/tags") ||
    c.req.path.startsWith("/api/health/");

  if (
    isProtectedApi &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS" &&
    !isTrustedRequestOrigin(c)
  ) {
    return c.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Invalid origin" } },
      403,
    );
  }

  await next();
});

app.use("/api/items", requireSession);
app.use("/api/items/*", requireSession);
app.use("/api/tags", requireSession);
app.use("/api/tags/*", requireSession);
app.use("/api/health/*", requireSession);

app.all("/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

app.route("/api/items", itemsRoutes);
app.route("/api/tags", tagsRoutes);
app.route("/api/health", healthRoutes);

app.get("/api/health", (c) =>
  c.json({ status: "ok", time: new Date().toISOString() }),
);

// OpenAPI JSON document
app.get("/doc", (c) => c.json(openApiDocument));

// Swagger UI
app.get("/swagger", swaggerUI({ url: "/doc" }));

app.get("/", (c) => c.redirect("/swagger"));

export default app;
