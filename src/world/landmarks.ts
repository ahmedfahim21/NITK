/**
 * Hero details that make the campus read as NITK rather than any campus:
 * the lighthouse on its knoll, the Main Building's entrance and nameboard,
 * the gate arch on NH66, the auditorium, the fountain and the flag.
 *
 * Everything keys off OSM names/tags, so it lands wherever the real map puts
 * those features; nothing is placed at hard-coded positions.
 */
import * as THREE from "three";
import { centroid, distToSeg, orientedBox, pointInPoly, type Pt } from "../geo";
import type { Building, CampusMap, Road } from "../osm/types";
import { toon } from "../fx/toon";
import type { Grid } from "./grid";
import { PATH, ROAD, SOLID, WATER } from "./grid";
import { FLOOR_H, curtainWall, signTexture } from "./textures";
import { addMound } from "./terrain";

export type LandmarkRig = {
  group: THREE.Group;
  update(t: number, glow: number): void;
  /** Named spots for the map and the teleport list. */
  spots: { name: string; x: number; z: number }[];
  /** Pieces standing on or in a building, by OSM id, to hide with it when you walk inside. */
  attached: Map<number, THREE.Object3D[]>;
};

function nearestRoadPoint(x: number, z: number, roads: Road[], filter: (r: Road) => boolean): { p: Pt; road: Road; seg: number } | null {
  let best: { p: Pt; road: Road; seg: number } | null = null;
  let bestD = Infinity;
  for (const r of roads) {
    if (!filter(r)) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const d = distToSeg(x, z, a, b);
      if (d < bestD) {
        bestD = d;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
        best = { p: [a[0] + dx * t, a[1] + dz * t], road: r, seg: i };
      }
    }
  }
  return best;
}

export type Face = ReturnType<typeof faceToward>;

/** The Main Building's front: the face toward NH66, where the gate is. */
export function mainEntrance(map: CampusMap, b: Building): Face {
  const c = centroid(b.outer);
  const gate = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.kind === "trunk");
  return faceToward(b, gate ? gate.p : [c[0] - 100, c[1]]);
}

/** The ceremonial axis: from the Main Building's entrance to where its drive meets NH66. */
export function mainAxis(map: CampusMap): { from: Pt; to: Pt } | null {
  const b = findByName(map, /^main building$|main building|administrative (block|building)/i);
  if (!b) return null;
  const c = centroid(b.outer);
  const gate = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.kind === "trunk");
  if (!gate) return null;
  const f = faceToward(b, gate.p);
  return { from: [f.x, f.z], to: gate.p };
}

/**
 * Where a winged hostel's entrance looks, checked on the ground: the Mega
 * towers' cores open toward Nandini (Kailash) and the gym (Everest, Himalaya).
 */
const CROOK_TOWARD: [RegExp, RegExp][] = [
  [/Tower 3 \(Kailash\)/i, /nand(h)?ini/i],
  [/Tower 1 \(Everest\)|Tower 2 \(Himalaya\)/i, /\bgym\b/i],
];

/** The nearest named building or point matching `re`, from (x, z). */
function nearestNamed(map: CampusMap, re: RegExp, x: number, z: number): Pt | null {
  const cands: Pt[] = [
    ...map.buildings.filter((b) => b.name && re.test(b.name)).map((b) => centroid(b.outer)),
    ...map.pois.filter((p) => re.test(p.name)).map((p) => [p.x, p.z] as Pt),
  ];
  let best: Pt | null = null;
  for (const c of cands) if (!best || Math.hypot(c[0] - x, c[1] - z) < Math.hypot(best[0] - x, best[1] - z)) best = c;
  return best;
}

/**
 * The crook between wings where the entrance is: toward the place in
 * CROOK_TOWARD if listed, else the one facing the front road. Null if the
 * outline has no crooks.
 */
function frontCrook(map: CampusMap, b: Building, wings: number): { p: Pt; dir: Pt } | null {
  const corners = innerCorners(b.outer, wings);
  if (!corners.length) return null;
  const c0 = centroid(b.outer);
  const rule = CROOK_TOWARD.find(([re]) => re.test(b.name ?? ""));
  const target = rule ? nearestNamed(map, rule[1], c0[0], c0[1]) : null;
  if (rule && !target) console.warn(`[landmarks] ${b.name}: nothing named ${rule[1]} to face; using its front road`);
  let nx: number;
  let nz: number;
  if (target) {
    const l = Math.hypot(target[0] - c0[0], target[1] - c0[1]) || 1;
    nx = (target[0] - c0[0]) / l;
    nz = (target[1] - c0[1]) / l;
  } else {
    const f = frontOf(map, b);
    nx = f.nx;
    nz = f.nz;
  }
  return corners.reduce((best, c) => (c.dir[0] * nx + c.dir[1] * nz > best.dir[0] * nx + best.dir[1] * nz ? c : best));
}

/**
 * The front OSM's road names give away: toward a nearby "… Front road" or
 * "Entry - …", or away from a nearby "Behind … Dept" or "… Back Road", when
 * the road also names the building. Null when no such road is close.
 */
function namedFront(map: CampusMap, b: Building): Face | null {
  const c = centroid(b.outer);
  const near = (p: Pt) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 60;
  // Only roads that also name this building count ("Mech Entry" for Mechanical,
  // not "West campus entry"; "Back Gate Road" is a gate, not anyone's back).
  const words = (b.name ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const names = (r: Road) =>
    (r.name ?? "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !/^(front|entry|back|behind|road|dept|gate)$/.test(w))
      .some((w) => words.some((bw) => bw.startsWith(w)));
  const front = nearestRoadPoint(c[0], c[1], map.roads, (r) => /\b(front|entry)\b/i.test(r.name ?? "") && names(r));
  if (front && near(front.p)) return faceToward(b, front.p);
  // Away from where the "behind" road runs as a whole, not its single nearest
  // point: round an L-shaped block that point can sit off a corner.
  const back = map.roads.filter((r) => /\b(behind|back)\b/i.test(r.name ?? "") && names(r)).flatMap((r) => r.pts).filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 80);
  if (back.length) {
    const bx = back.reduce((t, p) => t + p[0], 0) / back.length;
    const bz = back.reduce((t, p) => t + p[1], 0) / back.length;
    return faceToward(b, [2 * c[0] - bx, 2 * c[1] - bz]);
  }
  return null;
}

/**
 * A building's front: a checked facing (KNOWN_FRONTS), else what its road
 * names say (namedFront), else the face toward the nearest proper road.
 * Signs and doors go here.
 */
export function frontOf(map: CampusMap, b: Building): Face {
  const known = knownFront(b);
  if (known) return known;
  const c = centroid(b.outer);
  const named = namedFront(map, b);
  if (named) return named;
  const road = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.rank >= 3);
  return faceToward(b, road ? road.p : [c[0], c[1] + 50]);
}

/** Fronts checked on the ground, where OSM's roads and points mislead: the side the entrance faces. */
const KNOWN_FRONTS: [RegExp, Pt][] = [
  [/^Department of Computer Science/i, [1, 0]], // east
  [/^Department of Electronics and Communication/i, [1, 0]], // east, onto the same road as EEE
  [/^School of Humanities/i, [0, -1]], // north, like the Chemistry and Physics block it sits against
  [/^Lecture Hall Complex - ?C$/i, [1, 0]], // east, into campus; the west side is its back, on the compound wall
];

function knownFront(b: Building): Face | null {
  const hit = KNOWN_FRONTS.find(([re]) => re.test(b.name ?? ""));
  if (!hit) return null;
  const c = centroid(b.outer);
  return faceToward(b, [c[0] + hit[1][0] * 100, c[1] + hit[1][1] * 100]);
}

/**
 * A department's front. Checked facings win (KNOWN_FRONTS), then road names (namedFront). Otherwise OSM often has
 * the department as a point near its entrance as well as the building
 * outline; face that point when there is one (it's off-centre toward the
 * door), else the nearest road.
 */
function deptFront(map: CampusMap, b: Building): Face {
  const known = knownFront(b);
  if (known) return known;
  const named = namedFront(map, b);
  if (named) return named;
  const poi = deptPoint(map, b);
  return poi ? faceToward(b, poi) : frontOf(map, b);
}

/** The department's own OSM point near its building, off-centre (toward its door), or null. */
function deptPoint(map: CampusMap, b: Building): Pt | null {
  const c = centroid(b.outer);
  const base = (s: string) => s.toLowerCase().replace(/^departments /, "department ").replace(/ engineering$/, "").trim();
  const name = base(b.name ?? "");
  const poi = map.pois.find((p) => {
    const pn = base(p.name);
    const d = Math.hypot(p.x - c[0], p.z - c[1]);
    return pn.length > 8 && (name.startsWith(pn) || pn.startsWith(name)) && d < 50 && d > 6;
  });
  return poi ? [poi.x, poi.z] : null;
}

/** The OBB face of a building that looks toward a point: centre, outward normal, width. */
function faceToward(b: Building, target: Pt) {
  const box = orientedBox(b.outer);
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  const faces = [
    { n: [c, s], off: box.len / 2, w: box.wid },
    { n: [-c, -s], off: box.len / 2, w: box.wid },
    { n: [-s, c], off: box.wid / 2, w: box.len },
    { n: [s, -c], off: box.wid / 2, w: box.len },
  ];
  const tx = target[0] - box.cx;
  const tz = target[1] - box.cz;
  const tl = Math.hypot(tx, tz) || 1;
  let best = faces[0];
  let bestDot = -Infinity;
  for (const f of faces) {
    const d = (f.n[0] * tx + f.n[1] * tz) / tl;
    if (d > bestDot) {
      bestDot = d;
      best = f;
    }
  }
  return {
    x: box.cx + best.n[0] * best.off,
    z: box.cz + best.n[1] * best.off,
    nx: best.n[0],
    nz: best.n[1],
    width: best.w,
    box,
  };
}

