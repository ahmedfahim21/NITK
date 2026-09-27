/**
 * Seasons on the Karnataka coast, laid over NITK's academic year.
 *
 *   Monsoon       Jun–Sep   odd semester opens in the rain (Ch. 1–2)
 *   Post-monsoon  Oct–Nov   "October heat", afternoon thunderstorms; Engineer, Deepavali
 *   Winter        Dec–Feb   dry, clear, the pleasant months; endsems, Crescendo
 *   Summer        Mar–May   hot and hazy, gulmohar in flower; Incident, pre-monsoon storms
 *
 * Each season sets the weather odds, day length, colour of the land and
 * light, the sea state, what students wear and what you hear.
 */
import type { Preset } from "../fx/presets";

export type SeasonId = "monsoon" | "postmonsoon" | "winter" | "summer";

export type Season = {
  id: SeasonId;
  name: string;
  blurb: string;
  /** Chance per game hour that rain starts / stops. */
  rainStart: number;
  rainStop: number;
  /** Thunderstorms (lightning, thunder) rather than steady rain. */
  storms: boolean;
  /** Ground and foliage colour multipliers (linear RGB), applied to the cel materials. */
  grass: [number, number, number];
  foliage: [number, number, number];
  /** 0 calm .. 1 rough monsoon sea. */
  sea: number;
  /** Extra cloud cover, 0..1. */
  cloud: number;
  /** Gulmohar and laburnum in flower. */
  blossom: boolean;
  /** Students wear jackets (winter mornings), or light colours (summer). */
  wardrobe: "rain" | "normal" | "jackets" | "summer";
};

export const SEASONS: Record<SeasonId, Season> = {
  monsoon: {
    id: "monsoon",
    name: "Monsoon",
    blurb: "Rain that means it. Everything is green, the sea is wild, and Maggi tastes better.",
    rainStart: 0.2,
    rainStop: 0.35,
    storms: false,
    grass: [0.88, 1.06, 0.84],
    foliage: [0.92, 1.08, 0.92],
    sea: 1,
    cloud: 0.7,
    blossom: false,
    wardrobe: "rain",
  },
  postmonsoon: {
    id: "postmonsoon",
    name: "Post-monsoon",
    blurb: "October heat. Sticky afternoons, sudden thunderstorms, fest season.",
    rainStart: 0.06,
    rainStop: 0.5,
    storms: true,
    grass: [1, 1, 1],
    foliage: [1, 1, 1],
    sea: 0.45,
    cloud: 0.35,
    blossom: false,
    wardrobe: "normal",
  },
  winter: {
    id: "winter",
    name: "Winter",
    blurb: "Dry and clear, cool mornings, perfect sunsets. The best months on campus.",
    rainStart: 0,
    rainStop: 1,
    storms: false,
    grass: [1.06, 1.0, 0.82],
    foliage: [1.02, 0.98, 0.86],
    sea: 0.15,
    cloud: 0.1,
    blossom: false,
    wardrobe: "jackets",
  },
  summer: {
    id: "summer",
    name: "Summer",
    blurb: "Hot, humid, hazy. Gulmohar in flame, mangoes in the mess, storms building out at sea.",
    rainStart: 0.015,
    rainStop: 0.6,
    storms: true,
    grass: [1.28, 1.0, 0.6],
    foliage: [1.12, 0.98, 0.72],
    sea: 0.3,
    cloud: 0.2,
    blossom: true,
    wardrobe: "summer",
  },
};

/** Day 0 of the game is Monday 3 August 2026. */
export function dateOf(day: number): Date {
  return new Date(2026, 7, 3 + day);
}

export function seasonOf(day: number): Season {
  const m = dateOf(day).getMonth();
  if (m >= 5 && m <= 8) return SEASONS.monsoon;
  if (m === 9 || m === 10) return SEASONS.postmonsoon;
  if (m === 11 || m <= 1) return SEASONS.winter;
  return SEASONS.summer;
}

