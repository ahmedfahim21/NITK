/**
 * The coastal plain is flat to within a few metres, so the ground is a plane
 * except for mounds: the laterite knoll the lighthouse stands on, and a
 * low dune line behind the beach.
 */
export type Mound = { x: number; z: number; r: number; h: number };

const mounds: Mound[] = [];

export function addMound(m: Mound) {
  mounds.push(m);
}

export function clearMounds() {
  mounds.length = 0;
}

export function groundHeight(x: number, z: number): number {
  let y = 0;
  for (const m of mounds) {
    const d = Math.hypot(x - m.x, z - m.z) / m.r;
    if (d >= 1) continue;
    // Smooth dome with a flat-ish top.
    const t = 1 - d * d;
    y = Math.max(y, m.h * t * t * (3 - 2 * t));
  }
  return y;
}
