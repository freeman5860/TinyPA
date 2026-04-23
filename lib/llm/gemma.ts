import OpenAI from "openai";
import { setDefaultResultOrder } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
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

// Force IPv4 + bypass Next.js's fetch wrapper. Two things going wrong
// on Vercel lambdas:
//   1. Node prefers IPv6; the IPv6 path to NIM is stalled/blackholed,
//      so the first connect() hangs 30-60s before falling back to v4.
//   2. Next.js instruments the global fetch, so setGlobalDispatcher
//      doesn't reach the OpenAI SDK's actual HTTP calls.
// Fix both by (a) hinting the DNS resolver to prefer v4, and (b)
// passing undici's fetch + an IPv4-only Agent directly to the OpenAI
// SDK's `fetch` option.
try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Edge runtime / older Node: skip.
}

const llmAgent = new Agent({
  connect: { family: 4, timeout: 10_000 },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

const llmFetch: typeof fetch = (input, init) =>
  undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: llmAgent }
  ) as unknown as Promise<Response>;

const EXTRACT_MODEL = process.env.LLM_EXTRACT_MODEL ?? "meta/llama-3.1-8b-instruct";
const DIGEST_MODEL = process.env.LLM_DIGEST_MODEL ?? "google/gemma-4-31b-it";
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const EXTRACT_STREAM = (process.env.LLM_EXTRACT_STREAM ?? "true").toLowerCase() !== "false";
const EXTRACT_MAX_TOKENS = Number(process.env.LLM_EXTRACT_MAX_TOKENS ?? 1024);

function makeClient() {
  const apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY (or NVIDIA_API_KEY) is not set");
  return new OpenAI({
    apiKey,
    baseURL: LLM_BASE_URL,
    timeout: 45_000,
    maxRetries: 0,
    fetch: llmFetch,
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
    const reqStart = Date.now();
    console.log("[gemma.extract] start", {
      model: EXTRACT_MODEL,
      baseURL: LLM_BASE_URL,
      stream: EXTRACT_STREAM,
      maxTokens: EXTRACT_MAX_TOKENS,
      inputLen: input.text.length,
    });

    const baseParams = {
      model: EXTRACT_MODEL,
      messages: [
        { role: "system" as const, content: EXTRACT_SYSTEM },
        { role: "user" as const, content: extractUserPrompt(input.text, input.now, input.timezone) },
      ],
      max_tokens: EXTRACT_MAX_TOKENS,
      temperature: 0.4,
      top_p: 0.95,
    };

    let fullContent = "";
    let emittedCount = 0;
    const seen = new Set<string>();
    const wrappedOnItem = async (item: ExtractedItem) => {
      emittedCount++;
      await onItem(item);
    };

    const emitOne = async (raw: unknown) => {
      const ok = extractedItemSchema.safeParse(raw);
      if (!ok.success) return;
      const key = `${ok.data.type}::${ok.data.content}`;
      if (seen.has(key)) return;
      seen.add(key);
      try {
        await wrappedOnItem(ok.data);
      } catch (err) {
        console.error("[gemma.extract] onItem failed", err);
      }
    };

    const tryParseAndEmit = async (chunk: string) => {
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
      for (const item of arr) await emitOne(item);
    };

    try {
      if (EXTRACT_STREAM) {
        const stream = await client.chat.completions.create({ ...baseParams, stream: true });
        let buf = "";
        let firstChunkLogged = false;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;
          if (!firstChunkLogged) {
            firstChunkLogged = true;
            console.log("[gemma.extract] first chunk", {
              model: EXTRACT_MODEL,
              ttfbMs: Date.now() - reqStart,
            });
          }
          buf += delta;
          fullContent += delta;
          let nl = buf.indexOf("\n");
          while (nl >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            await tryParseAndEmit(line);
            nl = buf.indexOf("\n");
          }
        }
        if (buf.trim()) await tryParseAndEmit(buf);
      } else {
        const res = await client.chat.completions.create({ ...baseParams, stream: false });
        fullContent = res.choices[0]?.message?.content ?? "";
        console.log("[gemma.extract] first chunk", {
          model: EXTRACT_MODEL,
          ttfbMs: Date.now() - reqStart,
          nonStreaming: true,
        });
        for (const line of fullContent.split("\n")) {
          await tryParseAndEmit(line);
        }
      }
    } finally {
      // Fallback: if parsing found nothing but we have content, try whole-blob parse
      if (emittedCount === 0 && fullContent.trim()) {
        await tryParseAndEmit(fullContent);
      }
      console.log("[gemma.extract] done", {
        emittedCount,
        totalMs: Date.now() - reqStart,
        contentLen: fullContent.length,
        contentPreview: fullContent.slice(0, 300),
      });
    }
  }

  async digest(input: DigestInput): Promise<DigestResult> {
    const client = makeClient();
    const params = {
      model: DIGEST_MODEL,
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
