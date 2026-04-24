"use client";

import { useEffect, useRef, useState } from "react";

type Hit = {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  matchedBy: "keyword" | "vector";
  score: number;
};

export function NotesSearchClient() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (!trimmed) {
      setHits(null);
      setLoading(false);
      setErr(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(
          `/api/notes/search?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        const d = await r.json();
        if (seq !== seqRef.current) return;
        if (!r.ok) throw new Error(d.error ?? "search_failed");
        setHits(Array.isArray(d.items) ? d.items : []);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setErr(e instanceof Error ? e.message : "搜索出错");
        setHits([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div
      className="flex flex-col"
      style={{ height: "calc(100dvh - 56px - env(safe-area-inset-bottom))" }}
    >
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">搜索</h1>
        <p className="text-xs text-mute">搜得到你以前说过的事，按词也按含义。</p>
      </header>

      <div className="shrink-0 border-b border-border bg-panel/60 px-4 py-3">
        <div className="mx-auto max-w-xl">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="试试'财报'、'累'、'童年'"
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-[15px] outline-none focus:border-accent"
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {hits === null && (
            <div className="mt-16 text-center text-sm text-mute">
              输点什么看看。
              <br />
              关键字 + 语义一起搜。
            </div>
          )}
          {loading && hits === null && (
            <div className="text-center text-xs text-mute">搜索中…</div>
          )}
          {err && (
            <div className="text-center text-xs text-amber-400">{err}</div>
          )}
          {hits !== null && hits.length === 0 && !loading && !err && (
            <div className="mt-16 text-center text-sm text-mute">
              没找到相关 note。
            </div>
          )}
          {hits?.map((h) => (
            <div
              key={h.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-panel/60 px-3 py-2.5 text-sm"
            >
              <span
                className={
                  "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] " +
                  (h.matchedBy === "keyword"
                    ? "bg-accent/15 text-accent"
                    : "bg-emerald-500/15 text-emerald-300")
                }
                title={
                  h.matchedBy === "keyword"
                    ? "关键字命中"
                    : `语义相似 ${h.score.toFixed(2)}`
                }
              >
                {h.matchedBy === "keyword" ? "关键字" : "语义"}
              </span>
              <div className="flex-1 text-ink">
                <Highlight text={h.content} q={q.trim()} />
                <div className="mt-1 text-[11px] text-mute">
                  {new Date(h.createdAt).toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {h.tags.length > 0 && (
                    <span className="ml-2">
                      {h.tags.map((t) => `#${t}`).join(" ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={idx}
        className="rounded bg-accent/30 px-0.5 text-ink"
      >
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  return <>{parts}</>;
}
