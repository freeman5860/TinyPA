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

const EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? "nvidia/nv-embedqa-e5-v5";
const EMBED_BASE_URL =
  process.env.LLM_EMBED_BASE_URL ??
  process.env.LLM_BASE_URL ??
  "https://integrate.api.nvidia.com/v1";
export const EMBED_DIM = 1024;

function makeClient() {
  const apiKey =
    process.env.LLM_EMBED_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.NVIDIA_API_KEY;
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

class NimEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = makeClient();
    const start = Date.now();
    console.log("[embed] start", { n: texts.length, model: EMBED_MODEL });
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: texts,
      encoding_format: "float",
      // NIM's embedqa models want an input_type hint. The SDK passes
      // unknown fields through to the HTTP body.
      input_type: "passage",
    } as unknown as Parameters<typeof client.embeddings.create>[0]);
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
  if (!singleton) singleton = new NimEmbeddingProvider();
  return singleton;
}

export function embedQuery(text: string): Promise<number[][]> {
  // Query-side wants a different input_type on NIM, but since the model
  // is symmetric (e5), passage/query difference is small; call once with
  // input_type=query via a dedicated path so search gets tuned embedding.
  return new QueryEmbeddingProvider().embed([text]);
}

class QueryEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = makeClient();
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: texts,
      encoding_format: "float",
      input_type: "query",
    } as unknown as Parameters<typeof client.embeddings.create>[0]);
    return res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
  }
}
