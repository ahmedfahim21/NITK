/**
 * Rain around the camera, the objective beam, and the bee swarm on the
 * lighthouse hill.
 */
import * as THREE from "three";
import { groundHeight } from "../world/terrain";

export class Rain {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private speed: Float32Array;
  private n = 4000;
  private box = 50;
  on = false;
  private amount = 0;

  constructor() {
    this.pos = new Float32Array(this.n * 6);
    this.speed = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.reset(i, true, new THREE.Vector3());
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xc8d6e8, transparent: true, opacity: 0, depthWrite: false })
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  private reset(i: number, anyHeight: boolean, c: THREE.Vector3) {
    const x = c.x + (Math.random() - 0.5) * this.box * 2;
    const z = c.z + (Math.random() - 0.5) * this.box * 2;
    const y = c.y + (anyHeight ? Math.random() * 40 - 10 : 30);
    this.speed[i] = 22 + Math.random() * 8;
    const k = i * 6;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    // The monsoon comes in off the sea: a westerly slant.
    this.pos[k + 3] = x + 0.25;
    this.pos[k + 4] = y - 0.9;
    this.pos[k + 5] = z;
  }

  update(dt: number, cam: THREE.Vector3) {
    this.amount += ((this.on ? 1 : 0) - this.amount) * Math.min(1, dt * 1.6);
    const mat = this.mesh.material as THREE.LineBasicMaterial;
    mat.opacity = 0.55 * this.amount;
    this.mesh.visible = this.amount > 0.06;
    if (!this.mesh.visible) return;
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const k = i * 6;
      const dy = this.speed[i] * dt;
      p[k + 1] -= dy;
      p[k + 4] -= dy;
      p[k] += dt * 5;
      p[k + 3] += dt * 5;
      if (p[k + 4] < cam.y - 12 || Math.abs(p[k] - cam.x) > this.box || Math.abs(p[k + 2] - cam.z) > this.box) this.reset(i, false, cam);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

/** A tall glowing column over the current objective. */
export class Beacon {
  readonly group = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffd23f,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 70, 20, 1, true), this.mat);
    beam.position.y = 35;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.ring.position.y = 0.25;
    this.group.add(beam, this.ring);
    this.group.visible = false;
  }

  set(x: number | null, z = 0) {
    if (x === null) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(x, groundHeight(x, z), z);
  }

  update(t: number) {
    this.mat.opacity = 0.22 + Math.sin(t * 3) * 0.08;
    const s = 1 + Math.sin(t * 4) * 0.12;
    this.ring.scale.set(s, 1, s);
  }
}

/** Bees: a buzzing cloud of dots that follows its target. */
export class Swarm {
  readonly points: THREE.Points;
  private n = 70;
  private offs: Float32Array;

  constructor() {
    this.offs = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n * 3; i++) this.offs[i] = Math.random() * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.n * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x2b1d0e, size: 0.09 }));
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(t: number, at: THREE.Vector3 | null, spread = 1.4) {
    this.points.visible = !!at;
    if (!at) return;
    const p = this.points.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const o = this.offs;
      p[i * 3] = at.x + Math.sin(t * (5 + (i % 7)) + o[i * 3]) * spread;
      p[i * 3 + 1] = at.y + 1.4 + Math.sin(t * (7 + (i % 5)) + o[i * 3 + 1]) * spread * 0.6;
      p[i * 3 + 2] = at.z + Math.cos(t * (6 + (i % 3)) + o[i * 3 + 2]) * spread;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
