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

const EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? "gemini-embedding-001";
export const EMBED_DIM = 1024;

const GEMINI_API_ROOT =
  process.env.GEMINI_API_ROOT ?? "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string {
  const key = process.env.LLM_EMBED_API_KEY || process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_EMBED_API_KEY / LLM_API_KEY is not set");
  return key;
}

// gemini-embedding-001 requires manual L2 normalization for non-3072 sizes,
// otherwise pgvector cosine distance is off. See:
// https://ai.google.dev/gemini-api/docs/embeddings
function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

async function embedBatch(texts: string[], taskType: TaskType): Promise<number[][]> {
  if (texts.length === 0) return [];
  const url = `${GEMINI_API_ROOT}/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey()}`;
  const body = {
    requests: texts.map((t) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: t }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    })),
  };
  const start = Date.now();
  console.log("[embed] start", { n: texts.length, model: EMBED_MODEL, taskType });
  const res = await undiciFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    dispatcher: embedAgent,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini embed ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { embeddings: { values: number[] }[] };
  const vectors = json.embeddings.map((e) => l2Normalize(e.values));
  console.log("[embed] done", {
    n: vectors.length,
    ms: Date.now() - start,
    dim: vectors[0]?.length,
  });
  return vectors;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]> {
    return embedBatch(texts, "RETRIEVAL_DOCUMENT");
  }
}

let singleton: EmbeddingProvider | null = null;
export function getEmbed(): EmbeddingProvider {
  if (!singleton) singleton = new GeminiEmbeddingProvider();
  return singleton;
}

export function embedQuery(text: string): Promise<number[][]> {
  return embedBatch([text], "RETRIEVAL_QUERY");
}
