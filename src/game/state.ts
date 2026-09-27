/**
 * Everything that persists: the clock, the player's stats, mission progress
 * and story flags. Saved to localStorage so a session picks up where it left.
 */
import type { TimeOfDay } from "../fx/presets";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type Faction = "Karavali" | "Aravali" | "Sahyadri" | "Seniors" | "IRIS" | "Clubs";

export type SaveData = {
  v: 1;
  day: number;
  minutes: number;
  money: number;
  energy: number;
  food: number;
  classesHeld: number;
  classesAttended: number;
  rep: Partial<Record<Faction, number>>;
  completed: string[];
  flags: Record<string, string | number | boolean>;
  pos?: [number, number];
  raining: boolean;
};

const KEY = "nitk-fresher-save-v1";

export class GameState {
  /** Day 0 is Monday 3 August 2026, the first day of the odd semester. */
  day = 0;
  /** Minutes since midnight. */
  minutes = 7 * 60 + 40;
  money = 500;
  energy = 100;
  food = 70;
  classesHeld = 0;
  classesAttended = 0;
  rep: Partial<Record<Faction, number>> = {};
  completed = new Set<string>();
  flags: Record<string, string | number | boolean> = {};
  raining = false;
  /** Game minutes per real second. */
  timeScale = 1;
  paused = false;

  get hour() {
    return this.minutes / 60;
  }

  get weekday() {
    return this.day % 7;
  }

  get attendance(): number {
    return this.classesHeld ? (100 * this.classesAttended) / this.classesHeld : 100;
  }

  clockText(): string {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = Math.floor(this.minutes % 60);
    const h12 = ((h + 11) % 12) + 1;
    return `${DAYS[this.weekday].slice(0, 3)} ${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }

  dateText(): string {
    const d = new Date(2026, 7, 3 + this.day);
    return `${DAYS[this.weekday]}, ${d.getDate()} ${d.toLocaleString("en-GB", { month: "long" })}`;
  }

  period(): TimeOfDay {
    const h = this.hour;
    if (h >= 5.5 && h < 10) return "morning";
    if (h >= 10 && h < 17.25) return "noon";
    if (h >= 17.25 && h < 19.1) return "sunset";
    return "night";
  }

  /** Advance to a clock time (today if still ahead, else tomorrow). */
  advanceTo(minutes: number) {
    if (minutes <= this.minutes) this.day++;
    this.minutes = minutes;
  }

  addRep(f: Faction, n: number) {
    this.rep[f] = (this.rep[f] ?? 0) + n;
  }

  save(pos?: [number, number]) {
    const data: SaveData = {
      v: 1,
      day: this.day,
      minutes: this.minutes,
      money: this.money,
      energy: this.energy,
      food: this.food,
      classesHeld: this.classesHeld,
      classesAttended: this.classesAttended,
      rep: this.rep,
      completed: [...this.completed],
      flags: this.flags,
      pos,
      raining: this.raining,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* private mode: progress just is not kept */
    }
  }

  static load(): { state: GameState; pos?: [number, number] } | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (d.v !== 1) return null;
      const s = new GameState();
      Object.assign(s, {
        day: d.day,
        minutes: d.minutes,
        money: d.money,
        energy: d.energy,
        food: d.food,
        classesHeld: d.classesHeld,
        classesAttended: d.classesAttended,
        rep: d.rep ?? {},
        flags: d.flags ?? {},
        raining: d.raining ?? false,
      });
      s.completed = new Set(d.completed ?? []);
      return { state: s, pos: d.pos };
    } catch {
      return null;
    }
  }

  static clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  }
}
