"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Item = {
  id: string;
  type: "todo" | "note" | "mood" | "followup";
  content: string;
  dueAt: string | null;
  priority: number;
  tags: string[];
};

type Msg = {
  id: string;
  rawText: string;
  replyText: string | null;
  createdAt: string;
  processedAt: string | null;
  items: Item[];
  pending?: boolean;
  error?: boolean;
};

const typeLabel: Record<Item["type"], string> = {
  todo: "待办",
  note: "笔记",
  mood: "心情",
  followup: "待跟进",
};

const typeColor: Record<Item["type"], string> = {
  todo: "bg-accent/15 text-accent",
  note: "bg-emerald-500/15 text-emerald-300",
  mood: "bg-pink-500/15 text-pink-300",
  followup: "bg-amber-500/15 text-amber-300",
};

export default function ChatClient() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStop = useRef<number>(0);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const lastIdRef = useRef<string | null>(null);
  // When loadOlder prepends, capture pre-prepend (scrollHeight - scrollTop)
  // so we can restore exact reading position after the DOM grows.
  const restoreScrollRef = useRef<number | null>(null);

  useEffect(() => {
    refresh();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  // Scroll to bottom ONLY when the newest message id changes (initial load,
  // new send, reply arrival). Prepends don't change last id, so reader stays
  // put.
  useEffect(() => {
    const lastId = msgs[msgs.length - 1]?.id ?? null;
    if (lastId && lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else if (!lastId) {
      lastIdRef.current = null;
    }
  }, [msgs]);

  // Restore scroll position after a prepend from loadOlder.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || restoreScrollRef.current === null) return;
    el.scrollTop = el.scrollHeight - restoreScrollRef.current;
    restoreScrollRef.current = null;
  }, [msgs]);

  async function refresh() {
    try {
      const r = await fetch("/api/messages?limit=15", { cache: "no-store" });
      const d = await r.json();
      if (Array.isArray(d.messages)) {
        setHasMore(!!d.hasMore);
        setMsgs((prev) =>
          (d.messages as Msg[]).map((m) => {
            const local = prev.find((p) => p.id === m.id);
            const stillPending = !m.processedAt;
            return {
              ...m,
              pending: local?.pending && stillPending ? true : false,
              error: local?.error,
            };
          })
        );
      }
    } catch {}
  }

  async function loadOlder() {
    if (loadingOlder || !hasMore) return;
    const oldest = msgsRef.current[0];
    if (!oldest) return;
    const el = scrollRef.current;
    if (el) restoreScrollRef.current = el.scrollHeight - el.scrollTop;
    setLoadingOlder(true);
    try {
      const r = await fetch(
        `/api/messages?limit=15&before=${encodeURIComponent(oldest.createdAt)}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      if (Array.isArray(d.messages)) {
        setHasMore(!!d.hasMore);
        setMsgs((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const older = (d.messages as Msg[])
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({ ...m, pending: false, error: false }));
          return [...older, ...prev];
        });
      }
    } catch {
      // swallow; user can scroll again
      restoreScrollRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }

  // Thin poll: only the pending ids, not the whole history.
  async function pollPending() {
    const pendingIds = msgsRef.current
      .filter((m) => m.pending && !m.id.startsWith("tmp-"))
      .map((m) => m.id);
    if (!pendingIds.length) return;
    try {
      const r = await fetch(
        `/api/messages/poll?ids=${encodeURIComponent(pendingIds.join(","))}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      if (!Array.isArray(d.messages)) return;
      const byId = new Map<string, { replyText: string | null; processedAt: string | null; items: Item[] }>();
      for (const m of d.messages) {
        byId.set(m.id, {
          replyText: m.replyText ?? null,
          processedAt: m.processedAt ?? null,
          items: m.items ?? [],
        });
      }
      setMsgs((prev) =>
        prev.map((m) => {
          const fresh = byId.get(m.id);
          if (!fresh) return m;
          const done = !!fresh.processedAt;
          return {
            ...m,
            replyText: fresh.replyText,
            processedAt: fresh.processedAt,
            items: fresh.items,
            pending: done ? false : m.pending,
          };
        })
      );
    } catch {}
  }

  function schedulePoll() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (Date.now() > pollStop.current) {
      setMsgs((prev) =>
        prev.map((m) => (m.pending ? { ...m, pending: false, error: true } : m))
      );
      return;
    }
    pollTimer.current = setTimeout(async () => {
      await pollPending();
      setMsgs((prev) => {
        const stillPending = prev.some((m) => m.pending);
        if (stillPending && Date.now() < pollStop.current) {
          schedulePoll();
        } else if (stillPending) {
          return prev.map((m) => (m.pending ? { ...m, pending: false, error: true } : m));
        }
        return prev;
      });
    }, 1500);
  }

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Msg = {
      id: tempId,
      rawText: t,
      replyText: null,
      createdAt: new Date().toISOString(),
      processedAt: null,
      items: [],
      pending: true,
    };
    setMsgs((m) => [...m, optimistic]);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "send_failed");

      setMsgs((m) =>
        m.map((x) =>
          x.id === tempId
            ? {
                id: d.message.id,
                rawText: d.message.rawText,
                replyText: d.message.replyText ?? null,
                createdAt: d.message.createdAt,
                processedAt: d.message.processedAt ?? null,
                items: d.message.items ?? [],
                pending: true,
              }
            : x
        )
      );

      pollStop.current = Date.now() + 60_000;
      schedulePoll();
    } catch {
      setMsgs((m) =>
        m.map((x) => (x.id === tempId ? { ...x, pending: false, error: true } : x))
      );
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: "calc(100dvh - 56px - env(safe-area-inset-bottom))" }}
    >
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">聊天</h1>
        <p className="text-xs text-mute">说点什么吧，我在听。</p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {msgs.length > 0 && (
            <div className="flex justify-center text-xs text-mute">
              {loadingOlder ? (
                <span className="flex items-center gap-1.5">
                  <Spinner /> 加载中…
                </span>
              ) : hasMore ? (
                <button onClick={loadOlder} className="hover:text-ink">
                  加载更多
                </button>
              ) : (
                <span className="opacity-50">已经到最早了</span>
              )}
            </div>
          )}
          {msgs.length === 0 && (
            <div className="mt-16 text-center text-sm text-mute">
              第一次来？
              <br />
              试试"明天下午3点开会要准备财报"或"今天有点累"。
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              {/* User bubble */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/90 px-4 py-2.5 text-white">
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.rawText}</div>
                </div>
              </div>

              {m.pending && !m.replyText && (
                <div className="flex items-center gap-1.5 text-xs text-mute">
                  <AssistantAvatar />
                  <Spinner /> 正在整理…
                </div>
              )}

              {/* Assistant reply bubble */}
              {m.replyText && (
                <div className="flex items-start gap-2">
                  <AssistantAvatar />
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-panel px-4 py-2.5">
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                      {m.replyText}
                    </div>
                  </div>
                </div>
              )}

              {/* Extracted item cards */}
              {m.items && m.items.length > 0 && (
                <div className="flex flex-col gap-1.5 pl-10">
                  {m.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex max-w-[85%] items-start gap-2 rounded-xl border border-border bg-panel/60 px-3 py-2 text-sm"
                    >
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${typeColor[it.type]}`}>
                        {typeLabel[it.type]}
                      </span>
                      <div className="flex-1 text-ink">
                        {it.content}
                        {it.dueAt && (
                          <span className="ml-2 text-xs text-mute">
                            {new Date(it.dueAt).toLocaleString("zh-CN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {m.error && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AssistantAvatar />
                  整理超时，你的原话已记下，稍后刷新看看。
                </div>
              )}
              {m.processedAt && !m.replyText && m.items.length === 0 && !m.pending && !m.error && (
                <div className="flex items-center gap-1.5 text-xs text-mute">
                  <AssistantAvatar />
                  已记录。
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-panel px-3 py-2">
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="今天想说点什么…"
            rows={1}
            className="min-h-[40px] max-h-32 flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            发送
          </button>
        </div>
        <div className="mx-auto mt-1 max-w-xl px-1 text-[11px] text-mute">⌘/Ctrl + Enter 发送</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin text-mute"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function AssistantAvatar() {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-medium text-accent">
      PA
    </div>
  );
}
