import { NextRequest, NextResponse } from "next/server";
import { setDefaultResultOrder } from "node:dns";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // noop
}

// Hit this from anywhere (no auth) — gated only by ?secret=$CRON_SECRET so it
// can't be abused. Runs the exact same two calls as test-nim.mjs, inside a
// Vercel function, so we can tell network/key/region issues apart from
// issues specific to after() background execution.

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

  const client = new OpenAI({ apiKey, baseURL, timeout: 55_000, maxRetries: 0 });

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
