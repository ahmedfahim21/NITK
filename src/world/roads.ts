/**
 * Roads: flat ribbons with round joins, painted markings, the NH66 median,
 * the pedestrian overbridge, and street lamps.
 */
import * as THREE from "three";
import { hash, pointInPoly, polylineLength, type Pt } from "../geo";
import type { CampusMap, Road, RoadKind } from "../osm/types";
import { toon } from "../fx/toon";
import { ribbon } from "./ground";

const ROAD_COLOUR: Record<RoadKind, number> = {
  trunk: 0x55575c,
  primary: 0x5b5d61,
  secondary: 0x5f6165,
  tertiary: 0x646669,
  residential: 0x6c6d70,
  service: 0x76777a,
  track: 0xae7a55,
  pedestrian: 0xcfc3ae,
  footway: 0xc7b39c,
  cycleway: 0xb46a5a,
  steps: 0xbdb6a8,
};

const MARK_WHITE = new THREE.Color(0xf2f2ea);
const MARK_YELLOW = new THREE.Color(0xf0c93c);

type Buf = { pos: number[]; col: number[]; idx: number[] };

function pushGeo(buf: Buf, g: THREE.BufferGeometry, c: THREE.Color) {
  const base = buf.pos.length / 3;
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i++) buf.pos.push(p[i]);
  const n = p.length / 3;
  for (let i = 0; i < n; i++) buf.col.push(c.r, c.g, c.b);
  const ix = g.index!.array;
  for (let i = 0; i < ix.length; i++) buf.idx.push(ix[i] + base);
  g.dispose();
}

function disc(buf: Buf, x: number, z: number, r: number, y: number, c: THREE.Color) {
  const base = buf.pos.length / 3;
  const seg = 14;
  buf.pos.push(x, y, z);
  buf.col.push(c.r, c.g, c.b);
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    buf.pos.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    buf.col.push(c.r, c.g, c.b);
  }
  // Clockwise seen from above so the fan faces +y.
  for (let k = 0; k < seg; k++) buf.idx.push(base, base + k + 2, base + k + 1);
}

