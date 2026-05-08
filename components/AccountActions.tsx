"use client";

import { useState } from "react";

export function AccountActions({ email }: { email: string }) {
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/me/export");
      if (!res.ok) throw new Error("导出失败");
      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") || "";
      const match = dispo.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "tinypa-export.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error === "confirm_email_mismatch" ? "邮箱不匹配" : "删除失败");
      }
      window.location.href = "/login?deleted=1";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
      setDeleting(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="w-full rounded-xl border border-border bg-panel/60 p-4 text-left text-sm hover:border-accent/50 disabled:opacity-60"
      >
        <div className="font-medium text-ink">{exporting ? "导出中…" : "导出我的数据"}</div>
        <div className="mt-0.5 text-xs text-mute">下载一份 JSON，包含你的所有消息、条目、复盘。</div>
      </button>

      {!deleteOpen ? (
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="w-full rounded-xl border border-border bg-panel/60 p-4 text-left text-sm hover:border-red-500/50"
        >
          <div className="font-medium text-red-300">删除账号</div>
          <div className="mt-0.5 text-xs text-mute">清除所有数据，无法恢复。</div>
        </button>
      ) : (
        <div className="rounded-xl border border-red-500/40 bg-panel/60 p-4 text-sm">
          <div className="mb-2 font-medium text-red-300">确认删除账号</div>
          <p className="mb-3 text-xs text-mute">
            这一步不可逆。所有消息、条目、复盘、推送订阅都会立即从数据库里消失。
            在下面输入 <b className="text-ink">{email}</b> 确认。
          </p>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="你的邮箱"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-ink outline-none focus:border-red-500/60"
            autoFocus
          />
          {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setConfirmEmail("");
                setErr(null);
              }}
              disabled={deleting}
              className="flex-1 rounded-lg border border-border py-2 text-sm text-ink hover:bg-panel"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              className="flex-1 rounded-lg bg-red-500/80 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? "删除中…" : "永久删除"}
            </button>
          </div>
        </div>
      )}

      {err && !deleteOpen && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}
