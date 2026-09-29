/**
 * Street life: the small things that make a road read as a campus road.
 * Utility poles with crossarms, sagging wires and the odd transformer (crows
 * sit on the wires), benches and dustbins along the footpaths, and weed
 * tufts along the compound walls.
 *
 * The idea (and the wire/prop layering) follows sakuragaoka-station's
 * "poles" and "props" modules (https://github.com/Kenton-GMI/sakuragaoka-station,
 * MIT, Copyright (c) 2026 Kenton Wang), redone for an Indian campus.
 *
 * Everything is placed on the CPU at groundHeight, like the lamps, in
 * instanced meshes: a handful of draw calls for the whole campus.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, type Pt } from "../geo";
import type { CampusMap, Road } from "../osm/types";
import { toon } from "../fx/toon";
import { groundHeight } from "./terrain";
import { ROAD, SOLID, WATER, type Grid } from "./grid";

const rand = mulberry32(20260929);
const UP = new THREE.Vector3(0, 1, 0);

type Frame = { x: number; z: number; ux: number; uz: number };

/** Points every `step` metres along a road, with the unit direction there. */
function along(pts: Pt[], step: number, start = step / 2): Frame[] {
  const out: Frame[] = [];
  let carry = start;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    while (carry <= len) {
      out.push({ x: a[0] + ux * carry, z: a[1] + uz * carry, ux, uz });
      carry += step;
    }
    carry -= len;
  }
  return out;
}

const isVehicle = (r: Road) => ["residential", "service", "tertiary", "secondary", "primary"].includes(r.kind) && !r.bridge && !r.tunnel;
const isPath = (r: Road) => ["footway", "pedestrian", "cycleway"].includes(r.kind) && !r.bridge && !r.tunnel;

