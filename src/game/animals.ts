/**
 * Campus animals. A few stray dogs keep to their own corners (a hangout, a
 * mess, the gate), trotting short loops, sitting and dozing, and wagging when
 * you stop near them. One peacock is rarely about: every few minutes it may
 * turn up on a lawn well away from you, spends a minute or two pecking about,
 * fans its train if you keep your distance (the monsoon is its season), and
 * is gone if you come close.
 *
 * Both are built from toon boxes and spheres like everything else and stay on
 * the walkable grid. They stand at groundHeight, the same field the crowd uses.
 */
import * as THREE from "three";
import { mulberry32 } from "../geo";
import { toon } from "../fx/toon";
import { audio } from "./audio";
import { groundHeight } from "../world/terrain";
import type { Grid } from "../world/grid";

type Pt = [number, number];

const COATS: { coat: number; patch: number; ear: number }[] = [
  { coat: 0xc9985a, patch: 0xefe0bd, ear: 0x8a5a2b }, // sandy, cream chest
  { coat: 0x3a3532, patch: 0xd9d2c2, ear: 0x211e1c }, // black with a white chest
  { coat: 0x8b5a34, patch: 0xc9a06a, ear: 0x5c3a20 }, // brown
  { coat: 0xd8d0c0, patch: 0xffffff, ear: 0xa3856a }, // pale, dusty
  { coat: 0xb27a43, patch: 0xf1e2c4, ear: 0x5c3a20 },
];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/* ------------------------------------------------------------------ *
 * Dogs
 * ------------------------------------------------------------------ */

type DogState = "rest" | "sit" | "stand" | "trot";

class Dog {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private legs: { pivot: THREE.Group; front: boolean; side: number }[] = [];
  x: number;
  z: number;
  face: number;
  private state: DogState = "stand";
  private left = 1 + Math.random() * 4;
  private target: Pt | null = null;
  private phase = Math.random() * 6;
  private pose = 0; // 0 standing, 1 sitting, 2 lying (eased)
  private poseGoal = 0;
  private wag = 0;
  private barkT = 0;
  private slope = 0;

