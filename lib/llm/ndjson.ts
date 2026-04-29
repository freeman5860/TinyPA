import { ExtractedItem, extractedItemSchema } from "./provider";

function stripFences(raw: string) {
  return raw
    .replace(/^```(?:json|ndjson)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Streaming NDJSON parser for extract output.
 *
 * Models are told to emit one JSON object per line. We accumulate deltas,
 * flush on `\n`, and dedupe by `type::content` so the same item doesn't
 * fire twice if the model repeats itself under stress.
 */
export class NdjsonExtractParser {
  private buf = "";
  private seen = new Set<string>();
  private emitted = 0;
  public fullContent = "";

  constructor(private onItem: (item: ExtractedItem) => Promise<void>) {}

  get emittedCount() {
    return this.emitted;
  }

  /** Feed a delta from the stream. */
  async feed(delta: string) {
    if (!delta) return;
    this.buf += delta;
    this.fullContent += delta;
    let nl = this.buf.indexOf("\n");
    while (nl >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      await this.tryParseAndEmit(line);
      nl = this.buf.indexOf("\n");
    }
  }

  /** Flush any remaining buffered content (partial last line, or full blob). */
  async finish() {
    if (this.buf.trim()) {
      await this.tryParseAndEmit(this.buf);
      this.buf = "";
    }
    // Fallback: parsed nothing but we do have content → try whole-blob parse.
    if (this.emitted === 0 && this.fullContent.trim()) {
      await this.tryParseAndEmit(this.fullContent);
    }
  }

  /** One-shot path for non-streaming responses. */
  async feedWhole(content: string) {
    this.fullContent = content;
    for (const line of content.split("\n")) {
      await this.tryParseAndEmit(line);
    }
    if (this.emitted === 0 && this.fullContent.trim()) {
      await this.tryParseAndEmit(this.fullContent);
    }
  }

  private async tryParseAndEmit(chunk: string) {
    const s = stripFences(chunk);
    if (!s) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(s);
    } catch {
      return;
    }
    const arr: unknown[] =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : Array.isArray(parsed)
        ? (parsed as unknown[])
        : [parsed];
    for (const item of arr) await this.emitOne(item);
  }

  private async emitOne(raw: unknown) {
    const ok = extractedItemSchema.safeParse(raw);
    if (!ok.success) return;
    const key = `${ok.data.type}::${ok.data.content}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    try {
      this.emitted++;
      await this.onItem(ok.data);
    } catch (err) {
      console.error("[ndjson] onItem failed", err);
    }
  }
}

/**
 * Parse the digest raw output into summary markdown + picked top todo IDs.
 * The model is told to append `TOP_TODO_IDS: ["id1","id2","id3"]` after markdown.
 */
export function parseDigestOutput(raw: string, validIds: string[]) {
  const match = raw.match(/TOP_TODO_IDS:\s*(\[[^\]]*\])/);
  let topTodoIds: string[] = [];
  if (match) {
    try {
      const arr = JSON.parse(match[1]);
      if (Array.isArray(arr)) {
        topTodoIds = arr.filter(
          (v): v is string => typeof v === "string" && validIds.includes(v)
        );
      }
    } catch {
      // ignore, fall back to empty
    }
  }
  const summaryMd = raw.replace(/TOP_TODO_IDS:\s*\[[^\]]*\]\s*$/, "").trim();
  return { summaryMd, topTodoIds };
}