function toMesh(buf: Buf, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(buf.col, 3));
  const n = new Float32Array(buf.pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  g.setIndex(buf.idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** Splits a polyline into dashes of `on` metres every `period`. */
function dashes(pts: Pt[], on: number, period: number): Pt[][] {
  const out: Pt[][] = [];
  let acc = 0;
  let cur: Pt[] | null = null;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = 0;
    while (d < len) {
      const phase = acc % period;
      const inDash = phase < on;
      const step = Math.min(len - d, inDash ? on - phase : period - phase);
      const f0 = d / len;
      const f1 = (d + step) / len;
      const p0: Pt = [a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0];
      const p1: Pt = [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1];
      if (inDash) {
        if (!cur) cur = [p0];
        cur.push(p1);
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
      d += step;
      acc += step;
    }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out;
}

/** An arm lamp: pole at (x, z), the arm reaching over the road at angle ang. */
export type Lamp = { x: number; z: number; ang: number };
export type RoadRig = { group: THREE.Group; lamps: Lamp[]; overbridges: Road[] };

export function buildRoads(map: CampusMap): RoadRig {
  const group = new THREE.Group();
  group.name = "roads";
  const surface: Buf = { pos: [], col: [], idx: [] };
  const marks: Buf = { pos: [], col: [], idx: [] };
  const lamps: Lamp[] = [];
  const overbridges: Road[] = [];
  const inCampus = (p: Pt) => map.campus.some((c) => pointInPoly(p[0], p[1], c));
  const vehicle = (r: Road) => !["footway", "steps", "cycleway", "pedestrian", "track"].includes(r.kind) && !r.bridge;

  for (const r of map.roads) {
    if (r.bridge && (r.kind === "footway" || r.kind === "steps" || r.kind === "cycleway")) {
      overbridges.push(r);
      continue;
    }
    const y = 0.13 + r.rank * 0.012;
    const c = new THREE.Color(ROAD_COLOUR[r.kind]);
    // A touch of per-road variation so patched tarmac reads.
    c.offsetHSL(0, 0, ((hash(r.id) % 7) - 3) * 0.006);
    const hw = r.width / 2;
    pushGeo(surface, ribbon(r.pts, -hw, hw, y), c);
    for (const p of r.pts) disc(surface, p[0], p[1], hw, y - 0.002, c);

    const len = polylineLength(r.pts);
    const my = y + 0.006;
    if (r.kind === "trunk" || r.kind === "primary") {
      pushGeo(marks, ribbon(r.pts, hw - 0.5, hw - 0.35, my), MARK_WHITE);
      pushGeo(marks, ribbon(r.pts, -hw + 0.35, -hw + 0.5, my), MARK_WHITE);
      for (const d of dashes(r.pts, 3, 9)) pushGeo(marks, ribbon(d, -0.08, 0.08, my), MARK_WHITE);
      if (r.oneway && r.kind === "trunk") {
        // Kerbed median on the right of travel (traffic keeps left).
        pushGeo(surface, ribbon(r.pts, -hw - 1.6, -hw, y + 0.05), new THREE.Color(0xc9c5b8));
        pushGeo(marks, ribbon(r.pts, -hw - 1.35, -hw - 0.25, y + 0.07), new THREE.Color(0x6aa84f));
      }
    } else if ((r.kind === "secondary" || r.kind === "tertiary") && len > 20) {
      for (const d of dashes(r.pts, 2.5, 7)) pushGeo(marks, ribbon(d, -0.07, 0.07, my), MARK_YELLOW);
    }

    const campusRoad = vehicle(r) && r.kind !== "trunk" && r.kind !== "primary" && inCampus(r.pts[Math.floor(r.pts.length / 2)]);

    // Arm lamps along the highway and main roads; campus roads have none.
    if (r.rank >= 4 && !campusRoad && len > 25) {
      const spacing = r.kind === "trunk" ? 32 : 28;
      let acc = hash(r.id) % 10;
      for (let i = 1; i < r.pts.length; i++) {
        const [a, b] = [r.pts[i - 1], r.pts[i]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dx = (b[0] - a[0]) / (l || 1);
        const dz = (b[1] - a[1]) / (l || 1);
        while (acc < l) {
          const side = r.oneway ? 1 : (Math.floor(acc / spacing) % 2 ? 1 : -1);
          const off = hw + 0.9;
          // Left of travel is (dz, -dx).
          // The arm reaches back over the road: direction -(left * side).
          lamps.push({
            x: a[0] + dx * acc + dz * off * side,
            z: a[1] + dz * acc - dx * off * side,
            ang: -Math.atan2(dx * side, -dz * side),
          });
          acc += spacing;
        }
        acc -= l;
      }
    }
  }

  const roadMat = toon(0xffffff, { vertexColors: true, ramp: "soft", polygonOffset: 1 });
  group.add(toMesh(surface, roadMat));
  const markMat = toon(0xffffff, { vertexColors: true, ramp: "soft", polygonOffset: 2 });
  group.add(toMesh(marks, markMat));

  // OSM maps the stair landings as their own tiny bridges; the span's own flights stand for them.
  const spans = overbridges.filter((b) => Math.hypot(b.pts[b.pts.length - 1][0] - b.pts[0][0], b.pts[b.pts.length - 1][1] - b.pts[0][1]) > 10);
  for (const b of spans) group.add(overbridge(b));

  return { group, lamps, overbridges: spans };
}

/** The overbridge deck's height above the ground at its ends (walking surface is H + 0.2). */
export const OVERBRIDGE_H = 6.2;
/** How far each stair flight runs out beyond the span: 18 steps of 0.5 m. */
export const OVERBRIDGE_STAIRS = 9;

/** Covered steel foot overbridge with stair towers at both ends. */
function overbridge(r: Road): THREE.Group {
  const g = new THREE.Group();
  const H = OVERBRIDGE_H;
  const a = r.pts[0];
  const b = r.pts[r.pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const mid = new THREE.Vector3((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
  const steel = toon(0x3d6f8f);
  const deckMat = toon(0xb9b3a6);
  const roofMat = toon(0x2f7bbf);

  const span = new THREE.Group();
  span.position.copy(mid);
  span.rotation.y = -ang;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 2.6), deckMat);
  deck.position.y = H;
  span.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.08), steel);
    rail.position.set(0, H + 0.75, s * 1.25);
    span.add(rail);
    for (let x = -len / 2; x <= len / 2; x += 3) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), steel);
      post.position.set(x, H + 1.5, s * 1.25);
      span.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.12, 3.4), roofMat);
  roof.position.y = H + 2.85;
  roof.rotation.x = 0.06;
  span.add(roof);
  for (const x of [-len / 2 + 2, len / 2 - 2]) {
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), steel);
      col.position.set(x, H / 2, s * 1.1);
      span.add(col);
    }
  }
  // Stair flights descending along the span direction at both ends.
  for (const end of [-1, 1]) {
    const flight = new THREE.Group();
    const steps = 18;
    for (let k = 0; k < steps; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 2), deckMat);
      st.position.set(end * (len / 2 + 0.25 + k * 0.5), H - (k + 1) * (H / steps), 0);
      flight.add(st);
    }
    span.add(flight);
  }
  span.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.add(span);
  return g;
}
