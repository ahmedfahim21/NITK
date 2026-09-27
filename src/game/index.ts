/**
 * The game layer on top of the world: clock and stats, the student crowd,
 * cycles, weather, the cast, interactions, and the mission runner.
 *
 * Missions are async scripts (see chapter1.ts) written against the small API
 * on this class: goTo(), say(), choose(), give/take money, etc.
 */
import * as THREE from "three";
import type { CampusMap } from "../osm/types";
import type { World } from "../world";
import type { Input, Player } from "../player";
import type { Hud } from "../ui/hud";
import type { TimeOfDay } from "../fx/presets";
import { GameState, type Faction } from "./state";
import { GameUI } from "./ui";
import { Places, type PlaceKey, type Spot } from "./places";
import { Crowd, CHATTER, BUMP_LINES } from "./crowd";
import { Riders, buildRacks, makeCycle } from "./cycles";
import { Beacon, Rain, Swarm } from "./fx";
import { Cast, type CastId } from "./cast";
import { sfx, setRainSound, unlockAudio } from "./audio";
import { CHAPTER1, type Mission } from "./chapter1";
import { CHAPTER2 } from "./chapter2";
import { buildStalls, CLUBS, type StallRig } from "./stalls";
import { openJournal } from "./journal";
import { QUIZ } from "./quiz";
import { wait } from "./util";

type Target = Spot | PlaceKey | CastId;

export const MISSIONS: Mission[] = [...CHAPTER1, ...CHAPTER2];

export const CHAPTERS: { name: string; next: string }[] = [
  { name: "Chapter 1 · Srinivasnagar", next: "Chapter 2: Recruitments" },
  { name: "Chapter 2 · Recruitments", next: "Chapter 3: Engineer — coming soon" },
];

type Nav = {
  /** One or more targets; arriving at any resolves with its index. */
  get: () => { x: number; z: number }[];
  radius: number;
  objective: string;
  /** Real seconds left, or undefined. */
  timer?: number;
  /** Game-clock deadline (minutes). */
  clockBy?: number;
  resolve: (hit: number) => void;
};

type Interactable = {
  label: () => string;
  at: () => { x: number; z: number } | null;
  r: number;
  enabled: () => boolean;
  act: () => void | Promise<void>;
  /** Metres of preference over other interactions in range. */
  priority?: number;
};

export type GameHooks = {
  applyTime: (period: TimeOfDay, raining: boolean) => void;
};

export class Game {
  readonly state: GameState;
  readonly ui: GameUI;
  readonly places: Places;
  readonly crowd: Crowd;
  readonly riders: Riders;
  readonly cast = new Cast();
  readonly rain = new Rain();
  readonly beacon = new Beacon();
  readonly swarm = new Swarm();
  readonly group = new THREE.Group();
  /** The player's own cycle once they have one (parked in the world when not ridden). */
  cycle: THREE.Group | null = null;
  active: Mission | null = null;
  private nav: Nav | null = null;
  private interactables: Interactable[] = [];
  private period: TimeOfDay | null = null;
  private lastRain: boolean | null = null;
  private saveTimer = 0;
  private chatTimer = 3;
  private bumpCooldown = 0;
  private bubbles: { el: HTMLDivElement; i: number; x: number; z: number; ttl: number }[] = [];
  private beeTimer = 0;
  cutscene = false;
  private t = 0;

  constructor(
    readonly map: CampusMap,
    readonly world: World,
    readonly player: Player,
    readonly input: Input,
    readonly hud: Hud,
    readonly camera: THREE.PerspectiveCamera,
    private hooks: GameHooks,
    state?: GameState,
    ui?: GameUI
  ) {
    this.state = state ?? new GameState();
    this.ui = ui ?? new GameUI();
    this.places = new Places(map, world);

    const hangouts = (["nescafe", "nandini", "lhc", "megaMess", "library"] as PlaceKey[]).map((k) => {
      const s = this.places.get(k);
      return [s.x, s.z] as [number, number];
    });
    this.crowd = new Crowd(map, world.grid, hangouts, 160);
    this.riders = new Riders(map, 6);
    const racks = (["karavali", "aravali", "lhc", "library"] as PlaceKey[]).map((k) => {
      const s = this.places.get(k);
      const [x, z] = world.grid.nearestFree(s.x + 5, s.z + 3);
      return { x, z, face: s.face ?? 0 };
    });
    this.group.add(this.crowd.group, this.riders.group, this.cast.group, this.rain.mesh, this.beacon.group, this.swarm.points, buildRacks(racks));
    player.blockedExtra = (x, z) => this.crowd.blocked(x, z) || this.cast.blocked(x, z);
    this.registerInteractables();
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
  }