  constructor(private home: Pt, private roam: number, look: (typeof COATS)[number], x: number, z: number) {
    this.x = x;
    this.z = z;
    this.face = Math.random() * 6.28;
    const coat = toon(look.coat, { ramp: "three" });
    const patch = toon(look.patch, { ramp: "three" });
    const ear = toon(look.ear, { ramp: "three" });
    const dark = toon(0x1b1614, { ramp: "two" });

    this.rig.position.y = 0.44;
    this.root.add(this.rig);
    this.rig.add(box(0.3, 0.27, 0.56, coat));
    this.rig.add(box(0.32, 0.3, 0.24, coat, 0, 0.02, 0.22));
    this.rig.add(box(0.26, 0.12, 0.3, patch, 0, -0.1, 0.12));

    this.head.position.set(0, 0.13, 0.4);
    this.rig.add(this.head);
    this.head.add(box(0.2, 0.19, 0.21, coat));
    this.head.add(box(0.11, 0.09, 0.14, patch, 0, -0.04, 0.16));
    this.head.add(box(0.05, 0.045, 0.04, dark, 0, -0.02, 0.24));
    for (const s of [-1, 1]) {
      const e = box(0.055, 0.13, 0.05, ear, s * 0.095, 0.09, -0.02);
      e.rotation.z = s * 0.35;
      this.head.add(e);
    }

    this.tail.position.set(0, 0.08, -0.29);
    this.tail.rotation.x = -0.7;
    this.tail.add(box(0.05, 0.05, 0.3, coat, 0, 0, -0.14));
    this.rig.add(this.tail);

    for (const front of [true, false]) {
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.11, -0.12, front ? 0.2 : -0.2);
        pivot.add(box(0.075, 0.32, 0.075, front ? patch : coat, 0, -0.16, 0));
        this.rig.add(pivot);
        this.legs.push({ pivot, front, side });
      }
    }
    this.root.position.set(x, groundHeight(x, z), z);
  }

  /** A dog within earshot barks at riders and runners, not more than every so often. */
  bark(): boolean {
    if (this.barkT > 0) return false;
    this.barkT = 6 + Math.random() * 8;
    this.head.rotation.x = -0.35;
    return true;
  }

  private pick(grid: Grid) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * this.roam;
      const tx = this.home[0] + Math.cos(a) * r;
      const tz = this.home[1] + Math.sin(a) * r;
      if (!grid.blocked(tx, tz)) {
        this.target = [tx, tz];
        return;
      }
    }
    this.target = null;
  }

  update(dt: number, grid: Grid, player: THREE.Vector3, quiet: boolean) {
    this.barkT = Math.max(0, this.barkT - dt);
    this.left -= dt;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const pd = Math.hypot(dx, dz);

    if (this.left <= 0) {
      const r = Math.random();
      if (r < 0.34) {
        this.state = "trot";
        this.pick(grid);
        this.left = 6 + Math.random() * 8;
        if (!this.target) this.state = "stand";
      } else if (r < 0.55) {
        this.state = "sit";
        this.left = 5 + Math.random() * 8;
      } else if (r < 0.8 && !quiet) {
        this.state = "rest";
        this.left = 12 + Math.random() * 20;
      } else {
        this.state = "stand";
        this.left = 3 + Math.random() * 5;
      }
    }
    // Wake up and look when someone walks close.
    const near = pd < 7;
    if (near && this.state === "rest") {
      this.state = "sit";
      this.left = 4;
    }

    let speed = 0;
    if (this.state === "trot" && this.target) {
      const tx = this.target[0] - this.x;
      const tz = this.target[1] - this.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.6) {
        this.state = "stand";
        this.left = 2 + Math.random() * 4;
        this.target = null;
      } else {
        speed = 1.9;
        const want = Math.atan2(tx, tz);
        this.face += wrap(want - this.face) * Math.min(1, dt * 6);
        const nx = this.x + Math.sin(this.face) * speed * dt;
        const nz = this.z + Math.cos(this.face) * speed * dt;
        if (grid.blocked(nx, nz)) {
          this.state = "stand";
          this.left = 1;
          this.target = null;
          speed = 0;
        } else {
          this.x = nx;
          this.z = nz;
        }
      }
    } else if (near && pd > 1.6) {
      // Look at the visitor.
      this.face += wrap(Math.atan2(dx, dz) - this.face) * Math.min(1, dt * 2.5);
    }

    this.poseGoal = this.state === "rest" ? 2 : this.state === "sit" ? 1 : 0;
    this.pose += (this.poseGoal - this.pose) * Math.min(1, dt * 4);
    this.phase += dt * (speed > 0 ? 11 : 0);

    // Wag when you're close and standing near, slowly otherwise.
    const wagGoal = near ? 1 : this.state === "stand" || this.state === "sit" ? 0.25 : 0.1;
    this.wag += (wagGoal - this.wag) * Math.min(1, dt * 3);
    this.tail.rotation.y = Math.sin(performance.now() / 1000 * 13) * 0.55 * this.wag;
    this.tail.rotation.x = -0.7 + this.pose * 0.5;

    // Pose: standing, sitting (rear down, chest up) or curled up lying down.
    const sit = THREE.MathUtils.clamp(this.pose, 0, 1);
    const lie = THREE.MathUtils.clamp(this.pose - 1, 0, 1);
    const fold = Math.max(sit * 0.8, lie);
    this.rig.position.y = 0.44 - sit * 0.14 - lie * 0.14 + Math.abs(Math.sin(this.phase)) * 0.025 * (speed > 0 ? 1 : 0);
    this.rig.rotation.x = -sit * 0.6 * (1 - lie) + this.slope;
    for (const l of this.legs) {
      const swing = Math.sin(this.phase + (l.front === (l.side > 0) ? 0 : Math.PI)) * 0.75 * (speed > 0 ? 1 : 0);
      if (l.front) l.pivot.rotation.x = swing + sit * 0.6 * (1 - lie) - lie * 1.25;
      else l.pivot.rotation.x = swing + fold * -1.35 * (1 - lie * 0.2);
    }
    const sniff = this.state === "trot" ? Math.sin(this.phase * 0.5) * 0.12 : 0;
    this.head.rotation.x += ((near ? -0.15 : this.state === "stand" ? 0.25 * Math.sin(performance.now() / 1300) : sniff) + lie * 0.35 - this.head.rotation.x) * Math.min(1, dt * 5);

    // Stand on the ground, tilted with the slope.
    const y = groundHeight(this.x, this.z);
    const ax = Math.sin(this.face);
    const az = Math.cos(this.face);
    const ahead = groundHeight(this.x + ax * 0.3, this.z + az * 0.3);
    const back = groundHeight(this.x - ax * 0.3, this.z - az * 0.3);
    this.slope += ((Math.atan2(back - ahead, 0.6)) * 0.8 - this.slope) * Math.min(1, dt * 8);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.face;
  }
}

