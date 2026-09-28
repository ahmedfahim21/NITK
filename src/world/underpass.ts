/**
 * The NH66 underpasses: laterite-faced retaining walls down each side of
 * the trench, a concrete floor, and under the highway itself a box culvert
 * (walls, ceiling slab, and a headwall with a parapet at each portal).
 *
 * Built at absolute heights from the baked terrain (not lifted by the
 * displacement shader), since the trench and the deck are two levels at
 * the same x, z.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toon } from "../fx/toon";
import { SOLID, type Grid } from "./grid";
import { cuts, floorHeight, groundHeight } from "./terrain";

const CONCRETE = new THREE.Color(0xb9b4a6);
const LATERITE = new THREE.Color(0xa65a3f);
const ASPHALT = new THREE.Color(0x55575c);

function coloured(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const nn = g.index ? g.toNonIndexed() : g;
  const arr = new Float32Array(nn.attributes.position.count * 3);
  for (let k = 0; k < arr.length; k += 3) arr.set([c.r, c.g, c.b], k);
  nn.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  nn.deleteAttribute("uv");
  return nn;
}

/** A box between two points, from y0 up to y1, `t` thick, centred `off` metres to the left of a->b. */
function slab(ax: number, az: number, bx: number, bz: number, off: number, t: number, y0: number, y1: number): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / len;
  const nz = (bx - ax) / len;
  const g = new THREE.BoxGeometry(len + 0.05, Math.max(0.05, y1 - y0), t);
  g.rotateY(-Math.atan2(bz - az, bx - ax));
  g.translate((ax + bx) / 2 + nx * off, (y0 + y1) / 2, (az + bz) / 2 + nz * off);
  return g;
}

/** Whether a point is over the covered stretch of this cut. */
function inCovered(cut: (typeof cuts)[number], x: number, z: number): boolean {
  let best = Infinity;
  let bi = 0;
  cut.pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d < best) {
      best = d;
      bi = i;
    }
  });
  return best < cut.hw + 1 && cut.covered[bi];
}

export function buildUnderpasses(grid: Grid): THREE.Group {
  const group = new THREE.Group();
  group.name = "underpasses";
  const parts: THREE.BufferGeometry[] = [];
  for (const cut of cuts) {
    const { pts, hw, depthAt } = cut;
    // The road down the trench and through the culvert: one smooth ribbon at the floor, wall to wall.
    {
      const pos: number[] = [];
      const idx: number[] = [];
      const live = pts.map((_, i) => depthAt[i] >= 0.05 || (i > 0 && depthAt[i - 1] >= 0.05) || (i + 1 < pts.length && depthAt[i + 1] >= 0.05));
      let v = 0;
      for (let i = 0; i < pts.length; i++) {
        if (!live[i]) continue;
        const p = pts[i];
        const q = pts[Math.min(pts.length - 1, i + 1)];
        const o = pts[Math.max(0, i - 1)];
        const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
        const nx = -(q[1] - o[1]) / l;
        const nz = (q[0] - o[0]) / l;
        const y = floorHeight(p[0], p[1]) + 0.12;
        pos.push(p[0] + nx * (hw + 0.1), y, p[1] + nz * (hw + 0.1), p[0] - nx * (hw + 0.1), y, p[1] - nz * (hw + 0.1));
        if (i > 0 && live[i - 1]) idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
        v += 2;
      }
      if (idx.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        // Face up whichever way the road was drawn.
        const n = g.attributes.normal;
        if (n.count && n.getY(0) < 0) {
          const ix = g.index!.array as Uint32Array | Uint16Array;
          for (let t = 0; t < ix.length; t += 3) [ix[t + 1], ix[t + 2]] = [ix[t + 2], ix[t + 1]];
        }
        parts.push(coloured(g.toNonIndexed(), ASPHALT));
      }
    }
    for (let i = 1; i < pts.length; i++) {
      const d = Math.max(depthAt[i - 1], depthAt[i]);
      if (d < 0.3) continue;
      const [a, b] = [pts[i - 1], pts[i]];
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      const floor = Math.min(floorHeight(a[0], a[1]), floorHeight(b[0], b[1])) - 0.3;
      const covered = cut.covered[i] || cut.covered[i - 1];
      for (const side of [-1, 1]) {
        const ox = mx + nx * side * (hw + 2);
        const oz = mz + nz * side * (hw + 2);
        const top = covered ? groundHeight(mx, mz) - 0.45 : groundHeight(ox, oz);
        // Retaining wall (or culvert wall), laterite below a concrete coping and parapet.
        parts.push(coloured(slab(a[0], a[1], b[0], b[1], side * (hw + 0.45), 0.9, floor, top), LATERITE));
        if (!covered) {
          parts.push(coloured(slab(a[0], a[1], b[0], b[1], side * (hw + 0.45), 1.0, top, top + 0.9), CONCRETE));
          // Nobody walks off the top into the trench.
          grid.strokeLine([a, b].map(([x, z]) => [x + nx * side * (hw + 0.45), z + nz * side * (hw + 0.45)] as [number, number]), 0.9, SOLID, top + 0.9);
        }
      }
      if (covered) {
        // The culvert's ceiling slab, just under the deck.
        const deck = groundHeight(mx, mz);
        parts.push(coloured(slab(a[0], a[1], b[0], b[1], 0, hw * 2 + 1.8, deck - 0.45, deck - 0.05), CONCRETE));
        // A headwall and parapet where the trench meets the culvert.
        for (const [p, q] of [[a, b], [b, a]] as const) {
          const ex = p[0] - (q[0] - p[0]) * 0.5;
          const ez = p[1] - (q[1] - p[1]) * 0.5;
          // Only where the culvert opens onto the trench.
          if (inCovered(cut, ex, ez)) continue;
          const g = new THREE.BoxGeometry(hw * 2 + 1.8, 1.4, 0.5);
          g.rotateY(-Math.atan2(nz, nx));
          g.translate(p[0], deck + 0.5, p[1]);
          parts.push(coloured(g, CONCRETE));
        }
      }
    }
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, toon(0xffffff, { vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