function signBoard(lines: string[], w: number, h: number, opts: { bg?: string; fg?: string } = {}): THREE.Mesh {
  const tex = signTexture(lines, { ...opts, w: 1024, h: Math.round((1024 * h) / w) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(0xffffff, { map: tex, ramp: "soft", glow: 0x666666, emissiveMap: tex }));
  return m;
}

function shadows(o: THREE.Object3D) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

export function findByName(map: CampusMap, re: RegExp): Building | undefined {
  const hits = map.buildings.filter((b) => b.name && re.test(b.name));
  return hits.sort((a, b) => b.area - a.area)[0];
}

export function buildLandmarks(map: CampusMap, grid: Grid): LandmarkRig {
  const group = new THREE.Group();
  group.name = "landmarks";
  const updaters: ((t: number, glow: number) => void)[] = [];
  const spots: { name: string; x: number; z: number }[] = [];
  const attached = new Map<number, THREE.Object3D[]>();
  const attach = (id: number, o: THREE.Object3D) => {
    const list = attached.get(id) ?? [];
    list.push(o);
    attached.set(id, list);
  };

  /* ---------------- lighthouse ---------------- */
  if (map.lighthouse) {
    const [lx, lz] = map.lighthouse;
    addMound({ x: lx, z: lz, r: 48, h: 10 });
    // Built at 0: the terrain (knoll included) lifts it like everything else.
    const base = 0;
    const lh = new THREE.Group();
    lh.position.set(lx, base, lz);
    // A square concrete tower (OSM: height 30.3 m, lit 1972) in red and
    // white bands, a column of windows up each face, and a red service
    // floor with a cantilevered gallery under the lantern.
    const H = 26;
    const W = 4.6;
    const white = toon(0xf7f5ee);
    const red = toon(0xc0302a);
    const bands = [red, white, red, white, red, white];
    const bh = H / bands.length;
    bands.forEach((m, k) => {
      const band = new THREE.Mesh(new THREE.BoxGeometry(W, bh, W), m);
      band.position.y = bh * (k + 0.5);
      lh.add(band);
    });
    const winMat = toon(0x3a4a55, { glow: 0xffcf80 });
    const frameMat = toon(0xffffff);
    for (let y = 2.2; y < H - 1; y += 2.6) {
      for (const [dx, dz, ry] of [
        [0, W / 2, 0],
        [0, -W / 2, Math.PI],
        [W / 2, 0, Math.PI / 2],
        [-W / 2, 0, -Math.PI / 2],
      ] as const) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.12), frameMat);
        frame.position.set(dx * 1.01, y, dz * 1.01);
        frame.rotation.y = ry;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.14), winMat);
        glass.position.copy(frame.position);
        glass.rotation.y = ry;
        lh.add(frame, glass);
      }
    }
    // Service floor, wider than the shaft, then the gallery slab and rail.
    const service = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 3, W + 1.2), red);
    service.position.y = H + 1.5;
    lh.add(service);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const w = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 0.14), winMat);
      w.position.set(Math.sin(a) * (W / 2 + 0.62), H + 1.7, Math.cos(a) * (W / 2 + 0.62));
      w.rotation.y = a;
      lh.add(w);
    }
    const gallery = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 0.4, W + 3), toon(0x2d3436));
    gallery.position.y = H + 3.2;
    lh.add(gallery);
    const railMat = toon(0xf7f5ee);
    for (const [dx, dz, w, d] of [
      [0, (W + 3) / 2, W + 3, 0.08],
      [0, -(W + 3) / 2, W + 3, 0.08],
      [(W + 3) / 2, 0, 0.08, W + 3],
      [-(W + 3) / 2, 0, 0.08, W + 3],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), railMat);
      rail.position.set(dx, H + 3.85, dz);
      lh.add(rail);
    }
    const lanternMat = toon(0xbfe6ff, { glow: 0xfff2b0, transparent: true, opacity: 0.85 });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 10), lanternMat);
    lantern.position.y = H + 4.6;
    lh.add(lantern);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.8, 0.9, 10), white);
    roof.position.y = H + 6.25;
    lh.add(roof);
    // The DGPS/radar bar that sweeps on top.
    const radar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 0.4), toon(0xe8e8e8));
    radar.position.y = H + 7.1;
    lh.add(radar);
    updaters.push((t) => {
      radar.rotation.y = t * 1.6;
    });
    shadows(lh);

    // The beam: two long cones sweeping round, only after dusk.
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1b8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Group();
    beam.position.y = H + 4.6;
    for (const s of [0, Math.PI]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 260, 20, 1, true), beamMat);
      cone.rotation.z = Math.PI / 2;
      cone.position.x = 130;
      const arm = new THREE.Group();
      arm.rotation.y = s;
      arm.add(cone);
      beam.add(arm);
    }
    lh.add(beam);
    updaters.push((t, glow) => {
      beam.rotation.y = t * 0.9;
      beamMat.opacity = glow > 0.3 ? 0.16 * glow : 0;
      beam.visible = glow > 0.3;
    });
    group.add(lh);
    grid.fillPolygon(
      [
        [
          [lx - W / 2 - 0.3, lz - W / 2 - 0.3],
          [lx + W / 2 + 0.3, lz - W / 2 - 0.3],
          [lx + W / 2 + 0.3, lz + W / 2 + 0.3],
          [lx - W / 2 - 0.3, lz + W / 2 + 0.3],
        ],
      ],
      SOLID,
      base + H + 8
    );
    spots.push({ name: "Surathkal Lighthouse", x: lx - 8, z: lz - 8 });
  }

  /* ---------------- Main Building ---------------- */
  const main = findByName(map, /^main building$|main building|administrative (block|building)/i);
  if (main) {
    const f = mainEntrance(map, main);
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z);
    g.rotation.y = Math.atan2(f.nx, f.nz);
    const H = main.height;
    // From the photographs and the virtual tour: a khaki-olive entrance
    // block rising a floor above the egg-crate wings, a full-height glass front between four
    // yellow piers, a gilt grille under the parapet, a brick panel down one
    // side, and three yellow arches over the porch.
    const olive = toon(0xbdb86a);
    const yellow = toon(0xeec43c);
    const TH = H + 3.6;
    const tw = Math.min(20, f.width * 0.5);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, TH, 9), olive);
    tower.position.set(0, TH / 2, -3.9);
    g.add(tower);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.4, 0.5, 9.4), toon(0xeef0d8));
    cap.position.set(0, TH + 0.25, -3.9);
    g.add(cap);
    const gw = tw * 0.56;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(gw, TH - 6.2, 0.3), toon(0x2e4a52, { glow: 0xffd89a, ramp: "soft" }));
    glass.position.set(0, 5 + (TH - 6.2) / 2, 0.62);
    g.add(glass);
    for (let k = 0; k < 4; k++) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.9, TH - 1.6, 0.9), yellow);
      pier.position.set(glass.position.x - gw / 2 + (k * gw) / 3, (TH - 1.6) / 2, 0.95);
      g.add(pier);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(gw, 1.3, 0.4), toon(0xc9a24a));
    grille.position.set(glass.position.x, TH - 2.3, 0.8);
    g.add(grille);
    const brick = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.16, TH - 4, 0.4), toon(0x9b4a3a));
    brick.position.set(tw / 2 - tw * 0.08 - 0.3, 4 + (TH - 4) / 2, 0.75);
    g.add(brick);
    // Porch: a slab on the three arches, steps below.
    const span = gw / 3;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(gw + 1, 0.5, 6), toon(0xf3ecd6));
    slab.position.set(glass.position.x, 4.6, 3.6);
    g.add(slab);
    for (let k = 0; k < 3; k++) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2 - 0.2, 0.32, 6, 16, Math.PI), yellow);
      arch.position.set(glass.position.x - gw / 2 + span * (k + 0.5), 4.35 - (span / 2 - 0.2), 6.4);
      g.add(arch);
    }
    for (let k = 0; k < 4; k++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.35 - (span / 2 - 0.2), 0.6), yellow);
      leg.position.set(glass.position.x - gw / 2 + span * k, (4.35 - (span / 2 - 0.2)) / 2, 6.4);
      g.add(leg);
    }
    const steps = new THREE.Mesh(new THREE.BoxGeometry(gw + 1, 0.3, 6.5), toon(0xcfc6b4));
    steps.position.set(glass.position.x, 0.15, 3.5);
    g.add(steps);
    // Left of the brick panel, emblem first, as on the building.
    const bw = tw * 0.84 - 2.2;
    const board = signBoard(["NATIONAL INSTITUTE OF TECHNOLOGY KARNATAKA"], bw, bw / 22, { bg: "#bdb86a", fg: "#ffffff" });
    board.position.set(-tw / 2 + 2.2 + bw / 2, TH - 0.4, 0.62);
    g.add(board);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.65, 20), toon(0x1d3f7a, { glow: 0x88aaff }));
    emblem.position.set(-tw / 2 + 1.3, TH - 0.4, 0.63);
    g.add(emblem);
    shadows(g);
    group.add(g);
    attach(main.id, g);
    g.updateMatrixWorld(true);
    for (let k = 0; k < 4; k++) {
      const w = new THREE.Vector3(glass.position.x - gw / 2 + span * k, 0, 6.4).applyMatrix4(g.matrixWorld);
      grid.stampDisc(w.x, w.z, 0.5, SOLID, 5);
    }
    spots.push({ name: "Main Building", x: f.x + f.nx * 25, z: f.z + f.nz * 25 });
  }

  /* ---------------- the front lawns ---------------- */
  // Gate to Main Building (virtual tour): a long lawn with red-brick walks
  // down both sides and beds of red, orange and yellow crotons along them.
  {
    const axis = mainAxis(map);
    if (axis) {
      const [fx, fz] = axis.from;
      const [tx, tz] = axis.to;
      const l = Math.hypot(tx - fx, tz - fz);
      const ux = (tx - fx) / l;
      const uz = (tz - fz) / l;
      // Landmarks go down before buildings fill the grid, so check footprints too.
      const open = (x: number, z: number) =>
        !(grid.get(x, z) & (SOLID | ROAD | WATER)) && !map.buildings.some((b) => distToPoly(x, z, b.outer) < 3 || pointInPoly(x, z, b.outer));
      const at = (d: number, off: number): Pt => [fx + ux * d - uz * off, fz + uz * d + ux * off];
      const brick = toon(0xb0533c, { ramp: "soft", polygonOffset: 1 });
      const crotons = [toon(0xa8322a), toon(0xd9731f), toon(0xd8b62a), toon(0x5d8a2e)];
      const ang = -Math.atan2(uz, ux);
      for (const side of [-1, 1]) {
        for (let d = 22; d < l - 12; d += 4) {
          const [x, z] = at(d, side * 9);
          if (!open(x, z)) continue;
          const slab = new THREE.Mesh(new THREE.PlaneGeometry(4.05, 2.2).rotateX(-Math.PI / 2), brick);
          slab.position.set(x, 0.06, z);
          slab.rotation.y = ang;
          slab.receiveShadow = true;
          group.add(slab);
          grid.fillPolygon([rectAround(x, z, ux, uz, 4, 2.2)], PATH, 0);
        }
        for (let d = 26, k = 0; d < l - 16; d += 10, k++) {
          const [x, z] = at(d, side * 12);
          if (!open(x, z) || !open(x + ux * 3, z + uz * 3) || !open(x - ux * 3, z - uz * 3)) continue;
          const bed = new THREE.Mesh(new THREE.BoxGeometry(6, 0.55, 1.6), crotons[(k + (side > 0 ? 1 : 0)) % crotons.length]);
          bed.position.set(x, 0.28, z);
          bed.rotation.y = ang;
          bed.castShadow = true;
          bed.receiveShadow = true;
          group.add(bed);
          grid.fillPolygon([rectAround(x, z, ux, uz, 6, 1.6)], SOLID, 0.6);
        }
      }
    }
  }

  /* ---------------- signs on named landmarks ---------------- */
  const signed: [RegExp, string[], string][] = [
    [/central library/i, ["CENTRAL LIBRARY"], "#1d3557"],
    [/silver jubilee|auditorium/i, ["SILVER JUBILEE AUDITORIUM"], "#7a2e1d"],
    // LHC-C carries its own board on its portico (further down).
    [/^lecture hall complex (?!- ?c$)/i, ["LECTURE HALL COMPLEX"], "#1d3557"],
    [/mega mess/i, ["MEGA MESS"], "#1e6f5c"],
  ];
  for (const [re, lines, bg] of signed) {
    const b = findByName(map, re);
    if (!b) continue;
    const f = frontOf(map, b);
    const w = Math.min(f.width * 0.7, 18);
    const board = signBoard(lines, w, w / 9, { bg, fg: "#ffffff" });
    board.position.set(f.x + f.nx * 0.12, Math.min(b.height - 1.2, 9), f.z + f.nz * 0.12);
    board.rotation.y = Math.atan2(f.nx, f.nz);
    group.add(board);
    attach(b.id, board);
    spots.push({ name: b.name!, x: f.x + f.nx * 15, z: f.z + f.nz * 15 });
    if (/auditorium/i.test(b.name!)) {
      // Fly tower over the stage end.
      const tower = new THREE.Mesh(new THREE.BoxGeometry(f.box.wid * 0.5, 6, f.box.wid * 0.45), toon(0xe9dfca));
      tower.position.set(f.box.cx - f.nx * f.box.len * 0.25, b.height + 3, f.box.cz - f.nz * f.box.len * 0.25);
      tower.rotation.y = -f.box.angle;
      shadows(tower);
      group.add(tower);
      attach(b.id, tower);
    }
  }

  /* ---------------- entrances: departments and hostels ---------------- */
  // A porch on a building's front: two square pillars under a flat slab,
  // steps, a dark double door, and a nameboard on the fascia. `want` is where
  // along the face it should go (metres from the face's middle).
  const entrance = (b: Building, front: Face, lines: string[], bg: string, want0: number) => {
    // Sample the face; keep spots where the porch's whole width meets a wall
    // close behind the face (not a courtyard or a gap between wings), and take
    // the one nearest `want`. Wings and towers can leave no such spot on the
    // preferred face: then try its neighbours, then the back, with a narrower porch.
    const c = centroid(b.outer);
    const faces = [
      [front.nx, front.nz],
      [-front.nz, front.nx],
      [front.nz, -front.nx],
      [-front.nx, -front.nz],
    ].map(([x, z], i) => (i === 0 ? front : faceToward(b, [c[0] + x * 100, c[1] + z * 100])));
    for (const [i, f] of faces.entries()) {
      for (const narrow of [false, true]) {
        if (tryFace(b, f, lines, bg, i === 0 ? want0 : 0, narrow)) return;
      }
    }
    console.warn(`[landmarks] no flat wall on any face of ${b.name} for an entrance; skipped`);
  };
  const tryFace = (b: Building, f: Face, lines: string[], bg: string, want: number, narrow: boolean): boolean => {
    const pw = narrow ? 3.6 : Math.min(7, Math.max(4.5, f.width * 0.18));
    const tx = -f.nz;
    const tz = f.nx;
    const depthAt = (u: number) => {
      for (let k = 0; k <= 50; k++) {
        const d = k * 0.5;
        const x = f.x + tx * u - f.nx * d;
        const z = f.z + tz * u - f.nz * d;
        if (pointInPoly(x - f.nx * 0.3, z - f.nz * 0.3, b.outer)) return d;
      }
      return Infinity;
    };
    let best: { u: number; d: number } | null = null;
    for (let u = -f.width / 2 + pw / 2; u <= f.width / 2 - pw / 2; u += 0.5) {
      const d = depthAt(u);
      if (!Number.isFinite(d)) continue;
      // Flat wall across the porch: both ends meet it at about the same depth.
      if (Math.abs(depthAt(u - pw / 2 + 0.3) - d) > 0.6 || Math.abs(depthAt(u + pw / 2 - 0.3) - d) > 0.6) continue;
      if (!best || Math.abs(u - want) < Math.abs(best.u - want)) best = { u, d };
    }
    if (!best) return false;
    porchAt(b, f.x + tx * best.u - f.nx * best.d, f.z + tz * best.u - f.nz * best.d, f.nx, f.nz, pw, lines, bg);
    return true;
  };
  /** The porch itself, its back at (x, z) on the wall, facing (nx, nz). */
  const porchAt = (b: Building, x: number, z: number, nx: number, nz: number, pw: number, lines: string[], bg: string) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(nx, nz);
    const deep = 3.2;
    const white = toon(0xefece4);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.45, deep), white);
    slab.position.set(0, 3.5, deep / 2);
    g.add(slab);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.3, 0.55), white);
      pillar.position.set(side * (pw / 2 - 0.35), 1.65, deep - 0.3);
      g.add(pillar);
    }
    for (let i = 0; i < 2; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.4, 0.15 * (2 - i), 0.5), toon(0xbdb8ad));
      step.position.set(0, 0.075 * (2 - i), deep - 0.25 - i * 0.5 + 0.5);
      g.add(step);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.5, 0.2), toon(0x3a2e24, { glow: 0xffd9a0 }));
    door.position.set(0, 1.25, 0.05);
    g.add(door);
    const board = signBoard(lines, pw * 0.95, 0.75, { bg, fg: "#ffffff" });
    board.position.set(0, 3.5, deep + 0.24);
    g.add(board);
    shadows(g);
    group.add(g);
    attach(b.id, g);
    g.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const p = new THREE.Vector3(side * (pw / 2 - 0.35), 0, deep - 0.3).applyMatrix4(g.matrixWorld);
      grid.stampDisc(p.x, p.z, 0.4, SOLID, 3.3);
    }
  };
  // Winged hostels (blocks 1-5, the Mega towers) are entered at the core,
  // in the crook between two wings that faces the front road.
  const coreEntrance = (b: Building, wings: number, lines: string[], bg: string, finCore = false) => {
    const crook = frontCrook(map, b, wings);
    if (!crook) {
      entrance(b, frontOf(map, b), lines, bg, 0);
      return;
    }
    const [dx, dz] = crook.dir;
    if (!finCore) {
      // Out from the crook point until the porch clears both wing walls.
      porchAt(b, crook.p[0] + dx * 1.3, crook.p[1] + dz * 1.3, dx, dz, 4.5, lines, bg);
      return;
    }
    // The old boys' blocks (from a photo of Vindhya): a full-height core
    // stands out of the crook, its face a screen of close vertical concrete
    // fins over the ground floor, a band along the top, the door at its foot.
    const cw = 7;
    const cd = 4;
    const H = b.height + 0.6;
    const out = 1.2;
    const core = new THREE.Group();
    core.position.set(crook.p[0] + dx * out, 0, crook.p[1] + dz * out);
    core.rotation.y = Math.atan2(dx, dz);
    const cream = toon(0xe6dcae);
    const body = new THREE.Mesh(new THREE.BoxGeometry(cw, H, cd), cream);
    body.position.set(0, H / 2, 0);
    core.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.4, 0.7, cd + 0.4), toon(0xd8cc98));
    band.position.set(0, H - 0.35, 0);
    core.add(band);
    const fins = 11;
    for (let i = 0; i < fins; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, H - 4.6, 0.6), toon(0xd2c592));
      fin.position.set(-cw / 2 + 0.35 + (i * (cw - 0.7)) / (fins - 1), 4.0 + (H - 4.6) / 2, cd / 2 + 0.3);
      core.add(fin);
    }
    // Dark slots between the fins read as the stair hall behind.
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.6, H - 4.6), toon(0x4a4538));
    slot.position.set(0, 4.0 + (H - 4.6) / 2, cd / 2 + 0.01);
    core.add(slot);
    shadows(core);
    group.add(core);
    attach(b.id, core);
    grid.stampDisc(core.position.x, core.position.z, 2, SOLID, H);
    porchAt(b, crook.p[0] + dx * (out + cd / 2), crook.p[1] + dz * (out + cd / 2), dx, dz, 5, lines, bg);
  };

  // Departments and schools, on the blue NITK board. CSE, EEE/IT and Chemical
  // have their own entrances further down.
  const custom = /Computer Science|Electrical and Electronics|Chemical Engineering/i;
  const seenDept = new Set<string>();
  for (const b of map.buildings) {
    if (!b.name || !/^(Departments? of|School of) /i.test(b.name) || custom.test(b.name)) continue;
    const key = b.name.toLowerCase().replace(/ engineering$/, "");
    if (seenDept.has(key)) continue;
    seenDept.add(key);
    const f = deptFront(map, b);
    // Toward the department's OSM point if it has one (it marks the door's end), else the middle.
    const poi = deptPoint(map, b);
    const want = poi ? (poi[0] - f.x) * -f.nz + (poi[1] - f.z) * f.nx : 0;
    const title = /^School of /i.test(b.name) ? b.name.toUpperCase() : "DEPARTMENT OF " + b.name.replace(/^Departments? of /i, "").toUpperCase();
    entrance(b, f, [title, "NITK · SURATHKAL"], "#1f4fa0", want);
  }

  // Hostels, on a green board: the hostel's name, then its block and who lives there.
  const hostels = new Map<string, Building>();
  for (const b of map.buildings) {
    if (!b.name || /mess/i.test(b.name)) continue;
    if (!(b.type === "dormitory" || /\bblock\b|hostel|^GH-\d/i.test(b.name))) continue;
    // OSM splits some into parts (GH-4): one entrance, on the biggest.
    const prev = hostels.get(b.name);
    if (!prev || b.area > prev.area) hostels.set(b.name, b);
  }
  for (const b of hostels.values()) {
    const n = b.name!.replace(/\s+/g, " ").trim();
    // Shivalik's entrance comes with its copper box, further down.
    if (/Shiwalik|Shivalik/i.test(n)) continue;
    let lines: string[];
    let m: RegExpMatchArray | null;
    if ((m = n.match(/^(\d+\w*) Block ?\(([^)]+)\)$/i))) lines = [m[2].toUpperCase(), `${m[1].toUpperCase()} BLOCK · BOYS' HOSTEL`];
    else if ((m = n.match(/^GH-(\d+) (.+)$/i))) lines = [m[2].toUpperCase(), `GH-${m[1]} · GIRLS' HOSTEL`];
    else if ((m = n.match(/^Mega Hostel - Tower (\d+) \(([^)]+)\)$/i))) lines = [m[2].toUpperCase(), `MEGA HOSTEL · TOWER ${m[1]}`];
    else if ((m = n.match(/^(.+?) \(([^)]+)\)$/))) lines = [m[2].toUpperCase(), m[1].toUpperCase()];
    else if (/^girls hostel new$/i.test(n)) lines = ["NEW GIRLS' HOSTEL", "NITK · SURATHKAL"];
    else lines = [n.toUpperCase(), "NITK · SURATHKAL"];
    if (/^Mega Hostel/i.test(n)) coreEntrance(b, 4, lines, "#1e6f5c");
    // The old winged boys' blocks carry their name on a blue board over the door, as Vindhya does.
    else if (/^[1-5](st|nd|rd|th) Block|Pushpagiri/i.test(n)) coreEntrance(b, 3, [lines[0], lines[1]], "#1f5fae", true);
    else entrance(b, frontOf(map, b), lines, "#1e6f5c", 0);
  }

  /* ---------------- façade pieces, from photographs ---------------- */
  // Mega Hostel towers (virtual tour): four wings round a centre, with a
  // blue-glass stair core set into each of the four inner corners where the
  // wings meet; in the entrance corner it starts above the porch.
  for (const b of map.buildings) {
    if (!b.name || !/^Mega Hostel/i.test(b.name)) continue;
    const h = b.height + 1.2;
    const floors = Math.max(1, Math.round(h / FLOOR_H));
    const side = 4.5;
    const glass = toon(0xffffff, { map: curtainWall(3, floors * 2), glow: 0x9fd0ff, emissiveMap: curtainWall(3, floors * 2) });
    const corners = innerCorners(b.outer, 4);
    if (corners.length < 4) console.warn(`[landmarks] ${b.name}: found ${corners.length} of 4 inner corners for the glass cores`);
    // In the entrance crook (see coreEntrance) the glass starts above the porch;
    // the ground floor there is the way in.
    const door = frontCrook(map, b, 4);
    for (const c of corners) {
      const isDoor = !!door && c.p[0] === door.p[0] && c.p[1] === door.p[1];
      const base = isDoor ? 4.2 : 0;
      // A square core tucked into the crook: its sides along the two wing
      // walls (about 45 degrees either side of the crook's direction), its
      // back corner a little inside the building.
      const core = new THREE.Mesh(new THREE.BoxGeometry(side, h - base, side), glass);
      const k = side / Math.SQRT2 - 0.4;
      const cx = c.p[0] + c.dir[0] * k;
      const cz = c.p[1] + c.dir[1] * k;
      core.position.set(cx, base + (h - base) / 2, cz);
      core.rotation.y = -(Math.atan2(c.dir[1], c.dir[0]) + Math.PI / 4);
      shadows(core);
      group.add(core);
      attach(b.id, core);
      // Over the entrance it's overhead, so the ground under it stays walkable.
      if (!isDoor) grid.stampDisc(cx, cz, side / 2, SOLID, h);
    }
  }
  // The EEE/IT blocks (from a photo of the front): a light-blue glass core
  // runs up the middle, stood proud of the grey render; at its foot a green
  // portal porch on two square piers, with the department's blue nameboard
  // on its fascia.
  for (const b of map.buildings) {
    if (!b.name || !/Electrical and Electronics|Information Technology/i.test(b.name)) continue;
    const f = deptFront(map, b);
    const w = Math.min(8, f.width * 0.3);
    const h = b.height + 1.2;
    const floors = Math.max(1, Math.round(h / FLOOR_H));
    const glassTex = curtainWall(5, floors * 2);
    const core = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), toon(0x9cd2f2, { map: glassTex, glow: 0x9fd0ff, emissiveMap: glassTex }));
    core.position.set(f.x + f.nx * 0.7, h / 2, f.z + f.nz * 0.7);
    core.rotation.y = Math.atan2(f.nx, f.nz);
    shadows(core);
    group.add(core);
    attach(b.id, core);

    const green = toon(0x4f9a44);
    const porch = new THREE.Group();
    porch.position.set(f.x, 0, f.z);
    porch.rotation.y = core.rotation.y;
    const pw = w + 3;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.9, 3.4), green);
    beam.position.set(0, 3.65, 2.1);
    porch.add(beam);
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 0.7), green);
      pier.position.set(side * (pw / 2 - 0.35), 1.6, 3.4);
      porch.add(pier);
    }
    const dept = /Information Technology/i.test(b.name) ? "DEPT. OF INFORMATION TECHNOLOGY" : "DEPARTMENT OF ELECTRICAL & ELECTRONICS ENGINEERING";
    const board = signBoard([dept, "NITK · SURATHKAL"], pw * 0.8, 0.8, { bg: "#1f4fa0", fg: "#ffffff" });
    board.position.set(0, 3.65, 3.83);
    porch.add(board);
    // IT shares the EEE building (OSM has it as a point on its wall): its board goes on the glass above the porch.
    if (!/Information Technology/i.test(b.name) && map.pois.some((p) => /Information Technology/i.test(p.name) && (pointInPoly(p.x, p.z, b.outer) || distToPoly(p.x, p.z, b.outer) < 3))) {
      const it = signBoard(["DEPT. OF INFORMATION TECHNOLOGY", "NITK · SURATHKAL"], w * 1.05, 0.9, { bg: "#1f4fa0", fg: "#ffffff" });
      it.position.set(0, 5.4, 1.55);
      porch.add(it);
    }
    shadows(porch);
    group.add(porch);
    attach(b.id, porch);
    porch.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const p = new THREE.Vector3(side * (pw / 2 - 0.35), 0, 3.4).applyMatrix4(porch.matrixWorld);
      grid.stampDisc(p.x, p.z, 0.45, SOLID, 3.4);
    }
  }
  // Chemical Engineering: a curved canopy on round piers, the blue nameboard on its fascia.
  {
    const b = findByName(map, /^Department of Chemical Engineering$/i);
    if (b) {
      const f = frontOf(map, b);
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.z);
      g.rotation.y = Math.atan2(f.nx, f.nz);
      const R = Math.min(9, f.width * 0.4);
      const mauve = toon(0xb58d95);
      const fascia = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.3, 24, 1, true, -Math.PI / 2, Math.PI), mauve);
      fascia.material.side = THREE.DoubleSide;
      fascia.position.y = 6.2;
      // CircleGeometry's lower half (y < 0) lands on +z once laid flat.
      const roof = new THREE.Mesh(new THREE.CircleGeometry(R, 24, Math.PI, Math.PI), toon(0xe9dccf, { side: THREE.DoubleSide }));
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = 6.8;
      g.add(fascia, roof);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + ((k + 0.5) / 5) * Math.PI;
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5.6, 10), mauve);
        pier.position.set(Math.sin(a) * (R - 0.6), 2.8, Math.cos(a) * (R - 0.6));
        g.add(pier);
        const w = new THREE.Vector3(pier.position.x, 0, pier.position.z);
        g.updateMatrixWorld(true);
        w.applyMatrix4(g.matrixWorld);
        grid.stampDisc(w.x, w.z, 0.5, SOLID, 7);
      }
      const board = signBoard(["DEPARTMENT OF CHEMICAL ENGINEERING"], R * 1.1, 1.1, { bg: "#1d3f8a", fg: "#ffffff" });
      board.position.set(0, 7.6, R * 0.35);
      g.add(board);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 24, Math.PI, Math.PI), toon(0xc0583a));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.06;
      g.add(floor);
      shadows(g);
      group.add(g);
      attach(b.id, g);
    }
  }
  // Civil to Water Resources & Ocean Engineering: a covered first-floor
  // walkway on splayed concrete piers along the Civil block's front (per the
  // UG Programmes photo). Ends land on each building's nearest wall.
  {
    const a = findByName(map, /^Department of Civil Engineering$/i);
    const b = findByName(map, /^Department of Water Resources and Ocean/i);
    if (a && b) {
      const nearest = (ring: Pt[], to: Pt): Pt => {
        let best: Pt = ring[0];
        let bd = Infinity;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          const q = ring[(i + 1) % ring.length];
          const dx = q[0] - p[0];
          const dz = q[1] - p[1];
          const t = Math.max(0, Math.min(1, ((to[0] - p[0]) * dx + (to[1] - p[1]) * dz) / (dx * dx + dz * dz || 1)));
          const c: Pt = [p[0] + dx * t, p[1] + dz * t];
          const d = Math.hypot(c[0] - to[0], c[1] - to[1]);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        return best;
      };
      const s0 = nearest(a.outer, centroid(b.outer));
      const e0 = nearest(b.outer, centroid(a.outer));
      const len = Math.hypot(e0[0] - s0[0], e0[1] - s0[1]);
      if (len > 3 && len < 60) {
        const ux = (e0[0] - s0[0]) / len;
        const uz = (e0[1] - s0[1]) / len;
        const g = new THREE.Group();
        g.position.set((s0[0] + e0[0]) / 2, 0, (s0[1] + e0[1]) / 2);
        g.rotation.y = Math.atan2(ux, uz) - Math.PI / 2;
        // Local x runs along the walkway.
        const W = 2.8;
        const deckY = 4.6;
        const wall = toon(0xe6dcc0);
        const trim = toon(0xb9ab8c);
        const glass = toon(0x2b3a4a, { ramp: "soft" });
        const concrete = toon(0xc9c4b8);
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, 2.6, W), wall);
        box.position.y = deckY + 1.3;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.5, W + 0.5), trim);
        slab.position.y = deckY - 0.25;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.3, W + 0.8), trim);
        roof.position.y = deckY + 2.75;
        g.add(box, slab, roof);
        // A continuous window band on both long sides.
        for (const side of [-1, 1]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(len - 0.6, 0.9, 0.06), glass);
          band.position.set(0, deckY + 1.5, side * (W / 2 + 0.02));
          g.add(band);
        }
        // Splayed piers in pairs, every ~8 m, each with a diagonal lean.
        const bays = Math.max(1, Math.round(len / 8));
        for (let k = 0; k <= bays; k++) {
          const x = -len / 2 + (k / bays) * len;
          for (const side of [-1, 1]) {
            const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, deckY - 0.4, 4), concrete);
            pier.rotation.y = Math.PI / 4;
            pier.rotation.x = side * 0.09;
            pier.position.set(x, (deckY - 0.4) / 2, side * (W / 2 + 0.25));
            g.add(pier);
            const w = new THREE.Vector3(pier.position.x, 0, pier.position.z);
            g.updateMatrixWorld(true);
            w.applyMatrix4(g.matrixWorld);
            // Solid up to head height only, so you can walk under the deck.
            grid.stampDisc(w.x, w.z, 0.5, SOLID, deckY - 0.4);
          }
        }
        shadows(g);
        group.add(g);
      }
    }
  }
  // CSE (the 2018 block, from its aerial photo): cream render, with two tall
  // terracotta-tiled wall planes framing a glazed double-height lobby, a long
  // strip window above the entrance, a square cream portico in front and a
  // pale tiled forecourt set with dark squares.
  {
    const b = findByName(map, /^Department of Computer Science/i);
    if (b) {
      const f = deptFront(map, b);
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.z);
      g.rotation.y = Math.atan2(f.nx, f.nz);
      const H = b.height + 0.6;
      const bay = Math.min(14, f.width * 0.42);
      const panelW = Math.min(9, f.width * 0.24);
      const cream = toon(0xefe6d4);
      const red = toon(0xffffff, { map: tileTexture("#a8432f", "#8f3526", 6, 8) });
      // Local +z points out of the building; -z sinks into it, so every piece meets the wall.
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, H, 1.6), red);
        panel.position.set(side * (bay / 2 + panelW / 2), H / 2, -0.2);
        g.add(panel);
      }
      // The lobby: dark glazing, two floors, between the red planes.
      const glass = new THREE.Mesh(new THREE.BoxGeometry(bay, 6.6, 0.4), toon(0x33434f, { ramp: "soft" }));
      glass.position.set(0, 3.3, -0.9);
      g.add(glass);
      // A cream band over it carrying the long strip window.
      const band = new THREE.Mesh(new THREE.BoxGeometry(bay, H - 6.6, 1.2), cream);
      band.position.set(0, 6.6 + (H - 6.6) / 2, -0.6);
      g.add(band);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(bay * 0.86, 0.9, 0.1), toon(0x2b3642, { ramp: "soft" }));
      strip.position.set(0, 6.6 + (H - 6.6) * 0.45, 0.02);
      g.add(strip);
      // The portico: a square cream frame on two thick piers.
      const pw = Math.min(8, bay * 0.7);
      const deep = 6;
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.4, deep), cream);
        pier.position.set(side * (pw / 2 - 0.55), 2.2, 1.2 + deep / 2);
        g.add(pier);
      }
      const lid = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.9, deep), cream);
      lid.position.set(0, 4.85, 1.2 + deep / 2);
      g.add(lid);
      const csBoard = signBoard(["DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING", "NITK · SURATHKAL"], pw * 0.95, 0.75, { bg: "#1f4fa0", fg: "#ffffff" });
      csBoard.position.set(0, 4.85, 1.2 + deep + 0.02);
      g.add(csBoard);
      // Forecourt paving, just above the ground.
      const courtW = bay + panelW * 2;
      const court = new THREE.Mesh(new THREE.PlaneGeometry(courtW, 14), toon(0xffffff, { map: forecourtTexture(courtW, 14), ramp: "soft", polygonOffset: 2 }));
      court.rotation.x = -Math.PI / 2;
      court.position.set(0, 0.04, 7);
      court.receiveShadow = true;
      g.add(court);
      shadows(g);
      court.castShadow = false;
      group.add(g);
      attach(b.id, g);
      g.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        for (let d = 0; d <= deep; d += 1) {
          const w = new THREE.Vector3(side * (pw / 2 - 0.55), 0, 1.2 + d).applyMatrix4(g.matrixWorld);
          grid.stampDisc(w.x, w.z, 0.6, SOLID, 4.4);
        }
      }
    }
  }
  // The pavilion behind the Main Building: open on all sides, a barrel-vaulted
  // orange corrugated roof on steel arches and posts, low cream parapets along
  // the long sides, and a floor of red interlocking pavers.
  {
    const b = map.buildings.find((x) => x.type === "pavilion");
    if (b) {
      const box = orientedBox(b.outer);
      const g = new THREE.Group();
      g.position.set(box.cx, 0, box.cz);
      // Local x runs along the pavilion's length (the vault's axis).
      g.rotation.y = -box.angle;
      const L = box.len;
      const W = box.wid;
      const postH = 4;
      const rise = Math.min(3.2, W * 0.16);
      // The arc through both eaves and the crown.
      const R = (W * W) / 4 / (2 * rise) + rise / 2;
      const half = Math.asin(Math.min(1, W / 2 / R));
      const cy = postH + rise - R;

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), toon(0xffffff, { map: paverTexture(L, W), ramp: "soft", polygonOffset: 2 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      floor.receiveShadow = true;
      g.add(floor);

      // The vault: an open cylinder segment along x, seen from below as warm orange sheeting.
      const roof = new THREE.Mesh(
        // The segment is centred on +z; turn its axis onto x, then swing the arc to face up.
        new THREE.CylinderGeometry(R, R, L, 40, 1, true, -half, half * 2).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2),
        toon(0xffffff, { map: sheetTexture(L), side: THREE.DoubleSide, glow: 0x6a3a10, emissiveMap: sheetTexture(L) })
      );
      roof.position.y = cy;
      g.add(roof);

      const steel = toon(0x6e7378);
      const bays = Math.max(2, Math.round(L / 4.5));
      for (let k = 0; k <= bays; k++) {
        const x = -L / 2 + (k / bays) * L;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 5, 32, half * 2).rotateZ(Math.PI / 2 - half).rotateY(Math.PI / 2), steel);
        rib.position.set(x, cy, 0);
        g.add(rib);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, postH, 6), steel);
          post.position.set(x, postH / 2, side * (W / 2 - 0.1));
          g.add(post);
        }
      }
      // Low parapets along the long sides, open at the ends.
      const cream = toon(0xe9dcb0);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(L, 0.8, 0.25), cream);
        wall.position.set(0, 0.4, side * (W / 2 - 0.1));
        g.add(wall);
      }
      shadows(g);
      floor.castShadow = false;
      group.add(g);
      attach(b.id, g);
      g.updateMatrixWorld(true);
      const at = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld);
      for (const side of [-1, 1]) {
        const a = at(-L / 2, side * (W / 2 - 0.1));
        const c = at(L / 2, side * (W / 2 - 0.1));
        grid.strokeLine([[a.x, a.z], [c.x, c.z]], 0.4, SOLID, 0.8);
      }
      spots.push({ name: "Pavilion", x: box.cx, z: box.cz });
    }
  }
  // Shivalik (11th Block; from a photo): a long white block with tall bays of
  // ochre balcony frames and white fins, a copper-clad box with a glass front
  // over the entrance, and a low curved ochre wall with dark slits wrapping
  // one corner.
  {
    const b = map.buildings.find((x) => x.name && /Shiwalik|Shivalik/i.test(x.name));
    if (b) {
      const f = frontOf(map, b);
      const tx = -f.nz;
      const tz = f.nx;
      const W = f.width;
      const H = b.height;
      // How far behind the face the wall is at u along it (Infinity past the building's ends).
      const depthAt = (u: number) => {
        for (let k = 0; k <= 40; k++) {
          const d = k * 0.5;
          if (pointInPoly(f.x + tx * u - f.nx * (d + 0.3), f.z + tz * u - f.nz * (d + 0.3), b.outer)) return d;
        }
        return Infinity;
      };
      const at = (u: number, d: number) => new THREE.Vector3(f.x + tx * u - f.nx * d, 0, f.z + tz * u - f.nz * d);
      const face = Math.atan2(f.nx, f.nz);
      const ochre = toon(0xd39a3a);
      const white = toon(0xf4f3ee);
      const copper = toon(0xffffff, { map: tileTexture("#c8662f", "#a4501f", 8, 6) });

      // Balcony bays: from the second floor up, an ochre frame per floor between
      // two ochre piers, split by white fins.
      // Seen from the entry road (the photo): the curved wall at the left end, the copper box right of centre.
      const doorU = -W * 0.18;
      const bw = 7;
      for (let u = -W / 2 + 24; u <= W / 2 - 8; u += 11) {
        if (Math.abs(u - doorU) < 10) continue;
        const d = depthAt(u);
        if (!Number.isFinite(d) || Math.abs(depthAt(u - bw / 2) - d) > 0.6 || Math.abs(depthAt(u + bw / 2) - d) > 0.6) continue;
        const g = new THREE.Group();
        g.position.copy(at(u, d));
        g.rotation.y = face;
        for (let k = 1; k * FLOOR_H < H - 1; k++) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.24, 1.0), ochre);
          slab.position.set(0, k * FLOOR_H, 0.5);
          g.add(slab);
        }
        const tall = H - FLOOR_H;
        for (const side of [-1, 1]) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(0.4, tall, 1.05), ochre);
          pier.position.set(side * (bw / 2 - 0.2), FLOOR_H + tall / 2, 0.52);
          g.add(pier);
        }
        for (let i = 1; i <= 4; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, tall, 0.9), white);
          fin.position.set(-bw / 2 + (i * bw) / 5, FLOOR_H + tall / 2, 0.45);
          g.add(fin);
        }
        shadows(g);
        group.add(g);
        attach(b.id, g);
      }

      // The entrance: the porch and board, and the copper box over it on floors two and three.
      const dd = depthAt(doorU);
      if (Number.isFinite(dd)) {
        const p = at(doorU, dd);
        porchAt(b, p.x, p.z, f.nx, f.nz, 6, ["SHIVALIK", "11TH BLOCK · BOYS' HOSTEL"], "#1e6f5c");
        const g = new THREE.Group();
        g.position.copy(p);
        g.rotation.y = face;
        const box = new THREE.Mesh(new THREE.BoxGeometry(12, 2 * FLOOR_H + 0.6, 3.6), copper);
        box.position.set(0, 4.3 + FLOOR_H + 0.3, 1.8);
        const glassTex = curtainWall(8, 4);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2 * FLOOR_H - 0.8), toon(0x3b5566, { map: glassTex, glow: 0x9fd0ff, emissiveMap: glassTex }));
        pane.position.set(0, 4.3 + FLOOR_H + 0.3, 3.62);
        g.add(box, pane);
        shadows(g);
        group.add(g);
        attach(b.id, g);
      } else console.warn("[landmarks] Shivalik: no wall at the entrance spot on its front");

      // The curved ochre wall at the far +u end: it leaves the front wall,
      // swings out round the end of the block and comes back into the back
      // wall (more than a half round), with dark slits.
      const endU = W / 2 - 0.5;
      const ed = depthAt(endU - 1);
      if (Number.isFinite(ed)) {
        // The block's depth at that end: from the front wall to where it ends behind.
        let back = ed;
        while (back < ed + 30 && pointInPoly(at(endU - 1, back + 0.5).x, at(endU - 1, back + 0.5).z, b.outer)) back += 0.5;
        const h = (back - ed) / 2;
        const bulge = 3;
        const R = h + bulge;
        // Centred at mid-depth, far enough in from the end that it bulges `bulge` past it too.
        const g = new THREE.Group();
        g.position.copy(at(endU - (R - bulge), (ed + back) / 2));
        g.rotation.y = face;
        // Local z is out of the front, x along the block toward its end. The circle
        // meets the front wall (z = h) and the back wall (z = -h) at t0 either side.
        const t0 = Math.acos(h / R);
        const sweep = Math.PI + 2 * t0;
        const wallH = 2.4 * FLOOR_H;
        const arc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, wallH, 40, 1, true, -t0, sweep), toon(0xd39a3a, { side: THREE.DoubleSide }));
        arc.position.y = wallH / 2;
        g.add(arc);
        const dark = toon(0x5a3a1a);
        for (let i = 1; i < 18; i++) {
          const t = -t0 + (i / 18) * sweep;
          const slit = new THREE.Mesh(new THREE.BoxGeometry(0.18, wallH * (0.55 + 0.3 * (i % 2)), 0.08), dark);
          slit.position.set(Math.sin(t) * (R + 0.05), wallH * 0.45, Math.cos(t) * (R + 0.05));
          slit.rotation.y = t;
          g.add(slit);
        }
        shadows(g);
        group.add(g);
        attach(b.id, g);
        g.updateMatrixWorld(true);
        for (let i = 0; i <= 28; i++) {
          const t = -t0 + (i / 28) * sweep;
          const w = new THREE.Vector3(Math.sin(t) * R, 0, Math.cos(t) * R).applyMatrix4(g.matrixWorld);
          grid.stampDisc(w.x, w.z, 0.4, SOLID, wallH);
        }
      } else console.warn("[landmarks] Shivalik: no wall at the end of its front for the curved wall");
    }
  }
  // LHC-C (from a photo): a long white portico, a beam carried on tall raked
  // white blades over broad steps; beside it a yellow wall of tall white
  // louvred panels; behind, a white drum with two ribbons of glass rising
  // over the roof.
  {
    const b = map.buildings.find((x) => x.name && /^Lecture Hall Complex - ?C$/i.test(x.name));
    if (b) {
      const f = frontOf(map, b);
      const tx = -f.nz;
      const tz = f.nx;
      const W = f.width;
      const depthAt = (u: number) => {
        for (let k = 0; k <= 40; k++) {
          const d = k * 0.5;
          if (pointInPoly(f.x + tx * u - f.nx * (d + 0.3), f.z + tz * u - f.nz * (d + 0.3), b.outer)) return d;
        }
        return Infinity;
      };
      const at = (u: number, d: number) => new THREE.Vector3(f.x + tx * u - f.nx * d, 0, f.z + tz * u - f.nz * d);
      const face = Math.atan2(f.nx, f.nz);
      const white = toon(0xf2f1ec);

      // The portico, over the left part of the front.
      const pw = Math.min(30, W * 0.45);
      const pu = -W / 2 + pw / 2 + 2;
      const pd = depthAt(pu);
      if (Number.isFinite(pd)) {
        const g = new THREE.Group();
        g.position.copy(at(pu, pd));
        g.rotation.y = face;
        const deep = 5;
        const ph = 7.2;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(pw, 1.3, deep + 0.6), white);
        beam.position.set(0, ph - 0.65, deep / 2);
        g.add(beam);
        const blades = Math.max(5, Math.round(pw / 3.2));
        for (let i = 0; i < blades; i++) {
          // Tall thin blades, deep front to back, raked so they read as a saw-tooth from the side.
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, ph - 1.3, deep), white);
          blade.position.set(-pw / 2 + 0.5 + (i * (pw - 1)) / (blades - 1), (ph - 1.3) / 2, deep / 2);
          blade.rotation.y = 0.35;
          g.add(blade);
        }
        for (let i = 0; i < 4; i++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(pw - 1, 0.18 * (4 - i), 0.8), toon(0x8f8f8c));
          step.position.set(0, 0.09 * (4 - i), deep + 0.4 - i * 0.8);
          g.add(step);
        }
        // Doors, dark, at the back of the portico.
        const doors = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.5, 2.6, 0.2), toon(0x5a3a28, { glow: 0xffd9a0 }));
        doors.position.set(0, 1.3, 0.1);
        g.add(doors);
        const board = signBoard(["LECTURE HALL COMPLEX - C", "NITK · SURATHKAL"], Math.min(14, pw * 0.5), 0.9, { bg: "#1f4fa0", fg: "#ffffff" });
        board.position.set(0, ph - 0.65, deep + 0.32);
        g.add(board);
        shadows(g);
        group.add(g);
        attach(b.id, g);
        g.updateMatrixWorld(true);
        for (let i = 0; i < blades; i++) {
          const w = new THREE.Vector3(-pw / 2 + 0.5 + (i * (pw - 1)) / (blades - 1), 0, deep / 2).applyMatrix4(g.matrixWorld);
          grid.stampDisc(w.x, w.z, 0.6, SOLID, ph);
        }
      } else console.warn("[landmarks] LHC-C: no wall for its portico");

      // Louvred panels on the right part of the front.
      const lou = louvreTexture();
      for (let i = 0; i < 5; i++) {
        const u = pu + pw / 2 + 4 + i * 4.5;
        if (u > W / 2 - 2) break;
        const d = depthAt(u);
        if (!Number.isFinite(d)) continue;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6.5, 0.2), toon(0xffffff, { map: lou }));
        panel.position.copy(at(u, d - 0.1));
        panel.position.y = 1.2 + 3.25;
        panel.rotation.y = face;
        shadows(panel);
        group.add(panel);
        attach(b.id, panel);
      }

      // The glass drum, behind the portico, standing over the roof.
      const du = pu + pw * 0.15;
      const dd = depthAt(du);
      if (Number.isFinite(dd)) {
        const c = at(du, dd + 8);
        const R = 5.5;
        const top = b.height + 5;
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, top, 28), white);
        drum.position.set(c.x, top / 2, c.z);
        const glassTex = curtainWall(16, 1);
        for (const y of [b.height - 3.6, b.height + 1.8]) {
          const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 2.2, 28, 1, true), toon(0x2f8f88, { map: glassTex, glow: 0x9fd0ff, emissiveMap: glassTex }));
          ribbon.position.set(c.x, y, c.z);
          group.add(ribbon);
          attach(b.id, ribbon);
        }
        shadows(drum);
        group.add(drum);
        attach(b.id, drum);
      }
    }
  }
  // Central Library: grey louvre fins flank the entrance bay.
  {
    const b = findByName(map, /central library/i);
    if (b) {
      const f = frontOf(map, b);
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(1.4, b.height + 0.8, 0.6), toon(0x8d8c99));
        const off = s * Math.min(6, f.width * 0.18);
        fin.position.set(f.x - f.nz * off + f.nx * 0.3, (b.height + 0.8) / 2, f.z + f.nx * off + f.nz * 0.3);
        fin.rotation.y = Math.atan2(f.nx, f.nz);
        shadows(fin);
        group.add(fin);
        attach(b.id, fin);
      }
    }
  }

  /* ---------------- gate arch ---------------- */
  {
    const gateNode = map.pois.find((p) => /main gate/i.test(p.name));
    let at: Pt | null = gateNode ? [gateNode.x, gateNode.z] : null;
    if (!at && main) {
      // Where the road from the Main Building meets NH66.
      const c = centroid(main.outer);
      const tr = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.kind === "trunk");
      if (tr) at = tr.p;
    }
    if (at) {
      const r = nearestRoadPoint(at[0], at[1], map.roads, (rd) => rd.kind !== "trunk" && rd.rank >= 3);
      if (r && Math.hypot(r.p[0] - at[0], r.p[1] - at[1]) < 40) {
        const a = r.road.pts[r.seg - 1];
        const b = r.road.pts[r.seg];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const span = r.road.width + 3;
        const g = new THREE.Group();
        g.position.set(r.p[0], 0, r.p[1]);
        g.rotation.y = -ang + Math.PI / 2;
        // As photographed: no arch. Granite-clad piers, a stone security
        // cabin on one side, and a curved black-granite name wall on the
        // other, trilingual, with the sliding grilles rolled back.
        const stone = toon(0xdcd2bf);
        const pink = toon(0xd9a184);
        const solids: [number, number, number, number][] = [];
        for (const s of [-1, 1]) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), pink);
          pier.position.set((s * span) / 2, 2.6, 0);
          g.add(pier);
          const grille = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 6), toon(0x3a3f45));
          grille.position.set(s * (span / 2 + 0.9), 0.95, -3.4);
          g.add(grille);
          solids.push([(s * span) / 2, 0, 0.8, 5.4]);
        }
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 4.2), stone);
        cabin.position.set(span / 2 + 2.8, 1.6, 1.2);
        const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 0.1), toon(0x34454f, { glow: 0xffd89a }));
        cabinGlass.position.set(span / 2 + 2.8, 1.9, 3.32);
        const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 5), toon(0xf1ece2));
        cabinRoof.position.set(span / 2 + 2.8, 3.35, 1.2);
        g.add(cabin, cabinGlass, cabinRoof);
        solids.push([span / 2 + 2.8, 1.2, 2.3, 3.4]);
        const wallMat = toon(0x1f2023);
        const R = 9;
        const arc = 0.7;
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.8, 16, 1, true, -arc / 2, arc), wallMat);
        wall.material.side = THREE.DoubleSide;
        const wallX = -(span / 2 + 5);
        wall.position.set(wallX, 1.4 + 0.3, 3 - R);
        g.add(wall);
        const kerb = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.5, R + 0.5, 0.3, 16, 1, false, -arc / 2, arc), toon(0xb8664a));
        kerb.position.set(wallX, 0.15, 3 - R);
        g.add(kerb);
        const name = signBoard(
          ["ರಾಷ್ಟ್ರೀಯ ತಂತ್ರಜ್ಞಾನ ಸಂಸ್ಥೆ ಕರ್ನಾಟಕ", "राष्ट्रीय प्रौद्योगिकी संस्थान कर्नाटक", "National Institute of Technology", "Karnataka, Surathkal"],
          5.4,
          2.3,
          { bg: "#1f2023", fg: "#efe6cf" }
        );
        name.position.set(wallX, 1.75, 3.06);
        g.add(name);
        solids.push([wallX, 2.6, 6, 1.2]);
        shadows(g);
        group.add(g);
        g.updateMatrixWorld(true);
        for (const [x, z, w, d] of solids) {
          const pts: Pt[] = [
            [x - w / 2, z - d / 2],
            [x + w / 2, z - d / 2],
            [x + w / 2, z + d / 2],
            [x - w / 2, z + d / 2],
          ].map(([px, pz]) => {
            const v = new THREE.Vector3(px, 0, pz).applyMatrix4(g.matrixWorld);
            return [v.x, v.z] as Pt;
          });
          grid.fillPolygon([pts], SOLID, 5.5);
        }
        // Inside the gate (from the virtual tour, before the granite wall):
        // two yellow pavilions with terracotta pyramid roofs either side of
        // the drive, and a white balustrade with yellow ball finials.
        {
          const toMain = main ? centroid(main.outer) : r.p;
          const zx = Math.sin(g.rotation.y);
          const zz = Math.cos(g.rotation.y);
          const inward = (toMain[0] - r.p[0]) * zx + (toMain[1] - r.p[1]) * zz > 0 ? 1 : -1;
          const inner = new THREE.Group();
          inner.position.copy(g.position);
          inner.rotation.y = g.rotation.y;
          const yellow = toon(0xe8c34a);
          const white = toon(0xf4f1e8);
          const terracotta = toon(0xc0643a);
          const blocks: [number, number, number, number, number][] = [];
          for (const side of [-1, 1]) {
            const px = side * (span / 2 + 8);
            const pz = inward * 14;
            const plinth = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 6), white);
            plinth.position.set(px, 0.25, pz);
            inner.add(plinth);
            for (const [cx, cz] of [
              [-2.2, -2.2],
              [2.2, -2.2],
              [-2.2, 2.2],
              [2.2, 2.2],
            ]) {
              const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.42), yellow);
              col.position.set(px + cx, 0.5 + 1.7, pz + cz);
              inner.add(col);
              blocks.push([px + cx, pz + cz, 0.6, 0.6, 4]);
            }
            if (side < 0) {
              // The U. Srinivas Mallya statue (virtual tour, "U Srinivas
              // Mallya Statue"): the founder, in bronze, on a white pedestal.
              const bronze = toon(0x6b4a2c);
              const ped = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.4), white);
              ped.position.set(px, 0.5 + 0.65, pz);
              const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 10), bronze);
              body.position.set(px, 1.8 + 0.75, pz);
              const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bronze);
              head.position.set(px, 1.8 + 1.72, pz);
              inner.add(ped, body, head);
              blocks.push([px, pz, 1.6, 1.6, 3.6]);
            }
            const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 5.6), yellow);
            beam.position.set(px, 4.2, pz);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.9, 4), terracotta);
            roof.rotation.y = Math.PI / 4;
            roof.position.set(px, 5.45, pz);
            inner.add(beam, roof);
            // Balustrade from the pier out along the frontage.
            // Starts clear of the security cabin and the name wall.
            const x0 = side * (span / 2 + 12);
            const x1 = side * (span / 2 + 34);
            const len = Math.abs(x1 - x0);
            const mid = (x0 + x1) / 2;
            const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.3), toon(0xffffff, { map: balusterTexture(len) }));
            rail.position.set(mid, 0.4, inward * 1.6);
            const coping = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.42), toon(0xa8453a));
            coping.position.set(mid, 0.87, inward * 1.6);
            inner.add(rail, coping);
            // The name in red letters on a white plinth wall, facing NH66
            // (virtual tour, "Highway").
            // Read from the highway, the first half is on the viewer's left.
            const leftSide = inward > 0 ? 1 : -1;
            const name = signBoard([side === leftSide ? "NATIONAL INSTITUTE OF TECHNOLOGY" : "KARNATAKA, SURATHKAL"], len, 0.9, { bg: "#f4f1e8", fg: "#b3261e" });
            name.position.set(mid, 0.45, inward * 1.6 - inward * 0.3);
            if (inward > 0) name.rotation.y = Math.PI;
            const nameWall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.25), white);
            nameWall.position.set(mid, 0.45, inward * 1.6 - inward * 0.16);
            inner.add(nameWall, name);
            blocks.push([mid, inward * 1.6, len, 0.5, 1]);
            for (let d = 0; d <= len; d += 6) {
              const x = x0 + side * d;
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.05, 0.4), white);
              post.position.set(x, 0.52, inward * 1.6);
              const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), toon(0xf0c93a, { glow: 0x806020 }));
              ball.position.set(x, 1.3, inward * 1.6);
              inner.add(post, ball);
            }
          }
          shadows(inner);
          group.add(inner);
          inner.updateMatrixWorld(true);
          for (const [x, z, w, d, top] of blocks) {
            const pts: Pt[] = [
              [x - w / 2, z - d / 2],
              [x + w / 2, z - d / 2],
              [x + w / 2, z + d / 2],
              [x - w / 2, z + d / 2],
            ].map(([px, pz]) => {
              const v = new THREE.Vector3(px, 0, pz).applyMatrix4(inner.matrixWorld);
              return [v.x, v.z] as Pt;
            });
            grid.fillPolygon([pts], SOLID, top);
          }
        }
        spots.push({ name: "NITK Main Gate", x: r.p[0], z: r.p[1] });
      }
    }
  }

  /* ---------------- point features ---------------- */
  // A tiered fountain: basin, stem, bowl. The working one (wet) is NITK blue
  // with water and a jet; the dry ones are plain khaki render.
  const fountain = (x: number, z: number, wet: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const paint = toon(wet ? 0x3a86c8 : 0xdccb8c);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.7, 28), paint);
    basin.position.y = 0.35;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.1, 28), wet ? toon(0x4fb3d9, { glow: 0x2255aa }) : toon(0xb9ab7c));
    floor.position.y = wet ? 0.62 : 0.5;
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 12), paint);
    t1.position.y = 1.4;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.6, 0.5, 16), paint);
    bowl.position.y = 2.6;
    g.add(basin, floor, t1, bowl);
    if (wet) {
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.7 }));
      jet.position.y = 4.3;
      g.add(jet);
      updaters.push((t) => {
        jet.scale.y = 0.85 + Math.sin(t * 6) * 0.15;
      });
    }
    shadows(g);
    group.add(g);
    grid.stampDisc(x, z, 5.2, SOLID, 1);
  };
  // The blue fountain with water: on the Main Building's axis, beyond the flagpole toward the gate.
  {
    const axis = mainAxis(map);
    const flags = map.pois.filter((p) => p.kind === "flagpole");
    const flag = axis ? flags.sort((p, q) => Math.hypot(p.x - axis.from[0], p.z - axis.from[1]) - Math.hypot(q.x - axis.from[0], q.z - axis.from[1]))[0] : undefined;
    if (axis && flag) {
      const dx = axis.to[0] - axis.from[0];
      const dz = axis.to[1] - axis.from[1];
      const l = Math.hypot(dx, dz) || 1;
      const x = flag.x + (dx / l) * 14;
      const z = flag.z + (dz / l) * 14;
      if (grid.blocked(x, z)) console.warn("[landmarks] the Main Building fountain lands on something solid; placed anyway");
      fountain(x, z, true);
    } else console.warn("[landmarks] no Main Building axis or flagpole for the blue fountain");
  }
  for (const p of map.pois) {
    if (p.kind === "fountain") {
      // OSM's fountains stand by the hostels: dry, painted the hostels' khaki.
      fountain(p.x, p.z, false);
    } else if (p.kind === "flagpole") {
      group.add(flagpole(p.x, p.z, updaters));
      grid.stampDisc(p.x, p.z, 0.4, SOLID, 15);
    } else if (p.kind === "water_tower") {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 18, 14), toon(0xd9d2c4));
      shaft.position.y = 9;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 3, 6, 18), toon(0xeee7d8));
      tank.position.y = 21;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 3, 18), toon(0xeee7d8));
      top.position.y = 25.5;
      const lid = new THREE.Mesh(new THREE.ConeGeometry(7.3, 2, 18), toon(0xb85c3e));
      lid.position.y = 28;
      g.add(shaft, tank, top, lid);
      shadows(g);
      group.add(g);
      grid.stampDisc(p.x, p.z, 3, SOLID, 29);
    }
  }

  // Open-air theatres (the Students' Activity Centre, per the virtual tour):
  // the stage building stands at one end of the long axis, a lavender stage
  // under a sheet canopy on yellow poles; the green-painted seating tiers face
  // it from the far end, curving round it, with open ground between.
  for (const a of map.areas) {
    if (a.tags?.amenity !== "theatre") continue;
    const box = orientedBox(a.outer);
    if (Math.min(box.len, box.wid) < 12) continue;
    const g = new THREE.Group();
    g.position.set(box.cx, 0, box.cz);
    // Local x runs along the long axis: the stage at -x, the seats at +x. If a
    // building stands in the theatre (the stage block), the stage end is its end.
    const axis: Pt = [Math.cos(box.angle), Math.sin(box.angle)];
    const block = map.buildings.find((b) => {
      const c = centroid(b.outer);
      return pointInPoly(c[0], c[1], a.outer);
    });
    const flip = block ? (centroid(block.outer)[0] - box.cx) * axis[0] + (centroid(block.outer)[1] - box.cz) * axis[1] > 0 : false;
    g.rotation.y = -box.angle + (flip ? Math.PI : 0);
    const L = box.len;
    const W = box.wid;

    // The stage building.
    const sd = Math.min(8, L * 0.2);
    const sw = Math.min(W * 0.7, 22);
    const xs = -L / 2 + sd; // the stage's front edge
    const stage = new THREE.Mesh(new THREE.BoxGeometry(sd, 1.0, sw), toon(0xb9a6d6));
    stage.position.set(-L / 2 + sd / 2, 0.5, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, sw), toon(0xd8cfe6));
    back.position.set(-L / 2 + 0.2, 3, 0);
    g.add(stage, back);
    const poleMat = toon(0xe8c34a);
    for (const pz of [-sw / 2 + 0.3, sw / 2 - 0.3]) {
      for (const px of [xs - 0.3, -L / 2 + 0.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 6), poleMat);
        pole.position.set(px, 3.2, pz);
        g.add(pole);
      }
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(sd + 1, 0.12, sw + 1), toon(0xc9b58a, { side: THREE.DoubleSide }));
    canopy.position.set(-L / 2 + sd / 2, 6.5, 0);
    canopy.rotation.z = 0.1;
    g.add(canopy);

    // The seating: arcs centred on the stage front, filling the far end.
    const ro = L - sd - 0.6;
    const ri = Math.max(ro - Math.max(4, L * 0.35), L * 0.35);
    const tiers = Math.max(4, Math.min(9, Math.floor((ro - ri) / 1.4)));
    const d = (ro - ri) / tiers;
    const phi = Math.min(1.2, Math.asin(Math.min(1, (W / 2 - 0.5) / ro)));
    const stone = toon(0x3f7d68);
    const lip = toon(0xdfe8e0);
    for (let i = 0; i < tiers; i++) {
      const inner = ri + i * d;
      const outer = inner + d;
      const h = 0.42 * (i + 1);
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outer, -phi, phi, false);
      shape.absarc(0, 0, inner, phi, -phi, true);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 24 });
      geo.rotateX(-Math.PI / 2);
      const tier = new THREE.Mesh(geo, i % 2 ? stone : toon(0x4a8a73));
      tier.position.x = xs;
      g.add(tier);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(inner + 0.05, 0.05, 3, 24, phi * 2), lip);
      edge.rotation.set(-Math.PI / 2, 0, -phi);
      edge.position.set(xs, h, 0);
      g.add(edge);
    }
    // A red stair flight up the middle aisle.
    const red = toon(0xb24a36);
    for (let i = 0; i < tiers; i++) {
      const hh = 0.42 * (i + 1) + 0.04;
      const step = new THREE.Mesh(new THREE.BoxGeometry(d, hh, 1.6), red);
      step.position.set(xs + ri + (i + 0.5) * d, hh / 2, 0);
      g.add(step);
    }
    shadows(g);
    group.add(g);
    // The seats and the stage are solid; the ground between them is open.
    g.updateMatrixWorld(true);
    const at = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld);
    for (let i = 0; i < tiers; i++) {
      const rr = ri + (i + 0.5) * d;
      for (let k = 0; k <= 20; k++) {
        const t = -phi + (k / 20) * phi * 2;
        const w = at(xs + Math.cos(t) * rr, -Math.sin(t) * rr);
        grid.stampDisc(w.x, w.z, d * 0.6, SOLID, 0.42 * (i + 1));
      }
    }
    for (let z = -sw / 2; z <= sw / 2; z += 1) {
      for (let x = -L / 2 + 0.5; x < xs; x += 1) {
        const w = at(x, z);
        grid.stampDisc(w.x, w.z, 0.6, SOLID, 1.0);
      }
    }
    const mid = at((xs + ri + xs) / 2, 0);
    spots.push({ name: a.name ?? "Open-air theatre", x: mid.x, z: mid.z });
  }

  // Floodlight masts at the corners of lit grounds and the pool (virtual
  // tour: the main ground, the basketball courts, the swimming pool), and
  // stepped green-and-yellow seating along the basketball courts.
  {
    const mastGeo = new THREE.CylinderGeometry(0.16, 0.3, 18, 6).translate(0, 9, 0);
    const headGeo = new THREE.BoxGeometry(2.2, 1.2, 0.4).translate(0, 18.4, 0);
    const masts: [number, number, number][] = [];
    for (const a of map.areas) {
      const lit = (a.kind === "pitch" && a.tags?.lit === "yes") || a.kind === "pool";
      if (!lit) continue;
      const box = orientedBox(a.outer);
      if (box.len < 15) continue;
      const c = Math.cos(box.angle);
      const sn = Math.sin(box.angle);
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const u = su * (box.len / 2 + 3);
        const v = sv * (box.wid / 2 + 3);
        const x = box.cx + u * c - v * sn;
        const z = box.cz + u * sn + v * c;
        if (grid.get(x, z) & (SOLID | ROAD | WATER)) continue;
        masts.push([x, z, Math.atan2(box.cx - x, box.cz - z)]);
      }
      if (a.sport === "basketball") {
        const g = new THREE.Group();
        g.position.set(box.cx, 0, box.cz);
        g.rotation.y = -box.angle;
        for (let i = 0; i < 4; i++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(box.len * 0.8, 0.45 * (i + 1), 0.9), toon(i % 2 ? 0xe2c23a : 0x4f9a5e));
          step.position.set(0, (0.45 * (i + 1)) / 2, box.wid / 2 + 1.2 + i * 0.9);
          g.add(step);
        }
        shadows(g);
        group.add(g);
        g.updateMatrixWorld(true);
        const w0 = new THREE.Vector3(-box.len * 0.4, 0, box.wid / 2 + 0.75).applyMatrix4(g.matrixWorld);
        const w1 = new THREE.Vector3(box.len * 0.4, 0, box.wid / 2 + 0.75).applyMatrix4(g.matrixWorld);
        const w2 = new THREE.Vector3(box.len * 0.4, 0, box.wid / 2 + 4.8).applyMatrix4(g.matrixWorld);
        const w3 = new THREE.Vector3(-box.len * 0.4, 0, box.wid / 2 + 4.8).applyMatrix4(g.matrixWorld);
        grid.fillPolygon([[[w0.x, w0.z], [w1.x, w1.z], [w2.x, w2.z], [w3.x, w3.z]]], SOLID, 1.8);
      }
    }
    if (masts.length) {
      const poles = new THREE.InstancedMesh(mastGeo, toon(0x9aa1a6), masts.length);
      const heads = new THREE.InstancedMesh(headGeo, toon(0xe8ecef, { glow: 0xfff4d0 }), masts.length);
      const m = new THREE.Matrix4();
      masts.forEach(([x, z, yaw], i) => {
        m.makeRotationY(yaw).setPosition(x, 0, z);
        poles.setMatrixAt(i, m);
        heads.setMatrixAt(i, m);
        grid.stampDisc(x, z, 0.4, SOLID, 19);
      });
      poles.castShadow = true;
      poles.computeBoundingSphere();
      heads.computeBoundingSphere();
      group.add(poles, heads);
    }
  }

  // Pool: bright water with lane ropes.
  for (const a of map.areas) {
    if (a.kind !== "pool") continue;
    const box = orientedBox(a.outer);
    for (let k = 1; k < 6; k++) {
      const v = -box.wid / 2 + (k * box.wid) / 6;
      const rope = new THREE.Mesh(new THREE.BoxGeometry(box.len * 0.95, 0.08, 0.12), toon(k % 2 ? 0xe74c3c : 0xf1c40f));
      rope.position.set(box.cx - Math.sin(box.angle) * v, 0.2, box.cz + Math.cos(box.angle) * v);
      rope.rotation.y = -box.angle;
      group.add(rope);
    }
    if (a.name) spots.push({ name: a.name, x: box.cx, z: box.cz + box.wid });
  }

  return {
    group,
    spots,
    attached,
    update(t, glow) {
      for (const u of updaters) u(t, glow);
    },
  };
}

