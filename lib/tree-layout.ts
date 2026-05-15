// Deterministic positioning of tree items so the same item id always
// renders at the same spot. Anchors are clustered around the canopy of the
// tree silhouette defined in TreeScene (viewBox 0 0 800 800).

export type ItemPos = {
  x: number;
  y: number;
  rotateDeg: number;
  scale: number;
};

// Branch attachment points. (x, y) is the cluster centre, r is the jitter
// radius around it. Layout hand-tuned to feel like leaves growing on
// branches rather than scattered on a plane. y is small at the top because
// SVG y grows downward.
const ANCHORS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  // Top canopy
  { x: 400, y: 90, r: 38 },
  { x: 330, y: 120, r: 34 },
  { x: 470, y: 115, r: 36 },
  { x: 260, y: 160, r: 32 },
  { x: 540, y: 155, r: 34 },
  // Upper-mid
  { x: 200, y: 210, r: 36 },
  { x: 600, y: 205, r: 36 },
  { x: 360, y: 180, r: 30 },
  { x: 440, y: 175, r: 30 },
  // Mid canopy
  { x: 160, y: 280, r: 38 },
  { x: 640, y: 275, r: 38 },
  { x: 290, y: 240, r: 30 },
  { x: 510, y: 235, r: 30 },
  { x: 400, y: 230, r: 26 },
  // Lower spread
  { x: 130, y: 340, r: 34 },
  { x: 670, y: 335, r: 34 },
  { x: 230, y: 320, r: 28 },
  { x: 570, y: 315, r: 28 },
  // Side hangers (overhanging the trunk area, but above the hole)
  { x: 320, y: 380, r: 26 },
  { x: 480, y: 375, r: 26 },
  // Inner cluster
  { x: 380, y: 270, r: 24 },
  { x: 420, y: 290, r: 24 },
  { x: 360, y: 310, r: 22 },
  { x: 440, y: 320, r: 22 },
];

// FNV-1a 32-bit hash — small, deterministic, good enough for jitter.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function layoutItem(id: string): ItemPos {
  const h = hash32(id);
  const anchor = ANCHORS[h % ANCHORS.length];
  const angle = (((h >>> 8) & 0xffff) / 0xffff) * Math.PI * 2;
  const radius = (((h >>> 12) & 0xff) / 0xff) * anchor.r;
  const rotateDeg = (((h >>> 20) & 0xff) / 0xff) * 30 - 15;
  const scale = 0.85 + (((h >>> 4) & 0xff) / 0xff) * 0.3;
  return {
    x: anchor.x + Math.cos(angle) * radius,
    y: anchor.y + Math.sin(angle) * radius,
    rotateDeg,
    scale,
  };
}

// Tree-scene geometry constants — exported so other components stay in sync.
export const SCENE = {
  viewBox: { w: 800, h: 800 },
  hole: { cx: 400, cy: 540, rx: 42, ry: 56 },
  trunkBase: { x: 400, y: 720 },
} as const;
