"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export type ArrivedItem = {
  id: string;
  type: "todo" | "note" | "mood" | "followup";
  content: string;
  status: "open" | "done" | "dropped";
  priority: number;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  tags: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onItemsArrived: (items: ArrivedItem[]) => void;
};

const POLL_TIMEOUT_MS = 60_000;

export function HoleInput({ open, onClose, onItemsArrived }: Props) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "flying" | "waiting" | "done">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setPhase("idle");
      setErrMsg(null);
      setText("");
      // focus textarea after panel mounts
      const t = setTimeout(() => taRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "waiting") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  async function pollUntilProcessed(msgId: string, deadline: number) {
    if (Date.now() > deadline) {
      setErrMsg("整理超时，原话已记下，稍后刷新看看。");
      setPhase("idle");
      return;
    }
    pollTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/messages/poll?ids=${encodeURIComponent(msgId)}`, {
          cache: "no-store",
        });
        const d = await r.json();
        const m = Array.isArray(d.messages) ? d.messages[0] : null;
        if (m && m.processedAt) {
          const items = (m.items ?? []) as ArrivedItem[];
          setPhase("done");
          onItemsArrived(items);
          // brief delay so user sees the hole settle, then close
          setTimeout(() => onClose(), 350);
          return;
        }
      } catch {
        // swallow, will retry
      }
      pollUntilProcessed(msgId, deadline);
    }, 1500);
  }

  async function send() {
    const t = text.trim();
    if (!t || phase !== "idle") return;
    setErrMsg(null);
    setPhase("flying");
    // small delay so the flying animation can play before we swap to waiting
    setTimeout(() => setPhase((p) => (p === "flying" ? "waiting" : p)), 750);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error ?? "send_failed");
      }
      if (d.quotaExceeded) {
        setErrMsg("今日额度已满，明天见。");
        setPhase("idle");
        return;
      }
      const msgId: string = d.message?.id;
      if (!msgId) throw new Error("no_message_id");
      pollUntilProcessed(msgId, Date.now() + POLL_TIMEOUT_MS);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "送出失败，稍后再试。");
      setPhase("idle");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      onClick={() => phase === "idle" && onClose()}
    >
      {/* backdrop dim, transparent enough to keep tree visible */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "relative w-full max-w-md rounded-2xl border border-dusk-bark/60 bg-[#1a0e08]/95 p-4 shadow-2xl",
          "transition-all duration-300",
          phase === "flying" && "scale-50 opacity-0 translate-y-32",
          phase === "waiting" && "scale-90 opacity-60",
        )}
        style={{
          // gentle warm rim glow to feel of-a-piece with the dusk
          boxShadow: "0 0 40px rgba(245,168,94,0.15), 0 10px 30px rgba(0,0,0,0.6)",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-dusk-glow">对树洞说点什么</h3>
          {phase === "idle" && (
            <button
              onClick={onClose}
              className="text-xs text-mute hover:text-dusk-glow"
              aria-label="关闭"
            >
              收起
            </button>
          )}
        </div>

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
          rows={4}
          maxLength={4000}
          disabled={phase !== "idle"}
          className="w-full resize-none rounded-xl border border-dusk-bark/60 bg-[#0a0506]/80 px-3 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-mute focus:border-dusk-glow/60 disabled:opacity-60"
        />

        {errMsg && <div className="mt-2 text-xs text-amber-300">{errMsg}</div>}

        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] text-mute">
            {phase === "waiting" ? "树在听…" : "⌘/Ctrl + Enter 送入树洞"}
          </div>
          <button
            onClick={send}
            disabled={phase !== "idle" || !text.trim()}
            className="rounded-xl bg-dusk-horizon px-4 py-2 text-sm font-medium text-[#1a0e08] shadow-md disabled:opacity-40"
          >
            {phase === "idle" ? "送入" : phase === "flying" ? "飞入中…" : "倾听中…"}
          </button>
        </div>
      </div>
    </div>
  );
}
