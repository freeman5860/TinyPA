"use client";

import Link from "next/link";
import { useState } from "react";

const MODEL_PRESETS = [
  "google/gemma-4-31b-it",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.3-70b-instruct",
  "nvidia/nv-embedqa-e5-v5",
];

const USER_PROMPT_EXAMPLES = [
  "明天下午3点开会要准备财报；昨晚梦见小时候的院子；最近有点累",
  "你好",
  "Say hi in one word.",
];

type RunResult = {
  ok: boolean;
  totalMs: number;
  ttftMs: number | null;
  output: string;
  promptTokens: number | null;
  completionTokens: number | null;
  err: string | null;
};

type RunResponse = {
  env: {
    model: string;
    baseURL: string;
    stream: boolean;
    maxTokens: number;
    temperature: number;
  };
  result: RunResult;
};

export function LlmTestClient({
  presets,
}: {
  presets: { extract: string; digest: string };
}) {
  const [model, setModel] = useState(MODEL_PRESETS[0]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState(USER_PROMPT_EXAMPLES[0]);
  const [stream, setStream] = useState(true);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.4);
  const [running, setRunning] = useState(false);
  const [resp, setResp] = useState<RunResponse | null>(null);
  const [clientMs, setClientMs] = useState<number | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setResp(null);
    setClientMs(null);
    const t0 = Date.now();
    try {
      const r = await fetch("/api/debug/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          systemPrompt,
          userPrompt,
          stream,
          maxTokens,
          temperature,
        }),
      });
      const d = await r.json();
      setClientMs(Date.now() - t0);
      if (!r.ok) {
        setResp({
          env: { model, baseURL: "-", stream, maxTokens, temperature },
          result: {
            ok: false,
            totalMs: Date.now() - t0,
            ttftMs: null,
            output: "",
            promptTokens: null,
            completionTokens: null,
            err: d.error ?? "request_failed",
          },
        });
      } else {
        setResp(d as RunResponse);
      }
    } catch (e) {
      setClientMs(Date.now() - t0);
      setResp({
        env: { model, baseURL: "-", stream, maxTokens, temperature },
        result: {
          ok: false,
          totalMs: Date.now() - t0,
          ttftMs: null,
          output: "",
          promptTokens: null,
          completionTokens: null,
          err: e instanceof Error ? e.message : String(e),
        },
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-20">
      <header className="mb-4">
        <Link href="/settings" className="text-xs text-mute hover:text-ink">
          ← 设置
        </Link>
        <h1 className="mt-2 text-xl font-semibold">LLM 连接 & 耗时测试</h1>
        <p className="text-xs text-mute">
          直接走和生产同一条 OpenAI SDK + undici IPv4 agent 链路，只是可以改模型/prompt/流式。
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <Field label="模型">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent"
            placeholder="google/gemma-4-31b-it"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {MODEL_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={
                  "rounded-md border px-2 py-0.5 text-[11px] " +
                  (model === m
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-mute hover:text-ink")
                }
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Field label="System prompt（可空）">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[12px] outline-none focus:border-accent"
            placeholder="（留空即不传 system）"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              onClick={() => setSystemPrompt("")}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-mute hover:text-ink"
            >
              清空
            </button>
            <button
              onClick={() => setSystemPrompt(presets.extract)}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-mute hover:text-ink"
            >
              载入 EXTRACT_SYSTEM
            </button>
            <button
              onClick={() => setSystemPrompt(presets.digest)}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-mute hover:text-ink"
            >
              载入 DIGEST_SYSTEM
            </button>
          </div>
        </Field>

        <Field label="User prompt">
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {USER_PROMPT_EXAMPLES.map((p) => (
              <button
                key={p}
                onClick={() => setUserPrompt(p)}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-mute hover:text-ink"
              >
                {p.length > 24 ? p.slice(0, 24) + "…" : p}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="max_tokens">
            <input
              type="number"
              value={maxTokens}
              min={1}
              max={4096}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent"
            />
          </Field>
          <Field label="temperature">
            <input
              type="number"
              value={temperature}
              step={0.1}
              min={0}
              max={2}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent"
            />
          </Field>
          <Field label="流式">
            <label className="flex h-[38px] items-center gap-2 rounded-lg border border-border bg-bg px-3 text-[14px]">
              <input
                type="checkbox"
                checked={stream}
                onChange={(e) => setStream(e.target.checked)}
              />
              stream
            </label>
          </Field>
        </div>

        <button
          onClick={run}
          disabled={running || !userPrompt.trim() || !model.trim()}
          className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {running ? "请求中…" : "运行"}
        </button>
      </section>

      {resp && (
        <section className="mt-5 flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-panel/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span
                className={
                  "rounded px-1.5 py-0.5 text-[11px] " +
                  (resp.result.ok
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300")
                }
              >
                {resp.result.ok ? "OK" : "ERROR"}
              </span>
              <span className="text-mute">{resp.env.model}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
              <Metric label="Server 总耗时" value={`${resp.result.totalMs} ms`} />
              <Metric
                label="TTFT (server)"
                value={resp.result.ttftMs !== null ? `${resp.result.ttftMs} ms` : "—"}
              />
              <Metric label="Prompt tokens" value={fmt(resp.result.promptTokens)} />
              <Metric label="Completion tokens" value={fmt(resp.result.completionTokens)} />
            </div>

            {clientMs !== null && (
              <div className="mt-2 text-[11px] text-mute">
                客户端感知总耗时 {clientMs} ms（含网络 + JSON 序列化）
              </div>
            )}
          </div>

          {resp.result.err && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              <div className="font-medium">错误</div>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">
                {resp.result.err}
              </pre>
            </div>
          )}

          {resp.result.output && (
            <div className="rounded-xl border border-border bg-panel/60 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-mute">
                <span>原始输出</span>
                <span>{resp.result.output.length} chars</span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-ink">
                {resp.result.output}
              </pre>
              <NdjsonPreview text={resp.result.output} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-mute">{label}</div>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 px-2 py-1.5">
      <div className="text-[10px] text-mute">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] text-ink">{value}</div>
    </div>
  );
}

function fmt(n: number | null) {
  if (n === null) return "—";
  return String(n);
}

function NdjsonPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed: { line: string; obj: unknown; err: string | null }[] = [];
  let anyParsed = false;
  for (const line of lines) {
    try {
      parsed.push({ line, obj: JSON.parse(line), err: null });
      anyParsed = true;
    } catch (e) {
      parsed.push({
        line,
        obj: null,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (!anyParsed || lines.length <= 1) return null;
  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="mb-1 text-[11px] text-mute">
        按行 JSON parse 结果（{parsed.filter((p) => !p.err).length}/{parsed.length} 行成功）
      </div>
      <div className="flex flex-col gap-1">
        {parsed.map((p, i) => (
          <div
            key={i}
            className={
              "rounded-md border px-2 py-1 font-mono text-[11px] " +
              (p.err
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200")
            }
          >
            {p.err ? `✗ ${p.err}: ${p.line}` : `✓ ${JSON.stringify(p.obj)}`}
          </div>
        ))}
      </div>
    </div>
  );
}
