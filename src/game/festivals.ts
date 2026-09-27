/**
 * Festival decorations on the real 2026–27 dates: tricolour bunting for
 * Independence and Republic Day, red-and-yellow Kannada flags for
 * Rajyotsava, akash kandil lanterns and diyas for Deepavali, paper stars for
 * Christmas (a big one in Mangaluru), marigold garlands for Ganesh Chaturthi.
 * Lanterns, diyas and stars glow after dark.
 */
import * as THREE from "three";
import { toon } from "../fx/toon";
import { groundHeight } from "../world/terrain";
import type { Spot } from "./places";
import { festivalsOn } from "./seasons";

const SAFFRON = 0xff9933;
const WHITE = 0xf7f7f2;
const GREEN = 0x138808;

function bunting(a: THREE.Vector3, b: THREE.Vector3, colours: number[], sag = 1.2): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a3a3a })));
  const flag = new THREE.BufferGeometry();
  flag.setAttribute("position", new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.45, 0], 3));
  flag.computeVertexNormals();
  const mats = colours.map((c) => toon(c, { side: THREE.DoubleSide, ramp: "soft" }));
  const dir = b.clone().sub(a).setY(0).normalize();
  const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  for (let i = 1; i < n; i++) {
    const m = new THREE.Mesh(flag, mats[i % mats.length]);
    m.position.copy(pts[i]);
    m.rotation.y = yaw;
    g.add(m);
  }
  return g;
}

function lantern(colour: number): THREE.Group {
  // Akash kandil: a paper lantern with a tail of streamers.
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), toon(colour, { glow: colour, emissiveMap: null, ramp: "soft" }));
  body.scale.y = 1.3;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8), toon(0xd4a017));
  cap.position.y = 0.6;
  g.add(body, cap);
  for (let k = 0; k < 5; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.01), toon(k % 2 ? 0xd4a017 : colour));
    s.position.set((k - 2) * 0.08, -0.85, 0);
    g.add(s);
  }
  return g;
}

function star(colour: number): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.28 : 0.7;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  geo.translate(0, 0, -0.09);
  return new THREE.Mesh(geo, toon(colour, { glow: colour, ramp: "soft" }));
}

function flagOnPole(colours: number[]): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.5, 6), toon(0xcfd4d6));
  pole.position.y = 2.25;
  g.add(pole);
  colours.forEach((c, i) => {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9 / colours.length), toon(c, { side: THREE.DoubleSide, ramp: "soft" }));
    band.position.set(0.72, 4.2 - (i + 0.5) * (0.9 / colours.length), 0);
    g.add(band);
  });
  return g;
}

export class Festivals {
  readonly group = new THREE.Group();
  private sets = new Map<string, THREE.Group>();
  private current = "";

  /** `spots` are doorways to decorate; `face` points into the building. */
  constructor(spots: Spot[]) {
    this.group.name = "festivals";
    const mk = (id: string) => {
      const g = new THREE.Group();
      g.visible = false;
      this.sets.set(id, g);
      this.group.add(g);
      return g;
    };
    const tri = [SAFFRON, WHITE, GREEN];
    const indep = mk("independence");
    const repub = mk("republic");
    const rajyo = mk("rajyotsava");
    const deepa = mk("deepavali");
    const xmas = mk("christmas");
    const ganesh = mk("ganesha");

    for (const s of spots) {
      const face = s.face ?? 0;
      // Across the doorway, 3 m out from the wall, sagging between two poles.
      const ox = Math.cos(face) * 6;
      const oz = -Math.sin(face) * 6;
      const y = groundHeight(s.x, s.z);
      const a = new THREE.Vector3(s.x - ox, y + 4.4, s.z - oz);
      const b = new THREE.Vector3(s.x + ox, y + 4.4, s.z + oz);
      indep.add(bunting(a, b, tri));
      repub.add(bunting(a, b, tri));
      rajyo.add(bunting(a, b, [0xffd400, 0xd7261e]));
      ganesh.add(bunting(a, b, [0xff9f1c, 0xffd23f, 0x2f7d4f], 0.8));
      const kf = flagOnPole([0xffd400, 0xd7261e]);
      kf.position.set(s.x + ox * 1.15, y, s.z + oz * 1.15);
      rajyo.add(kf);
      // Lanterns and stars hang in the doorway itself.
      for (const k of [-1, 1]) {
        const l = lantern([0xff7a1a, 0xe23b7a, 0xffc21a][(Math.abs(Math.round(s.x)) + k + 3) % 3]);
        l.position.set(s.x + ox * 0.35 * k, y + 3.4, s.z + oz * 0.35 * k);
        deepa.add(l);
        const st = star(k < 0 ? 0xff4d4d : 0xffe066);
        st.position.set(s.x + ox * 0.35 * k, y + 3.5, s.z + oz * 0.35 * k);
        st.rotation.y = face;
        xmas.add(st);
      }
      // A row of diyas along the approach.
      const diyaMat = toon(0xffb347, { glow: 0xffa500, ramp: "soft" });
      for (let d = -5; d <= 5; d++) {
        const diya = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), diyaMat);
        const bx = s.x - Math.sin(face) * 1.5 + Math.cos(face) * d * 0.6;
        const bz = s.z - Math.cos(face) * 1.5 - Math.sin(face) * d * 0.6;
        diya.position.set(bx, groundHeight(bx, bz) + 0.12, bz);
        deepa.add(diya);
      }
    }
  }

  /** Show whatever is on today; returns the festival names newly started. */
  update(day: number): string[] {
    const on = festivalsOn(day);
    const key = on.map((f) => f.id).join(",");
    if (key === this.current) return [];
    const before = new Set(this.current.split(",").filter(Boolean));
    this.current = key;
    for (const [id, g] of this.sets) g.visible = on.some((f) => f.id === id);
    return on.filter((f) => !before.has(f.id)).map((f) => f.name);
  }
}
