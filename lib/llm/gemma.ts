import OpenAI from "openai";
import {
  LLMProvider,
  ExtractResult,
  extractResultSchema,
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
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export class GemmaProvider implements LLMProvider {
  async extract(input: { text: string; now: string; timezone: string }): Promise<ExtractResult> {
    const client = makeClient();
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: extractUserPrompt(input.text, input.now, input.timezone) },
      ],
      max_tokens: 2048,
      temperature: 0.4,
      top_p: 0.95,
      stream: false,
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const cleaned = stripFences(raw);
    try {
      const parsed = JSON.parse(cleaned);
      return extractResultSchema.parse(parsed);
    } catch (err) {
      console.error("[gemma.extract] parse failed", { raw, err });
      return { items: [] };
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