/* ------------------------------------------------------------------ *
 * Peacock
 * ------------------------------------------------------------------ */

type PeaState = "away" | "forage" | "display" | "flee";

const FEATHERS = 19;
const FEATHER_LEN = 1.05;

class Peacock {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private neck = new THREE.Group();
  private train = new THREE.Group();
  private feathers: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  x = 0;
  z = 0;
  face = 0;
  state: PeaState = "away";
  private fan = 0;
  private fanGoal = 0;
  private phase = 0;
  private life = 0;
  private wander: Pt | null = null;
  private wanderT = 0;
  private peck = 0;

  constructor() {
    const body = toon(0x1f7a8c);
    const chest = toon(0x1b4fb0);
    const neckMat = toon(0x1a46a0);
    const beak = toon(0xd9b36a);
    const dark = toon(0x14202b, { ramp: "two" });
    const leg = toon(0x7d6a58, { ramp: "two" });
    const green = toon(0x2f8f5a, { side: THREE.DoubleSide, ramp: "soft" });
    const gold = toon(0xd8a520, { side: THREE.DoubleSide, ramp: "soft" });
    const blue = toon(0x1c6bd0, { side: THREE.DoubleSide, ramp: "soft" });

    this.root.add(this.rig);
    this.rig.position.y = 0.55;
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), body);
    torso.scale.set(0.85, 0.85, 1.45);
    torso.castShadow = true;
    this.rig.add(torso);
    const front = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), chest);
    front.position.set(0, 0.03, 0.18);
    front.castShadow = true;
    this.rig.add(front);

    this.neck.position.set(0, 0.1, 0.24);
    this.neck.rotation.x = 0.35;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.36, 8), neckMat);
    stalk.position.y = 0.18;
    stalk.castShadow = true;
    this.neck.add(stalk);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), neckMat);
    head.position.set(0, 0.38, 0.02);
    this.neck.add(head);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 6), beak);
    bill.rotation.x = Math.PI / 2;
    bill.position.set(0, 0.375, 0.1);
    this.neck.add(bill);
    for (const dx of [-0.025, 0, 0.025]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 4), dark);
      c.position.set(dx, 0.47, -0.005);
      c.rotation.z = dx * 6;
      this.neck.add(c);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), blue);
      tip.position.set(dx * 2.6, 0.53, -0.005);
      this.neck.add(tip);
    }
    this.rig.add(this.neck);

    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.07, -0.05, 0.02);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.5, 5), leg);
      l.position.y = -0.25;
      pivot.add(l);
      this.rig.add(pivot);
      this.legs.push(pivot);
    }

    // The train: a fan of long feathers pivoting at the rump, each with an eye at the tip.
    this.train.position.set(0, 0.02, -0.26);
    this.rig.add(this.train);
    for (let i = 0; i < FEATHERS; i++) {
      const pivot = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.1, FEATHER_LEN), green);
      shaft.position.y = FEATHER_LEN / 2;
      const ring = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), gold);
      ring.position.set(0, FEATHER_LEN - 0.1, 0.002);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.037, 10), blue);
      eye.position.set(0, FEATHER_LEN - 0.1, 0.004);
      pivot.add(shaft, ring, eye);
      pivot.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = false) : 0));
      this.train.add(pivot);
      this.feathers.push(pivot);
    }
    this.root.visible = false;
    this.applyFan();
  }

  get active() {
    return this.state !== "away";
  }

  appear(x: number, z: number, face: number) {
    this.x = x;
    this.z = z;
    this.face = face;
    this.state = "forage";
    this.life = 55 + Math.random() * 60;
    this.fan = 0;
    this.fanGoal = 0;
    this.wander = null;
    this.root.visible = true;
  }

  vanish() {
    this.state = "away";
    this.root.visible = false;
  }

  private applyFan() {
    // Folded, the train trails along the ground; open, it stands up behind as a half-circle.
    const spread = THREE.MathUtils.lerp(0.11, 2.75, this.fan);
    this.feathers.forEach((f, i) => {
      const u = i / (FEATHERS - 1) - 0.5;
      f.rotation.z = u * spread;
      // The outer feathers are a touch shorter, so the open fan reads round.
      f.scale.y = 1 - Math.abs(u) * 0.34 * this.fan - (1 - this.fan) * 0.15;
    });
    this.train.rotation.x = THREE.MathUtils.lerp(-1.42, -0.32, this.fan);
    this.neck.rotation.x = 0.35 - this.fan * 0.2 + this.peck * 1.1;
  }

  update(dt: number, grid: Grid, player: THREE.Vector3) {
    if (this.state === "away") return;
    this.life -= dt;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const pd = Math.hypot(dx, dz);

    if (this.state === "flee") {
      // Off across the grass, away from you; gone when far enough.
      const away = Math.atan2(-dx, -dz);
      this.face += wrap(away - this.face) * Math.min(1, dt * 4);
      const nx = this.x + Math.sin(this.face) * 3.2 * dt;
      const nz = this.z + Math.cos(this.face) * 3.2 * dt;
      if (!grid.blocked(nx, nz)) {
        this.x = nx;
        this.z = nz;
      } else this.face += 1.2;
      this.phase += dt * 12;
      this.fanGoal = 0;
      if (pd > 38) this.vanish();
    } else {
      if (pd < 8) {
        this.state = "flee";
      } else if (this.life <= 0) {
        // Time to go; walk off and vanish once well out of sight.
        this.state = "flee";
      } else if (this.state === "display") {
        // Show the train to you: turn your back on the visitor, and hold still.
        this.face += wrap(Math.atan2(-dx, -dz) - this.face) * Math.min(1, dt * 1.6);
        this.fanGoal = 1;
        this.phase += 0;
        if (pd > 34 || Math.random() < dt * 0.02) {
          this.state = "forage";
          this.fanGoal = 0;
        }
      } else {
        this.fanGoal = 0;
        // Forage: wander a few steps, peck, and now and then open up if watched from afar.
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 3 + Math.random() * 4;
          const a = Math.random() * 6.28;
          const r = 2 + Math.random() * 4;
          const tx = this.x + Math.cos(a) * r;
          const tz = this.z + Math.sin(a) * r;
          this.wander = grid.blocked(tx, tz) ? null : [tx, tz];
          if (pd > 11 && pd < 30 && Math.random() < 0.5) this.state = "display";
        }
        if (this.wander) {
          const tx = this.wander[0] - this.x;
          const tz = this.wander[1] - this.z;
          const d = Math.hypot(tx, tz);
          if (d < 0.3) this.wander = null;
          else {
            this.face += wrap(Math.atan2(tx, tz) - this.face) * Math.min(1, dt * 3);
            const nx = this.x + Math.sin(this.face) * 0.8 * dt;
            const nz = this.z + Math.cos(this.face) * 0.8 * dt;
            if (grid.blocked(nx, nz)) this.wander = null;
            else {
              this.x = nx;
              this.z = nz;
              this.phase += dt * 6;
            }
          }
        }
      }
    }

    this.fan += (this.fanGoal - this.fan) * Math.min(1, dt * (this.fanGoal > this.fan ? 1.6 : 3));
    // Peck the ground when standing about, not while fanned or moving.
    const still = this.state === "forage" && !this.wander;
    this.peck += ((still ? 0.5 + 0.5 * Math.sin(performance.now() / 420) : 0) - this.peck) * Math.min(1, dt * 6);
    // The open fan quivers.
    const quiver = this.fan > 0.9 ? Math.sin(performance.now() / 55) * 0.012 : 0;
    this.applyFan();
    this.train.rotation.x += quiver;
    this.legs[0].rotation.x = Math.sin(this.phase) * 0.5;
    this.legs[1].rotation.x = -Math.sin(this.phase) * 0.5;
    this.rig.position.y = 0.55 + Math.abs(Math.sin(this.phase)) * 0.015;

    const y = groundHeight(this.x, this.z);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.face;
  }
}

