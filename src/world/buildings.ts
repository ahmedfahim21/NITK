/**
 * Every OSM building footprint, extruded. Walls carry a facade texture by
 * style (one tile = one window bay of one floor) and a night mask for lit
 * windows. Flat roofs get a parapet and the ubiquitous black water tank;
 * small houses get hipped Mangalore-tile roofs, as they do on this coast.
 */
import * as THREE from "three";
import { hash, orientedBox, polyArea, signedArea, type Pt } from "../geo";
import type { Building, CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { flatPolygon } from "./ground";
import { BAY_W, FLOOR_H, facade, mangaloreTiles, type FacadeStyle } from "./textures";

const HOUSE_PAINT = [0xf3e3b3, 0xd8ecd0, 0xf6cfc4, 0xcfe0f0, 0xf7f1e5, 0xe6d6f0, 0xf5d6a8, 0xbfe3da, 0xffffff, 0xf1e0c5];
const SHOP_PAINT = [0xffffff, 0xf2efe6, 0xe8f0f4, 0xf7e9cf, 0xf0e2e2];

export function styleFor(b: Building): FacadeStyle {
  const name = b.name ?? "";
  const t = b.type;
  if (/hostel|block|tower|dorm|mess|girls|boys/i.test(name) || t === "dormitory") return "hostel";
  if (/library|lecture|lhc|centre|center|complex|auditorium/i.test(name)) return "modern";
  if (b.campus) return t === "house" || t === "apartments" || t === "residential" ? "house" : "academic";
  if (t === "industrial" || t === "warehouse" || t === "shed" || t === "garage" || t === "garages") return "industrial";
  if (t === "commercial" || t === "retail" || t === "kiosk" || b.tags.shop) return "shop";
  if (t === "apartments" || t === "hotel") return "plain";
  return "house";
}

function parseColour(c: string | undefined): THREE.Color | null {
  if (!c) return null;
  try {
    const col = new THREE.Color();
    col.setStyle(c.trim().toLowerCase().replace(/\s+/g, ""));
    return col;
  } catch {
    return null;
  }
}

class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Quad a-b-c-d (a,b bottom; c,d top) facing normal n. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uvs: number[][], colour: THREE.Color) {
    const base = this.pos.length / 3;
    for (const [p, t] of [
      [a, uvs[0]],
      [b, uvs[1]],
      [c, uvs[2]],
      [d, uvs[3]],
    ] as const) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(t[0], t[1]);
      this.col.push(colour.r, colour.g, colour.b);
    }
    // Pick the winding whose face normal matches n.
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    if (fx * n[0] + fy * n[1] + fz * n[2] >= 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  tri(a: number[], b: number[], c: number[], uvs: number[][], colour: THREE.Color) {
    const base = this.pos.length / 3;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    let flip = false;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      flip = true;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const [p, t] of [
      [a, uvs[0]],
      [b, uvs[1]],
      [c, uvs[2]],
    ] as const) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx / l, ny / l, nz / l);
      this.uv.push(t[0], t[1]);
      this.col.push(colour.r, colour.g, colour.b);
    }
    if (flip) this.idx.push(base, base + 2, base + 1);
    else this.idx.push(base, base + 1, base + 2);
  }

  addGeometry(g: THREE.BufferGeometry, colour: THREE.Color) {
    const base = this.pos.length / 3;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const uv = g.attributes.uv?.array;
    const count = p.length / 3;
    for (let i = 0; i < count; i++) {
      this.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.nor.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      this.uv.push(uv ? uv[i * 2] : p[i * 3] / 2.4, uv ? uv[i * 2 + 1] : p[i * 3 + 2] / 2.4);
      this.col.push(colour.r, colour.g, colour.b);
    }
    if (g.index) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base);
    } else for (let i = 0; i < count; i++) this.idx.push(base + i);
  }

  mesh(mat: THREE.Material, shadows = true): THREE.Mesh | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    return m;
  }
}

