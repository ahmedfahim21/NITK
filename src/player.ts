/**
 * The walker: a student with a backpack, a third-person orbit camera that
 * pulls in rather than clip through buildings, and a drone mode for seeing
 * the campus from above. Movement feel follows SADAK's movement.ts: speed
 * built up and bled off, turns that carve, a jump with hang time.
 */
import * as THREE from "three";
import { toon } from "./fx/toon";
import type { Grid } from "./world/grid";
import { groundHeight } from "./world/terrain";

const WALK = 4.6;
const RUN = 9.5;
const ACCEL = 16;
const BRAKE = 26;
const GRAVITY = 18;
const JUMP = 6;
const RADIUS = 0.35;
const DRONE = 30;
const DRONE_FAST = 90;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Input {
  keys = new Set<string>();
  dragging = false;
  dx = 0;
  dy = 0;
  wheel = 0;
  pressed = new Set<string>();
  joy = { x: 0, y: 0, active: false };
  private lastX = 0;
  private lastY = 0;
  private joyId: number | null = null;
  private lookId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };

  constructor(el: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    el.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => (this.dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === el) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      } else if (this.dragging) {
        this.dx += e.clientX - this.lastX;
        this.dy += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    el.addEventListener("dblclick", () => el.requestPointerLock?.());
    el.addEventListener(
      "wheel",
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false }
    );
    // Touch: left half is a joystick, right half looks around.
    el.addEventListener(
      "touchstart",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < window.innerWidth / 2 && this.joyId === null) {
            this.joyId = t.identifier;
            this.joyOrigin = { x: t.clientX, y: t.clientY };
            this.joy.active = true;
          } else if (this.lookId === null) {
            this.lookId = t.identifier;
            this.lastX = t.clientX;
            this.lastY = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.joyId) {
            const x = (t.clientX - this.joyOrigin.x) / 60;
            const y = (t.clientY - this.joyOrigin.y) / 60;
            const l = Math.hypot(x, y);
            this.joy.x = l > 1 ? x / l : x;
            this.joy.y = l > 1 ? y / l : y;
          } else if (t.identifier === this.lookId) {
            this.dx += (t.clientX - this.lastX) * 1.5;
            this.dy += (t.clientY - this.lastY) * 1.5;
            this.lastX = t.clientX;
            this.lastY = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.joy = { x: 0, y: 0, active: false };
        }
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  hit(code: string) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}

function makeStudent(): { root: THREE.Group; parts: Record<string, THREE.Object3D> } {
  const root = new THREE.Group();
  const skin = toon(0xc68863);
  const shirt = toon(0x2e86de);
  const pants = toon(0x2d3436);
  const shoe = toon(0xf5f6fa);
  const hair = toon(0x1e1a18);
  const bag = toon(0xd35400);

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.12, 0, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.18), pants);
    leg.position.y = -0.43;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), shoe);
    foot.position.set(0, -0.88, 0.05);
    hip.add(leg, foot);
    hips.add(hip);
    legs.push(hip);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
  torso.position.y = 0.33;
  hips.add(torso);
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.3, 0.6, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.13), shirt);
    arm.position.y = -0.24;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), skin);
    hand.position.y = -0.56;
    sh.add(arm, hand);
    hips.add(sh);
    arms.push(sh);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
  head.position.y = 0.84;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 0.87;
  hairCap.rotation.x = -0.25;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.18), bag);
  pack.position.set(0, 0.36, -0.22);
  hips.add(head, hairCap, pack);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, parts: { hips, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1] } };
}

