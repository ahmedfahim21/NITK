/**
 * Tiny WebAudio synth: mission stings, the cycle bell, UI blips and a rain
 * bed. No audio files; everything is generated, so nothing to download.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rainGain: GainNode | null = null;
let unlocked = false;
let wantRain = false;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  if (!unlocked) return null;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Browsers start audio suspended until a gesture. */
export function unlockAudio() {
  unlocked = true;
  const a = ac();
  if (a && a.state === "suspended") void a.resume();
  if (wantRain && !rainGain) setRainSound(true);
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = "triangle", vol = 0.4) {
  const a = ac();
  if (!a || !master) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
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
    if (!a || !master) return;
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
    o.connect(g).connect(master);
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
  if (!a || !master) return;
  if (!rainGain) {
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brown-ish noise reads as rain on leaves rather than static.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2400;
    rainGain = a.createGain();
    rainGain.gain.value = 0;
    src.connect(f).connect(rainGain).connect(master);
    src.start();
  }
  rainGain.gain.setTargetAtTime(on ? 0.5 : 0, a.currentTime, 0.8);
}
