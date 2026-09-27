/**
 * WebAudio: one context, three buses (sfx, music, ambience) with saved
 * volumes, plus the synthesized stings, bell, blips and rain bed. No audio
 * files are needed; music.ts and ambience.ts build on the buses here.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let rainGain: GainNode | null = null;
let unlocked = false;
let wantRain = false;
const onUnlock: (() => void)[] = [];

export type Mix = { master: number; music: number; sfx: number; ambience: number; musicOn: boolean };
const MIX_KEY = "nitk-mix-v1";
export const mix: Mix = (() => {
  const d: Mix = { master: 0.8, music: 0.55, sfx: 0.8, ambience: 0.7, musicOn: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(MIX_KEY) ?? "{}") };
  } catch {
    return d;
  }
})();

export function setMix(m: Partial<Mix>) {
  Object.assign(mix, m);
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch {
    /* not persisted */
  }
  applyMix();
}

function applyMix() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(mix.master * 0.5, t, 0.05);
  sfxBus!.gain.setTargetAtTime(mix.sfx, t, 0.05);
  musicBus!.gain.setTargetAtTime(mix.musicOn ? mix.music : 0, t, 0.2);
  ambBus!.gain.setTargetAtTime(mix.ambience, t, 0.05);
}

function ac(): AudioContext | null {
  if (ctx) return ctx;
  if (!unlocked) return null;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    // A gentle limiter so stacked layers never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    ambBus = ctx.createGain();
    for (const b of [sfxBus, musicBus, ambBus]) b.connect(master);
    applyMix();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** The context and buses, once the player has interacted with the page. */
export function audio(): { ctx: AudioContext; sfx: GainNode; music: GainNode; amb: GainNode } | null {
  const a = ac();
  if (!a || !sfxBus || !musicBus || !ambBus) return null;
  return { ctx: a, sfx: sfxBus, music: musicBus, amb: ambBus };
}

/** Run once audio is available (immediately if it already is). */
export function whenAudio(fn: () => void) {
  if (audio()) fn();
  else onUnlock.push(fn);
}

/** Browsers start audio suspended until a gesture. */
export function unlockAudio() {
  const first = !unlocked;
  unlocked = true;
  const a = ac();
  if (a && a.state === "suspended") void a.resume();
  if (wantRain && !rainGain) setRainSound(true);
  if (first && a) for (const fn of onUnlock.splice(0)) fn();
}

/** Shared noise buffers (white and brown), 2 s, looped by users. */
let noiseCache: { white: AudioBuffer; brown: AudioBuffer } | null = null;
export function noise(): { white: AudioBuffer; brown: AudioBuffer } | null {
  const a = ac();
  if (!a) return null;
  if (noiseCache) return noiseCache;
  const len = a.sampleRate * 2;
  const white = a.createBuffer(1, len, a.sampleRate);
  const brown = a.createBuffer(1, len, a.sampleRate);
  const w = white.getChannelData(0);
  const b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const r = Math.random() * 2 - 1;
    w[i] = r;
    last = (last + 0.02 * r) / 1.02;
    b[i] = last * 3.5;
  }
  noiseCache = { white, brown };
  return noiseCache;
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = "triangle", vol = 0.4) {
  const a = ac();
  if (!a || !sfxBus) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const N = (semi: number) => 440 * Math.pow(2, (semi - 9) / 12); // C4 = 0

export const sfx = {
  missionStart() {
    [0, 4, 7, 12].forEach((s, i) => tone(N(s + 12), i * 0.09, 0.35, "square", 0.18));
  },
  missionPassed() {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19];
    seq.forEach((s, i) => tone(N(s + 12), i * 0.11, 0.4, "square", 0.2));
    tone(N(0), 0, 1.2, "triangle", 0.25);
    tone(N(7), 0.44, 1.0, "triangle", 0.2);
  },
  missionFailed() {
    [7, 6, 5, 4].forEach((s, i) => tone(N(s), i * 0.18, 0.45, "sawtooth", 0.12));
  },
  blip() {
    tone(N(24), 0, 0.08, "square", 0.08);
  },
  coin() {
    tone(N(26), 0, 0.08, "square", 0.12);
    tone(N(31), 0.07, 0.2, "square", 0.12);
  },
  bell() {
    for (const k of [0, 0.16]) {
      tone(2350, k, 0.5, "sine", 0.18);
      tone(3520, k, 0.35, "sine", 0.08);
    }
  },
  chapter() {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(N(s), i * 0.14, 1.4, "triangle", 0.18));
  },
  bees() {
    const a = ac();
    if (!a || !sfxBus) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sawtooth";
    o.frequency.value = 210;
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = 23;
    lg.gain.value = 30;
    lfo.connect(lg).connect(o.frequency);
    g.gain.value = 0.05;
    o.connect(g).connect(sfxBus);
    o.start();
    lfo.start();
    o.stop(a.currentTime + 0.6);
    lfo.stop(a.currentTime + 0.6);
  },
};

/** Continuous rain hiss, faded in and out. */
export function setRainSound(on: boolean) {
  wantRain = on;
  const a = ac();
  const n = noise();
  if (!a || !ambBus || !n) return;
  if (!rainGain) {
    const src = a.createBufferSource();
    src.buffer = n.brown;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2400;
    rainGain = a.createGain();
    rainGain.gain.value = 0;
    src.connect(f).connect(rainGain).connect(ambBus);
    src.start();
  }
  rainGain.gain.setTargetAtTime(on ? 0.5 : 0, a.currentTime, 0.8);
}
