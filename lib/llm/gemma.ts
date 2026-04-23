import OpenAI from "openai";
import {
  LLMProvider,
  ExtractedItem,
  extractedItemSchema,
  DigestInput,
  DigestResult,
} from "./provider";
import {
  EXTRACT_SYSTEM,
  extractUserPrompt,
  DIGEST_SYSTEM,
  digestUserPrompt,
} from "./prompts";

const MODEL = "google/gemma-4-31b-it";

function makeClient() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");
  return new OpenAI({
    apiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
    timeout: 45_000,
    maxRetries: 0,
  });
}

function stripFences(raw: string) {
  return raw
    .replace(/^```(?:json|ndjson)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export class GemmaProvider implements LLMProvider {
  async extract(
    input: { text: string; now: string; timezone: string },
    onItem: (item: ExtractedItem) => Promise<void>
  ): Promise<void> {
    const client = makeClient();
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: extractUserPrompt(input.text, input.now, input.timezone) },
      ],
      max_tokens: 2048,
      temperature: 0.4,
      top_p: 0.95,
      stream: true,
    });

    let buf = "";
    let fullContent = "";
    let emittedCount = 0;
    const seen = new Set<string>();
    const wrappedOnItem = async (item: ExtractedItem) => {
      emittedCount++;
      await onItem(item);
    };

    const emitLineWithWrapped = async (raw: string) => {
      const s = stripFences(raw);
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
          : [parsed];
      for (const raw of arr) {
        const ok = extractedItemSchema.safeParse(raw);
        if (!ok.success) continue;
        const key = `${ok.data.type}::${ok.data.content}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await wrappedOnItem(ok.data);
        } catch (err) {
          console.error("[gemma.extract] onItem failed", err);
        }
      }
    };

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        buf += delta;
        fullContent += delta;
        let nl = buf.indexOf("\n");
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          await emitLineWithWrapped(line);
          nl = buf.indexOf("\n");
        }
      }
    } finally {
      if (buf.trim()) await emitLineWithWrapped(buf);

      // Fallback: if the LLM ignored NDJSON and returned one big JSON
      // blob, try parsing the accumulated content as a whole.
      if (emittedCount === 0 && fullContent.trim()) {
        const cleaned = stripFences(fullContent);
        try {
          const parsed = JSON.parse(cleaned);
          const arr: unknown[] =
            parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
              ? (parsed as { items: unknown[] }).items
              : Array.isArray(parsed)
              ? (parsed as unknown[])
              : [parsed];
          for (const raw of arr) {
            const ok = extractedItemSchema.safeParse(raw);
            if (!ok.success) continue;
            const key = `${ok.data.type}::${ok.data.content}`;
            if (seen.has(key)) continue;
            seen.add(key);
            try {
              await wrappedOnItem(ok.data);
            } catch (err) {
              console.error("[gemma.extract] fallback onItem failed", err);
            }
          }
        } catch {
          // ignore - nothing we can do
        }
      }

      console.log("[gemma.extract] stream done", {
        emittedCount,
        contentLen: fullContent.length,
        contentPreview: fullContent.slice(0, 300),
      });
    }
  }

  async digest(input: DigestInput): Promise<DigestResult> {
    const client = makeClient();
    const params = {
      model: MODEL,
      messages: [
        { role: "system" as const, content: DIGEST_SYSTEM },
        { role: "user" as const, content: digestUserPrompt(input) },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.95,
      stream: false as const,
      // NIM extension: make Gemma "think" before writing the digest.
      // The OpenAI SDK passes unknown fields through to the HTTP body.
      chat_template_kwargs: { enable_thinking: true },
    };
    const res = await client.chat.completions.create(
      params as unknown as Parameters<typeof client.chat.completions.create>[0]
    );
    const raw =
      ("choices" in res && res.choices?.[0]?.message?.content) ||
      "";
    const { summaryMd, topTodoIds } = parseDigestOutput(raw, input.openTodos.map((t) => t.id));
    return { summaryMd, topTodoIds };
  }
}

function parseDigestOutput(raw: string, validIds: string[]) {
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

let singleton: GemmaProvider | null = null;
export function getLLM(): LLMProvider {
  if (!singleton) singleton = new GemmaProvider();
  return singleton;
}
