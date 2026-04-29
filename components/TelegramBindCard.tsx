"use client";

import { useEffect, useState } from "react";

type Binding = {
  id: string;
  chatId: number | null;
  username: string | null;
  firstName: string | null;
  enabled: boolean;
  createdAt: string;
};

type Status =
  | { kind: "loading" }
  | { kind: "not-configured" }
  | { kind: "ready"; bindings: Binding[]; botUsername: string }
  | { kind: "working"; bindings: Binding[]; botUsername: string };

export function TelegramBindCard() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [pending, setPending] = useState<{ token: string; deepLink: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/telegram/bind");
    if (!res.ok) {
      setStatus({ kind: "not-configured" });
      return;
    }
    const data = (await res.json()) as {
      bindings: Binding[];
      botUsername: string | null;
      configured: boolean;
    };
    if (!data.configured || !data.botUsername) {
      setStatus({ kind: "not-configured" });
      return;
    }
    setStatus({ kind: "ready", bindings: data.bindings, botUsername: data.botUsername });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function generateToken() {
    if (status.kind !== "ready") return;
    setStatus({ ...status, kind: "working" });
    setMsg(null);
    const res = await fetch("/api/telegram/bind", { method: "POST" });
    if (!res.ok) {
      setMsg("生成失败，请重试");
      setStatus({ ...status, kind: "ready" });
      return;
    }
    const data = (await res.json()) as { token: string; deepLink: string; expiresAt: string };
    setPending(data);
    setStatus({ ...status, kind: "ready" });
    // Refresh bindings every 4s so the card flips to "已绑定" once the user clicks /start.
    const startedAt = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - startedAt > 5 * 60 * 1000) return clearInterval(iv);
      const r = await fetch("/api/telegram/bind");
      if (!r.ok) return;
      const d = (await r.json()) as { bindings: Binding[]; botUsername: string };
      if (d.bindings.length) {
        setPending(null);
        setStatus({ kind: "ready", bindings: d.bindings, botUsername: d.botUsername });
        clearInterval(iv);
      }
    }, 4000);
  }

  async function unbind(id: string) {
    if (status.kind !== "ready") return;
    setStatus({ ...status, kind: "working" });
    setMsg(null);
    const res = await fetch(`/api/telegram/bind?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg("解绑失败");
    }
    await refresh();
  }

  if (status.kind === "loading") {
    return (
      <div className="mt-3 rounded-xl border border-border bg-panel/60 p-4 text-xs text-mute">
        <div className="mb-1 font-medium text-ink">Telegram 绑定</div>
        检查中…
      </div>
    );
  }

  if (status.kind === "not-configured") {
    return (
      <div className="mt-3 rounded-xl border border-border bg-panel/60 p-4 text-xs text-mute">
        <div className="mb-1 font-medium text-ink">Telegram 绑定</div>
        后端没有配置 Telegram bot（TELEGRAM_BOT_TOKEN）。部署时补上就能用。
      </div>
    );
  }

  const { bindings, botUsername } = status;

  return (
    <div className="mt-3 rounded-xl border border-border bg-panel/60 p-4 text-xs text-mute">
      <div className="mb-2 font-medium text-ink">Telegram 绑定</div>

      {bindings.length ? (
        <div className="flex flex-col gap-2">
          {bindings.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2"
            >
              <div>
                <div className="text-ink">
                  {b.username ? `@${b.username}` : b.firstName || `chat ${b.chatId}`}
                </div>
                <div className="text-[11px] text-mute">已绑定 · {new Date(b.createdAt).toLocaleDateString("zh-CN")}</div>
              </div>
              <button
                onClick={() => unbind(b.id)}
                className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-red-300 hover:border-red-500/50"
              >
                解绑
              </button>
            </div>
          ))}
          <div className="mt-1">把消息发给 @{botUsername} 就会同步到 TinyPA，早报也会推到这里。</div>
        </div>
      ) : pending ? (
        <div className="flex flex-col gap-2">
          <div>
            点下面按钮打开 <b>@{botUsername}</b>，然后发送里面已填好的命令就完成绑定（5 分钟内有效）。
          </div>
          <a
            href={pending.deepLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-accent px-3 py-1.5 text-center text-xs font-medium text-white"
          >
            打开 Telegram 完成绑定
          </a>
          <div className="text-[11px]">或者手动在 @{botUsername} 里发：<code className="rounded bg-bg px-1">/start {pending.token}</code></div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={generateToken}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            生成绑定码
          </button>
          <span>绑定 @{botUsername} 后，在 Telegram 里发消息就能同步到 TinyPA。</span>
        </div>
      )}

      {msg && <div className="mt-2 text-mute">{msg}</div>}
    </div>
  );
}