/** Sunrise and sunset at Surathkal (13°N), decimal hours, by month. */
const SUN: [number, number][] = [
  [6.97, 18.35], // Jan
  [6.95, 18.6],
  [6.72, 18.7],
  [6.37, 18.75],
  [6.12, 18.85],
  [6.07, 19.0], // Jun
  [6.15, 19.05],
  [6.25, 18.95], // Aug
  [6.3, 18.62],
  [6.33, 18.25], // Oct
  [6.45, 18.05],
  [6.72, 18.1], // Dec
];

export function sunTimes(day: number): { rise: number; set: number } {
  const d = dateOf(day);
  const m = d.getMonth();
  const f = (d.getDate() - 1) / 30;
  const [r0, s0] = SUN[m];
  const [r1, s1] = SUN[(m + 1) % 12];
  return { rise: r0 + (r1 - r0) * f, set: s0 + (s1 - s0) * f };
}

export type Festival = { id: string; name: string; from: [number, number]; to: [number, number] };

/** Dates for the 2026–27 academic year ([month 1-12, day]). */
export const FESTIVALS: Festival[] = [
  { id: "independence", name: "Independence Day", from: [8, 13], to: [8, 16] },
  { id: "ganesha", name: "Ganesh Chaturthi", from: [9, 13], to: [9, 16] },
  { id: "rajyotsava", name: "Kannada Rajyotsava", from: [10, 30], to: [11, 2] },
  { id: "deepavali", name: "Deepavali", from: [11, 5], to: [11, 11] },
  { id: "christmas", name: "Christmas", from: [12, 18], to: [1, 1] },
  { id: "republic", name: "Republic Day", from: [1, 24], to: [1, 27] },
];

export function festivalsOn(day: number): Festival[] {
  const d = dateOf(day);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return FESTIVALS.filter((f) => {
    const a = f.from[0] * 100 + f.from[1];
    const b = f.to[0] * 100 + f.to[1];
    return a <= b ? md >= a && md <= b : md >= a || md <= b;
  });
}

/** A representative day in each season, for Explore mode's picker. */
export const SEASON_SAMPLE_DAY: Record<SeasonId, number> = {
  monsoon: 12, // 15 August
  postmonsoon: 97, // 8 November, Deepavali
  winter: 144, // 25 December
  summer: 238, // 29 March
};

/** Tints the time-of-day preset for the season. */
export function seasonalPreset(p: Preset, s: Season): Preset {
  const out: Preset = JSON.parse(JSON.stringify(p));
  const night = p.glow > 0.8;
  switch (s.id) {
    case "monsoon":
      out.haze.density *= 1.3;
      out.grade.saturation *= 1.04;
      out.sun.intensity *= 0.9;
      break;
    case "postmonsoon":
      out.grade.saturation *= 1.08;
      out.grade.temperature += 0.04;
      break;
    case "winter":
      out.haze.density *= 0.7;
      out.grade.saturation *= 1.02;
      if (!night) out.sky = p.sky.map((c, i) => (i < 2 ? shade(c, -0.04) : c)) as Preset["sky"];
      out.grade.temperature -= 0.03;
      break;
    case "summer":
      out.haze.density *= 1.45;
      out.haze.color = [0.93, 0.9, 0.84];
      out.sun.intensity *= 1.08;
      out.grade.temperature += 0.1;
      out.grade.saturation *= 0.95;
      if (!night) out.sky = p.sky.map((c, i) => (i >= 2 ? mixHex(c, "#f3e2c2", 0.35) : mixHex(c, "#9fc2e0", 0.2))) as Preset["sky"];
      break;
  }
  return out;
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function mixHex(a: string, b: string, k: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

function shade(a: string, k: number): string {
  const [r, g, b] = hexToRgb(a);
  return rgbToHex([r * (1 + k), g * (1 + k), b * (1 + k)]);
}

/** NITK's academic calendar: odd semester Aug–Dec, even Jan–May, break Jun–Jul. */
export function semesterOf(day: number): string {
  const m = dateOf(day).getMonth();
  if (m >= 7 && m <= 11) return "Odd semester";
  if (m <= 4) return "Even semester";
  return "Summer break";
}