  /* ================= mission API ================= */

  spot(t: Target): Spot {
    if (typeof t === "object") return t;
    if (this.cast.chars.has(t as CastId)) {
      const c = this.cast.get(t as CastId);
      return { x: c.x, z: c.z, name: c.name };
    }
    return this.places.get(t as PlaceKey);
  }

  /** Walk (or ride) to a target. Resolves false if a timer or deadline runs out. */
  async goTo(target: Target, objective: string, opts: { radius?: number; timeLimit?: number; clockBy?: number } = {}): Promise<boolean> {
    return (await this.goToAny([target], objective, opts)) >= 0;
  }

  /** Go to whichever of several targets; resolves with its index, or -1 on timeout. */
  goToAny(targets: Target[], objective: string, opts: { radius?: number; timeLimit?: number; clockBy?: number } = {}): Promise<number> {
    return new Promise((resolve) => {
      const get = () => targets.map((t) => this.spot(t));
      this.nav = { get, radius: opts.radius ?? 4, objective, timer: opts.timeLimit, clockBy: opts.clockBy, resolve };
    });
  }

  say(lines: [string, string][]) {
    return this.ui.say(lines);
  }

  choose(who: string, q: string, options: string[]) {
    return this.ui.choose(who, q, options);
  }

  /** Put a cast member at a place, standing a little off the exact spot. */
  put(id: CastId, at: Target, dx = 0, dz = 0) {
    const s = this.spot(at);
    const [x, z] = this.world.grid.nearestFree(s.x + dx, s.z + dz, 30);
    const c = this.cast.get(id);
    c.place(x, z, s.face !== undefined ? s.face + Math.PI : c.face);
    return c;
  }

  hide(...ids: CastId[]) {
    for (const id of ids) this.cast.get(id).hide();
  }

  money(n: number, why = "") {
    this.state.money += n;
    this.ui.toast(`${n >= 0 ? "+" : "−"}₹${Math.abs(n)}${why ? ` · ${why}` : ""}`, n >= 0 ? "#1e6f5c" : "#c0392b");
    if (n > 0) sfx.coin();
  }

  rep(f: Faction, n: number) {
    this.state.addRep(f, n);
    this.ui.toast(`${f} respect ${n >= 0 ? "+" : ""}${n}`, "#1d3557");
  }

  eat(food: number, energy = 0) {
    this.state.food = Math.min(100, this.state.food + food);
    this.state.energy = Math.min(100, this.state.energy + energy);
  }

  setRain(on: boolean) {
    this.state.raining = on;
  }

  setClock(minutes: number) {
    this.state.minutes = minutes;
  }

  giveCycle() {
    this.state.flags.cycle = true;
    if (!this.cycle) this.cycle = makeCycle(0x15171a);
    const p = this.player.pos;
    const [x, z] = this.world.grid.nearestFree(p.x + 1.5, p.z + 1.5);
    this.parkCycle(x, z, this.player.facing);
  }

  private stalls: StallRig | null = null;

  /** Recruitment-week stalls, built once when Chapter 2 is running. */
  ensureStalls() {
    if (this.stalls) return;
    const sac = this.places.get("sac");
    this.stalls = buildStalls(sac.x, sac.z, sac.face ?? 0, this.world.grid);
    this.group.add(this.stalls.group);
    // A senior behind every table (Meera and Sid staff their own).
    const skins = [0x8d5524, 0xa0623a, 0xc68642, 0xe0ac69, 0x9c6a44];
    CLUBS.forEach((club, i) => {
      if (club.id === "stargazing" || club.id === "lug") return;
      const sp = this.stalls!.spots.get(`${club.id}:senior`)!;
      const e = this.cast.extra(`${club.name} senior`, {
        skin: skins[i % skins.length],
        shirt: parseInt(club.colour.slice(1), 16),
        pants: 0x2d3436,
        shoe: 0xe8e8e8,
        hair: 0x1a1512,
        bag: null,
        longHair: i % 3 === 1,
      });
      e.place(sp.x, sp.z, sp.face);
    });
  }

