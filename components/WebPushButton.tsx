"use client";

import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "ios-not-standalone" | "denied" | "off" | "on" | "working";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS exposes navigator.standalone
  const ios = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!(mq || ios);
}

export function WebPushButton({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (!vapidPublicKey) {
        setState("unsupported");
        setMsg("服务器未配置 VAPID_PUBLIC_KEY");
        return;
      }
      if (isIos() && !isStandalone()) {
        setState("ios-not-standalone");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setState(existing ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setState("working");
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("订阅保存失败");
      setState("on");
    } catch (e) {
      setState("off");
      setMsg(e instanceof Error ? e.message : "订阅失败");
    }
  }

  async function disable() {
    setState("working");
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setState("on");
      setMsg(e instanceof Error ? e.message : "解绑失败");
    }
  }

  async function test() {
    setMsg(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    if (!res.ok) {
      setMsg("测试推送失败");
      return;
    }
    const data = (await res.json()) as { sent: number; pruned: number; failed: number };
    setMsg(`已发送 ${data.sent} 条，清理 ${data.pruned} 条失效订阅`);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-panel/60 p-4 text-xs text-mute">
      <div className="mb-2 font-medium text-ink">浏览器推送</div>

      {state === "loading" && <div>检查中…</div>}

      {state === "unsupported" && (
        <div>当前浏览器不支持 Web Push。{msg ? `(${msg})` : ""}</div>
      )}

      {state === "ios-not-standalone" && (
        <div>
          iOS 需要先把 TinyPA 添加到主屏幕（Safari → 分享 →「添加到主屏幕」），再从桌面图标打开才能开启推送。
        </div>
      )}

      {state === "denied" && (
        <div>通知权限被拒绝。到浏览器设置里允许通知后刷新页面。</div>
      )}

      {(state === "off" || state === "working") && (
        <div className="flex items-center gap-2">
          <button
            onClick={enable}
            disabled={state === "working"}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {state === "working" ? "处理中…" : "开启推送"}
          </button>
          <span>开启后，每天 08:03 的早报会直接弹到系统通知。</span>
        </div>
      )}

      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-emerald-400">● 已开启</span>
          <button
            onClick={test}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent/50"
          >
            发一条测试
          </button>
          <button
            onClick={disable}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-red-300 hover:border-red-500/50"
          >
            关闭
          </button>
        </div>
      )}

      {msg && <div className="mt-2 text-mute">{msg}</div>}
    </div>
  );
}
