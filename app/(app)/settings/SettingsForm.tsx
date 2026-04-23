"use client";

import { useState } from "react";

const TZ_OPTIONS = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/Los_Angeles",
  "America/New_York",
  "UTC",
];

export function SettingsForm({
  initial,
}: {
  initial: { name: string; timezone: string; digestHour: number; morningHour: number };
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        timezone: form.timezone,
        digestHour: Number(form.digestHour),
        morningHour: Number(form.morningHour),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-panel p-5">
      <Field label="昵称">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="随便取一个"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
        />
      </Field>

      <Field label="时区">
        <select
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
        >
          {TZ_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </Field>

      <Field label="每晚复盘时间">
        <HourPicker
          value={form.digestHour}
          onChange={(h) => setForm({ ...form, digestHour: h })}
        />
      </Field>

      <Field label="次日早报时间">
        <HourPicker
          value={form.morningHour}
          onChange={(h) => setForm({ ...form, morningHour: h })}
        />
      </Field>

      <button
        onClick={save}
        disabled={saving}
        className="mt-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "保存中…" : saved ? "已保存 ✓" : "保存"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs text-mute">{label}</div>
      {children}
    </label>
  );
}

function HourPicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}
