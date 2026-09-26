/**
 * Geometry helpers shared by the OSM compiler and the world builders.
 *
 * World frame: metres around area.origin, x east, z south (three.js looks
 * down -z, so north is "forward" on the map), y up.
 */
import area from "./area.json";

export type Pt = [number, number];

const LAT0 = area.origin.lat;
const LON0 = area.origin.lon;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

export function project(lat: number, lon: number): Pt {
  return [(lon - LON0) * M_PER_DEG_LON, -(lat - LAT0) * M_PER_DEG_LAT];
}

export function unproject(x: number, z: number): { lat: number; lon: number } {
  return { lat: LAT0 - z / M_PER_DEG_LAT, lon: LON0 + x / M_PER_DEG_LON };
}

/** Half extents of the playable square in metres (from the bbox). */
export function mapBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const b = area.bbox;
  const [minX, maxZ] = project(b.south, b.west);
  const [maxX, minZ] = project(b.north, b.east);
  return { minX, maxX, minZ, maxZ };
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of a number/string, for per-feature variation. */
export function hash(v: number | string): number {
  const s = String(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Signed area, positive when counter-clockwise in (x, z). */
export function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i];
    const [x2, z2] = p[(i + 1) % p.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function polyArea(p: Pt[]): number {
  return Math.abs(signedArea(p));
}

export function centroid(p: Pt[]): Pt {
  const a = signedArea(p);
  if (Math.abs(a) < 1e-6) {
    let x = 0;
    let z = 0;
    for (const q of p) {
      x += q[0];
      z += q[1];
    }
    return [x / p.length, z / p.length];
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i];
    const [x2, z2] = p[(i + 1) % p.length];
    const f = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

export function pointInPoly(x: number, z: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Drop a closing duplicate vertex and collinear/duplicate points. */
export function cleanRing(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - q[0], last[1] - q[1]) < 0.05) continue;
    out.push(q);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) out.pop();
  }
  return out;
}

export type OBB = { cx: number; cz: number; angle: number; len: number; wid: number };

/**
 * Minimum-area oriented rectangle (rotating calipers over the hull edges).
 * angle is the direction of the long side, radians from +x toward +z.
 */
export function orientedBox(p: Pt[]): OBB {
  const hull = convexHull(p);
  let best: OBB = { cx: 0, cz: 0, angle: 0, len: 1, wid: 1 };
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of hull) {
      const u = q[0] * c + q[1] * s;
      const v = -q[0] * s + q[1] * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const ar = (maxU - minU) * (maxV - minV);
    if (ar < bestArea) {
      bestArea = ar;
      const mu = (minU + maxU) / 2;
      const mv = (minV + maxV) / 2;
      const du = maxU - minU;
      const dv = maxV - minV;
      const cx = mu * c - mv * s;
      const cz = mu * s + mv * c;
      best = du >= dv
        ? { cx, cz, angle: ang, len: du, wid: dv }
        : { cx, cz, angle: ang + Math.PI / 2, len: dv, wid: du };
    }
  }
  return best;
}

export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Sutherland-Hodgman against an axis-aligned box. */
export function clipPolygon(poly: Pt[], b: Box): Pt[] {
  let out = poly;
  const lerpAt = (a: Pt, c: Pt, axis: 0 | 1, v: number): Pt => {
    const t = (v - a[axis]) / (c[axis] - a[axis]);
    return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
  };
  const edges: [(p: Pt) => boolean, (a: Pt, c: Pt) => Pt][] = [
    [(p) => p[0] >= b.minX, (a, c) => lerpAt(a, c, 0, b.minX)],
    [(p) => p[0] <= b.maxX, (a, c) => lerpAt(a, c, 0, b.maxX)],
    [(p) => p[1] >= b.minZ, (a, c) => lerpAt(a, c, 1, b.minZ)],
    [(p) => p[1] <= b.maxZ, (a, c) => lerpAt(a, c, 1, b.maxZ)],
  ];
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i];
      const prev = src[(i + src.length - 1) % src.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
    if (!out.length) return out;
  }
  return out;
}

/** Clip a polyline to a box; may split into several pieces. */
export function clipPolyline(pts: Pt[], b: Box): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  const inside = (p: Pt) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minZ && p[1] <= b.maxZ;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], b);
    if (!seg) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      continue;
    }
    if (!cur.length) cur.push(seg[0]);
    cur.push(seg[1]);
    if (!inside(pts[i + 1])) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function clipSegment(a: Pt, c: Pt, b: Box): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = c[0] - a[0];
  const dz = c[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] - b.minX],
    [dx, b.maxX - a[0]],
    [-dz, a[1] - b.minZ],
    [dz, b.maxZ - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

export function polylineLength(p: Pt[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return l;
}

/** Distance from point to segment. */
export function distToSeg(x: number, z: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}