/** Square cladding tiles with a darker joint, `cols` x `rows` per texture. */
function tileTexture(face: string, joint: string, cols: number, rows: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = joint;
  ctx.fillRect(0, 0, 256, 256);
  const cw = 256 / cols;
  const ch = 256 / rows;
  ctx.fillStyle = face;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillRect(i * cw + 1.5, j * ch + 1.5, cw - 3, ch - 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pale forecourt tiles set with a dark square every few metres. */
function forecourtTexture(w: number, d: number): THREE.Texture {
  const c = document.createElement("canvas");
  const px = 24;
  c.width = Math.round(w * px);
  c.height = Math.round(d * px);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e9e6de";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#d3cfc4";
  ctx.lineWidth = 1;
  for (let x = 0; x < c.width; x += px) ctx.strokeRect(x, 0, px, c.height);
  for (let y = 0; y < c.height; y += px) ctx.strokeRect(0, y, c.width, px);
  ctx.fillStyle = "#3b3d42";
  for (let x = px * 1.5; x < c.width - px; x += px * 3) for (let y = px * 1.5; y < c.height - px; y += px * 3) ctx.fillRect(x, y, px * 0.6, px * 0.6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Red interlocking pavers: offset bricks, a few shades. */
function paverTexture(l: number, w: number): THREE.Texture {
  const c = document.createElement("canvas");
  const px = 20;
  c.width = Math.min(2048, Math.round(l * px));
  c.height = Math.min(2048, Math.round(w * px));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#7d3a24";
  ctx.fillRect(0, 0, c.width, c.height);
  const shades = ["#b5553a", "#a84c33", "#c0613f", "#9d4630"];
  const bw = px * 0.45;
  const bh = px * 0.22;
  let row = 0;
  for (let y = 0; y < c.height; y += bh + 1, row++) {
    for (let x = row % 2 ? -bw / 2 : 0; x < c.width; x += bw + 1) {
      ctx.fillStyle = shades[(Math.floor(x * 7 + y * 13) >>> 0) % shades.length];
      ctx.fillRect(x, y, bw, bh);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Orange corrugated sheeting, the ribs running round the vault. */
function sheetTexture(l: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e08a3a";
  ctx.fillRect(0, 0, 512, 64);
  const n = Math.round(l * 4);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 512;
    ctx.fillStyle = "rgba(120,55,15,0.35)";
    ctx.fillRect(x, 0, 512 / n / 3, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A tall white louvred panel: a frame round close horizontal slats. */
function louvreTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 192;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4f3ee";
  ctx.fillRect(0, 0, 64, 192);
  ctx.fillStyle = "#c9c6bb";
  for (let y = 10; y < 182; y += 7) ctx.fillRect(6, y, 52, 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 58, 186);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function distToPoly(x: number, z: number, ring: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSeg(x, z, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** A w x d rectangle centred at (x, z), its length along (ux, uz). */
function rectAround(x: number, z: number, ux: number, uz: number, w: number, d: number): Pt[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    [x - ux * hw + uz * hd, z - uz * hw - ux * hd],
    [x + ux * hw + uz * hd, z + uz * hw - ux * hd],
    [x + ux * hw - uz * hd, z + uz * hw + ux * hd],
    [x - ux * hw - uz * hd, z - uz * hw + ux * hd],
  ];
}

/** White balusters on shadow, repeating every 0.5 m along a rail `len` long. */
function balusterTexture(len: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6b675e";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillRect(0, 56, 64, 8);
  ctx.beginPath();
  ctx.ellipse(32, 36, 13, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(24, 8, 16, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(len / 0.5, 1);
  return t;
}

function flagpole(x: number, z: number, updaters: ((t: number, glow: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 15, 8), toon(0xdfe6e9));
  pole.position.y = 7.5;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.8, 8), toon(0xcfc6b4));
  plinth.position.y = 0.4;
  g.add(pole, plinth);

  const c = document.createElement("canvas");
  c.width = 300;
  c.height = 200;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#FF9933";
  ctx.fillRect(0, 0, 300, 67);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 67, 300, 66);
  ctx.fillStyle = "#138808";
  ctx.fillRect(0, 133, 300, 67);
  ctx.strokeStyle = "#000080";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(150, 100, 28, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(150, 100);
    ctx.lineTo(150 + Math.cos(a) * 28, 100 + Math.sin(a) * 28);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(3, 2, 12, 1);
  geo.translate(1.5, 0, 0);
  const flag = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  flag.position.y = 13.8;
  g.add(flag);
  const base = geo.attributes.position.array.slice() as Float32Array;
  updaters.push((t) => {
    const p = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      const u = base[i];
      p[i + 2] = Math.sin(u * 2.2 - t * 5) * 0.18 * (u / 3);
    }
    geo.attributes.position.needsUpdate = true;
  });
  return g;
}

/**
 * The inner corners of a winged plan (the crooks where the wings meet). The
 * OSM outlines are stepped and noisy, so this reads the plan's shape instead
 * of its vertices: the outline's distance from the centre, all the way round,
 * peaks along each wing and dips at each crook. Returns the `count` deepest
 * dips (at least 50 degrees apart), each as the point on the outline and the
 * direction out of the crook.
 */
function innerCorners(ring: Pt[], count: number): { p: Pt; dir: Pt }[] {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const n = pts.length;
  // Area centroid (a vertex average leans towards the busier, stepped sides).
  let a2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const [p, q] = [pts[i], pts[(i + 1) % n]];
    const c = p[0] * q[1] - q[0] * p[1];
    a2 += c;
    cx += (p[0] + q[0]) * c;
    cz += (p[1] + q[1]) * c;
  }
  cx /= 3 * a2;
  cz /= 3 * a2;
  // How far the outline reaches along a ray from the centre.
  const reach = (th: number) => {
    const dx = Math.cos(th);
    const dz = Math.sin(th);
    let best = 0;
    for (let i = 0; i < n; i++) {
      const [p, q] = [pts[i], pts[(i + 1) % n]];
      const ex = q[0] - p[0];
      const ez = q[1] - p[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p[0] - cx) * ez - (p[1] - cz) * ex) / den;
      const u = ((p[0] - cx) * dz - (p[1] - cz) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  };
  const N = 180;
  const r = Array.from({ length: N }, (_, k) => reach((2 * Math.PI * k) / N));
  const sm = r.map((_, k) => [-2, -1, 0, 1, 2].reduce((acc, j) => acc + r[(k + j + N) % N], 0) / 5);
  const dips = sm.map((_, k) => k).filter((k) => sm[k] <= sm[(k - 1 + N) % N] && sm[k] <= sm[(k + 1) % N]);
  dips.sort((p, q) => sm[p] - sm[q]);
  const out: number[] = [];
  for (const k of dips) {
    if (out.some((o) => Math.min(Math.abs(k - o), N - Math.abs(k - o)) < 25)) continue;
    out.push(k);
    if (out.length === count) break;
  }
  return out.map((k) => {
    const th = (2 * Math.PI * k) / N;
    const dir: Pt = [Math.cos(th), Math.sin(th)];
    return { p: [cx + dir[0] * r[k], cz + dir[1] * r[k]] as Pt, dir };
  });
}
