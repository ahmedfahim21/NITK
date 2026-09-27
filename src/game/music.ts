/**
 * The soundtrack: a small WebAudio sequencer with synth instruments and a set
 * of generated tracks, each written for a mood (title, day, rain, sunset,
 * night, mission). Tracks crossfade when the mood changes; N skips to the
 * next track for the mood.
 *
 * Your own recordings can join the rotation: put audio files in
 * public/music/ and list them in public/music/manifest.json as
 *   [{ "title": "Lighthouse Blues", "file": "lighthouse.mp3", "moods": ["sunset", "day"] }]
 */
import { audio, mix, noise, whenAudio } from "./audio";

export type Mood = "title" | "day" | "rain" | "sunset" | "night" | "mission";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Instruments. Each schedules into `out` at absolute context time `t`.
 * ------------------------------------------------------------------ */

class Kit {
  constructor(
    readonly ctx: AudioContext,
    readonly out: AudioNode
  ) {}

  private env(t: number, a: number, d: number, peak: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  osc(type: OscillatorType, f: number, t: number, dur: number, g: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  pad(notes: number[], t: number, dur: number, vel = 0.06, cutoff = 1100) {
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.8, dur * 0.3));
    g.gain.setValueAtTime(vel, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    f.connect(g).connect(this.out);
    for (const n of notes) {
      this.osc("sawtooth", mtof(n), t, dur + 0.6, f, -7);
      this.osc("sawtooth", mtof(n), t, dur + 0.6, f, 7);
    }
  }

  pluck(n: number, t: number, vel = 0.12, decay = 0.45, type: OscillatorType = "triangle") {
    const g = this.env(t, 0.004, decay, vel);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + decay);
    f.connect(g).connect(this.out);
    this.osc(type, mtof(n), t, decay, f);
  }

  keys(notes: number[], t: number, dur: number, vel = 0.07) {
    // Electric-piano-ish: sine plus a quiet octave, with tremolo.
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    const trem = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 4.5;
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(trem.gain);
    trem.gain.value = 0.75;
    lfo.start(t);
    lfo.stop(t + dur + 0.4);
    g.connect(trem).connect(this.out);
    for (const n of notes) {
      this.osc("sine", mtof(n), t, dur + 0.3, g);
      const h = this.ctx.createGain();
      h.gain.value = 0.18;
      h.connect(g);
      this.osc("sine", mtof(n + 12), t, dur * 0.4, h);
    }
  }

  bass(n: number, t: number, dur: number, vel = 0.16) {
    const g = this.env(t, 0.01, dur, vel);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    f.connect(g).connect(this.out);
    this.osc("triangle", mtof(n), t, dur, f);
    this.osc("sine", mtof(n - 12), t, dur, f);
  }

  lead(n: number, t: number, dur: number, vel = 0.06, type: OscillatorType = "square") {
    const g = this.env(t, 0.02, dur, vel);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200;
    f.connect(g).connect(this.out);
    const o = this.osc(type, mtof(n), t, dur, f);
    const vib = this.ctx.createOscillator();
    const vg = this.ctx.createGain();
    vib.frequency.value = 5.5;
    vg.gain.value = 4;
    vib.connect(vg).connect(o.detune);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }

  flute(n: number, t: number, dur: number, vel = 0.07) {
    // Bansuri-ish: a sine with breath noise and a slow, wide vibrato.
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.08);
    g.gain.setValueAtTime(vel, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    g.connect(this.out);
    const o = this.osc("sine", mtof(n), t, dur + 0.15, g);
    const vib = this.ctx.createOscillator();
    const vg = this.ctx.createGain();
    vib.frequency.value = 5;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(18, t + dur * 0.6);
    vib.connect(vg).connect(o.detune);
    vib.start(t);
    vib.stop(t + dur + 0.2);
    const nz = noise();
    if (nz) {
      const s = this.ctx.createBufferSource();
      s.buffer = nz.white;
      const bf = this.ctx.createBiquadFilter();
      bf.type = "bandpass";
      bf.frequency.value = mtof(n) * 2;
      bf.Q.value = 6;
      const ng = this.ctx.createGain();
      ng.gain.value = vel * 0.25;
      s.connect(bf).connect(ng).connect(g);
      s.start(t, Math.random());
      s.stop(t + dur + 0.1);
    }
  }

