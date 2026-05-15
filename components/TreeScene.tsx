"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { layoutItem, SCENE } from "@/lib/tree-layout";
import { FlowerNode, FruitNode, LeafNode, SproutNode } from "./tree/Nodes";
import { HoleInput, type ArrivedItem } from "./HoleInput";

export type SceneItem = {
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

const NEW_HIGHLIGHT_MS = 4000;
const FALL_ANIM_MS = 1100;

export function TreeScene({ initialItems }: { initialItems: SceneItem[] }) {
  const [items, setItems] = useState<SceneItem[]>(initialItems);
  const [holeOpen, setHoleOpen] = useState(false);
  const [selected, setSelected] = useState<SceneItem | null>(null);
  // Ids that should play the entrance "grow" animation (added in this session).
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  // Ids currently playing the fall-off animation (todo/followup completing).
  const [fallingIds, setFallingIds] = useState<Set<string>>(new Set());

  // Drop "new" highlight after the animation duration so future re-renders
  // (resize, theme tweaks, etc.) don't replay it.
  useEffect(() => {
    if (newIds.size === 0) return;
    const t = setTimeout(() => setNewIds(new Set()), NEW_HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [newIds]);

  const onItemsArrived = useCallback((arrived: ArrivedItem[]) => {
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      const fresh = arrived.filter((i) => !existing.has(i.id));
      return [...prev, ...fresh];
    });
    setNewIds((prev) => {
      const next = new Set(prev);
      for (const i of arrived) next.add(i.id);
      return next;
    });
  }, []);

  const completeItem = useCallback(async (id: string) => {
    setFallingIds((prev) => new Set(prev).add(id));
    // After the fall animation ends, drop it from rendered items.
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setFallingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, FALL_ANIM_MS);
    setSelected(null);
    try {
      await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
    } catch {
      // swallow; user can refresh
    }
  }, []);

  const visibleItems = useMemo(
    // open status is the only thing rendered; completed todos/followups
    // animate out then disappear, notes/moods stay regardless.
    () =>
      items.filter(
        (i) =>
          fallingIds.has(i.id) ||
          (i.type !== "todo" && i.type !== "followup") ||
          i.status === "open",
      ),
    [items, fallingIds],
  );

  return (
    <div className="dusk-sky relative h-[calc(100dvh-56px-env(safe-area-inset-bottom))] w-full overflow-hidden">
      <Scene
        items={visibleItems}
        newIds={newIds}
        fallingIds={fallingIds}
        onNodeClick={(it) => setSelected(it)}
        onHoleClick={() => setHoleOpen(true)}
      />

      <HoleInput open={holeOpen} onClose={() => setHoleOpen(false)} onItemsArrived={onItemsArrived} />

      <NodeDetail
        item={selected}
        onClose={() => setSelected(null)}
        onComplete={completeItem}
      />

      {/* fixed-position firefly particles, layered above SVG */}
      <Fireflies />
    </div>
  );
}