/** Walls round one ring. outward: +1 when the ring's outside is the building's outside. */
function walls(buf: Buf, ring: Pt[], y0: number, y1: number, outward: number, colour: THREE.Color, floors: number, u0: number) {
  const ccw = signedArea(ring) > 0 ? 1 : -1;
  const s = ccw * outward;
  let dist = u0;
  const tileW = BAY_W * 4;
  const tileH = FLOOR_H * floors;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < 0.05) continue;
    const n = [(dz / l) * s, 0, (-dx / l) * s];
    // Snap each wall to whole bays so windows never straddle a corner.
    const bays = Math.max(1, Math.round(l / BAY_W));
    const u1 = dist + (bays * BAY_W) / tileW;
    buf.quad(
      [a[0], y0, a[1]],
      [b[0], y0, b[1]],
      [b[0], y1, b[1]],
      [a[0], y1, a[1]],
      n,
      [
        [dist, y0 / tileH],
        [u1, y0 / tileH],
        [u1, y1 / tileH],
        [dist, y1 / tileH],
      ],
      colour
    );
    dist = u1;
  }
}

function hipRoof(buf: Buf, b: Building, colour: THREE.Color, shape: string) {
  const box = orientedBox(b.outer);
  const o = 0.55;
  const L = box.len + 2 * o;
  const W = box.wid + 2 * o;
  const pitch = Math.tan(THREE.MathUtils.degToRad(27));
  const h = (W / 2) * pitch;
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  const y = b.height - 0.25;
  const P = (u: number, v: number, dy: number) => [box.cx + u * c - v * s, y + dy, box.cz + u * s + v * c];
  const T = (u: number, v: number) => [u / 2.4, v / 2.4];
  const hl = L / 2;
  const hw = W / 2;
  if (shape === "gabled") {
    for (const side of [-1, 1]) {
      buf.quad(P(-hl, side * hw, 0), P(hl, side * hw, 0), P(hl, 0, h), P(-hl, 0, h), [0, 1, 0], [T(-hl, hw), T(hl, hw), T(hl, 0), T(-hl, 0)], colour);
    }
    // Gable ends are wall, so tint them like the facade would be: plain plaster.
    const wall = new THREE.Color(0xf1e6d2);
    for (const end of [-1, 1]) {
      const u = end * (box.len / 2);
      buf.tri(P(u, -box.wid / 2, 0.25), P(u, box.wid / 2, 0.25), P(u, 0, h), [T(0, 0), T(1, 0), T(0.5, 1)], wall);
    }
    return;
  }
  const rl = shape === "pyramidal" ? 0 : Math.max(0, hl - hw);
  for (const side of [-1, 1]) {
    buf.quad(
      P(-hl, side * hw, 0),
      P(hl, side * hw, 0),
      P(rl, 0, h),
      P(-rl, 0, h),
      [0, 1, 0],
      [T(-hl, hw), T(hl, hw), T(rl, 0), T(-rl, 0)],
      colour
    );
    buf.tri(P(side * hl, -hw, 0), P(side * hl, hw, 0), P(side * rl, 0, h), [T(0, hw), T(W, hw), T(W / 2, 0)], colour);
  }
}

export type BuildingRig = { group: THREE.Group };

