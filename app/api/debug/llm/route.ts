import { NextRequest, NextResponse } from "next/server";
import { setDefaultResultOrder } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { EXTRACT_SYSTEM, DIGEST_SYSTEM } from "@/lib/llm/prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // noop
}

const debugAgent = new Agent({
  connect: { family: 4, timeout: 10_000 },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

const debugFetch: typeof fetch = (input, init) =>
  undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: debugAgent }
  ) as unknown as Promise<Response>;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return new URL(req.url).searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const model = url.searchParams.get("model") ?? "meta/llama-3.1-8b-instruct";
  const baseURL = process.env.LLM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no_api_key" }, { status: 500 });

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 55_000,
    maxRetries: 0,
    fetch: debugFetch,
  });

  async function nonStream() {
    const t0 = Date.now();
    try {
      const r = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Say hi in one word." }],
        max_tokens: 20,
        stream: false,
      });
      return {
        ok: true,
        ms: Date.now() - t0,
        output: r.choices[0]?.message?.content ?? "",
      };
    } catch (err: unknown) {
      return {
        ok: false,
        ms: Date.now() - t0,
        err: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function streamed() {
    const t0 = Date.now();
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Say hi in one word." }],
        max_tokens: 20,
        stream: true,
      });
      let firstMs = -1;
      let out = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta && firstMs < 0) firstMs = Date.now() - t0;
        out += delta;
      }
      return { ok: true, ms: Date.now() - t0, ttftMs: firstMs, output: out };
    } catch (err: unknown) {
      return {
        ok: false,
        ms: Date.now() - t0,
        err: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const a = await nonStream();
  const b = await streamed();

  return NextResponse.json({
    env: { model, baseURL, keyPrefix: apiKey.slice(0, 8), keyLen: apiKey.length },
    nonStream: a,
    stream: b,
  });
}

type ChatRunResult = {
  ok: boolean;
  totalMs: number;
  ttftMs: number | null;
  output: string;
  promptTokens: number | null;
  completionTokens: number | null;
  err: string | null;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return NextResponse.json({ error: "missing model" }, { status: 400 });
  const userPrompt = typeof body.userPrompt === "string" ? body.userPrompt : "";
  if (!userPrompt) return NextResponse.json({ error: "missing userPrompt" }, { status: 400 });
  const systemPrompt =
    typeof body.systemPrompt === "string" && body.systemPrompt.length > 0
      ? body.systemPrompt
      : null;
  const stream = body.stream !== false;
  const maxTokens = Math.min(
    Math.max(Number(body.maxTokens ?? 512), 1),
    4096
  );
  const temperature = Math.min(
    Math.max(Number(body.temperature ?? 0.4), 0),
    2
  );

  const baseURL = process.env.LLM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "no_api_key" }, { status: 500 });

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 55_000,
    maxRetries: 0,
    fetch: debugFetch,
  });

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });

  const t0 = Date.now();
  const result: ChatRunResult = {
    ok: false,
    totalMs: 0,
    ttftMs: null,
    output: "",
    promptTokens: null,
    completionTokens: null,
    err: null,
  };

  try {
    if (stream) {
      const s = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        stream_options: { include_usage: true },
      });
      for await (const chunk of s) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          if (result.ttftMs === null) result.ttftMs = Date.now() - t0;
          result.output += delta;
        }
        const usage = (chunk as unknown as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
        if (usage) {
          if (typeof usage.prompt_tokens === "number") result.promptTokens = usage.prompt_tokens;
          if (typeof usage.completion_tokens === "number") result.completionTokens = usage.completion_tokens;
        }
      }
    } else {
      const r = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      });
      result.output = r.choices[0]?.message?.content ?? "";
      result.promptTokens = r.usage?.prompt_tokens ?? null;
      result.completionTokens = r.usage?.completion_tokens ?? null;
    }
    result.ok = true;
  } catch (err) {
    result.err = err instanceof Error ? err.message : String(err);
  }
  result.totalMs = Date.now() - t0;

  return NextResponse.json({
    env: { model, baseURL, stream, maxTokens, temperature },
    result,
  });
}

export async function OPTIONS() {
  return NextResponse.json({
    systemPresets: {
      extract: EXTRACT_SYSTEM,
      digest: DIGEST_SYSTEM,
    },
  });
}
