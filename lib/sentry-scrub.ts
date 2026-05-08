import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEYS = new Set([
  "rawText",
  "replyText",
  "text",
  "content",
  "summaryMd",
  "note",
  "notes",
  "body",
  "email",
  "identifier",
  "to",
]);

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return v.length > 64 ? `[redacted:${v.length}ch]` : "[redacted]";
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 10).map((x) => redact(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? redact(val, depth + 1) : val;
    }
    return out;
  }
  return v;
}

export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    if (event.request.query_string) event.request.query_string = "[redacted]";
    if (event.request.cookies) event.request.cookies = { redacted: "[redacted]" };
    if (event.request.data) event.request.data = redact(event.request.data) as typeof event.request.data;
    if (event.request.headers) {
      const h = event.request.headers as Record<string, string>;
      for (const k of Object.keys(h)) {
        if (/^(cookie|authorization|x-forwarded-for|x-real-ip)$/i.test(k)) h[k] = "[redacted]";
      }
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (redact(b.data) as typeof b.data) : b.data,
    }));
  }

  if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
  if (event.contexts) {
    for (const [k, v] of Object.entries(event.contexts)) {
      event.contexts[k] = redact(v) as typeof v;
    }
  }

  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}
