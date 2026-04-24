"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { href: "/", label: "聊天", icon: "chat" },
  { href: "/today", label: "今日", icon: "today" },
  { href: "/notes", label: "搜索", icon: "search" },
  { href: "/review", label: "复盘", icon: "review" },
  { href: "/settings", label: "设置", icon: "settings" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-panel/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/"
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={clsx(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-xs",
                  active ? "text-accent" : "text-mute hover:text-ink"
                )}
              >
                <Icon name={t.icon} active={active} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "#7c83ff" : "#8b8b93";
  const common = { width: 22, height: 22, fill: "none", stroke, strokeWidth: 1.8 };
  switch (name) {
    case "chat":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M4 5h16v12H8l-4 3z" strokeLinejoin="round" />
        </svg>
      );
    case "today":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 9h16M9 3v4M15 3v4" strokeLinecap="round" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.5-4.5" strokeLinecap="round" />
        </svg>
      );
    case "review":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
          <path d="M14 4v5h5M8 13h8M8 17h5" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.8a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.4a7 7 0 0 0-2.1 1.2L5.1 5.8l-2 3.5 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.5 2.4-.8a7 7 0 0 0 2.1 1.2L10 21h4l.4-2.4a7 7 0 0 0 2.1-1.2l2.4.8 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z" />
        </svg>
      );
  }
  return null;
}