  stallSpot(id: string): Spot {
    this.ensureStalls();
    const s = this.stalls!.spots.get(id)!;
    return { x: s.x, z: s.z, name: id, face: s.face };
  }

  parkCycleAt(x: number, z: number, face: number) {
    this.parkCycle(x, z, face);
  }

  private parkCycle(x: number, z: number, face: number) {
    if (!this.cycle) return;
    this.group.add(this.cycle);
    this.cycle.position.set(x, 0, z);
    this.cycle.rotation.set(0, face, 0.12);
    this.state.flags.cycleX = x;
    this.state.flags.cycleZ = z;
  }

  /** Point the camera from behind the player toward a spot. */
  frame(face: number, pitch = 0.12, dist = 7) {
    this.player.facing = face;
    this.player.yaw = face + Math.PI;
    this.player.pitch = pitch;
    this.player.dist = dist;
  }

  /* ================= missions ================= */

  private available(): Mission[] {
    if (this.active) return [];
    return MISSIONS.filter((m) => !this.state.completed.has(m.id) && m.requires.every((r) => this.state.completed.has(r)));
  }

  /** Put givers of available missions in place with their "!" markers. */
  refreshGivers() {
    for (const c of this.cast.chars.values()) c.marker.visible = false;
    if (this.active) return;
    for (const m of this.available()) {
      if (!m.giver) continue;
      const c = this.put(m.giver, m.where!, 1.5, 1.5);
      c.marker.visible = true;
    }
  }

  async startMission(m: Mission) {
    if (this.active) return;
    this.active = m;
    this.refreshGivers();
    sfx.missionStart();
    this.ui.showBanner(m.title, m.chapter, "start", 2600);
    let ok = false;
    try {
      ok = await m.run(this);
    } catch (err) {
      console.error(err);
      ok = false;
    }
    this.nav = null;
    this.ui.setObjective(null);
    this.player.frozen = false;
    this.cutscene = false;
    this.active = null;
    if (ok) {
      this.state.completed.add(m.id);
      if (m.reward?.money) this.state.money += m.reward.money;
      if (m.reward?.rep) for (const [f, n] of Object.entries(m.reward.rep)) this.state.addRep(f as Faction, n!);
      const bits = [
        m.reward?.money ? `+₹${m.reward.money}` : "",
        ...Object.entries(m.reward?.rep ?? {}).map(([f, n]) => `${f} +${n}`),
      ].filter(Boolean);
      sfx.missionPassed();
      this.ui.showBanner("MISSION PASSED", bits.join("  ·  "), "pass", 3600);
      await wait(3800);
      await m.after?.(this);
      const chapter = MISSIONS.filter((q) => q.chapter === m.chapter);
      if (chapter.every((q) => this.state.completed.has(q.id))) {
        const meta = CHAPTERS.find((c) => c.name === m.chapter);
        sfx.chapter();
        this.ui.showBanner(`${m.chapter.split(" · ")[0].toUpperCase()} COMPLETE`, meta ? `Coming next · ${meta.next}` : "", "chapter", 6000);
        await wait(6200);
      }
    } else {
      sfx.missionFailed();
      this.ui.showBanner("MISSION FAILED", m.failHint ?? "Talk to them again to retry.", "fail", 3200);
      await wait(1200);
    }
    this.save();
    this.refreshGivers();
    // Chain straight into the next auto mission, if any.
    const next = this.available().find((q) => !q.giver);
    if (next) void this.startMission(next);
  }