/* ------------------------------------------------------------------ *
 * The lot
 * ------------------------------------------------------------------ */

export class Animals {
  readonly group = new THREE.Group();
  private dogs: Dog[] = [];
  private peacock = new Peacock();
  private cooldown: number;
  private sighted = false;
  private rand = mulberry32(90210);
  /** Called the first time you see the peacock. */
  onPeacock: (() => void) | null = null;

  constructor(private grid: Grid, dogHomes: Pt[], private lawns: Pt[]) {
    this.group.name = "animals";
    dogHomes.forEach((h, i) => {
      const [x, z] = grid.nearestFree(h[0] + 3, h[1] + 2, 20);
      const dog = new Dog(h, 9 + (i % 3) * 3, COATS[i % COATS.length], x, z);
      this.dogs.push(dog);
      this.group.add(dog.root);
    });
    this.group.add(this.peacock.root);
    // Not in the first minute or two.
    this.cooldown = 100 + this.rand() * 90;
  }

  private bark() {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const st = t + k * 0.17;
      const o = a.ctx.createOscillator();
      const f = a.ctx.createBiquadFilter();
      const g = a.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(330, st);
      o.frequency.exponentialRampToValueAtTime(170, st + 0.11);
      f.type = "lowpass";
      f.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.12, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.13);
      o.connect(f).connect(g).connect(a.sfx);
      o.start(st);
      o.stop(st + 0.15);
    }
  }

  private call() {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(1350, t + 0.32);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(a.sfx);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** `ambient` is false during cutscenes, when nothing new should wander in. */
  update(dt: number, camera: THREE.Vector3, player: THREE.Vector3, o: { night: boolean; raining: boolean; loud: boolean; ambient: boolean }) {
    for (const d of this.dogs) {
      const far = Math.hypot(d.x - camera.x, d.z - camera.z) > 140;
      d.root.visible = !far;
      if (far) continue;
      d.update(dt, this.grid, player, o.night);
      // Barks at riders and runners, from a distance.
      if (o.loud && Math.hypot(d.x - player.x, d.z - player.z) < 12 && d.bark()) this.bark();
    }

    const p = this.peacock;
    if (p.active) {
      p.update(dt, this.grid, player);
      if (!p.active) this.cooldown = 240 + this.rand() * 300;
      return;
    }
    if (!o.ambient || o.night) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    // Rarely: a lawn 20 to 70 m from you, one you're not looking straight into.
    const spots = this.lawns.filter(([x, z]) => {
      const d = Math.hypot(x - player.x, z - player.z);
      return d > 20 && d < 70;
    });
    if (!spots.length) {
      this.cooldown = 12;
      return;
    }
    const [sx, sz] = spots[Math.floor(this.rand() * spots.length)];
    const [x, z] = this.grid.nearestFree(sx + (this.rand() - 0.5) * 8, sz + (this.rand() - 0.5) * 8, 15);
    // The monsoon is the peacock's season; it is a little likelier to show then.
    if (!o.raining && this.rand() < 0.35) {
      this.cooldown = 60 + this.rand() * 90;
      return;
    }
    p.appear(x, z, this.rand() * 6.28);
    this.call();
    if (!this.sighted) {
      this.sighted = true;
      this.onPeacock?.();
    }
  }
}
