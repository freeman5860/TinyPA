import OpenAI from "openai";
import { setDefaultResultOrder } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import {
  LLMProvider,
  ExtractedItem,
  DigestInput,
  DigestResult,
} from "./provider";
import {
  EXTRACT_SYSTEM,
  extractUserPrompt,
  DIGEST_SYSTEM,
  digestUserPrompt,
} from "./prompts";
import { NdjsonExtractParser, parseDigestOutput } from "./ndjson";

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

const EXTRACT_MODEL = process.env.LLM_EXTRACT_MODEL ?? "meta/llama-3.3-70b-instruct";
const DIGEST_MODEL = process.env.LLM_DIGEST_MODEL ?? "meta/llama-3.3-70b-instruct";
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const EXTRACT_STREAM = (process.env.LLM_EXTRACT_STREAM ?? "true").toLowerCase() !== "false";
const EXTRACT_MAX_TOKENS = Number(process.env.LLM_EXTRACT_MAX_TOKENS ?? 1024);
const DIGEST_MAX_TOKENS = Number(process.env.LLM_DIGEST_MAX_TOKENS ?? 1024);

function makeClient() {
  const apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY (or NVIDIA_API_KEY / OPENAI_API_KEY) is not set");
  return new OpenAI({
    apiKey,
    baseURL: LLM_BASE_URL,
    timeout: 45_000,
    maxRetries: 0,
    fetch: llmFetch,
  });
}

export class OpenAICompatProvider implements LLMProvider {
  async extract(
    input: { text: string; now: string; timezone: string },
    onItem: (item: ExtractedItem) => Promise<void>
  ): Promise<void> {
    const client = makeClient();
    const reqStart = Date.now();
    console.log("[openai-compat.extract] start", {
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

    const parser = new NdjsonExtractParser(onItem);
    let firstChunkLogged = false;

    try {
      if (EXTRACT_STREAM) {
        const stream = await client.chat.completions.create({ ...baseParams, stream: true });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;
          if (!firstChunkLogged) {
            firstChunkLogged = true;
            console.log("[openai-compat.extract] first chunk", {
              model: EXTRACT_MODEL,
              ttfbMs: Date.now() - reqStart,
            });
          }
          await parser.feed(delta);
        }
        await parser.finish();
      } else {
        const res = await client.chat.completions.create({ ...baseParams, stream: false });
        const content = res.choices[0]?.message?.content ?? "";
        console.log("[openai-compat.extract] first chunk", {
          model: EXTRACT_MODEL,
          ttfbMs: Date.now() - reqStart,
          nonStreaming: true,
        });
        await parser.feedWhole(content);
      }
    } finally {
      console.log("[openai-compat.extract] done", {
        emittedCount: parser.emittedCount,
        totalMs: Date.now() - reqStart,
        contentLen: parser.fullContent.length,
        contentPreview: parser.fullContent.slice(0, 300),
      });
    }
  }

  async digest(input: DigestInput): Promise<DigestResult> {
    const client = makeClient();
    const t0 = Date.now();
    console.log("[openai-compat.digest] start", { model: DIGEST_MODEL, maxTokens: DIGEST_MAX_TOKENS });
    const params = {
      model: DIGEST_MODEL,
      messages: [
        { role: "system" as const, content: DIGEST_SYSTEM },
        { role: "user" as const, content: digestUserPrompt(input) },
      ],
      max_tokens: DIGEST_MAX_TOKENS,
      temperature: 0.7,
      top_p: 0.95,
      stream: false as const,
    };
    const res = await client.chat.completions.create(
      params as unknown as Parameters<typeof client.chat.completions.create>[0]
    );
    const raw =
      ("choices" in res && res.choices?.[0]?.message?.content) ||
      "";
    console.log("[openai-compat.digest] done", { ms: Date.now() - t0, rawLen: raw.length });
    const { summaryMd, topTodoIds } = parseDigestOutput(raw, input.openTodos.map((t) => t.id));
    return { summaryMd, topTodoIds };
  }
}