export class Player {
  readonly body: THREE.Group;
  private parts: Record<string, THREE.Object3D>;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0;
  yaw = 0;
  pitch = 0.32;
  dist = 7;
  drone = false;
  private droneDist = 160;
  private droneAlt = 0;
  private phase = 0;
  private grounded = true;
  private camPos = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private grid: Grid,
    private input: Input
  ) {
    const s = makeStudent();
    this.body = s.root;
    this.parts = s.parts;
  }

  place(x: number, z: number, facing: number) {
    this.pos.set(x, groundHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.yaw = facing + Math.PI;
    this.camPos.set(0, 0, 0);
  }

  toggleDrone() {
    this.drone = !this.drone;
    if (!this.drone) {
      const [x, z] = this.grid.nearestFree(this.pos.x, this.pos.z);
      this.place(x, z, this.facing);
    } else {
      this.droneAlt = 0;
      this.pitch = 0.9;
    }
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  update(dt: number) {
    const inp = this.input;
    this.yaw -= inp.dx * 0.0042;
    this.pitch = THREE.MathUtils.clamp(this.pitch + inp.dy * 0.003, this.drone ? 0.25 : -0.25, 1.35);
    if (inp.down("KeyQ", "ArrowLeft")) this.yaw += dt * 1.8;
    if (inp.down("KeyE", "ArrowRight")) this.yaw -= dt * 1.8;
    if (this.drone) this.droneDist = THREE.MathUtils.clamp(this.droneDist * (1 + inp.wheel * 0.12), 40, 700);
    else this.dist = THREE.MathUtils.clamp(this.dist * (1 + inp.wheel * 0.12), 2.5, 30);

    // Desired move direction, relative to the camera.
    let f = 0;
    let r = 0;
    if (inp.down("KeyW", "ArrowUp")) f += 1;
    if (inp.down("KeyS", "ArrowDown")) f -= 1;
    if (inp.down("KeyD")) r += 1;
    if (inp.down("KeyA")) r -= 1;
    if (inp.joy.active) {
      f -= inp.joy.y;
      r += inp.joy.x;
    }
    const l = Math.hypot(f, r);
    if (l > 1) {
      f /= l;
      r /= l;
    }
    // Camera looks from yaw toward the player: forward is -(sin yaw, cos yaw).
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    const dx = fx * f + rx * r;
    const dz = fz * f + rz * r;
    const run = inp.down("ShiftLeft", "ShiftRight");

    if (this.drone) {
      const sp = run ? DRONE_FAST : DRONE;
      this.pos.x += dx * sp * dt;
      this.pos.z += dz * sp * dt;
      if (inp.down("Space")) this.droneAlt += 25 * dt;
      if (inp.down("KeyC", "ControlLeft")) this.droneAlt -= 25 * dt;
      this.droneAlt = THREE.MathUtils.clamp(this.droneAlt, 0, 400);
      const b = this.grid;
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.minX + b.w);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.minZ + b.h);
      this.pos.y = groundHeight(this.pos.x, this.pos.z) + this.droneAlt;
      if (l > 0.01) this.facing = Math.atan2(dx, dz);
      this.body.visible = false;
    } else {
      this.body.visible = true;
      const top = run ? RUN : WALK;
      const tx = dx * top;
      const tz = dz * top;
      const want = l > 0.01;
      const rate = (want ? ACCEL : BRAKE) * (this.grounded ? 1 : 0.3);
      let ex = tx - this.vel.x;
      let ez = tz - this.vel.z;
      const e = Math.hypot(ex, ez);
      if (e > rate * dt) {
        ex *= (rate * dt) / e;
        ez *= (rate * dt) / e;
      }
      this.vel.x += ex;
      this.vel.z += ez;

      // Move with slide: try the full step, then each axis.
      const nx = this.pos.x + this.vel.x * dt;
      const nz = this.pos.z + this.vel.z * dt;
      if (this.free(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else if (this.free(nx, this.pos.z)) {
        this.pos.x = nx;
        this.vel.z *= 0.5;
      } else if (this.free(this.pos.x, nz)) {
        this.pos.z = nz;
        this.vel.x *= 0.5;
      } else {
        this.vel.x = 0;
        this.vel.z = 0;
      }

      // Vertical.
      const gy = groundHeight(this.pos.x, this.pos.z);
      if (this.grounded && inp.hit("Space")) {
        this.vel.y = JUMP;
        this.grounded = false;
      }
      if (!this.grounded) {
        this.vel.y -= GRAVITY * (this.vel.y < 0 ? 1.3 : inp.down("Space") ? 0.65 : 1) * dt;
        this.pos.y += this.vel.y * dt;
        if (this.pos.y <= gy) {
          this.pos.y = gy;
          this.vel.y = 0;
          this.grounded = true;
        }
      } else {
        this.pos.y = gy;
      }

      const sp = this.speed;
      if (sp > 0.2) {
        const head = Math.atan2(this.vel.x, this.vel.z);
        const turn = wrap(head - this.facing);
        const max = (14 - 8 * Math.min(1, sp / RUN)) * dt;
        this.facing = wrap(this.facing + THREE.MathUtils.clamp(turn, -max, max));
      }
      this.animate(dt, sp);
    }

    this.body.position.copy(this.pos);
    this.body.rotation.y = this.facing;
    this.updateCamera(dt);
  }

  private free(x: number, z: number) {
    const g = this.grid;
    if (g.blocked(x, z)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (g.blocked(x + Math.cos(a) * RADIUS, z + Math.sin(a) * RADIUS)) return false;
    }
    return true;
  }

  private animate(dt: number, sp: number) {
    const p = this.parts;
    const amp = Math.min(1, sp / WALK) * (sp > WALK + 1 ? 0.9 : 0.6);
    this.phase += dt * (3 + sp * 1.25);
    const s = Math.sin(this.phase) * amp;
    p.legL.rotation.x = s;
    p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8;
    p.armR.rotation.x = s * 0.8;
    p.hips.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * 0.06 * amp;
    p.hips.rotation.x = sp > WALK + 1 ? 0.12 : 0.03 * amp;
    if (!this.grounded) {
      p.legL.rotation.x = 0.5;
      p.legR.rotation.x = -0.3;
      p.armL.rotation.x = -2.4;
      p.armR.rotation.x = -2.4;
    }
  }

  private updateCamera(dt: number) {
    const headY = this.pos.y + (this.drone ? 0 : 1.55);
    const target = new THREE.Vector3(this.pos.x, headY, this.pos.z);
    const d = this.drone ? this.droneDist : this.dist;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let dist = d;
    if (!this.drone) {
      // Pull in where a building stands between the head and the camera.
      for (let s = 0.6; s < d; s += 0.4) {
        const x = target.x + dir.x * s;
        const z = target.z + dir.z * s;
        const y = target.y + dir.y * s;
        if (this.grid.topAt(x, z) > y - 0.3 || y < groundHeight(x, z) + 0.3) {
          dist = Math.max(1.2, s - 0.5);
          break;
        }
      }
    }
    const want = target.clone().addScaledVector(dir, dist);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want);
    // Snap in fast, ease out slowly, so walls never show through.
    const k = dist < this.camPos.distanceTo(target) ? 1 : 1 - Math.exp(-dt * 6);
    this.camPos.lerp(want, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);
  }
}
