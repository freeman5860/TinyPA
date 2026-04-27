"use client";

import { useEffect, useState } from "react";

type ItemType = "todo" | "note" | "mood" | "followup";

export type EditableItem = {
  id: string;
  type: ItemType;
  content: string;
  dueAt: string | null;
  priority: number;
};

type Patch = {
  content?: string;
  dueAt?: string | null;
  priority?: number;
};

// Turn an ISO string into what a <input type="datetime-local"> wants:
// "YYYY-MM-DDTHH:mm" in the user's local time. Empty if no dueAt.
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Reverse: interpret a datetime-local string as user's local time, emit ISO.
function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function ItemEditSheet({
  item,
  onClose,
  onSaved,
}: {
  item: EditableItem | null;
  onClose: () => void;
  onSaved: (updated: EditableItem) => void;
}) {
  const [content, setContent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState(2);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setContent(item.content);
    setDueAt(toLocalInput(item.dueAt));
    setPriority(item.priority);
    setErr(null);
  }, [item]);

  if (!item) return null;

  const showTime = item.type === "todo" || item.type === "followup";
  const showPriority = item.type === "todo";

  async function save() {
    if (!item) return;
    const trimmed = content.trim();
    if (!trimmed) {
      setErr("内容不能为空");
      return;
    }
    const patch: Patch = {};
    if (trimmed !== item.content) patch.content = trimmed;
    if (showTime) {
      const newDueAt = fromLocalInput(dueAt);
      if (newDueAt !== item.dueAt) patch.dueAt = newDueAt;
    }
    if (showPriority && priority !== item.priority) patch.priority = priority;
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "save_failed");
      onSaved({
        ...item,
        content: patch.content ?? item.content,
        dueAt: "dueAt" in patch ? patch.dueAt ?? null : item.dueAt,
        priority: patch.priority ?? item.priority,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存出错");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-panel p-4 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium">编辑</h3>
          <button onClick={onClose} className="text-xs text-mute hover:text-ink">
            取消
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 text-[11px] text-mute">内容</div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-[15px] outline-none focus:border-accent"
              autoFocus
            />
          </div>

          {showTime && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-mute">
                <span>时间</span>
                {dueAt && (
                  <button
                    onClick={() => setDueAt("")}
                    className="hover:text-ink"
                  >
                    清除
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent"
              />
            </div>
          )}

          {showPriority && (
            <div>
              <div className="mb-1 text-[11px] text-mute">优先级</div>
              <div className="flex gap-1">
                {[
                  { v: 1, label: "P1 重要", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
                  { v: 2, label: "P2 普通", cls: "bg-accent/10 text-accent border-accent/40" },
                  { v: 3, label: "P3 可选", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setPriority(o.v)}
                    className={
                      "flex-1 rounded-lg border px-3 py-1.5 text-[12px] " +
                      (priority === o.v ? o.cls : "border-border text-mute hover:text-ink")
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <div className="text-xs text-red-300">{err}</div>}

          <button
            onClick={save}
            disabled={saving || !content.trim()}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