  /** New game or continue. `?skipto=<missionId>` starts a new game just before that mission (for development). */
  async begin(fresh: boolean, savedPos?: [number, number]) {
    const skipto = new URLSearchParams(location.search).get("skipto");
    if (skipto && MISSIONS.some((m) => m.id === skipto)) {
      for (const m of MISSIONS) {
        if (m.id === skipto) break;
        this.state.completed.add(m.id);
      }
      const done = this.state.completed;
      if (done.has("ch1-mess")) this.state.flags.mess = "karavali";
      if (done.has("ch1-iris")) this.state.flags.iris = true;
      const k = this.places.get("karavali");
      this.player.place(k.x, k.z, 0);
      if (done.has("ch1-cycle")) this.giveCycle();
      if (done.has("ch1-sunset")) this.ensureStalls();
      this.refreshGivers();
      const auto = this.available().find((m) => !m.giver);
      if (auto) void this.startMission(auto);
      return;
    }
    if (!fresh && savedPos) {
      const [x, z] = this.world.grid.nearestFree(savedPos[0], savedPos[1]);
      this.player.place(x, z, 0);
      if (this.state.flags.cycle) {
        this.cycle = makeCycle(0x15171a);
        const cx = Number(this.state.flags.cycleX ?? x + 1);
        const cz = Number(this.state.flags.cycleZ ?? z + 1);
        this.parkCycle(cx, cz, 0);
      }
    } else {
      const bus = this.places.get("busStop");
      const gate = this.places.get("mainGate");
      this.player.place(bus.x, bus.z, Math.atan2(gate.x - bus.x, gate.z - bus.z));
    }
    if (this.state.completed.has("ch1-sunset")) this.ensureStalls();
    this.refreshGivers();
    const auto = this.available().find((m) => !m.giver);
    if (auto) void this.startMission(auto);
  }

  save() {
    this.state.save([this.player.pos.x, this.player.pos.z]);
  }

  /* ================= interactions ================= */

  private registerInteractables() {
    const P = this.places;
    const st = this.state;
    const food = (key: PlaceKey, item: string, price: number, f: number, e: number, open: () => boolean, closed: string) =>
      this.interactables.push({
        label: () => (open() ? `${item} · ₹${price}` : closed),
        at: () => P.get(key),
        r: 3.5,
        enabled: () => st.completed.has("ch1-arrival"),
        act: async () => {
          if (!open()) {
            this.ui.toast(closed);
            return;
          }
          if (st.money < price) {
            this.ui.toast("Not enough money.", "#c0392b");
            return;
          }
          this.money(-price, item);
          this.eat(f, e);
        },
      });
    const h = () => st.hour;
    food("nescafe", "Maggi at Nescafe", 40, 30, 5, () => h() >= 10 && h() < 22, "Nescafe is shut (10 AM – 10 PM)");
    food("nandini", "Oreo shake at Nandini", 60, 18, 15, () => h() >= 9 && h() < 23, "Nandini is shut");

    // Mess meals: free with your mess card, at meal times.
    this.interactables.push({
      label: () => (this.mealOpen() ? "Eat at the mess" : "Mess is between meals"),
      at: () => (st.flags.mess ? P.get(st.flags.mess as PlaceKey) : null),
      r: 4,
      enabled: () => !!st.flags.mess,
      act: async () => {
        if (!this.mealOpen()) {
          this.ui.toast("Breakfast 7:30–9:30 · Lunch 12:30–2 · Dinner 7:30–9:30");
          return;
        }
        if (st.flags.lastMeal === `${st.day}-${this.mealOpen()}`) {
          this.ui.toast("You've already eaten this meal.");
          return;
        }
        st.flags.lastMeal = `${st.day}-${this.mealOpen()}`;
        await this.ui.fadeOut(300);
        st.minutes += 25;
        this.eat(60, 5);
        await this.ui.fadeIn(300);
        this.ui.toast("Rice, sambar, a mystery sabzi. Full.");
      },
    });

    // Night canteens, named on the real map.
    const nc = this.world.places.find((p) => /night canteen/i.test(p.name));
    if (nc) {
      this.interactables.push({
        label: () => (h() >= 19 || h() < 2 ? "Night canteen: egg maggi · ₹70" : "Night canteen opens at 7 PM"),
        at: () => ({ x: nc.x, z: nc.z }),
        r: 5,
        enabled: () => st.completed.has("ch1-arrival"),
        act: () => {
          if (!(h() >= 19 || h() < 2)) return;
          if (st.money < 70) return this.ui.toast("Not enough money.", "#c0392b");
          this.money(-70, "Night canteen");
          this.eat(40, 5);
        },
      });
    }

    // Sleep at Karavali.
    this.interactables.push({
      label: () => "Sleep till morning",
      at: () => P.get("karavali"),
      r: 4,
      enabled: () => st.completed.has("ch1-arrival") && !this.active && (h() >= 21 || h() < 5 || st.energy < 30),
      act: async () => {
        await this.ui.fadeOut(700);
        st.advanceTo(7 * 60);
        st.energy = 100;
        st.food = Math.max(10, st.food - 25);
        this.save();
        await this.ui.fadeIn(700);
        this.ui.showBanner(st.dateText(), "Rise and shine, fresher.", "chapter", 2400);
      },
    });

    // Kill time in your room.
    this.interactables.push({
      label: () => "Rest in your room (1 hour)",
      at: () => P.get("karavali"),
      r: 4,
      enabled: () => st.completed.has("ch1-arrival") && !this.active && h() >= 5 && h() < 21 && st.energy >= 30,
      act: async () => {
        await this.ui.fadeOut(400);
        st.minutes += 60;
        st.energy = Math.min(100, st.energy + 15);
        await this.ui.fadeIn(400);
        this.ui.toast(`Rested. It's ${st.clockText()}.`);
      },
    });

    // Classes at LHC, once IRIS is set up.
    this.interactables.push({
      label: () => `Attend class (${this.currentClass()?.name ?? ""})`,
      at: () => P.get("lhc"),
      r: 5,
      enabled: () => !!st.flags.iris && !!this.currentClass() && !this.active && st.flags.attended !== this.currentClass()!.key,
      act: async () => {
        const c = this.currentClass()!;
        st.flags.attended = c.key;
        await this.ui.fadeOut(500);
        st.minutes = c.start + 55;
        await this.ui.fadeIn(400);
        const qs = pickQuiz(2);
        const right = await this.ui.quiz(`${c.name} — surprise quiz`, qs);
        st.classesAttended++;
        st.flags.prep = Number(st.flags.prep ?? 0) + right;
        this.ui.toast(`Attended ${c.name} · quiz ${right}/2`, "#1d3557");
      },
    });

    // The founder's statue, from the real map.
    const statue = this.world.places.find((p) => /mallya/i.test(p.name));
    if (statue) {
      this.interactables.push({
        label: () => "Read the plaque",
        at: () => ({ x: statue.x, z: statue.z }),
        r: 4,
        enabled: () => true,
        act: () =>
          this.say([
            ["Plaque", "U. Srinivas Mallya. The campus is Srinivasnagar because of him."],
            ["Plaque", "Foundation stone laid 6 August 1960 as Karnataka Regional Engineering College. NITK since 2002."],
          ]),
      });
    }

    // Your cycle.
    this.interactables.push({
      label: () => (this.player.riding ? "Get off the cycle" : "Ride your cycle"),
      at: () => {
        if (this.player.riding) return { x: this.player.pos.x, z: this.player.pos.z };
        return this.cycle && this.cycle.parent === this.group ? { x: this.cycle.position.x, z: this.cycle.position.z } : null;
      },
      r: 2.2,
      priority: 5,
      enabled: () => !!this.cycle && !this.player.drone,
      act: () => {
        if (this.player.riding) {
          const c = this.player.dismount();
          if (c) this.parkCycle(c.position.x, c.position.z, c.rotation.y);
        } else if (this.state.flags.flatTyres) {
          this.ui.toast("Both tyres are flat. Somebody's going to pay for this.", "#c0392b");
        } else if (this.cycle) {
          this.group.remove(this.cycle);
          this.player.facing = this.cycle.rotation.y;
          this.player.pos.set(this.cycle.position.x, 0, this.cycle.position.z);
          this.player.mount(this.cycle);
        }
      },
    });
  }

