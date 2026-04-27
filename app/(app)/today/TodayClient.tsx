"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { ItemEditSheet, EditableItem } from "@/components/ItemEditSheet";

type Item = {
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

export function TodayClient({
  tz,
  openTodos,
  openFollowups,
  todayItems,
}: {
  tz: string;
  openTodos: Item[];
  openFollowups: Item[];
  todayItems: Item[];
}) {
  const [todos, setTodos] = useState(openTodos);
  const [followups, setFollowups] = useState(openFollowups);
  const [records, setRecords] = useState(todayItems);
  const [editing, setEditing] = useState<EditableItem | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(id: string, done: boolean) {
    setTodos((t) =>
      t.map((x) =>
        x.id === id
          ? { ...x, status: done ? "done" : "open", completedAt: done ? new Date().toISOString() : null }
          : x
      )
    );
    startTransition(async () => {
      await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: done ? "done" : "open" }),
      });
    });
  }

  async function completeFollowup(id: string) {
    setFollowups((f) => f.filter((x) => x.id !== id));
    setRecords((r) =>
      r.map((x) =>
        x.id === id
          ? { ...x, status: "done", completedAt: new Date().toISOString() }
          : x
      )
    );
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  }

  async function drop(id: string) {
    setTodos((t) => t.filter((x) => x.id !== id));
    setFollowups((f) => f.filter((x) => x.id !== id));
    setRecords((t) => t.filter((x) => x.id !== id));
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  }

  function applyEdit(updated: EditableItem) {
    const patch = (x: Item) =>
      x.id === updated.id
        ? {
            ...x,
            content: updated.content,
            dueAt: updated.dueAt,
            priority: updated.priority,
          }
        : x;
    setTodos((t) => t.map(patch));
    setFollowups((f) => f.map(patch));
    setRecords((r) => r.map(patch));
  }

  const openEdit = (it: Item) =>
    setEditing({
      id: it.id,
      type: it.type,
      content: it.content,
      dueAt: it.dueAt,
      priority: it.priority,
    });

  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="text-xs text-mute">
          {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
          <span className="ml-2 opacity-60">{tz}</span>
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-mute">
          待办 · {todos.filter((t) => t.status === "open").length} 项
        </h2>
        <ul className="flex flex-col gap-1.5">
          {todos.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-mute">
              目前没有未完成的待办。去聊天页记一些吧。
            </li>
          )}
          {todos.map((t) => (
            <li
              key={t.id}
              className={clsx(
                "flex items-start gap-3 rounded-xl border border-border bg-panel p-3",
                t.status === "done" && "opacity-50"
              )}
            >
              <button
                onClick={() => toggle(t.id, t.status !== "done")}
                className={clsx(
                  "mt-0.5 h-5 w-5 shrink-0 rounded-md border",
                  t.status === "done" ? "border-accent bg-accent" : "border-border bg-bg"
                )}
                aria-label={t.status === "done" ? "取消完成" : "标记完成"}
              >
                {t.status === "done" && (
                  <svg viewBox="0 0 20 20" className="h-5 w-5" stroke="white" strokeWidth="2.5" fill="none">
                    <path d="M5 10l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className={clsx("text-[15px]", t.status === "done" && "line-through")}>
                  {t.content}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-mute">
                  {t.dueAt && (
                    <span>
                      {new Date(t.dueAt).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5",
                      t.priority === 1
                        ? "bg-red-500/15 text-red-300"
                        : t.priority === 3
                        ? "bg-zinc-500/15 text-zinc-400"
                        : "bg-accent/10 text-accent/80"
                    )}
                  >
                    P{t.priority}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <button onClick={() => openEdit(t)} className="text-mute hover:text-ink">
                  编辑
                </button>
                <button onClick={() => drop(t.id)} className="text-mute hover:text-red-400">
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-mute">
          待跟进 · {followups.length} 项
        </h2>
        <ul className="flex flex-col gap-1.5">
          {followups.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-mute">
              没有等别人的事。
            </li>
          )}
          {followups.map((f) => {
            const daysWaited = Math.floor(
              (Date.now() - new Date(f.createdAt).getTime()) / (24 * 3600 * 1000)
            );
            const stale = daysWaited >= 3;
            return (
              <li
                key={f.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-panel p-3"
              >
                <span className="mt-0.5 shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">
                  跟进
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px]">{f.content}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={clsx(
                        stale ? "text-amber-400" : "text-mute"
                      )}
                    >
                      {daysWaited === 0
                        ? "今天"
                        : daysWaited === 1
                        ? "已等 1 天"
                        : `已等 ${daysWaited} 天`}
                    </span>
                    {f.dueAt && (
                      <span className="text-mute">
                        到期{" "}
                        {new Date(f.dueAt).toLocaleString("zh-CN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <button
                    onClick={() => completeFollowup(f.id)}
                    className="text-emerald-300 hover:text-emerald-200"
                  >
                    完成
                  </button>
                  <button onClick={() => openEdit(f)} className="text-mute hover:text-ink">
                    编辑
                  </button>
                  <button onClick={() => drop(f.id)} className="text-mute hover:text-red-400">
                    删除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-mute">今日记录 · {records.length} 条</h2>
        <ul className="flex flex-col gap-1.5">
          {records.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-mute">
              今天还没有记录，去聊天页说点什么吧。
            </li>
          )}
          {records.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-panel p-3 text-sm"
            >
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${typeColor[r.type]}`}>
                {typeLabel[r.type]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-ink">{r.content}</div>
                <div className="mt-0.5 text-xs text-mute">
                  {new Date(r.createdAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <button onClick={() => openEdit(r)} className="text-mute hover:text-ink">
                  编辑
                </button>
                <button onClick={() => drop(r.id)} className="text-mute hover:text-red-400">
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ItemEditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={applyEdit}
      />
    </div>
  );
}
