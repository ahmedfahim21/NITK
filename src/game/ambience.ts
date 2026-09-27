/**
 * Ambient sound, mixed from where you stand and when: the sea on the real
 * coastline, NH66 traffic and horns, birds by day, crickets by night, the
 * murmur of students at the hangouts, temple bells at dawn and dusk, wind,
 * footsteps, and the tick of a freewheeling cycle.
 */
import type { CampusMap } from "../osm/types";
import { audio, noise, whenAudio } from "./audio";

export type AmbientInput = {
  x: number;
  z: number;
  hour: number;
  raining: boolean;
  /** Students within ~25 m. */
  crowd: number;
  speed: number;
  running: boolean;
  riding: boolean;
  onRoad: boolean;
  /** 0..1 how enclosed (indoors-ish): dampens everything. */
  muffle?: number;
};

type Loop = { gain: GainNode; filter: BiquadFilterNode };

function samplePolyline(lines: [number, number][][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (const l of lines) {
    for (let i = 1; i < l.length; i++) {
      const [a, b] = [l[i - 1], l[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return out;
}

function nearest(pts: [number, number][], x: number, z: number): number {
  let d = Infinity;
  for (const p of pts) {
    const q = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (q < d) d = q;
  }
  return Math.sqrt(d);
}

export class Ambience {
  private coast: [number, number][];
  private highway: [number, number][];
  private temples: [number, number][];
  private waves: Loop | null = null;
  private wind: Loop | null = null;
  private traffic: Loop | null = null;
  private murmur: Loop | null = null;
  private crickets: GainNode | null = null;
  private chain: Loop | null = null;
  private dCoast = 1e9;
  private dRoad = 1e9;
  private dTemple = 1e9;
  private slow = 0;
  private waveT = 0;
  private stepT = 0;
  private birdT = 2;
  private hornT = 5;
  private bellT = 10;
  private tickT = 0;

  constructor(map: CampusMap) {
    this.coast = samplePolyline(map.coast, 12);
    this.highway = samplePolyline(map.roads.filter((r) => r.kind === "trunk" || r.kind === "primary").map((r) => r.pts), 15);
    this.temples = map.pois
      .filter((p) => p.tags.amenity === "place_of_worship" || /temple|church|mandir/i.test(p.name))
      .map((p) => [p.x, p.z] as [number, number]);
    whenAudio(() => this.build());
  }

  private loop(buf: "white" | "brown", type: BiquadFilterType, freq: number, q = 1): Loop | null {
    const a = audio();
    const n = noise();
    if (!a || !n) return null;
    const src = a.ctx.createBufferSource();
    src.buffer = n[buf];
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = a.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = a.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(a.amb);
    src.start(0, Math.random() * 1.5);
    return { gain, filter };
  }

  private build() {
    const a = audio();
    if (!a) return;
    this.waves = this.loop("brown", "lowpass", 650);
    this.wind = this.loop("white", "bandpass", 380, 0.6);
    this.traffic = this.loop("brown", "lowpass", 260);
    this.murmur = this.loop("brown", "bandpass", 520, 1.4);
    this.chain = this.loop("white", "bandpass", 1500, 4);
    // Crickets: two detuned chirping oscillators, gated.
    const g = a.ctx.createGain();
    g.gain.value = 0;
    g.connect(a.amb);
    for (const f of [4400, 4730]) {
      const o = a.ctx.createOscillator();
      o.frequency.value = f;
      const am = a.ctx.createGain();
      am.gain.value = 0;
      const lfo = a.ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 28 + Math.random() * 6;
      const lg = a.ctx.createGain();
      lg.gain.value = 0.5;
      const gate = a.ctx.createOscillator();
      gate.type = "square";
      gate.frequency.value = 2.2 + Math.random();
      const gg = a.ctx.createGain();
      gg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      gate.connect(gg).connect(am.gain);
      o.connect(am).connect(g);
      o.start();
      lfo.start();
      gate.start();
    }
    this.crickets = g;
  }

  update(dt: number, s: AmbientInput) {
    const a = audio();
    if (!a || !this.waves) return;
    const t = a.ctx.currentTime;
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.3;
      this.dCoast = this.coast.length ? nearest(this.coast, s.x, s.z) : 1e9;
      this.dRoad = this.highway.length ? nearest(this.highway, s.x, s.z) : 1e9;
      this.dTemple = this.temples.length ? nearest(this.temples, s.x, s.z) : 1e9;
    }
    const near = (d: number, full: number, gone: number) => Math.max(0, Math.min(1, (gone - d) / (gone - full)));
    const day = s.hour >= 5.5 && s.hour < 19;
    const m = 1 - (s.muffle ?? 0) * 0.6;

    // Sea: a swell that rolls in every seven seconds or so.
    this.waveT -= dt;
    const sea = near(this.dCoast, 25, 420) * m;
    if (this.waveT <= 0) {
      this.waveT = 5.5 + Math.random() * 3;
      const peak = 0.05 + sea * 0.55;
      const g = this.waves.gain.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(peak, t, 1.2);
      g.setTargetAtTime(peak * 0.35, t + 2.6, 1.5);
      this.waves.filter.frequency.setTargetAtTime(500 + sea * 700, t, 1);
    }
    if (sea < 0.01) this.waves.gain.gain.setTargetAtTime(0, t, 0.5);

    // Wind: always a little, more on the beach and in the rain.
    this.wind!.gain.gain.setTargetAtTime((0.015 + sea * 0.05 + (s.raining ? 0.04 : 0)) * m, t, 0.8);

    // NH66.
    const road = near(this.dRoad, 12, 260) * m;
    this.traffic!.gain.gain.setTargetAtTime(road * 0.4, t, 0.5);
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.hornT = 3 + Math.random() * 9;
      if (road > 0.25) this.horn(road);
    }

    // Students.
    const crowd = Math.min(1, s.crowd / 12) * m;
    this.murmur!.gain.gain.setTargetAtTime(crowd * 0.12 * (0.7 + Math.random() * 0.6), t, 0.4);

    // Birds by day, busiest at dawn and dusk; crickets after dark.
    const chorus = day ? (s.hour < 9 || s.hour > 17 ? 1 : 0.45) * (s.raining ? 0.2 : 1) : 0;
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 0.4 + Math.random() * (3.5 - chorus * 2.5);
      if (chorus > 0 && Math.random() < chorus) this.bird(0.03 + Math.random() * 0.04);
    }
    this.crickets!.gain.setTargetAtTime(!day ? (s.raining ? 0.004 : 0.012) * m : 0, t, 1.5);

    // Temple bells round dawn and dusk.
    this.bellT -= dt;
    if (this.bellT <= 0) {
      this.bellT = 6 + Math.random() * 8;
      const aarti = (s.hour >= 6 && s.hour < 7.5) || (s.hour >= 18 && s.hour < 19.5);
      const v = near(this.dTemple, 20, 300);
      if (aarti && v > 0) for (let k = 0; k < 4; k++) this.bell(t + k * 0.55, 0.06 * v);
    }

    // Footsteps, and the cycle.
    if (s.riding) {
      this.chain!.gain.gain.setTargetAtTime(Math.min(1, s.speed / 9) * 0.03, t, 0.2);
      this.tickT -= dt;
      if (this.tickT <= 0 && s.speed > 1) {
        this.tickT = 0.9 / Math.max(1, s.speed);
        this.click(0.02);
      }
    } else {
      this.chain!.gain.gain.setTargetAtTime(0, t, 0.2);
      this.stepT -= dt;
      if (s.speed > 0.6 && this.stepT <= 0) {
        this.stepT = (s.running ? 0.95 : 0.72) / Math.max(1, s.speed) * (s.running ? 2.3 : 1.7);
        this.step(s.onRoad, s.running, s.raining);
      }
    }
  }

  private horn(v: number) {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const beeps = Math.random() < 0.5 ? 1 : 2;
    const base = [330, 392, 440, 294][Math.floor(Math.random() * 4)];
    for (let k = 0; k < beeps; k++) {
      const g = a.ctx.createGain();
      const st = t + k * 0.28;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.05 * v, st + 0.02);
      g.gain.setValueAtTime(0.05 * v, st + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.24);
      const f = a.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1800;
      g.connect(a.amb);
      f.connect(g);
      for (const r of [1, 1.26]) {
        const o = a.ctx.createOscillator();
        o.type = "square";
        o.frequency.value = base * r;
        o.connect(f);
        o.start(st);
        o.stop(st + 0.26);
      }
    }
  }

  private bird(vel: number) {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 2400;
    for (let k = 0; k < notes; k++) {
      const st = t + k * (0.07 + Math.random() * 0.06);
      const o = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), st);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), st + 0.05);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(vel, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.07);
      const pan = a.ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(g).connect(pan).connect(a.amb);
      o.start(st);
      o.stop(st + 0.09);
    }
  }

  private bell(t: number, vel: number) {
    const a = audio();
    if (!a) return;
    for (const [f, v, d] of [
      [880, 1, 2.2],
      [1760 * 1.01, 0.4, 1.4],
      [2640 * 0.99, 0.25, 0.9],
    ]) {
      const o = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * v, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(a.amb);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  private click(vel: number) {
    const a = audio();
    const n = noise();
    if (!a || !n) return;
    const s = a.ctx.createBufferSource();
    s.buffer = n.white;
    const f = a.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 5000;
    const g = a.ctx.createGain();
    const t = a.ctx.currentTime;
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
    s.connect(f).connect(g).connect(a.amb);
    s.start(t, Math.random());
    s.stop(t + 0.03);
  }

  private step(road: boolean, run: boolean, wet: boolean) {
    const a = audio();
    const n = noise();
    if (!a || !n) return;
    const s = a.ctx.createBufferSource();
    s.buffer = n.white;
    const f = a.ctx.createBiquadFilter();
    f.type = road ? "bandpass" : "lowpass";
    f.frequency.value = road ? 1100 + Math.random() * 300 : 700 + Math.random() * 200;
    f.Q.value = road ? 1.2 : 0.7;
    const g = a.ctx.createGain();
    const t = a.ctx.currentTime;
    const vel = (run ? 0.08 : 0.05) * (wet ? 1.3 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (wet ? 0.12 : 0.07));
    s.connect(f).connect(g).connect(a.amb);
    s.start(t, Math.random());
    s.stop(t + 0.15);
  }
}
