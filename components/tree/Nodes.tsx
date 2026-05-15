"use client";

import clsx from "clsx";

export type TreeNodeProps = {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
  isNew?: boolean;
  isFalling?: boolean;
  onClick?: () => void;
};

// Wrapper handles common transform + entrance animation + click hit-area.
// Children draw the actual shape inside a 0,0-centred coordinate space.
function NodeWrap({
  x,
  y,
  scale,
  rotateDeg,
  isNew,
  isFalling,
  onClick,
  ariaLabel,
  children,
  swayClass,
}: {
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
  isNew?: boolean;
  isFalling?: boolean;
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  swayClass?: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={clsx(
        "cursor-pointer outline-none",
        isNew && "[transform-box:fill-box] [transform-origin:center] animate-node-grow",
        isFalling && "[transform-box:fill-box] [transform-origin:center] animate-fruit-fall",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={ariaLabel}
    >
      <g
        transform={`rotate(${rotateDeg}) scale(${scale})`}
        className={swayClass}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {children}
      </g>
    </g>
  );
}

export function LeafNode(p: TreeNodeProps & { content?: string }) {
  // Almond/teardrop leaf, lit side warm yellow-green.
  return (
    <NodeWrap {...p} ariaLabel={`笔记: ${p.content ?? ""}`} swayClass="animate-leaf-sway">
      <defs>
        <radialGradient id={`leaf-${p.id}`} cx="35%" cy="65%" r="80%">
          <stop offset="0%" stopColor="#a8c66a" />
          <stop offset="100%" stopColor="#4a5d3a" />
        </radialGradient>
      </defs>
      <path
        d="M 0 -14 C 10 -10 12 0 8 10 C 4 14 -4 14 -8 10 C -12 0 -10 -10 0 -14 Z"
        fill={`url(#leaf-${p.id})`}
        stroke="#2d3a22"
        strokeWidth="0.6"
      />
      {/* central vein */}
      <path d="M 0 -12 L 0 11" stroke="#5d7245" strokeWidth="0.6" fill="none" opacity="0.7" />
    </NodeWrap>
  );
}

export function FruitNode(
  p: TreeNodeProps & { content?: string; done?: boolean },
) {
  return (
    <NodeWrap {...p} ariaLabel={`待办: ${p.content ?? ""}`}>
      <defs>
        <radialGradient id={`fruit-${p.id}`} cx="35%" cy="35%" r="75%">
          {p.done ? (
            <>
              <stop offset="0%" stopColor="#fff1b8" />
              <stop offset="60%" stopColor="#f5c54b" />
              <stop offset="100%" stopColor="#a8821a" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#ffb87a" />
              <stop offset="55%" stopColor="#e8783c" />
              <stop offset="100%" stopColor="#a83e1c" />
            </>
          )}
        </radialGradient>
      </defs>
      {/* stem */}
      <path d="M 0 -12 L 2 -16" stroke="#3a2a18" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* tiny leaf on stem */}
      <ellipse cx="4" cy="-15" rx="3" ry="1.4" fill="#7ba05b" transform="rotate(-30 4 -15)" />
      {/* fruit body */}
      <circle r="11" fill={`url(#fruit-${p.id})`} stroke="#2a1108" strokeWidth="0.6" />
      {/* highlight */}
      <ellipse cx="-3.5" cy="-4" rx="2.4" ry="1.4" fill="#ffe4c2" opacity="0.55" />
    </NodeWrap>
  );
}

export function FlowerNode(
  p: TreeNodeProps & { content?: string; mood?: number },
) {
  // mood (-1..1 if available) tints petals; default rosegold.
  const mood = p.mood ?? 0;
  const lit = mood > 0.3 ? "#f5c54b" : mood < -0.3 ? "#b08abf" : "#e89a8a";
  const dark = mood > 0.3 ? "#a8821a" : mood < -0.3 ? "#4f3358" : "#6b4570";
  return (
    <NodeWrap {...p} ariaLabel={`心情: ${p.content ?? ""}`} swayClass="animate-leaf-sway">
      <defs>
        <radialGradient id={`flower-${p.id}`} cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor={lit} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      {/* 5 petals */}
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="0"
          cy="-7"
          rx="4"
          ry="6.5"
          fill={`url(#flower-${p.id})`}
          stroke={dark}
          strokeWidth="0.4"
          transform={`rotate(${a})`}
        />
      ))}
      {/* center */}
      <circle r="2.5" fill="#f5c54b" stroke="#7a5a18" strokeWidth="0.4" />
    </NodeWrap>
  );
}

export function SproutNode(p: TreeNodeProps & { content?: string }) {
  return (
    <NodeWrap {...p} ariaLabel={`待跟进: ${p.content ?? ""}`} swayClass="animate-leaf-sway">
      <defs>
        <linearGradient id={`sprout-${p.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4e09b" />
          <stop offset="100%" stopColor="#7ba05b" />
        </linearGradient>
      </defs>
      {/* stem */}
      <path d="M 0 8 L 0 -8" stroke="#5d7245" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* left leaf */}
      <path
        d="M 0 -2 C -8 -4 -10 -10 -2 -10 C 0 -8 0 -4 0 -2 Z"
        fill={`url(#sprout-${p.id})`}
        stroke="#3a4a26"
        strokeWidth="0.4"
      />
      {/* right leaf */}
      <path
        d="M 0 -5 C 8 -7 10 -13 2 -13 C 0 -11 0 -7 0 -5 Z"
        fill={`url(#sprout-${p.id})`}
        stroke="#3a4a26"
        strokeWidth="0.4"
      />
    </NodeWrap>
  );
}