export function buildStreetLife(map: CampusMap, grid: Grid): THREE.Group {
  const group = new THREE.Group();
  group.name = "streetlife";
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const free = (x: number, z: number, r = 0.6) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (grid.get(x + dx, z + dz) & (SOLID | WATER | ROAD)) return false;
    return true;
  };
  const yaw = (a: number) => q.setFromAxisAngle(UP, a);

  /* ---- utility poles, wires, transformers, crows ---- */
  type Pole = { x: number; z: number; y: number; ang: number; px: number; pz: number; xf: boolean };
  const runs: Pole[][] = [];
  const poleAt = (r: Road, side: number, f: Frame): { x: number; z: number } => ({ x: f.x - f.uz * side * (r.width / 2 + 1.6), z: f.z + f.ux * side * (r.width / 2 + 1.6) });
  map.roads.filter((r) => isVehicle(r) && r.kind !== "primary" && r.width >= 3).forEach((r, ri) => {
    const side = ri % 2 ? 1 : -1;
    const run: Pole[] = [];
    for (const f of along(r.pts, 34, 12)) {
      const p = poleAt(r, side, f);
      if (!free(p.x, p.z, 0.5)) {
        if (run.length > 1) runs.push([...run]);
        run.length = 0;
        continue;
      }
      // The crossarm lies across the road; wires hang from its three insulators.
      run.push({ x: p.x, z: p.z, y: groundHeight(p.x, p.z), ang: Math.atan2(f.ux, f.uz), px: -f.uz, pz: f.ux, xf: rand() < 0.16 });
    }
    if (run.length > 1) runs.push(run);
  });
  const poles = runs.flat();
  if (poles.length) {
    const body = mergeGeometries(
      [
        new THREE.CylinderGeometry(0.09, 0.14, 9.2, 6).translate(0, 4.6, 0),
        new THREE.BoxGeometry(1.7, 0.09, 0.09).translate(0, 8.55, 0),
        new THREE.BoxGeometry(1.2, 0.08, 0.08).translate(0, 7.7, 0),
        ...[-0.7, 0, 0.7].map((k) => new THREE.CylinderGeometry(0.05, 0.05, 0.16, 5).translate(k, 8.68, 0)),
      ].map((g) => (g.index ? g.toNonIndexed() : g))
    )!;
    const mesh = new THREE.InstancedMesh(body, toon(0x8f8d86), poles.length);
    poles.forEach((p, i) => {
      // Local +x of the model runs along the crossarm; rotate so it spans the road.
      m.compose(new THREE.Vector3(p.x, p.y, p.z), yaw(p.ang), one);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);

    const xfPoles = poles.filter((p) => p.xf);
    if (xfPoles.length) {
      const xg = mergeGeometries(
        [
          new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10).translate(-0.4, 7.0, 0.42),
          new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10).translate(0.4, 7.0, 0.42),
          new THREE.BoxGeometry(1.4, 0.06, 0.06).translate(0, 7.6, 0.2),
        ].map((g) => g.toNonIndexed())
      )!;
      const xm = new THREE.InstancedMesh(xg, toon(0x6f7a72), xfPoles.length);
      xfPoles.forEach((p, i) => {
        m.compose(new THREE.Vector3(p.x, p.y, p.z), yaw(p.ang), one);
        xm.setMatrixAt(i, m);
      });
      xm.castShadow = true;
      xm.computeBoundingSphere();
      group.add(xm);
    }

    // Wires: three per span, catenary-ish sag. Each poles' grid cell is stamped solid.
    const pos: number[] = [];
    const spans: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    for (const run of runs) {
      for (let i = 1; i < run.length; i++) {
        const [a, b] = [run[i - 1], run[i]];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > 60) continue;
        for (const k of [-0.7, 0, 0.7]) {
          const A = new THREE.Vector3(a.x + Math.cos(a.ang) * k, a.y + 8.62, a.z - Math.sin(a.ang) * k);
          const B = new THREE.Vector3(b.x + Math.cos(b.ang) * k, b.y + 8.62, b.z - Math.sin(b.ang) * k);
          const sag = 0.35 + d * 0.028;
          let prev = A;
          for (let s = 1; s <= 8; s++) {
            const t = s / 8;
            const P = A.clone().lerp(B, t);
            P.y -= 4 * sag * t * (1 - t);
            pos.push(prev.x, prev.y, prev.z, P.x, P.y, P.z);
            prev = P;
          }
          if (k === 0) spans.push({ a: A, b: B });
        }
      }
    }
    for (const p of poles) grid.stampDisc(p.x, p.z, 0.2, SOLID, 9);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1d1f22 }));
    wires.frustumCulled = false;
    group.add(wires);

    // Crows on the middle wire: house crows, black with a grey collar.
    const perch = spans.filter(() => rand() < 0.28).slice(0, 22);
    if (perch.length) {
      const crow = mergeGeometries(
        [
          new THREE.SphereGeometry(0.14, 8, 6).scale(0.85, 0.8, 1.45).translate(0, 0.16, 0),
          new THREE.SphereGeometry(0.075, 6, 5).translate(0, 0.27, 0.19),
          new THREE.BoxGeometry(0.06, 0.05, 0.13).translate(0, 0.27, 0.3),
          new THREE.BoxGeometry(0.1, 0.03, 0.22).translate(0, 0.13, -0.28),
        ].map((g) => g.toNonIndexed())
      )!;
      const cm = new THREE.InstancedMesh(crow, toon(0x24272c), perch.length);
      perch.forEach((s, i) => {
        const t = 0.2 + rand() * 0.6;
        const P = s.a.clone().lerp(s.b, t);
        const d = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
        P.y -= 4 * (0.35 + d * 0.028) * t * (1 - t);
        // Perched across the wire, facing either way.
        const wireAng = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
        m.compose(new THREE.Vector3(P.x, P.y + 0.0, P.z), yaw(wireAng + (rand() < 0.5 ? 1 : -1) * Math.PI / 2 + (rand() - 0.5) * 0.4), one);
        cm.setMatrixAt(i, m);
      });
      cm.castShadow = true;
      cm.computeBoundingSphere();
      group.add(cm);
    }
  }

  const nearAny = (list: { x: number; z: number }[], x: number, z: number, d: number) => list.some((h) => Math.hypot(h.x - x, h.z - z) < d);

  /* ---- benches and dustbins along the footpaths ---- */
  const benches: { x: number; z: number; ang: number }[] = [];
  const bins: { x: number; z: number }[] = [];
  map.roads.filter(isPath).forEach((r, ri) => {
    if (r.width < 1.5) return;
    for (const f of along(r.pts, 75, 20 + (ri % 5) * 9)) {
      const side = rand() < 0.5 ? 1 : -1;
      const off = r.width / 2 + 1.1;
      const x = f.x - f.uz * side * off;
      const z = f.z + f.ux * side * off;
      if (!free(x, z, 0.9) || nearAny(benches, x, z, 25)) continue;
      // Facing the path.
      benches.push({ x, z, ang: Math.atan2(f.uz * side, -f.ux * side) + Math.PI });
    }
    for (const f of along(r.pts, 110, 55 + (ri % 4) * 11)) {
      const x = f.x - f.uz * (r.width / 2 + 0.9);
      const z = f.z + f.ux * (r.width / 2 + 0.9);
      if (free(x, z, 0.4) && !nearAny(bins, x, z, 30) && !nearAny(benches, x, z, 4)) bins.push({ x, z });
    }
  });
  if (benches.length) {
    const seat = mergeGeometries(
      [
        new THREE.BoxGeometry(1.7, 0.07, 0.5).translate(0, 0.46, 0),
        new THREE.BoxGeometry(1.7, 0.36, 0.06).translate(0, 0.8, -0.24),
        new THREE.BoxGeometry(0.1, 0.46, 0.5).translate(-0.75, 0.23, 0),
        new THREE.BoxGeometry(0.1, 0.46, 0.5).translate(0.75, 0.23, 0),
      ].map((g) => g.toNonIndexed())
    )!;
    const bm = new THREE.InstancedMesh(seat, toon(0x8a8f92), benches.length);
    benches.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, groundHeight(b.x, b.z), b.z), yaw(b.ang), one);
      bm.setMatrixAt(i, m);
      grid.stampDisc(b.x, b.z, 0.5, SOLID, 1);
    });
    bm.castShadow = true;
    bm.receiveShadow = true;
    bm.computeBoundingSphere();
    group.add(bm);
  }
  if (bins.length) {
    const bin = mergeGeometries(
      [new THREE.CylinderGeometry(0.26, 0.22, 0.75, 10).translate(0, 0.38, 0), new THREE.CylinderGeometry(0.29, 0.29, 0.06, 10).translate(0, 0.78, 0)].map((g) => g.toNonIndexed())
    )!;
    // Half blue, half green: dry and wet waste.
    const blue = bins.filter((_, i) => i % 2 === 0);
    const green = bins.filter((_, i) => i % 2 === 1);
    for (const [list, col] of [[blue, 0x2a6ebb], [green, 0x2f8f4a]] as const) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(bin, toon(col), list.length);
      list.forEach((b, i) => {
        m.compose(new THREE.Vector3(b.x, groundHeight(b.x, b.z), b.z), yaw(0), one);
        im.setMatrixAt(i, m);
        grid.stampDisc(b.x, b.z, 0.3, SOLID, 0.9);
      });
      im.castShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }

  /* ---- weed tufts along the compound walls and pond of the roads ---- */
  const tufts: { x: number; z: number; s: number; c: number }[] = [];
  const GREENS = [0x5f9a3c, 0x6fae46, 0x4e8a34, 0x8aa544];
  for (const b of map.barriers) {
    if (b.kind !== "wall") continue;
    for (const f of along(b.pts, 1.6, rand())) {
      if (rand() < 0.45) continue;
      const side = rand() < 0.5 ? 1 : -1;
      const off = 0.35 + rand() * 0.5;
      const x = f.x - f.uz * side * off;
      const z = f.z + f.ux * side * off;
      if (grid.get(x, z) & (ROAD | WATER)) continue;
      tufts.push({ x, z, s: 0.5 + rand() * 0.9, c: GREENS[Math.floor(rand() * GREENS.length)] });
    }
  }
  if (tufts.length) {
    const blade = mergeGeometries(
      [-0.5, 0, 0.5].map((a) => new THREE.ConeGeometry(0.06, 0.42, 4).translate(Math.sin(a) * 0.05, 0.21, 0).rotateZ(a * 0.35).toNonIndexed())
    )!;
    const tm = new THREE.InstancedMesh(blade, toon(0xffffff, { ramp: "soft" }), Math.min(tufts.length, 2500));
    const col = new THREE.Color();
    tufts.slice(0, 2500).forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, groundHeight(t.x, t.z), t.z), yaw(rand() * 6.28), new THREE.Vector3(t.s, t.s, t.s));
      tm.setMatrixAt(i, m);
      tm.setColorAt(i, col.setHex(t.c));
    });
    tm.computeBoundingSphere();
    group.add(tm);
  }

  return group;
}