function Scene({
  items,
  newIds,
  fallingIds,
  onNodeClick,
  onHoleClick,
}: {
  items: SceneItem[];
  newIds: Set<string>;
  fallingIds: Set<string>;
  onNodeClick: (it: SceneItem) => void;
  onHoleClick: () => void;
}) {
  return (
    <svg
      viewBox={`0 0 ${SCENE.viewBox.w} ${SCENE.viewBox.h}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="树洞"
    >
      <defs>
        {/* Sun glow */}
        <radialGradient id="sun-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff5d8" stopOpacity="1" />
          <stop offset="55%" stopColor="#f5c54b" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e8783c" stopOpacity="0" />
        </radialGradient>
        {/* Trunk gradient */}
        <linearGradient id="trunk-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1f1209" />
          <stop offset="55%" stopColor="#3a2418" />
          <stop offset="80%" stopColor="#5d3a20" />
          <stop offset="100%" stopColor="#1f1209" />
        </linearGradient>
        {/* Hole inner gradient */}
        <radialGradient id="hole-grad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1a0e08" />
          <stop offset="70%" stopColor="#0a0506" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        {/* Hole ring outer warm rim */}
        <radialGradient id="hole-rim" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="rgba(245,168,94,0)" />
          <stop offset="80%" stopColor="rgba(245,168,94,0.35)" />
          <stop offset="100%" stopColor="rgba(245,168,94,0)" />
        </radialGradient>
      </defs>

      {/* Distant hills (silhouette layered behind tree) */}
      <path
        d="M 0 580 Q 150 520 300 560 T 600 540 T 900 580 L 900 800 L 0 800 Z"
        fill="#3d2447"
        opacity="0.85"
      />
      <path
        d="M 0 620 Q 200 580 400 610 T 800 600 L 800 800 L 0 800 Z"
        fill="#2a1838"
        opacity="0.9"
      />

      {/* Sun disc with halo */}
      <circle cx="640" cy="600" r="80" fill="url(#sun-grad)" opacity="0.85" />
      <circle cx="640" cy="600" r="32" fill="#fff5d8" opacity="0.95" />

      {/* Ground */}
      <rect x="0" y="700" width="800" height="100" fill="#1a0e08" />

      {/* Tree trunk (silhouette with gradient + warm rim light from right) */}
      <g>
        {/* warm rim halo behind trunk */}
        <path
          d="M 360 720 C 360 600 340 480 360 360 C 380 240 380 140 400 80 C 420 140 420 240 440 360 C 460 480 440 600 440 720 Z"
          fill="rgba(245,168,94,0.18)"
          transform="translate(6 0)"
          filter="blur(4px)"
        />
        {/* trunk body */}
        <path
          d="M 360 720 C 360 600 340 480 360 360 C 380 240 380 140 400 80 C 420 140 420 240 440 360 C 460 480 440 600 440 720 Z"
          fill="url(#trunk-grad)"
        />
        {/* main branches as silhouettes */}
        <path d="M 380 280 C 320 250 240 220 160 230" stroke="#1f1209" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M 420 280 C 480 250 560 220 640 230" stroke="#1f1209" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M 380 200 C 340 170 280 150 220 150" stroke="#1f1209" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M 420 200 C 460 170 520 150 580 150" stroke="#1f1209" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M 400 140 C 380 110 340 90 300 100" stroke="#1f1209" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M 400 140 C 420 110 460 90 500 100" stroke="#1f1209" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M 400 350 C 350 360 290 340 230 350" stroke="#1f1209" strokeWidth="11" fill="none" strokeLinecap="round" />
        <path d="M 400 350 C 450 360 510 340 570 350" stroke="#1f1209" strokeWidth="11" fill="none" strokeLinecap="round" />
      </g>

      {/* Items on the tree */}
      <g>
        {items.map((it) => {
          const pos = layoutItem(it.id);
          const isNew = newIds.has(it.id);
          const isFalling = fallingIds.has(it.id);
          const common = {
            id: it.id,
            x: pos.x,
            y: pos.y,
            scale: pos.scale,
            rotateDeg: pos.rotateDeg,
            isNew,
            isFalling,
            content: it.content,
            onClick: () => onNodeClick(it),
          };
          if (it.type === "note") return <LeafNode key={it.id} {...common} />;
          if (it.type === "todo") return <FruitNode key={it.id} {...common} done={it.status === "done"} />;
          if (it.type === "mood") return <FlowerNode key={it.id} {...common} />;
          return <SproutNode key={it.id} {...common} />;
        })}
      </g>

      {/* Tree hole — drawn AFTER items so the hole always sits on the trunk
          surface; its position is on the trunk so leaves above naturally
          overlap nothing. Animated breathing rim hints interactivity. */}
      <g
        onClick={onHoleClick}
        className="cursor-pointer animate-hole-breathe"
        role="button"
        aria-label="对树洞说点什么"
      >
        {/* outer warm rim */}
        <ellipse
          cx={SCENE.hole.cx}
          cy={SCENE.hole.cy}
          rx={SCENE.hole.rx + 14}
          ry={SCENE.hole.ry + 14}
          fill="url(#hole-rim)"
        />
        {/* hole opening */}
        <ellipse
          cx={SCENE.hole.cx}
          cy={SCENE.hole.cy}
          rx={SCENE.hole.rx}
          ry={SCENE.hole.ry}
          fill="url(#hole-grad)"
          stroke="#0a0506"
          strokeWidth="2"
        />
        {/* tiny inner darker pit */}
        <ellipse
          cx={SCENE.hole.cx}
          cy={SCENE.hole.cy + 6}
          rx={SCENE.hole.rx * 0.55}
          ry={SCENE.hole.ry * 0.55}
          fill="#000"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}

function Fireflies() {
  // 5 dots with staggered animation delays for organic feel.
  const flies = [
    { left: "18%", top: "30%", delay: "0s" },
    { left: "72%", top: "28%", delay: "1.6s" },
    { left: "30%", top: "55%", delay: "3.2s" },
    { left: "60%", top: "62%", delay: "4.8s" },
    { left: "85%", top: "45%", delay: "6.4s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0">
      {flies.map((f, i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-dusk-glow animate-firefly-drift"
          style={{
            left: f.left,
            top: f.top,
            animationDelay: f.delay,
            boxShadow: "0 0 6px 2px rgba(245,197,75,0.7)",
          }}
        />
      ))}
    </div>
  );
}

const TYPE_LABEL: Record<SceneItem["type"], string> = {
  todo: "待办",
  note: "笔记",
  mood: "心情",
  followup: "待跟进",
};

function NodeDetail({
  item,
  onClose,
  onComplete,
}: {
  item: SceneItem | null;
  onClose: () => void;
  onComplete: (id: string) => void;
}) {
  if (!item) return null;
  const canComplete = item.type === "todo" || item.type === "followup";
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "w-full max-w-md rounded-t-2xl border border-dusk-bark/60 bg-[#1a0e08]/95 p-4 sm:rounded-2xl",
        )}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="rounded-md bg-dusk-bark/40 px-2 py-0.5 text-[11px] text-dusk-glow">
            {TYPE_LABEL[item.type]}
          </span>
          <button onClick={onClose} className="text-xs text-mute hover:text-dusk-glow">
            收起
          </button>
        </div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{item.content}</p>
        {item.dueAt && (
          <div className="mt-2 text-xs text-mute">
            {new Date(item.dueAt).toLocaleString("zh-CN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        {canComplete && item.status === "open" && (
          <button
            onClick={() => onComplete(item.id)}
            className="mt-4 w-full rounded-xl bg-dusk-fruitGold px-4 py-2.5 text-sm font-medium text-[#3a2418] shadow-md hover:opacity-90"
          >
            ✓ 完成
          </button>
        )}
      </div>
    </div>
  );
}
