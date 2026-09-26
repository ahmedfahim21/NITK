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
import { signTexture } from "./textures";
import { addMound, groundHeight } from "./terrain";

export type LandmarkRig = {
  group: THREE.Group;
  update(t: number, glow: number): void;
  /** Named spots for the map and the teleport list. */
  spots: { name: string; x: number; z: number }[];
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

  /* ---------------- lighthouse ---------------- */
  if (map.lighthouse) {
    const [lx, lz] = map.lighthouse;
    addMound({ x: lx, z: lz, r: 48, h: 10 });
    const base = groundHeight(lx, lz);
    const lh = new THREE.Group();
    lh.position.set(lx, base, lz);
    const white = toon(0xf7f5ee);
    const red = toon(0xc0392b);
    const H = 30;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3.4, H, 16), white);
    tower.position.y = H / 2;
    lh.add(tower);
    for (const y of [H * 0.33, H * 0.66]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - (y / H) * 1.1 + 0.03, 3.4 - (y / H) * 1.1 + 0.05, 2.2, 16), red);
      band.position.y = y;
      lh.add(band);
    }
    // Slit windows spiralling up the stair.
    for (let k = 0; k < 6; k++) {
      const y = 5 + k * 4;
      const r = 3.4 - (y / H) * 1.1;
      const a = k * 1.3;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.2), toon(0x2c3e50, { glow: 0xffcf80 }));
      win.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      win.lookAt(Math.cos(a) * r * 2, y, Math.sin(a) * r * 2);
      lh.add(win);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 20), toon(0x2d3436));
    gallery.position.y = H + 0.25;
    lh.add(gallery);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), toon(0x2d3436));
      post.position.set(Math.cos(a) * 3.3, H + 1, Math.sin(a) * 3.3);
      lh.add(post);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.06, 4, 24), toon(0x2d3436));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = H + 1.5;
    lh.add(rail);
    const lanternMat = toon(0xbfe6ff, { glow: 0xfff2b0, transparent: true, opacity: 0.85 });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3, 12), lanternMat);
    lantern.position.y = H + 2;
    lh.add(lantern);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
    dome.position.y = H + 3.5;
    lh.add(dome);
    const vane = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 6), toon(0x2d3436));
    vane.position.y = H + 5.8;
    lh.add(vane);
    // Keeper's quarters at the foot.
    const hut = new THREE.Mesh(new THREE.BoxGeometry(10, 3.6, 7), white);
    hut.position.set(7, 1.8, 3);
    lh.add(hut);
    const hutRoof = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.4, 7.6), red);
    hutRoof.position.set(7, 3.8, 3);
    lh.add(hutRoof);
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
    beam.position.y = H + 2;
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
    grid.stampDisc(lx, lz, 3.6, SOLID, base + H + 6);
    grid.fillPolygon(
      [
        [
          [lx + 2, lz - 0.5],
          [lx + 12, lz - 0.5],
          [lx + 12, lz + 6.5],
          [lx + 2, lz + 6.5],
        ],
      ],
      SOLID,
      base + 4
    );
    spots.push({ name: "Surathkal Lighthouse", x: lx - 8, z: lz - 8 });
  }

  /* ---------------- Main Building ---------------- */
  const main = findByName(map, /^main building$|main building|administrative (block|building)/i);
  if (main) {
    const c = centroid(main.outer);
    const gate = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.kind === "trunk") ?? { p: [c[0] - 100, c[1]] as Pt };
    const f = faceToward(main, gate.p);
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z);
    g.rotation.y = Math.atan2(f.nx, f.nz);
    const H = main.height;
    const cream = toon(0xf4ead3);
    const terracotta = toon(0xb85c3e);
    // Raised central block with the emblem, standing proud of the facade.
    const tw = Math.min(18, f.width * 0.3);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, H + 6, 6), cream);
    tower.position.set(0, (H + 6) / 2, -1.5);
    g.add(tower);
    const towerCap = new THREE.Mesh(new THREE.BoxGeometry(tw + 1, 0.6, 7), terracotta);
    towerCap.position.set(0, H + 6.3, -1.5);
    g.add(towerCap);
    // Portico: slab on columns in front of the entrance.
    const pw = tw + 4;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.7, 7), cream);
    slab.position.set(0, 7.2, 4);
    g.add(slab);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.35, 7.1), terracotta);
    fascia.position.set(0, 7.7, 4);
    g.add(fascia);
    for (let k = 0; k < 6; k++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 7, 10), toon(0xfbf7ee));
      col.position.set(-pw / 2 + 1 + (k * (pw - 2)) / 5, 3.5, 7);
      g.add(col);
    }
    const steps = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.5, 5), toon(0xcfc6b4));
    steps.position.set(0, 0.25, 4.5);
    g.add(steps);
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(6, 4.5, 0.2), toon(0x5a3a22));
    doorway.position.set(0, 2.25, 1.6);
    g.add(doorway);
    // Nameboard, trilingual as on central institutions in Karnataka.
    const board = signBoard(
      ["ರಾಷ್ಟ್ರೀಯ ತಂತ್ರಜ್ಞಾನ ಸಂಸ್ಥೆ ಕರ್ನಾಟಕ", "राष्ट्रीय प्रौद्योगिकी संस्थान कर्नाटक", "NATIONAL INSTITUTE OF TECHNOLOGY KARNATAKA"],
      tw - 1,
      3.2,
      { bg: "#f4ead3", fg: "#7a2e1d" }
    );
    board.position.set(0, H + 2.6, 1.56);
    g.add(board);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), toon(0x1d3f7a, { glow: 0x88aaff }));
    emblem.position.set(0, H + 4.9, 1.57);
    g.add(emblem);
    const emblemRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.55, 24), toon(0xd4a017));
    emblemRing.position.set(0, H + 4.9, 1.575);
    g.add(emblemRing);
    shadows(g);
    group.add(g);
    grid.fillPolygon([rectPts(f.x, f.z, f.nx, f.nz, pw, 8, 4)], SOLID, 8);
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
    const c = centroid(b.outer);
    const road = nearestRoadPoint(c[0], c[1], map.roads, (r) => r.rank >= 3);
    const f = faceToward(b, road ? road.p : [c[0], c[1] + 50]);
    const w = Math.min(f.width * 0.7, 18);
    const board = signBoard(lines, w, w / 9, { bg, fg: "#ffffff" });
    board.position.set(f.x + f.nx * 0.12, Math.min(b.height - 1.2, 9), f.z + f.nz * 0.12);
    board.rotation.y = Math.atan2(f.nx, f.nz);
    group.add(board);
    spots.push({ name: b.name!, x: f.x + f.nx * 15, z: f.z + f.nz * 15 });
    if (/auditorium/i.test(b.name!)) {
      // Fly tower over the stage end.
      const tower = new THREE.Mesh(new THREE.BoxGeometry(f.box.wid * 0.5, 6, f.box.wid * 0.45), toon(0xe9dfca));
      tower.position.set(f.box.cx - f.nx * f.box.len * 0.25, b.height + 3, f.box.cz - f.nz * f.box.len * 0.25);
      tower.rotation.y = -f.box.angle;
      shadows(tower);
      group.add(tower);
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
        const span = r.road.width + 6;
        const g = new THREE.Group();
        g.position.set(r.p[0], 0, r.p[1]);
        g.rotation.y = -ang + Math.PI / 2;
        const pillarMat = toon(0xb85c3e);
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.6), pillarMat);
          p.position.set((s * span) / 2, 4, 0);
          g.add(p);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), toon(0xf4ead3));
          cap.position.set((s * span) / 2, 8.25, 0);
          g.add(cap);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(span + 1.6, 2.2, 1.2), toon(0xf4ead3));
        lintel.position.y = 7;
        g.add(lintel);
        for (const side of [1, -1]) {
          const sign = signBoard(["NATIONAL INSTITUTE OF TECHNOLOGY KARNATAKA", "SURATHKAL"], span, 1.9, { bg: "#1d3557", fg: "#ffffff" });
          sign.position.set(0, 7, side * 0.62);
          if (side < 0) sign.rotation.y = Math.PI;
          g.add(sign);
        }
        shadows(g);
        group.add(g);
        g.updateMatrixWorld(true);
        for (const s of [-1, 1]) {
          const w = new THREE.Vector3((s * span) / 2, 0, 0).applyMatrix4(g.matrixWorld);
          grid.stampDisc(w.x, w.z, 1.2, SOLID, 8.5);
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
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 12), toon(0xd8d0c0));
      t1.position.y = 1.4;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.6, 0.5, 16), toon(0xd8d0c0));
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
    update(t, glow) {
      for (const u of updaters) u(t, glow);
    },
  };
}

function rectPts(x: number, z: number, nx: number, nz: number, w: number, d: number, off: number): Pt[] {
  // Rectangle of width w along the face, depth d outward, centred `off` out.
  const tx = -nz;
  const tz = nx;
  const cx = x + nx * off;
  const cz = z + nz * off;
  return [
    [cx - tx * (w / 2) - nx * (d / 2), cz - tz * (w / 2) - nz * (d / 2)],
    [cx + tx * (w / 2) - nx * (d / 2), cz + tz * (w / 2) - nz * (d / 2)],
    [cx + tx * (w / 2) + nx * (d / 2), cz + tz * (w / 2) + nz * (d / 2)],
    [cx - tx * (w / 2) + nx * (d / 2), cz - tz * (w / 2) + nz * (d / 2)],
  ];
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