export function buildBuildings(map: CampusMap, skip: Set<number>): BuildingRig {
  const group = new THREE.Group();
  group.name = "buildings";
  const wallBufs = new Map<FacadeStyle, Buf>();
  const flatRoofs = new Buf();
  const tileRoofs = new Buf();
  const parapets = new Buf();
  const tanks = new Buf();
  const tankGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.4, 10);

  for (const b of map.buildings) {
    if (skip.has(b.id)) continue;
    const h = hash(b.id);
    const style = styleFor(b);
    const f = facade(style);
    let tint: THREE.Color;
    const osmColour = parseColour(b.colour);
    if (osmColour) tint = osmColour;
    else if (style === "house") tint = new THREE.Color(HOUSE_PAINT[h % HOUSE_PAINT.length]);
    else if (style === "shop" || style === "plain") tint = new THREE.Color(SHOP_PAINT[h % SHOP_PAINT.length]);
    else tint = new THREE.Color(1, 1, 1).offsetHSL(0, 0, -((h % 5) * 0.012));

    let buf = wallBufs.get(style);
    if (!buf) {
      buf = new Buf();
      wallBufs.set(style, buf);
    }
    const u0 = (h % 4) * 0.25;
    walls(buf, b.outer, b.minHeight, b.height, 1, tint, f.floors, u0);
    for (const hole of b.holes) walls(buf, hole, b.minHeight, b.height, -1, tint, f.floors, u0);

    // Roof form.
    const box = orientedBox(b.outer);
    const fill = polyArea(b.outer) / Math.max(1, box.len * box.wid);
    const osmShape = b.roofShape;
    const wantsPitch =
      osmShape === "hipped" || osmShape === "gabled" || osmShape === "pyramidal"
        ? true
        : osmShape
          ? false
          : !b.campus && style === "house" && b.area < 260 && b.levels <= 2 && h % 100 < 55;
    const pitched = wantsPitch && fill > 0.78 && box.wid < 22 && !b.holes.length;
    if (pitched) {
      const rc = parseColour(b.roofColour) ?? new THREE.Color(h % 3 === 0 ? 0x9a4a30 : 0xb9562f).offsetHSL(0, 0, ((h >> 3) % 5) * 0.01);
      hipRoof(tileRoofs, b, rc, osmShape === "gabled" || (h >> 5) % 5 === 0 ? "gabled" : box.len / box.wid < 1.25 ? "pyramidal" : "hipped");
      const cap = flatPolygon(b.outer, b.holes, b.height - 0.3);
      if (cap) flatRoofs.addGeometry(cap, new THREE.Color(0x8d8a84));
      continue;
    }

    const rc = parseColour(b.roofColour) ?? new THREE.Color(0xbdb6aa).offsetHSL(0, 0, (((h >> 4) % 5) - 2) * 0.015);
    const cap = flatPolygon(b.outer, b.holes, b.height);
    if (cap) flatRoofs.addGeometry(cap, rc);
    const pc = new THREE.Color(style === "academic" ? 0xb85c3e : style === "hostel" ? 0x9c3f35 : 0xe9e4da);
    if (b.height > 3 && b.type !== "roof") {
      walls(parapets, b.outer, b.height, b.height + 0.85, 1, pc, 1, 0);
      walls(parapets, b.outer, b.height, b.height + 0.85, -1, pc.clone().multiplyScalar(0.85), 1, 0);
    }
    // Black PVC water tanks on most flat roofs.
    if (!b.campus && b.area < 600 && b.height > 2.5 && h % 3 !== 0) {
      const g = tankGeo.clone();
      g.translate(box.cx + Math.cos(box.angle) * box.len * 0.25, b.height + 0.7, box.cz + Math.sin(box.angle) * box.len * 0.25);
      tanks.addGeometry(g, new THREE.Color(0x1d1f22));
      g.dispose();
    } else if (b.campus && b.area > 400 && h % 2 === 0) {
      const g = new THREE.BoxGeometry(4, 2.4, 3).translate(box.cx, b.height + 1.2, box.cz);
      tanks.addGeometry(g, new THREE.Color(0xd7d0c2));
      g.dispose();
    }
  }

  for (const [style, buf] of wallBufs) {
    const f = facade(style);
    const m = buf.mesh(toon(0xffffff, { map: f.map, emissiveMap: f.night, glow: 0xffc27a, vertexColors: true, flat: true }));
    if (m) {
      m.name = `walls-${style}`;
      group.add(m);
    }
  }
  const roofFlat = flatRoofs.mesh(toon(0xffffff, { vertexColors: true, ramp: "soft" }));
  if (roofFlat) group.add(roofFlat);
  const roofTile = tileRoofs.mesh(toon(0xffffff, { vertexColors: true, map: mangaloreTiles(), side: THREE.DoubleSide }));
  if (roofTile) group.add(roofTile);
  const par = parapets.mesh(toon(0xffffff, { vertexColors: true }));
  if (par) group.add(par);
  const tk = tanks.mesh(toon(0xffffff, { vertexColors: true }));
  if (tk) group.add(tk);
  tankGeo.dispose();
  return { group };
}
