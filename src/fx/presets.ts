/**
 * Time of day. Each preset sets the lights, sky, and the cel grade.
 * The grade structure follows SADAK's fx/presets.ts house style: dark warm
 * ink, cool violet shadows, haze as a depth cue rather than weather.
 */
export type RGB = [number, number, number];

export type TimeOfDay = "morning" | "noon" | "sunset" | "night";

export type Preset = {
  name: string;
  /** Sky gradient, zenith -> horizon. */
  sky: [string, string, string, string, string];
  sun: { color: number; intensity: number; elevation: number; azimuth: number };
  hemi: { sky: number; ground: number; intensity: number };
  shadowTint: number;
  /** 0 by day, 1 at night: lit windows, street lamps, lighthouse beam. */
  glow: number;
  sea: { deep: number; shallow: number; foam: number };
  ink: { color: RGB; strength: number; fadeStart: number; fadeEnd: number };
  tone: { exposure: number; splitShadow: RGB; splitLight: RGB; shadowLift: number };
  grade: {
    lift: RGB;
    gamma: RGB;
    gain: RGB;
    saturation: number;
    temperature: number;
    vignette: { strength: number; radius: number };
  };
  haze: { color: RGB; density: number; horizonBoost: number };
};

const INK = { color: [0.045, 0.03, 0.05] as RGB, strength: 1, fadeStart: 45, fadeEnd: 130 };

export const PRESETS: Record<TimeOfDay, Preset> = {
  morning: {
    name: "Coastal morning",
    sky: ["#4f8fd6", "#78b0e6", "#a9d2f0", "#e8ecdc", "#f7e7c6"],
    // The sun rises over the Western Ghats, inland to the east.
    sun: { color: 0xfff0d6, intensity: 1.9, elevation: 34, azimuth: 105 },
    hemi: { sky: 0xbcd8f0, ground: 0x8a80b8, intensity: 0.5 },
    shadowTint: 0x7f8fc4,
    glow: 0,
    sea: { deep: 0x2a6f9a, shallow: 0x4fb3b8, foam: 0xf4f7f2 },
    ink: INK,
    tone: { exposure: 1.05, splitShadow: [0.84, 0.88, 1.0], splitLight: [1.0, 0.985, 0.95], shadowLift: 0.02 },
    grade: {
      lift: [0.0, 0.004, 0.01],
      gamma: [1.0, 1.0, 0.99],
      gain: [1.04, 1.05, 1.05],
      saturation: 1.14,
      temperature: 0.03,
      vignette: { strength: 0.1, radius: 0.85 },
    },
    haze: { color: [0.84, 0.91, 0.96], density: 0.0016, horizonBoost: 0.14 },
  },
  noon: {
    name: "Clear coastal noon",
    sky: ["#3f86d8", "#62a6e8", "#9fcdf2", "#dcecf4", "#eef4f2"],
    sun: { color: 0xffffff, intensity: 1.95, elevation: 62, azimuth: 160 },
    hemi: { sky: 0xcfe4f6, ground: 0x8a80b8, intensity: 0.5 },
    shadowTint: 0x7f8fc4,
    glow: 0,
    sea: { deep: 0x1f6d9e, shallow: 0x45b8bf, foam: 0xffffff },
    ink: INK,
    tone: { exposure: 1.02, splitShadow: [0.84, 0.88, 1.0], splitLight: [1.0, 0.99, 0.97], shadowLift: 0.02 },
    grade: {
      lift: [0.0, 0.004, 0.01],
      gamma: [1.0, 1.0, 0.99],
      gain: [1.04, 1.05, 1.06],
      saturation: 1.12,
      temperature: 0.0,
      vignette: { strength: 0.1, radius: 0.85 },
    },
    haze: { color: [0.84, 0.91, 0.97], density: 0.0015, horizonBoost: 0.14 },
  },
  sunset: {
    name: "Arabian Sea sunset",
    // NITK beach is famous for it: the sun drops into the sea due west.
    sky: ["#3d4f96", "#7a6fb0", "#e38c7a", "#f7b267", "#ffd89a"],
    sun: { color: 0xffb070, intensity: 1.8, elevation: 11, azimuth: 262 },
    hemi: { sky: 0xd9a8b8, ground: 0x6a5a7a, intensity: 0.55 },
    shadowTint: 0x8a70b8,
    glow: 0.35,
    sea: { deep: 0x3b4f86, shallow: 0xd98f6f, foam: 0xffe6c8 },
    ink: { ...INK, color: [0.06, 0.03, 0.06] },
    tone: { exposure: 1.08, splitShadow: [0.9, 0.82, 1.0], splitLight: [1.0, 0.95, 0.88], shadowLift: 0.02 },
    grade: {
      lift: [0.014, 0.006, 0.014],
      gamma: [1.0, 1.0, 1.0],
      gain: [1.08, 1.02, 1.02],
      saturation: 1.2,
      temperature: 0.18,
      vignette: { strength: 0.16, radius: 0.78 },
    },
    haze: { color: [0.96, 0.8, 0.72], density: 0.0022, horizonBoost: 0.2 },
  },
  night: {
    name: "Campus at night",
    sky: ["#070b1f", "#0f1838", "#1c2a55", "#2b3a66", "#3a4670"],
    sun: { color: 0x9fb4ff, intensity: 0.45, elevation: 40, azimuth: 220 },
    hemi: { sky: 0x3a4a80, ground: 0x1c2240, intensity: 0.45 },
    shadowTint: 0x2c3570,
    glow: 1,
    sea: { deep: 0x0b1a36, shallow: 0x18365a, foam: 0x8fa6c8 },
    ink: { ...INK, color: [0.01, 0.01, 0.03], fadeEnd: 90 },
    tone: { exposure: 1.25, splitShadow: [0.8, 0.86, 1.05], splitLight: [1.0, 0.95, 0.85], shadowLift: 0.03 },
    grade: {
      lift: [0.006, 0.01, 0.03],
      gamma: [1.0, 1.0, 1.02],
      gain: [1.02, 1.04, 1.1],
      saturation: 1.1,
      temperature: -0.1,
      vignette: { strength: 0.2, radius: 0.75 },
    },
    haze: { color: [0.12, 0.16, 0.28], density: 0.0026, horizonBoost: 0.2 },
  },
};

export const TIME_ORDER: TimeOfDay[] = ["morning", "noon", "sunset", "night"];
