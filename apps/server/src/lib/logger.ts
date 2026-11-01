/**
 * Structured logging for Cloudflare Workers.
 *
 * Workers Logs captures everything written through `console.*`. Emitting one
 * JSON object per line keeps those logs queryable by field (level, requestId,
 * status, ...) instead of relying on free-form strings.
 *
 * Never pass request bodies, cookies, authorization headers, or other secrets
 * in `fields`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function write(level: LogLevel, message: string, fields: LogFields): void {
  const entry = {
    ...fields,
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logDebug(message: string, fields: LogFields = {}): void {
  write("debug", message, fields);
}

export function logInfo(message: string, fields: LogFields = {}): void {
  write("info", message, fields);
}

export function logWarn(message: string, fields: LogFields = {}): void {
  write("warn", message, fields);
}

export function logError(message: string, fields: LogFields = {}): void {
  write("error", message, fields);
}

/** Turn an unknown thrown value into JSON-serializable log fields. */
export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}