  private mealOpen(): string | null {
    const m = this.state.minutes;
    if (m >= 450 && m < 570) return "breakfast";
    if (m >= 750 && m < 840) return "lunch";
    if (m >= 1170 && m < 1290) return "dinner";
    return null;
  }

  private currentClass(): { key: string; start: number; name: string } | null {
    const st = this.state;
    if (st.weekday >= 5) return null;
    const slots = [
      { start: 9 * 60, name: "Engineering Mechanics" },
      { start: 14 * 60, name: "Programming in C" },
    ];
    for (const s of slots) {
      if (st.minutes >= s.start - 15 && st.minutes <= s.start + 10) return { key: `${st.day}-${s.start}`, ...s };
    }
    return null;
  }

  private nextClassText(): string | undefined {
    const st = this.state;
    if (!st.flags.iris) return undefined;
    const c = this.currentClass();
    if (c && st.flags.attended !== c.key) return `▶ ${c.name} at LHC — now!`;
    if (st.weekday >= 5) return "Weekend. No classes.";
    const next = [9 * 60, 14 * 60].find((s) => s > st.minutes);
    if (next === undefined) return "No more classes today.";
    const hh = Math.floor(next / 60);
    return `Next class ${((hh + 11) % 12) + 1}:00 ${hh < 12 ? "AM" : "PM"} at LHC`;
  }

