/**
 * The walker: you (hero.ts, a rigged first-year animated procedurally), a
 * third-person orbit camera that pulls in rather than clip through
 * buildings, and a drone mode for seeing the campus from above. Movement
 * feel and the chase camera follow SADAK: speed built up and bled off, turns
 * that carve, a jump with hang time and a landing squash; a camera that sits
 * off the shoulder, leads the aim into the direction of travel, rolls a
 * touch into turns and widens with speed.
 */
import * as THREE from "three";
import type { Grid } from "./world/grid";
import { bridgeHeight, groundHeight, surfaceAt } from "./world/terrain";
import { HeroAnimator, makeHero } from "./hero";

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

export class Player {
  readonly body: THREE.Group;
  private anim: HeroAnimator;
  /** Motion history for the animator and the camera. */
  private lastSpeed = 0;
  private lastFacing = 0;
  private turnRate = 0;
  private land = 0;
  private air = 0;
  private clockT = 0;
  private lookAim = new THREE.Vector3();
  private fov = 60;
  /** Somewhere worth glancing at (a person you're walking up to), or null. */
  lookAt: { x: number; z: number } | null = null;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0;
  yaw = 0;
  pitch = 0.32;
  dist = 7;
  drone = false;
  /** Controls held by dialogue, cutscenes and overlays. */
  frozen = false;
  /** Extra obstacles (the crowd). */
  blockedExtra: ((x: number, z: number) => boolean) | null = null;
  /** Somewhere you can't go at your current level (NH66 once it's closed); leaving it is always allowed. */
  closedAt: ((x: number, z: number, y: number) => boolean) | null = null;
  /** Set when a move was refused by closedAt, for the game to explain once. */
  bumpedClosed = false;
  /** 0..1, slows the walker when exhausted. */
  tired = 0;
  /** The cycle being ridden, if any. */
  riding: THREE.Group | null = null;
  private bikeSpeed = 0;
  private droneDist = 160;
  private droneAlt = 0;
  private phase = 0;
  private grounded = true;
  private camPos = new THREE.Vector3();
  /** Cycle top-speed multiplier (the Engineering Mechanics perk, game/courses.ts). */
  bikeBoost = 1;
  /** Lowest camera pitch on foot. Raised indoors so the camera looks down into the room. */
  minPitch = -0.25;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private grid: Grid,
    private input: Input
  ) {
    const hero = makeHero();
    this.body = hero.root;
    this.anim = new HeroAnimator(hero.rig);
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

  /** Set the drone camera distance and pitch (for framing a building). */
  droneView(dist: number, pitch: number) {
    this.droneDist = dist;
    this.pitch = pitch;
  }

  get speed() {
    return this.riding ? Math.abs(this.bikeSpeed) : Math.hypot(this.vel.x, this.vel.z);
  }

  mount(cycle: THREE.Group) {
    this.riding = cycle;
    cycle.position.set(0, 0, 0);
    cycle.rotation.set(0, 0, 0);
    this.body.add(cycle);
    this.bikeSpeed = 0;
    this.vel.set(0, 0, 0);
  }

  /** Steps off; returns the cycle so the caller can park it in the world. */
  dismount(): THREE.Group | null {
    const c = this.riding;
    if (!c) return null;
    this.body.remove(c);
    this.riding = null;
    // Step to the left of the cycle.
    const lx = this.pos.x + Math.cos(this.facing) * 0.9;
    const lz = this.pos.z - Math.sin(this.facing) * 0.9;
    const [fx, fz] = this.grid.nearestFree(lx, lz);
    c.position.set(this.pos.x, 0, this.pos.z);
    c.rotation.set(0, this.facing, 0.12);
    this.pos.set(fx, groundHeight(fx, fz), fz);
    this.vel.set(0, 0, 0);
    return c;
  }

  update(dt: number) {
    const inp = this.input;
    this.yaw -= inp.dx * 0.0042;
    const lo = this.drone ? 0.25 : this.minPitch;
    this.pitch = THREE.MathUtils.clamp(this.pitch + inp.dy * 0.003, Math.min(lo, this.pitch), 1.35);
    // Ease up to a raised floor rather than snapping.
    if (this.pitch < lo) this.pitch = Math.min(lo, this.pitch + dt * 1.5);
    if (inp.down("ArrowLeft")) this.yaw += dt * 1.8;
    if (inp.down("ArrowRight")) this.yaw -= dt * 1.8;
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
    if (this.frozen) {
      f = 0;
      r = 0;
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
    const run = inp.down("ShiftLeft", "ShiftRight") && this.tired < 0.8 && !this.frozen;

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
    } else if (this.riding) {
      this.body.visible = true;
      this.ride(dt, dx, dz, l, run);
    } else {
      this.body.visible = true;
      const top = (run ? RUN : WALK) * (1 - this.tired * 0.35);
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
      // The ground, or the culvert floor if you're down in an underpass.
      const gy = surfaceAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.grounded && inp.hit("Space") && !this.frozen) {
        this.vel.y = JUMP;
        this.grounded = false;
      }
      if (!this.grounded) {
        this.vel.y -= GRAVITY * (this.vel.y < 0 ? 1.3 : inp.down("Space") ? 0.65 : 1) * dt;
        this.pos.y += this.vel.y * dt;
        if (this.pos.y <= gy) {
          // The harder the fall, the deeper the knees go.
          this.land = Math.min(1, Math.abs(this.vel.y) / 9);
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
      this.motion(dt, sp);
      this.body.rotation.z *= Math.exp(-dt * 8);
    }

    this.body.position.copy(this.pos);
    this.body.rotation.y = this.facing;
    this.updateCamera(dt);
  }

  private ride(dt: number, dx: number, dz: number, l: number, run: boolean) {
    const top = (run ? 11.5 : 8) * this.bikeBoost;
    // Steer toward the input direction at a rate that tightens with speed.
    if (l > 0.05) {
      const want = Math.atan2(dx, dz);
      const back = Math.abs(wrap(want - this.facing)) > 2.4;
      if (back) {
        this.bikeSpeed = Math.max(this.bikeSpeed - 9 * dt, -1.5);
      } else {
        const rate = 2.6 / (1 + Math.abs(this.bikeSpeed) * 0.12);
        const turn = THREE.MathUtils.clamp(wrap(want - this.facing), -rate * dt, rate * dt);
        this.facing = wrap(this.facing + turn);
        this.bikeSpeed = Math.min(top, this.bikeSpeed + (this.bikeSpeed < top ? 4.5 : -3) * dt * l);
      }
    } else {
      // Coasting.
      this.bikeSpeed *= Math.exp(-dt * 0.7);
      if (Math.abs(this.bikeSpeed) < 0.05) this.bikeSpeed = 0;
    }
    const vx = Math.sin(this.facing) * this.bikeSpeed;
    const vz = Math.cos(this.facing) * this.bikeSpeed;
    const nx = this.pos.x + vx * dt;
    const nz = this.pos.z + vz * dt;
    if (this.free(nx, nz, 0.55)) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else if (this.free(nx, this.pos.z, 0.55)) {
      this.pos.x = nx;
      this.bikeSpeed *= 0.6;
    } else if (this.free(this.pos.x, nz, 0.55)) {
      this.pos.z = nz;
      this.bikeSpeed *= 0.6;
    } else {
      this.bikeSpeed = 0;
    }
    this.vel.set(vx, 0, vz);
    this.pos.y = surfaceAt(this.pos.x, this.pos.z, this.pos.y);
    // Pedal and wheel animation.
    const c = this.riding!;
    const spin = (this.bikeSpeed * dt) / 0.34;
    for (const w of (c.userData.wheels as THREE.Object3D[]) ?? []) w.rotation.x += spin;
    // One crank turn per ~2 wheel turns; coasting leaves the pedals still.
    this.phase += spin * 0.5;
    this.motion(dt, Math.abs(this.bikeSpeed), this.phase);
    // Lean the whole bike into turns, harder the faster you go.
    const lean = THREE.MathUtils.clamp(-this.turnRate * Math.abs(this.bikeSpeed) * 0.035, -0.35, 0.35);
    this.body.rotation.z += (lean - this.body.rotation.z) * Math.min(1, dt * 6);
  }

  private free(x: number, z: number, radius = RADIUS) {
    const g = this.grid;
    // Up on an overbridge, what's on the ground below doesn't block you; the
    // edges do (stepping off is a drop, refused below).
    const here = this.drone ? null : bridgeHeight(this.pos.x, this.pos.z);
    const aloft = here !== null && Math.abs(here - this.pos.y) < 0.6 && this.pos.y > groundHeight(this.pos.x, this.pos.z) + 0.6;
    if (aloft) {
      const b = bridgeHeight(x, z);
      return b !== null && Math.abs(b - this.pos.y) <= 1;
    }
    if (g.blocked(x, z)) return false;
    if (!this.drone) {
      // No stepping up or dropping more than a metre at once: off an overbridge,
      // out of a culvert's side onto the road above, over a trench wall.
      const next = surfaceAt(x, z, this.pos.y);
      if (this.grounded && Math.abs(next - this.pos.y) > 1) return false;
      if (this.closedAt?.(x, z, next) && !this.closedAt(this.pos.x, this.pos.z, this.pos.y)) {
        this.bumpedClosed = true;
        return false;
      }
    }
    // People only block if you're not already tangled up with them (never trap the player).
    if (this.blockedExtra?.(x, z) && !this.blockedExtra(this.pos.x, this.pos.z)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (g.blocked(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return false;
    }
    return true;
  }

  /** Feed the animator: speed, acceleration, turn rate, air, landing squash, what to glance at. */
  private motion(dt: number, sp: number, pedal?: number) {
    const d = Math.max(dt, 1e-4);
    const accel = (sp - this.lastSpeed) / d;
    this.lastSpeed = sp;
    const turn = wrap(this.facing - this.lastFacing) / d;
    this.lastFacing = this.facing;
    this.turnRate += (turn - this.turnRate) * Math.min(1, dt * 10);
    this.air += ((this.grounded ? 0 : 1) - this.air) * Math.min(1, dt * (this.grounded ? 9 : 18));
    this.land = Math.max(0, this.land - dt * 3.5);
    this.clockT += dt;
    let look = 0;
    if (this.lookAt) {
      const bearing = wrap(Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z) - this.facing);
      if (Math.abs(bearing) < 1.6) look = THREE.MathUtils.clamp(bearing, -1.1, 1.1);
    }
    this.anim.update({
      dt,
      t: this.clockT,
      speed: sp,
      accel: THREE.MathUtils.clamp(accel, -30, 30),
      turn: this.turnRate,
      air: this.air,
      vy: this.vel.y,
      crouch: this.land,
      look,
      pedal,
    });
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
        // Building tops in the grid are heights above their pad.
        // Down in an underpass, the floor there (not the deck overhead) is the ground.
        const g = surfaceAt(x, z, y);
        const top = this.grid.topAt(x, z);
        if ((top > 0 && g + top > y - 0.3) || y < g + 0.3) {
          dist = Math.max(1.2, s - 0.5);
          break;
        }
      }
    }
    const want = target.clone().addScaledVector(dir, dist);
    // Off the right shoulder, so what you walk toward isn't hidden behind your head.
    if (!this.drone && dist > 2.5) {
      const shoulder = 0.55 * Math.min(1, dist / 7);
      want.x += -Math.cos(this.yaw) * shoulder;
      want.z += Math.sin(this.yaw) * shoulder;
    }
    const first = this.camPos.lengthSq() === 0;
    if (first) this.camPos.copy(want);
    // Snap in fast, ease out slowly, so walls never show through.
    const k = dist < this.camPos.distanceTo(target) ? 1 : 1 - Math.exp(-dt * 7);
    this.camPos.lerp(want, k);
    this.camera.position.copy(this.camPos);
    // Aim leads into the direction of travel and is damped too: a lagging
    // body with an instant aim reads as swimmy but jerky.
    const lead = this.drone ? 0 : 0.35;
    const aim = target.clone().addScaledVector(this.vel, lead);
    if (first) this.lookAim.copy(aim);
    this.lookAim.lerp(aim, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(this.lookAim);
    // Roll a touch into turns, and widen the view with speed: most of the sense of pace.
    const speed01 = THREE.MathUtils.clamp(this.speed / RUN, 0, 1.2);
    if (!this.drone) this.camera.rotateZ(THREE.MathUtils.clamp(-this.turnRate * 0.012 * speed01, -0.04, 0.04));
    const fov = this.drone ? 60 : 60 + speed01 * 8;
    if (Math.abs(fov - this.fov) > 0.01) {
      this.fov += (fov - this.fov) * Math.min(1, dt * 4);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
