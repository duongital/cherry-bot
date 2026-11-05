/**
 * Cloudflare Workers native tracing helpers.
 *
 * Tracing is enabled in `wrangler.toml` (`[observability.traces]`) and exported
 * to OTLP destinations configured in the Cloudflare dashboard (Observability >
 * Destinations). No OpenTelemetry SDK runs inside the Worker: the runtime
 * creates the invocation/root span and platform spans (fetch, KV, D1, ...)
 * automatically. This module only wraps custom application spans and adds
 * attributes to the root span.
 *
 * All helpers are safe no-ops when tracing is disabled or the request is not
 * sampled, so callers never need to check.
 */

import { tracing } from "cloudflare:workers";

export type SpanAttributes = Record<
  string,
  boolean | number | string | undefined
>;

export type TracingSpan = ReturnType<typeof tracing.startSpan>;

export interface TraceIds {
  traceId: string;
  spanId: string;
}

/**
 * IDs of the active span, useful for correlating structured logs with traces.
 * Returns `undefined` when observability is disabled (zero IDs).
 */
export function getTraceIds(): TraceIds | undefined {
  const context = tracing.getActiveSpan()?.spanContext();
  if (!context || /^0+$/.test(context.traceId)) return undefined;
  return { traceId: context.traceId, spanId: context.spanId };
}

export function setRootSpanName(name: string): void {
  tracing.getActiveSpan()?.updateName(name);
}

export function setRootSpanAttributes(attributes: SpanAttributes): void {
  tracing.getActiveSpan()?.setAttributes(attributes);
}

export function setRootSpanStatus(
  code: "ok" | "error" | "unset",
  message?: string,
): void {
  tracing.getActiveSpan()?.setStatus({
    code,
    ...(message ? { message } : {}),
  });
}

/** Record an exception on the root span without changing control flow. */
export function recordRootException(error: unknown): void {
  const span = tracing.getActiveSpan();
  if (!span) return;

  span.recordException(
    error instanceof Error ? error : String(error ?? "Unknown error"),
  );
  span.setStatus({ code: "error", message: messageOf(error) });
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function recordSpanError(span: TracingSpan, error: unknown): void {
  span.recordException(
    error instanceof Error ? error : String(error ?? "Unknown error"),
  );
  span.setStatus({ code: "error", message: messageOf(error) });
}

/**
 * Run `fn` inside a custom span. The span automatically becomes a child of the
 * currently active span, ends when `fn` returns/settles, and records thrown
 * errors. Supports both synchronous and asynchronous callbacks.
 */
export function withSpan<T>(
  name: string,
  fn: (span: TracingSpan) => T,
  attributes?: SpanAttributes,
): T {
  return tracing.enterSpan(name, (span) => {
    if (attributes) span.setAttributes(attributes);

    let result: T;
    try {
      result = fn(span);
    } catch (error) {
      recordSpanError(span, error);
      throw error;
    }

    if (result instanceof Promise) {
      return result.then(
        (value) => {
          span.setStatus({ code: "ok" });
          return value;
        },
        (error: unknown) => {
          recordSpanError(span, error);
          throw error;
        },
      ) as T;
    }

    span.setStatus({ code: "ok" });
    return result;
  });
}