  /** Close attendance on a class window once it passes. */
  private tickClasses() {
    const st = this.state;
    if (!st.flags.iris || st.weekday >= 5) return;
    for (const start of [9 * 60, 14 * 60]) {
      const key = `${st.day}-${start}`;
      if (st.minutes > start + 10 && st.flags[`held-${key}`] === undefined && st.minutes < start + 180) {
        st.flags[`held-${key}`] = true;
        st.classesHeld++;
        if (st.flags.attended !== key) {
          this.ui.toast("Missed a class. Attendance drops.", "#c0392b");
          if (st.attendance < 75) this.ui.toast("Attendance under 75%!", "#c0392b");
        }
      }
    }
  }

  /* ================= per frame ================= */

  update(dt: number) {
    this.t += dt;
    const st = this.state;
    const inp = this.input;
    const ui = this.ui;
    const p = this.player;

    // Clock.
    const holding = ui.busy || this.cutscene;
    if (!holding) st.minutes += dt * st.timeScale;
    if (st.minutes >= 1440) {
      st.minutes -= 1440;
      st.day++;
    }
    const period = st.period();
    if (period !== this.period || st.raining !== this.lastRain) {
      this.period = period;
      this.lastRain = st.raining;
      this.hooks.applyTime(period, st.raining);
      this.rain.on = st.raining;
      this.crowd.raining = st.raining;
      setRainSound(st.raining);
    }
    this.crowd.night = period === "night";

    // Body.
    if (!holding) {
      const running = p.speed > 5 && !p.riding;
      st.energy -= dt * (0.07 * st.timeScale + (running ? 0.35 : 0)) * (st.food < 10 ? 2 : 1);
      st.food -= dt * 0.09 * st.timeScale;
      st.energy = Math.max(0, Math.min(100, st.energy));
      st.food = Math.max(0, Math.min(100, st.food));
    }
    p.tired = Math.max(0, Math.min(1, (25 - st.energy) / 25));
    p.frozen = holding;
    this.tickClasses();

    // Navigation objective.
    const nav = this.nav;
    if (nav) {
      const tgts = nav.get();
      let best = 0;
      let bd = Infinity;
      tgts.forEach((t, i) => {
        const d = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const tgt = tgts[best];
      this.beacon.set(tgt.x, tgt.z);
      if (nav.timer !== undefined && !holding) nav.timer -= dt;
      let timerShown = nav.timer;
      if (nav.clockBy !== undefined) timerShown = Math.max(0, nav.clockBy - st.minutes) / Math.max(0.01, st.timeScale);
      ui.setObjective(this.active?.title ?? "", `${nav.objective} <span style="opacity:.6">(${Math.round(bd)} m)</span>`, timerShown);
      this.hud.markers = tgts.map((t) => ({ x: t.x, z: t.z, color: "#ffd23f" }));
      const done = (hit: number) => {
        this.nav = null;
        this.beacon.set(null);
        ui.setObjective(null);
        this.hud.markers = [];
        nav.resolve(hit);
      };
      if (bd < nav.radius && !p.drone) done(best);
      else if ((nav.timer !== undefined && nav.timer <= 0) || (nav.clockBy !== undefined && st.minutes >= nav.clockBy)) done(-1);
    } else {
      this.beacon.set(null);
      if (!this.active) {
        ui.setObjective(null);
        this.hud.markers = [...this.cast.chars.values()].filter((c) => c.marker.visible).map((c) => ({ x: c.x, z: c.z, color: "#ffd23f" }));
      } else this.hud.markers = [];
    }

    // Interactions: mission givers first, then everything else.
    let prompt: string | null = null;
    let action: (() => void | Promise<void>) | null = null;
    if (!holding && !p.drone) {
      if (!this.active) {
        for (const m of this.available()) {
          if (!m.giver) continue;
          const c = this.cast.get(m.giver);
          if (!c.root.visible) continue;
          if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 2.6) {
            prompt = `Talk to ${c.name} — "${m.title}"`;
            action = async () => {
              const gate = m.window ? m.window(this) : null;
              if (gate) await this.say([[c.name, gate]]);
              else await this.startMission(m);
            };
            break;
          }
        }
      }
      if (!action) {
        let best = Infinity;
        for (const it of this.interactables) {
          if (!it.enabled()) continue;
          const at = it.at();
          if (!at) continue;
          const d = Math.hypot(at.x - p.pos.x, at.z - p.pos.z);
          if (d < it.r && d - (it.priority ?? 0) < best) {
            best = d - (it.priority ?? 0);
            prompt = it.label();
            action = it.act;
          }
        }
      }
    }
    ui.setPrompt(prompt);
    if (action && inp.hit("KeyE") && performance.now() - ui.lastClosed > 350) void action();
    if (inp.hit("KeyJ") && !holding) void openJournal(this);
    if (p.riding && inp.hit("KeyB")) {
      sfx.bell();
      for (const n of this.crowd.near(p.pos.x, p.pos.z, 7)) this.crowd.startle(n.i, p.pos.x, p.pos.z);
    }

    // Bumping into students.
    this.bumpCooldown -= dt;
    if (p.speed > 3.2 && this.bumpCooldown <= 0) {
      const hit = this.crowd.near(p.pos.x, p.pos.z, p.riding ? 1.2 : 0.85)[0];
      if (hit) {
        this.crowd.startle(hit.i, p.pos.x, p.pos.z);
        this.bubble(hit.i, BUMP_LINES[Math.floor(Math.random() * BUMP_LINES.length)], hit.x, hit.z);
        this.bumpCooldown = 1.5;
      }
    }

    // Chatter.
    this.chatTimer -= dt;
    if (this.chatTimer <= 0) {
      this.chatTimer = 2.5 + Math.random() * 4;
      const near = this.crowd.near(p.pos.x, p.pos.z, 16).filter((n) => n.d > 2 && !this.bubbles.some((b) => b.i === n.i));
      if (near.length && this.bubbles.length < 3) {
        const n = near[Math.floor(Math.random() * near.length)];
        this.bubble(n.i, CHATTER[Math.floor(Math.random() * CHATTER.length)], n.x, n.z);
      }
    }
    this.updateBubbles(dt);

    // Bees on the lighthouse hill.
    const lh = this.map.lighthouse;
    let bees: THREE.Vector3 | null = null;
    if (lh && Math.hypot(lh[0] - p.pos.x, lh[1] - p.pos.z) < 9 && !p.drone) {
      bees = p.pos;
      this.beeTimer -= dt;
      st.energy = Math.max(0, st.energy - dt * 6);
      if (this.beeTimer <= 0) {
        this.beeTimer = 1.2;
        sfx.bees();
        ui.toast("BEES! Get away from the tower!", "#c0392b");
      }
    }
    this.swarm.update(this.t, bees ?? (lh ? new THREE.Vector3(lh[0], 12, lh[1]) : null), bees ? 1.2 : 3);

    // World.
    this.crowd.update(dt, this.camera.position, p.pos);
    this.riders.update(dt, p.pos, period === "night");
    this.cast.update(dt, p.pos, this.t);
    this.rain.update(dt, this.camera.position);
    this.beacon.update(this.t);

    ui.setStats({
      clock: st.clockText(),
      date: st.dateText(),
      money: st.money,
      energy: st.energy,
      food: st.food,
      attendance: st.attendance,
      next: this.nextClassText(),
    });

    this.saveTimer += dt;
    if (this.saveTimer > 20 && !this.active) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private bubble(i: number, text: string, x: number, z: number) {
    const el = document.createElement("div");
    el.className = "bubble";
    el.textContent = text;
    this.ui.bubbles.appendChild(el);
    this.bubbles.push({ el, i, x, z, ttl: 3.4 });
  }

  private updateBubbles(dt: number) {
    const v = new THREE.Vector3();
    for (const b of [...this.bubbles]) {
      b.ttl -= dt;
      const near = this.crowd.near(b.x, b.z, 2).find((n) => n.i === b.i);
      if (near) {
        b.x = near.x;
        b.z = near.z;
      }
      v.set(b.x, 2.25, b.z).project(this.camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      if (b.ttl <= 0 || off) {
        b.el.remove();
        this.bubbles.splice(this.bubbles.indexOf(b), 1);
        continue;
      }
      b.el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(Math.min(1, b.ttl * 2));
    }
  }
}


function pickQuiz(n: number) {
  const pool = [...QUIZ];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
