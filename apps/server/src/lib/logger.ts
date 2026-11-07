/**
 * Structured logging for Cloudflare Workers.
 *
 * Workers Logs captures everything written through `console.*`. Emitting one
 * JSON object per line keeps those logs queryable by field (level, requestId,
 * status, ...) instead of relying on free-form strings.
 *
 * Each entry is also shipped as a JSON line to the standard log collector
 * (`log.duongital.com`). Shipping is best-effort and happens in the background
 * via `waitUntil`, so a collector outage never affects request latency or
 * success. Call `configureLogging` once per request with the runtime hostname.
 *
 * Never pass request bodies, cookies, authorization headers, or other secrets
 * in `fields`.
 */

import { waitUntil } from "cloudflare:workers";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const DEFAULT_APP = "cherry-server";
const DEFAULT_HOST = "cherry-api";
const DEFAULT_ENDPOINT =
  "https://log.duongital.com/insert/jsonline" +
  "?_stream_fields=app,host&_msg_field=_msg&_time_field=_time";

interface LogSink {
  app: string;
  host: string;
  endpoint: string;
}

let sink: LogSink = {
  app: DEFAULT_APP,
  host: DEFAULT_HOST,
  endpoint: DEFAULT_ENDPOINT,
};

/**
 * Configure the remote log collector for the current request. The Worker env is
 * only available inside a request, so `index.ts` calls this from the first
 * middleware. Pass an empty `endpoint` to disable remote shipping.
 */
export function configureLogging(options: {
  app?: string;
  host?: string;
  endpoint?: string;
}): void {
  sink = {
    app: options.app?.trim() || DEFAULT_APP,
    host: options.host?.trim() || DEFAULT_HOST,
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
  };
}

/** Ship one JSON line to the collector. Failures are intentionally swallowed. */
function ship(entry: Record<string, unknown>): void {
  if (!sink.endpoint) return;

  const payload = JSON.stringify(entry);

  const request = fetch(sink.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/stream+json",
    },
    body: `${payload}\n`,
  })
    .then((response) => {
      if (!response.ok) {
        // Drain the body so the runtime can reuse the connection.
        return response.body?.cancel();
      }
    })
    .catch(() => {
      // Remote logging is best-effort: never surface collector errors to the
      // request path.
    });

  try {
    waitUntil(request);
  } catch {
    // Outside a request context (for example a local script); ignore.
  }
}

function write(level: LogLevel, message: string, fields: LogFields): void {
  const timestamp = new Date().toISOString();
  // Use VictoriaLogs' standard field names for message (`_msg`) and time
  // (`_time`) in both Workers Logs and the remote collector. `app` and `host`
  // are the configured `_stream_fields`, so they are always included.
  const entry = {
    ...fields,
    // Reserved collector fields go last so callers cannot override them.
    _msg: message,
    _time: timestamp,
    level,
    app: sink.app,
    host: sink.host,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  ship(entry);
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