  kick(t: number, vel = 0.5) {
    const g = this.env(t, 0.002, 0.28, vel);
    g.connect(this.out);
    const o = this.osc("sine", 120, t, 0.3, g);
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  }

  private hit(t: number, type: BiquadFilterType, f: number, decay: number, vel: number, q = 1) {
    const nz = noise();
    if (!nz) return;
    const s = this.ctx.createBufferSource();
    s.buffer = nz.white;
    const bf = this.ctx.createBiquadFilter();
    bf.type = type;
    bf.frequency.value = f;
    bf.Q.value = q;
    const g = this.env(t, 0.001, decay, vel);
    s.connect(bf).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + decay + 0.05);
  }

  snare(t: number, vel = 0.22, brush = false) {
    this.hit(t, "bandpass", brush ? 2600 : 1800, brush ? 0.22 : 0.16, vel, brush ? 0.6 : 1);
    if (!brush) {
      const g = this.env(t, 0.001, 0.08, vel * 0.5);
      g.connect(this.out);
      this.osc("triangle", 190, t, 0.1, g);
    }
  }

  hat(t: number, vel = 0.06, open = false) {
    this.hit(t, "highpass", 7500, open ? 0.14 : 0.035, vel);
  }

  shaker(t: number, vel = 0.03) {
    this.hit(t, "bandpass", 5200, 0.05, vel, 2);
  }

  /** Tabla strokes: 'dha' (bass + treble), 'na'/'tin' (treble ring), 'ge' (bass). */
  tabla(stroke: "dha" | "dhin" | "na" | "tin" | "ge" | "ka" | "ta", t: number, vel = 0.25) {
    const bayan = (depth: number) => {
      const g = this.env(t, 0.002, 0.45, vel * 0.9);
      g.connect(this.out);
      const o = this.osc("sine", 95, t, 0.5, g);
      o.frequency.setValueAtTime(80, t);
      o.frequency.linearRampToValueAtTime(80 + depth, t + 0.12);
      o.frequency.linearRampToValueAtTime(95, t + 0.4);
    };
    const dayan = (f: number, ring: number) => {
      const g = this.env(t, 0.001, ring, vel * 0.6);
      g.connect(this.out);
      this.osc("sine", f, t, ring, g);
      const h = this.ctx.createGain();
      h.gain.value = 0.35;
      h.connect(g);
      this.osc("sine", f * 2.7, t, ring * 0.5, h);
      this.hit(t, "bandpass", 3200, 0.02, vel * 0.3, 3);
    };
    switch (stroke) {
      case "dha":
        bayan(22);
        dayan(330, 0.35);
        break;
      case "dhin":
        bayan(12);
        dayan(330, 0.5);
        break;
      case "ge":
        bayan(28);
        break;
      case "na":
        dayan(330, 0.3);
        break;
      case "tin":
        dayan(392, 0.4);
        break;
      case "ta":
        dayan(440, 0.18);
        break;
      case "ka":
        this.hit(t, "lowpass", 400, 0.06, vel * 0.8);
        break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Tracks. `bar` schedules one bar starting at t0.
 * ------------------------------------------------------------------ */

type Track = {
  id: string;
  title: string;
  moods: Mood[];
  bpm: number;
  swing?: number;
  bar(k: Kit, t0: number, bar: number, step: (i: number) => number): void;
};

const TRACKS: Track[] = [
  {
    id: "srinivasnagar",
    title: "Srinivasnagar (main theme)",
    moods: ["title", "day"],
    bpm: 104,
    bar(k, t0, b, s) {
      const prog = [
        [62, 66, 69],
        [61, 64, 69],
        [59, 62, 66],
        [55, 59, 62],
      ];
      const ch = prog[b % 4];
      const motif = [
        [74, 0, 76, 0, 78, 0, 76, 74, 0, 0, 73, 0, 74, 0, 0, 0],
        [73, 0, 71, 0, 69, 0, 71, 73, 0, 0, 76, 0, 73, 0, 0, 0],
        [71, 0, 73, 0, 74, 0, 76, 78, 0, 0, 76, 0, 74, 0, 71, 0],
        [67, 0, 69, 0, 71, 0, 74, 0, 73, 0, 71, 0, 69, 0, 0, 0],
      ][b % 4];
      k.pad(ch, t0, s(16) - t0, 0.035, 1400);
      for (let i = 0; i < 16; i++) {
        if (i % 2 === 0) k.pluck(ch[(i / 2) % 3] + 12, s(i), 0.07, 0.3);
        if (motif[i] && b % 8 >= 4) k.lead(motif[i], s(i), (s(1) - s(0)) * 1.8, 0.05);
        if (i % 2 === 0) k.hat(s(i), 0.04);
      }
      k.bass(ch[0] - 24, s(0), s(3) - s(0));
      k.bass(ch[0] - 12, s(8), s(10) - s(8));
      k.kick(s(0));
      k.kick(s(8));
      k.kick(s(11), 0.3);
      k.snare(s(4));
      k.snare(s(12));
    },
  },
  {
    id: "campus-days",
    title: "Campus Days (lo-fi)",
    moods: ["day"],
    bpm: 82,
    swing: 0.58,
    bar(k, _t0, b, s) {
      const prog = [
        [53, 57, 60, 64],
        [52, 55, 59, 62],
        [50, 53, 57, 60],
        [48, 52, 55, 59],
      ];
      const ch = prog[b % 4];
      const r = rng(b * 31 + 7);
      k.keys(ch, s(0), s(6) - s(0), 0.05);
      k.keys(ch.slice(1), s(6), s(14) - s(6), 0.035);
      k.bass(ch[0] - 12, s(0), s(5) - s(0), 0.14);
      k.bass(ch[2] - 12, s(10), s(14) - s(10), 0.1);
      k.kick(s(0), 0.4);
      k.kick(s(7), 0.25);
      k.kick(s(10), 0.35);
      k.snare(s(4), 0.12, true);
      k.snare(s(12), 0.12, true);
      for (let i = 0; i < 16; i += 2) k.hat(s(i), i % 4 ? 0.02 : 0.035);
      const penta = [72, 74, 76, 79, 81];
      for (let i = 0; i < 16; i++) if (r() < 0.13) k.pluck(penta[Math.floor(r() * 5)] - (b % 2 ? 0 : 12), s(i), 0.05, 0.5, "sine");
    },
  },
  {
    id: "monsoon",
    title: "Monsoon",
    moods: ["rain"],
    bpm: 68,
    bar(k, t0, b, s) {
      const prog = [
        [57, 60, 64],
        [53, 57, 60],
        [55, 60, 64],
        [55, 59, 62],
      ];
      const ch = prog[b % 4];
      const r = rng(b * 17 + 3);
      k.pad(ch.concat(ch[0] - 12), t0, s(16) - t0, 0.045, 800);
      k.bass(ch[0] - 24, s(0), s(12) - s(0), 0.09);
      // Raindrop plucks, high and sparse.
      for (let i = 0; i < 16; i++) if (r() < 0.2) k.pluck(ch[Math.floor(r() * 3)] + 24, s(i) + r() * 0.05, 0.04, 0.8, "sine");
      for (let i = 0; i < 16; i++) k.shaker(s(i), i % 2 ? 0.008 : 0.014);
    },
  },
  {
    id: "lighthouse",
    title: "Lighthouse Hill",
    moods: ["sunset"],
    bpm: 88,
    bar(k, t0, b, s) {
      const prog = [
        [63, 67, 70],
        [60, 63, 67],
        [56, 60, 63],
        [58, 62, 65],
      ];
      const ch = prog[b % 4];
      k.pad(ch, t0, s(16) - t0, 0.04, 1200);
      const arp = [0, 1, 2, 1, 0, 1, 2, 3];
      for (let i = 0; i < 16; i++) {
        const idx = arp[i % 8];
        const n = idx === 3 ? ch[0] + 12 : ch[idx];
        k.pluck(n + 12, s(i), 0.05, 0.35);
      }
      k.bass(ch[0] - 24, s(0), s(8) - s(0), 0.12);
      k.bass(ch[0] - 12, s(8), s(8) - s(0), 0.1);
      k.kick(s(0), 0.32);
      if (b % 2) k.kick(s(10), 0.2);
      k.hat(s(4), 0.03, true);
      k.hat(s(12), 0.03, true);
    },
  },
  {
    id: "night-canteen",
    title: "Night Canteen",
    moods: ["night"],
    bpm: 74,
    swing: 0.62,
    bar(k, _t0, b, s) {
      const prog = [
        [50, 53, 57, 60],
        [55, 59, 62, 65],
        [48, 52, 55, 59],
        [57, 61, 64, 67],
      ];
      const ch = prog[b % 4];
      k.keys(ch, s(0), s(8) - s(0), 0.045);
      k.keys([ch[1], ch[3]], s(10), s(14) - s(10), 0.03);
      // Walking bass.
      const walk = [ch[0], ch[1], ch[2], ch[1] + 1];
      for (let q = 0; q < 4; q++) k.bass(walk[q] - 12, s(q * 4), s(q * 4 + 3) - s(q * 4), 0.11);
      k.snare(s(4), 0.08, true);
      k.snare(s(12), 0.08, true);
      for (let i = 0; i < 16; i += 2) k.hat(s(i), i % 4 === 0 ? 0.03 : 0.018, i % 8 === 6);
    },
  },
  {
    id: "coastal-groove",
    title: "Coastal Groove (tabla & bansuri)",
    moods: ["day", "sunset"],
    bpm: 96,
    bar(k, t0, b, s) {
      // Mohanam (C D E G A) over a Sa-Pa drone and a keherwa-style theka.
      const r = rng(b * 13 + 5);
      k.pad([48, 55, 60], t0, s(16) - t0, 0.03, 700);
      const theka: ("dha" | "ge" | "na" | "tin" | "ka" | "dhin" | "ta")[] = ["dha", "ge", "na", "tin", "na", "ka", "dhin", "na"];
      for (let i = 0; i < 8; i++) k.tabla(theka[i], s(i * 2), i === 0 ? 0.3 : 0.2);
      if (b % 4 === 3) k.tabla("ta", s(15), 0.18);
      const scale = [72, 74, 76, 79, 81, 84];
      let i = 0;
      while (i < 16) {
        const len = [2, 2, 4, 1, 3][Math.floor(r() * 5)];
        if (r() < 0.7 && b % 8 >= 2) k.flute(scale[Math.floor(r() * scale.length)], s(i), s(Math.min(16, i + len)) - s(i), 0.06);
        i += len;
      }
      k.bass(48 - 12, s(0), s(6) - s(0), 0.1);
      k.bass(55 - 12, s(8), s(6) - s(0), 0.08);
    },
  },
  {
    id: "mission",
    title: "Against the Clock",
    moods: ["mission"],
    bpm: 132,
    bar(k, t0, b, s) {
      const prog = [
        [52, 55, 59],
        [48, 52, 55],
        [50, 54, 57],
        [47, 51, 54],
      ];
      const ch = prog[b % 4];
      const riff = [0, 0, 12, 0, 7, 0, 12, 10];
      for (let i = 0; i < 16; i++) {
        k.bass(ch[0] - 12 + (i % 2 ? 12 : 0), s(i), (s(1) - s(0)) * 0.9, 0.12);
        if (i % 4 === 0) k.kick(s(i), 0.5);
        if (i % 4 === 2) k.hat(s(i), 0.06, true);
        else k.hat(s(i), 0.025);
        if (b % 4 >= 2 && i % 2 === 0) k.lead(ch[0] + 12 + riff[(i / 2) % 8], s(i), (s(1) - s(0)) * 1.6, 0.04);
      }
      k.snare(s(4));
      k.snare(s(12));
      if (b % 4 === 3) for (let i = 12; i < 16; i++) k.snare(s(i), 0.12);
      k.pad(ch, t0, s(16) - t0, 0.025, 1800);
    },
  },
];

type FileTrack = { id: string; title: string; moods: Mood[]; el: HTMLAudioElement };

/* ------------------------------------------------------------------ *
 * The player.
 * ------------------------------------------------------------------ */

type Playing = { track: Track | FileTrack; gain: GainNode; bar: number; nextBar: number };

export class Music {
  private mood: Mood = "title";
  private playing: Playing | null = null;
  private fading: Playing[] = [];
  private files: FileTrack[] = [];
  private index: Partial<Record<Mood, number>> = {};
  private timer = 0;
  private sinceSwitch = 0;
  onTrack: ((title: string) => void) | null = null;

  constructor() {
    void this.loadManifest();
    whenAudio(() => {
      this.start();
      this.timer = window.setInterval(() => this.tick(), 50);
    });
  }

  private async loadManifest() {
    try {
      const res = await fetch("./music/manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      const list = (await res.json()) as { title: string; file: string; moods: Mood[] }[];
      for (const f of list) {
        const el = new Audio(`./music/${f.file}`);
        el.loop = true;
        el.crossOrigin = "anonymous";
        this.files.push({ id: `file:${f.file}`, title: f.title, moods: f.moods, el });
      }
    } catch {
      /* no custom music */
    }
  }

  private candidates(mood: Mood): (Track | FileTrack)[] {
    return [...TRACKS.filter((t) => t.moods.includes(mood)), ...this.files.filter((f) => f.moods.includes(mood))];
  }

  setMood(m: Mood) {
    if (m === this.mood) return;
    this.mood = m;
    this.start();
  }

  /** Skip to the next track for the current mood. */
  next() {
    const list = this.candidates(this.mood);
    this.index[this.mood] = ((this.index[this.mood] ?? 0) + 1) % Math.max(1, list.length);
    this.start();
  }

  get title() {
    return this.playing?.track.title ?? "";
  }

  private start() {
    const a = audio();
    if (!a) return;
    const list = this.candidates(this.mood);
    if (!list.length) return;
    const track = list[(this.index[this.mood] ?? 0) % list.length];
    if (this.playing?.track === track) return;
    // Fade the old one out.
    if (this.playing) {
      const old = this.playing;
      old.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.8);
      this.fading.push(old);
      const el = (old.track as FileTrack).el;
      setTimeout(() => {
        this.fading = this.fading.filter((f) => f !== old);
        old.gain.disconnect();
        el?.pause();
      }, 4000);
    }
    const gain = a.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(1, a.ctx.currentTime + 0.3, 1.2);
    gain.connect(a.music);
    const el = (track as FileTrack).el;
    if (el) {
      const src = a.ctx.createMediaElementSource(el);
      src.connect(gain);
      el.currentTime = 0;
      void el.play().catch(() => undefined);
    }
    this.playing = { track, gain, bar: 0, nextBar: a.ctx.currentTime + 0.15 };
    this.sinceSwitch = 0;
    this.onTrack?.(track.title);
  }

  private tick() {
    const a = audio();
    if (!a || !this.playing || !mix.musicOn) return;
    // Day music rotates every few minutes so it never wears thin.
    this.sinceSwitch += 0.05;
    if (this.mood === "day" && this.sinceSwitch > 200) this.next();
    for (const p of [this.playing, ...this.fading]) {
      const tr = p.track as Track;
      if (!tr.bar) continue;
      const spb = 60 / tr.bpm;
      const stepDur = spb / 4;
      // After a pause (music off, background tab) pick up from now, don't burst.
      if (p.nextBar < a.ctx.currentTime) p.nextBar = a.ctx.currentTime + 0.05;
      while (p.nextBar < a.ctx.currentTime + 0.25) {
        const t0 = p.nextBar;
        const sw = tr.swing ?? 0.5;
        const step = (i: number) => {
          const pair = Math.floor(i / 2);
          return t0 + pair * 2 * stepDur + (i % 2 ? 2 * stepDur * sw : 0);
        };
        tr.bar(new Kit(a.ctx, p.gain), t0, p.bar, step);
        p.bar++;
        p.nextBar = t0 + 16 * stepDur;
      }
    }
  }

  dispose() {
    clearInterval(this.timer);
  }
}

export const TRACK_LIST = TRACKS.map((t) => ({ title: t.title, moods: t.moods }));
