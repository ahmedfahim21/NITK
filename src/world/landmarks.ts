/**
 * Hero details that make the campus read as NITK rather than any campus:
 * the lighthouse on its knoll, the Main Building's entrance and nameboard,
 * the gate arch on NH66, the auditorium, the fountain and the flag.
 *
 * Everything keys off OSM names/tags, so it lands wherever the real map puts
 * those features; nothing is placed at hard-coded positions.
 */
import * as THREE from "three";
import { centroid, distToSeg, orientedBox, type Pt } from "../geo";
import type { Building, CampusMap, Road } from "../osm/types";
import { toon } from "../fx/toon";
import type { Grid } from "./grid";
import { SOLID } from "./grid";
import { FLOOR_H, curtainWall, signTexture } from "./textures";
import { addMound, groundHeight } from "./terrain";

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

/** A building's front: the face toward the nearest proper road. Signs and doors go here. */
export function frontOf(map: CampusMap, b: Building): Face {
  const c = centroid(b.outer);
  const road = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.rank >= 3);
  return faceToward(b, road ? road.p : [c[0], c[1] + 50]);
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
    const base = groundHeight(lx, lz);
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
    // From the photographs: an olive-green entrance block rising a floor
    // above the pale-yellow wings, a full-height glass front between four
    // yellow piers, a gilt grille under the parapet, a brick panel down one
    // side, and three yellow arches over the porch.
    const olive = toon(0xa3aa58);
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
    const board = signBoard(["NATIONAL INSTITUTE OF TECHNOLOGY KARNATAKA"], bw, bw / 22, { bg: "#a3aa58", fg: "#ffffff" });
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

  /* ---------------- signs on named landmarks ---------------- */
  const signed: [RegExp, string[], string][] = [
    [/central library/i, ["CENTRAL LIBRARY"], "#1d3557"],
    [/silver jubilee|auditorium/i, ["SILVER JUBILEE AUDITORIUM"], "#7a2e1d"],
    [/lecture hall/i, ["LECTURE HALL COMPLEX"], "#1d3557"],
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

  /* ---------------- façade pieces, from photographs ---------------- */
  // Mega Hostel towers: a blue-glass stair core stands proud of each front.
  for (const b of map.buildings) {
    if (!b.name || !/^Mega Hostel/i.test(b.name)) continue;
    const f = frontOf(map, b);
    const w = Math.min(8, f.width * 0.3);
    const h = b.height + 1.2;
    const floors = Math.max(1, Math.round(h / FLOOR_H));
    const core = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), toon(0xffffff, { map: curtainWall(5, floors * 2), glow: 0x9fd0ff, emissiveMap: curtainWall(5, floors * 2) }));
    core.position.set(f.x + f.nx * 0.7, h / 2, f.z + f.nz * 0.7);
    core.rotation.y = Math.atan2(f.nx, f.nz);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.35, 3), toon(0xc8976f));
    canopy.position.set(f.x + f.nx * 2, 3.2, f.z + f.nz * 2);
    canopy.rotation.y = core.rotation.y;
    shadows(core);
    group.add(core, canopy);
    attach(b.id, core);
    attach(b.id, canopy);
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
        spots.push({ name: "NITK Main Gate", x: r.p[0], z: r.p[1] });
      }
    }
  }

  /* ---------------- point features ---------------- */
  for (const p of map.pois) {
    if (p.kind === "fountain") {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.7, 28), toon(0xd8d0c0));
      basin.position.y = 0.35;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.1, 28), toon(0x4fb3d9, { glow: 0x2255aa }));
      water.position.y = 0.62;
      // The fountains in front of the Main Building are painted NITK blue.
      const blue = toon(0x3a86c8);
      basin.material = blue;
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 12), blue);
      t1.position.y = 1.4;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.6, 0.5, 16), blue);
      bowl.position.y = 2.6;
      const jetMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.7 });
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3, 8, 1, true), jetMat);
      jet.position.y = 4.3;
      g.add(basin, water, t1, bowl, jet);
      updaters.push((t) => {
        jet.scale.y = 0.85 + Math.sin(t * 6) * 0.15;
      });
      shadows(g);
      group.add(g);
      grid.stampDisc(p.x, p.z, 5.2, SOLID, 1);
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

  // Open-air theatres (the Students' Activity Centre): laterite tiers round a stage.
  for (const a of map.areas) {
    if (a.tags?.amenity !== "theatre") continue;
    const box = orientedBox(a.outer);
    const R = Math.min(box.len, box.wid) / 2;
    if (R < 6) continue;
    const g = new THREE.Group();
    // The stage sits at one end of the long axis; seats wrap round it.
    const c = Math.cos(box.angle);
    const sn = Math.sin(box.angle);
    const sx = box.cx - c * (box.len / 2 - R);
    const sz = box.cz - sn * (box.len / 2 - R);
    g.position.set(sx, 0, sz);
    g.rotation.y = -box.angle;
    const tiers = Math.max(4, Math.min(9, Math.floor(R / 1.6)));
    const r0 = R * 0.38;
    const d = (R - r0) / tiers;
    const stone = toon(0xa65a3f);
    const lip = toon(0xe9dfca);
    for (let i = 0; i < tiers; i++) {
      const inner = r0 + i * d;
      const outer = inner + d;
      const h = 0.42 * (i + 1);
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outer, -Math.PI / 2, Math.PI / 2, false);
      shape.absarc(0, 0, inner, Math.PI / 2, -Math.PI / 2, true);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 24 });
      geo.rotateX(-Math.PI / 2);
      const tier = new THREE.Mesh(geo, i % 2 ? stone : toon(0xb46a4c));
      g.add(tier);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(inner + 0.05, 0.05, 3, 24, Math.PI), lip);
      edge.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      edge.position.y = h;
      g.add(edge);
    }
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.85, r0 * 0.85, 0.7, 28, 1, false, Math.PI, Math.PI), toon(0xd8cbb0));
    stage.position.y = 0.35;
    g.add(stage);
    shadows(g);
    group.add(g);
    // Seats are solid; the stage and the open side are walkable.
    g.updateMatrixWorld(true);
    for (let i = 0; i < tiers; i++) {
      const rr = r0 + (i + 0.5) * d;
      for (let k = 0; k <= 16; k++) {
        const t = -Math.PI / 2 + (k / 16) * Math.PI;
        const w = new THREE.Vector3(Math.cos(t) * rr, 0, -Math.sin(t) * rr).applyMatrix4(g.matrixWorld);
        grid.stampDisc(w.x, w.z, d * 0.6, SOLID, 0.42 * (i + 1));
      }
    }
    spots.push({ name: a.name ?? "Open-air theatre", x: sx, z: sz });
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
