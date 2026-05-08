import OpenAI from "openai";
import { setDefaultResultOrder } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Edge runtime / older Node: skip.
}

const embedAgent = new Agent({
  connect: { family: 4, timeout: 10_000 },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

const embedFetch: typeof fetch = (input, init) =>
  undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: embedAgent }
  ) as unknown as Promise<Response>;

const EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? "gemini-embedding-001";
const EMBED_BASE_URL =
  process.env.LLM_EMBED_BASE_URL ??
  process.env.LLM_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai/";
export const EMBED_DIM = 1024;

function makeClient() {
  const apiKey = process.env.LLM_EMBED_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_EMBED_API_KEY / LLM_API_KEY is not set");
  return new OpenAI({
    apiKey,
    baseURL: EMBED_BASE_URL,
    timeout: 30_000,
    maxRetries: 1,
    fetch: embedFetch,
  });
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = makeClient();
    const start = Date.now();
    console.log("[embed] start", { n: texts.length, model: EMBED_MODEL });
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: texts,
      encoding_format: "float",
      dimensions: EMBED_DIM,
    });
    const vectors = res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
    console.log("[embed] done", {
      n: vectors.length,
      ms: Date.now() - start,
      dim: vectors[0]?.length,
    });
    return vectors;
  }
}

let singleton: EmbeddingProvider | null = null;
export function getEmbed(): EmbeddingProvider {
  if (!singleton) singleton = new GeminiEmbeddingProvider();
  return singleton;
}

export function embedQuery(text: string): Promise<number[][]> {
  return getEmbed().embed([text]);
}
