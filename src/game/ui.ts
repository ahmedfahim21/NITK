/**
 * Game UI: banners for chapters and mission results, a lower-third dialogue,
 * an objective tracker with a timer, the status card, interaction prompts,
 * toasts, and paper cards for the journal, quizzes and minigames. Styled on
 * the tokens in index.html (dark glass HUD, one gold accent).
 */
import { sfx } from "./audio";

const CSS = `
#game-ui { position: fixed; inset: 0; pointer-events: none; font-family: "Noto Sans", system-ui, sans-serif; color: var(--text); }
#game-ui .plate { background: var(--glass); border: 1px solid var(--line); border-radius: var(--radius); backdrop-filter: blur(12px) saturate(1.2); -webkit-backdrop-filter: blur(12px) saturate(1.2); box-shadow: 0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06); }

/* Status: money, three bars, what's next */
#stats { position: absolute; top: 96px; left: 16px; padding: 11px 14px 12px; width: 232px; font-size: 12px; }
#stats .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
#stats .money { font: 400 24px/1 var(--display); letter-spacing: 0.04em; color: var(--gold); }
#stats .row { display: grid; grid-template-columns: 78px 1fr 34px; align-items: center; gap: 8px; margin: 5px 0; }
#stats .lbl { font: 400 12px var(--label); letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
#stats .val { font: 400 13px var(--label); text-align: right; font-variant-numeric: tabular-nums; }
#stats .bar { height: 5px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,0.12); }
#stats .bar i { display: block; height: 100%; border-radius: 3px; transition: width 0.4s; }
#stats .next { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.4; color: var(--text); }
#stats .next.now { color: var(--gold); }

/* Mission tracker */
#tracker { position: absolute; top: 232px; left: 16px; width: 284px; padding: 11px 14px 12px 18px; display: none; overflow: hidden; }
#tracker::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--gold); }
#tracker.on { display: block; animation: slideIn 0.3s ease-out; }
#tracker .t { font: 400 12px var(--label); letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); }
#tracker .o { font-size: 14.5px; line-height: 1.4; margin-top: 4px; }
#tracker .o span { color: var(--muted); }
#tracker .timer { font: 400 30px/1 var(--display); letter-spacing: 0.06em; color: var(--red); margin-top: 6px; font-variant-numeric: tabular-nums; }
@keyframes slideIn { from { transform: translateX(-12px); opacity: 0; } }

/* Interaction prompt */
#prompt { position: absolute; left: 50%; bottom: 168px; transform: translateX(-50%); padding: 8px 14px 8px 8px; font: 400 16px var(--label); letter-spacing: 0.04em; display: none; align-items: center; gap: 10px; border-radius: 999px !important; }
#prompt kbd { min-width: 28px; height: 28px; border-radius: 999px; background: var(--gold); color: var(--ink); border: 0; font-size: 14px; }

/* Dialogue: a cinematic lower third */
#dialogue { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); width: min(760px, calc(100vw - 32px)); padding: 16px 22px 14px; display: none; pointer-events: auto; background: var(--glass-strong) !important; }
#dialogue .who { font: 400 13px var(--label); letter-spacing: 0.18em; text-transform: uppercase; color: var(--gold); margin-bottom: 6px; }
#dialogue .txt { font-size: 18px; line-height: 1.5; min-height: 54px; color: var(--text); }
#dialogue .more { display: flex; justify-content: flex-end; align-items: center; gap: 6px; font: 400 11px var(--label); letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
#dialogue .choices { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
#dialogue .choices button { display: flex; align-items: center; gap: 10px; text-align: left; font: 400 15px "Noto Sans", sans-serif; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--text); cursor: pointer; transition: background 0.15s, border-color 0.15s; }
#dialogue .choices button:hover { background: rgba(242,184,75,0.16); border-color: var(--gold); }
#dialogue .choices button kbd { flex: none; }

/* Big moments */
#banner { position: absolute; left: 0; right: 0; top: 30%; text-align: center; display: none; }
#banner .band { display: inline-block; padding: 10px 56px 14px; background: linear-gradient(90deg, transparent, rgba(11,15,23,0.78) 18%, rgba(11,15,23,0.78) 82%, transparent); }
#banner .big { font: 400 clamp(46px, 8vw, 104px)/1 var(--display); letter-spacing: 0.06em; color: var(--gold); text-shadow: 0 4px 24px rgba(0,0,0,0.45); }
#banner .big.fail { color: var(--red); }
#banner .big.chapter { color: var(--text); }
#banner .big.start { font-size: clamp(34px, 5vw, 64px); color: var(--text); }
#banner .small { font: 400 clamp(14px, 1.8vw, 20px) var(--label); letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
#banner .rule { width: 120px; height: 2px; margin: 10px auto 0; background: var(--gold); }
#banner.show { display: block; animation: reveal 0.5s cubic-bezier(.2,.9,.3,1); }
@keyframes reveal { from { opacity: 0; letter-spacing: 0.3em; } to { opacity: 1; } }

/* Toasts */
#toasts { position: absolute; right: 16px; top: 236px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; max-width: 320px; }
#toasts .toast { position: relative; padding: 7px 12px 7px 16px; font-size: 13px; line-height: 1.35; color: var(--text); overflow: hidden; animation: toastIn 0.25s ease-out; border-radius: 10px !important; }
#toasts .toast::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent, var(--gold)); }
#toasts .toast.out { opacity: 0; transform: translateX(16px); transition: opacity 0.3s, transform 0.3s; }
@keyframes toastIn { from { transform: translateX(24px); opacity: 0; } }
#fade { position: absolute; inset: 0; background: #0b0f17; opacity: 0; transition: opacity 0.6s; }

/* Paper cards: the journal, quizzes, minigames (in-world documents) */
#overlay { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(8,11,17,0.62); backdrop-filter: blur(4px); pointer-events: auto; }
#overlay.on { display: flex; }
#overlay .card { width: min(560px, calc(100vw - 32px)); padding: 22px 24px; background: var(--paper); color: var(--ink); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,0.5); border: 1px solid rgba(0,0,0,0.08); }
#overlay h2 { margin: 0 0 6px; font: 400 30px/1.05 var(--display); letter-spacing: 0.04em; color: var(--ink); }
#overlay .q { font-size: 17px; margin: 12px 0; }
#overlay .opts { display: flex; flex-direction: column; gap: 6px; }
#overlay .opts button { text-align: left; font: 400 15px "Noto Sans", sans-serif; padding: 10px 12px; border: 1px solid rgba(17,21,29,0.16); border-radius: 10px; background: #fff; color: var(--ink); cursor: pointer; transition: background 0.15s, border-color 0.15s; }
#overlay .opts button:hover { border-color: var(--gold-deep); background: #fff8e8; }
#overlay .opts button.right { background: #d9f2e6; border-color: #3a9b73; }
#overlay .opts button.wrong { background: #fbe0db; border-color: #d0533f; }
#overlay .typing { font-family: ui-monospace, Menlo, monospace; font-size: 22px; letter-spacing: 0.08em; margin: 10px 0; }
#overlay .typing .done { color: #1e6f5c; }
#overlay .typing .next { background: #ffe29a; }
#overlay input { font: inherit; font-size: 18px; padding: 8px 10px; width: 100%; border: 1px solid rgba(17,21,29,0.25); border-radius: 10px; background: #fff; color: var(--ink); }
#overlay .rules { font-size: 13px; margin: 6px 0; }
#overlay .rules div.ok { color: #1e6f5c; }
#overlay .rules div.bad { color: #c0392b; }
#overlay .chip { display: inline-block; min-width: 54px; padding: 1px 7px; margin-right: 6px; border-radius: 999px; font: 400 11px var(--label); letter-spacing: 0.12em; text-transform: uppercase; text-align: center; }
#overlay .chip.done { background: #d9f2e6; color: #1e6f5c; }
#overlay .chip.open { background: #ffe8b8; color: #8a5a00; }
#overlay .chip.locked { background: #eceae4; color: #8c8a84; }
#overlay .chip.later { background: #eceae4; color: #8c8a84; }
#overlay .card.jr { max-height: calc(100vh - 40px); overflow-y: auto; padding: 22px 26px 26px; }
.jr .ic { flex: none; }
.jr-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.jr-top h2 { margin: 0; }
.jr-cap { font: 400 12px var(--label); letter-spacing: 0.14em; text-transform: uppercase; color: #8a5a00; }
.jr-actions { display: flex; align-items: center; gap: 8px; }
.jr-btn { display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid rgba(17,21,29,0.16); border-radius: 10px; background: #fff; color: var(--ink); font: 400 14px var(--label); letter-spacing: 0.06em; cursor: pointer; }
.jr-btn:hover { border-color: var(--gold-deep); background: #fff8e8; }
.jr-btn kbd { font: 400 11px var(--label); padding: 1px 6px; border-radius: 5px; background: #1b1f2a; color: #fff; }
.jr-count { font: 400 12px var(--label); letter-spacing: 0.08em; padding: 1px 7px; border-radius: 999px; background: rgba(17,21,29,0.08); color: #4a4f5a; margin-left: auto; }
.jr-count.big { font-size: 14px; padding: 4px 10px; }
.jr-muted { color: #8c8a84; font-size: 13px; }
.jr-muted.small { font-size: 11.5px; margin-left: auto; }
.jr-tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 6px; }
.jr-tile { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border-radius: 12px; background: #fff; border: 1px solid rgba(17,21,29,0.08); min-width: 0; }
.jr-tile .big { font: 400 17px/1.1 var(--label); letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jr-tile .small { font-size: 11.5px; color: #6b6f78; white-space: nowrap; }
.jr-tile > div { min-width: 0; }
.jr-cols { display: grid; grid-template-columns: 1fr 1.25fr; gap: 22px; }
.jr-sec { margin-top: 14px; font-size: 13.5px; }
.jr-h { display: flex; align-items: center; gap: 7px; font: 400 13px var(--label); letter-spacing: 0.14em; text-transform: uppercase; color: #8a5a00; margin-bottom: 7px; padding-bottom: 5px; border-bottom: 1px solid rgba(17,21,29,0.1); }
.jr-disc { flex: none; display: inline-grid; place-items: center; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.25), inset 0 0 0 1.5px rgba(255,255,255,0.35); }
.jr-rep { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
.jr-rep .nm { width: 66px; }
.jr-rep .bar { flex: 1; height: 8px; border-radius: 5px; background: rgba(17,21,29,0.08); overflow: hidden; }
.jr-rep .bar i { display: block; height: 100%; border-radius: 5px; }
.jr-rep .n { width: 24px; text-align: right; font: 400 13px var(--label); }
.jr-pills { display: flex; flex-wrap: wrap; gap: 5px; }
.jr-pill { padding: 3px 9px; border-radius: 999px; color: #fff; font-size: 12px; }
.jr-pill.ghost { background: transparent; color: var(--ink); border: 1px dashed rgba(17,21,29,0.3); }
.jr-prog { height: 4px; border-radius: 3px; background: rgba(17,21,29,0.08); overflow: hidden; margin: -3px 0 6px; }
.jr-prog i { display: block; height: 100%; background: linear-gradient(90deg, #f2b84b, #d99a20); }
.jr-m { display: flex; align-items: center; gap: 9px; margin: 5px 0; }
.jr-m .t { min-width: 0; }
.jr-m .chip { margin: 0 0 0 7px; min-width: 0; font-size: 10px; }
.jr-m .sub { font-size: 11.5px; color: #6b6f78; }
.jr-m.locked { opacity: 0.55; }
.jr-m.done .t > div:first-child { color: #4a4f5a; }
.jr-courses { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.jr-course { display: flex; gap: 9px; padding: 9px 10px; border-radius: 12px; background: #fff; border: 1px solid rgba(17,21,29,0.08); }
.jr-course .code { font: 400 13px var(--label); letter-spacing: 0.06em; color: #6b6f78; }
.jr-course .pips { display: flex; gap: 3px; margin: 4px 0 3px; }
.jr-course .pips i { width: 16px; height: 6px; border-radius: 3px; border: 1px solid; }
.jr-course .sub { font-size: 11.5px; color: #6b6f78; }
.jr-week { display: grid; grid-template-columns: 40px 1fr 1fr; gap: 4px 8px; font-size: 12.5px; }
.jr-week .hd { font: 400 12px var(--label); letter-spacing: 0.1em; text-transform: uppercase; color: #6b6f78; align-self: center; }
.jr-week .slot { padding: 4px 8px; border-left: 4px solid; border-radius: 6px; background: #fff; }
.jr-week .slot em { font-style: normal; color: #6b6f78; margin-left: 6px; font-size: 11.5px; }
.yb-loading { padding: 40px 0; text-align: center; color: #6b6f78; font: 400 14px var(--label); letter-spacing: 0.12em; text-transform: uppercase; }
.yb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; }
.yb-card { padding: 8px 8px 10px; background: #fff; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); transform: rotate(-0.6deg); }
.yb-card:nth-child(2n) { transform: rotate(0.7deg); }
.yb-photo { position: relative; aspect-ratio: 240 / 280; border-radius: 3px; overflow: hidden; background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--tint) 35%, #fff), color-mix(in srgb, var(--tint) 70%, #1b1f2a)); }
.yb-photo img { position: absolute; inset: 0; width: 100%; height: 100%; }
.yb-card.locked .yb-photo img { opacity: 0.55; }
.yb-q { position: absolute; inset: 0; display: grid; place-items: center; font: 400 44px var(--display); color: rgba(255,255,255,0.9); }
.yb-name { margin-top: 7px; font: 400 18px/1.1 var(--display); letter-spacing: 0.04em; }
.yb-card.locked .yb-name { color: #8c8a84; }
.yb-role { margin-top: 3px; font-size: 11.5px; line-height: 1.35; color: #4a4f5a; }
.yb-card.locked .yb-role { color: #8c8a84; display: flex; gap: 4px; align-items: flex-start; }
.yb-met { margin-top: 5px; font: 400 11px var(--label); letter-spacing: 0.1em; text-transform: uppercase; color: #8a5a00; }
@media (max-width: 720px) { .jr-tiles { grid-template-columns: repeat(2, 1fr); } .jr-cols { grid-template-columns: 1fr; } }

/* Speech bubbles over the crowd */
#bubbles .bubble { position: absolute; left: 0; top: 0; max-width: 230px; padding: 6px 10px; font-size: 12.5px; line-height: 1.35; background: #fff; color: var(--ink); border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.22); white-space: normal; will-change: transform; }
#bubbles .bubble::after { content: ""; position: absolute; left: 50%; bottom: -7px; border: 7px solid transparent; border-bottom: 0; border-top-color: #fff; transform: translateX(-50%); }

/* Title screen */
#titlecard { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: radial-gradient(ellipse at 50% 30%, rgba(31,51,84,0.82), rgba(8,11,17,0.94) 70%); pointer-events: auto; color: var(--text); text-align: center; padding: 20px; }
#titlecard.on { display: flex; }
#titlecard h1 { margin: 0; font: 400 clamp(56px, 11vw, 132px)/0.9 var(--display); letter-spacing: 0.04em; color: var(--text); }
#titlecard h1 em { font-style: normal; color: var(--gold); }
#titlecard p { margin: 0; max-width: 580px; font-size: 15px; line-height: 1.6; color: var(--muted); }
#titlecard .mode { display: flex; flex-direction: column; gap: 10px; align-items: center; padding: 18px 22px 20px; min-width: 250px; max-width: 280px; background: var(--glass); border: 1px solid var(--line); border-radius: 16px; }
#titlecard .mode .name { font: 400 26px var(--display); letter-spacing: 0.08em; }
#titlecard .mode .sub { font-size: 13px; line-height: 1.5; color: var(--muted); }
#titlecard button { font: 400 16px var(--label); letter-spacing: 0.14em; text-transform: uppercase; padding: 10px 24px; border: 0; border-radius: 999px; background: var(--gold); color: var(--ink); cursor: pointer; transition: transform 0.15s, background 0.15s; }
#titlecard button:hover { transform: translateY(-1px); background: #ffcb66; }
#titlecard button.ghost { background: transparent; color: var(--text); border: 1px solid var(--line-strong); font-size: 13px; padding: 7px 16px; }
#titlecard .hint { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; font-size: 12px; color: var(--muted); }
#titlecard .hint span { display: inline-flex; align-items: center; gap: 5px; }
body.talking #help, body.talking #controls { display: none; }
body.titling #title, body.titling #clock, body.titling #minimap-wrap, body.titling #help, body.titling #controls, body.titling #stats, body.titling #fps { visibility: hidden; }
@media (max-width: 700px) { #prompt { bottom: 380px; } #stats { top: 72px; width: 190px; } #tracker { top: 196px; width: 220px; } #toasts { top: 150px; } #dialogue .txt { font-size: 16px; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, id?: string, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export type StatsView = { clock: string; date: string; money: number; energy: number; food: number; attendance: number; next?: string };

export class GameUI {
  readonly root: HTMLDivElement;
  private stats: HTMLDivElement;
  private tracker: HTMLDivElement;
  private prompt: HTMLDivElement;
  private dialogue: HTMLDivElement;
  private banner: HTMLDivElement;
  private toasts: HTMLDivElement;
  private fade: HTMLDivElement;
  private overlay: HTMLDivElement;
  readonly bubbles: HTMLDivElement;
  private titlecard: HTMLDivElement;
  private bannerTimer = 0;
  /** Set while a dialogue/overlay holds the controls. */
  busy = false;
  /** When the last dialogue/overlay closed (ms), so the closing key press doesn't re-trigger an interaction. */
  lastClosed = 0;
  private advance: (() => void) | null = null;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el("div", "game-ui", undefined, document.body);
    this.bubbles = el("div", "bubbles", undefined, this.root);
    this.stats = el("div", "stats", "plate", this.root);
    this.tracker = el("div", "tracker", "plate", this.root);
    this.prompt = el("div", "prompt", "plate", this.root);
    this.toasts = el("div", "toasts", undefined, this.root);
    this.banner = el("div", "banner", undefined, this.root);
    this.dialogue = el("div", "dialogue", "plate", this.root);
    this.overlay = el("div", "overlay", undefined, this.root);
    this.fade = el("div", "fade", undefined, this.root);
    this.titlecard = el("div", "titlecard", undefined, this.root);
    window.addEventListener("keydown", (e) => {
      if (!this.advance) return;
      if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        this.advance();
      }
    });
    this.dialogue.addEventListener("click", () => this.advance?.());
  }

  showStats(on: boolean) {
    this.stats.style.display = on ? "block" : "none";
  }

  setStats(s: StatsView) {
    if (this.stats.style.display === "none") return;
    const row = (label: string, v: number, c: string) =>
      `<div class="row"><span class="lbl">${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div><span class="val">${Math.round(v)}</span></div>`;
    const att = s.attendance;
    const html = `
      <div class="head"><span class="cap">Wallet</span><span class="money">₹${Math.round(s.money)}</span></div>
      ${row("Energy", s.energy, s.energy < 20 ? "var(--red)" : "var(--gold)")}
      ${row("Food", s.food, s.food < 20 ? "var(--red)" : "var(--teal)")}
      ${row("Attendance", att, att < 75 ? "var(--red)" : "var(--blue)")}
      ${s.next ? `<div class="next${s.next.startsWith("Now:") ? " now" : ""}">${s.next}</div>` : ""}`;
    if (this.stats.innerHTML !== html) this.stats.innerHTML = html;
  }

  setObjective(title: string | null, objective = "", timer?: number) {
    if (!title) {
      this.tracker.classList.remove("on");
      return;
    }
    this.tracker.classList.add("on");
    const t = timer !== undefined ? `<div class="timer">${Math.floor(timer / 60)}:${String(Math.floor(timer % 60)).padStart(2, "0")}</div>` : "";
    const html = `<div class="t">${title}</div><div class="o">${objective}</div>${t}`;
    if (this.tracker.innerHTML !== html) this.tracker.innerHTML = html;
  }

  setPrompt(text: string | null, key = "E") {
    if (!text || this.busy) {
      this.prompt.style.display = "none";
      return;
    }
    this.prompt.style.display = "flex";
    const html = `<kbd>${key}</kbd>${text}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  /** A short note in the corner; `colour` is its accent rule. */
  toast(text: string, colour = "#f2b84b") {
    const t = el("div", undefined, "toast plate", this.toasts);
    // Callers pass the old paper-UI colours; the darkest ones vanish on glass, so they turn gold.
    const n = parseInt(colour.replace("#", ""), 16);
    const lum = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
    t.style.setProperty("--accent", Number.isNaN(n) || lum < 70 ? "#f2b84b" : colour);
    t.textContent = text;
    setTimeout(() => t.classList.add("out"), 3000);
    setTimeout(() => t.remove(), 3400);
  }

  showBanner(big: string, small = "", kind: "pass" | "fail" | "chapter" | "start" = "pass", ms = 3200) {
    this.banner.innerHTML = `<div class="band"><div class="big ${kind === "pass" ? "" : kind}">${big}</div>${small ? `<div class="small">${small}</div>` : ""}<div class="rule"></div></div>`;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove("show"), ms);
  }

  /** Lines are [speaker, text]. Resolves when the last line is dismissed. */
  say(lines: [string, string][]): Promise<void> {
    return new Promise((resolve) => {
      this.busy = true;
      document.body.classList.add("talking");
      this.setPrompt(null);
      let i = 0;
      let typing: number | undefined;
      let full = "";
      const txt = el("div", undefined, "txt");
      const who = el("div", undefined, "who");
      const more = el("div", undefined, "more");
      this.dialogue.replaceChildren(who, txt, more);
      this.dialogue.style.display = "block";
      const show = () => {
        const [speaker, text] = lines[i];
        who.textContent = speaker;
        who.style.display = speaker ? "block" : "none";
        full = text;
        let n = 0;
        txt.textContent = "";
        more.innerHTML = `<kbd>E</kbd> ${i < lines.length - 1 ? "Next" : "Done"}`;
        clearInterval(typing);
        typing = window.setInterval(() => {
          n += 2;
          txt.textContent = full.slice(0, n);
          if (n >= full.length) clearInterval(typing);
        }, 16);
        sfx.blip();
      };
      this.advance = () => {
        if (txt.textContent !== full) {
          clearInterval(typing);
          txt.textContent = full;
          return;
        }
        i++;
        if (i >= lines.length) {
          clearInterval(typing);
          this.dialogue.style.display = "none";
          this.advance = null;
          this.busy = false;
          this.lastClosed = performance.now();
          document.body.classList.remove("talking");
          resolve();
          return;
        }
        show();
      };
      show();
    });
  }

  /** A question with options, answered by click or number keys. */
  choose(speaker: string, question: string, options: string[]): Promise<number> {
    return new Promise((resolve) => {
      this.busy = true;
      document.body.classList.add("talking");
      this.setPrompt(null);
      const who = el("div", undefined, "who");
      who.textContent = speaker;
      who.style.display = speaker ? "block" : "none";
      const txt = el("div", undefined, "txt");
      txt.textContent = question;
      const box = el("div", undefined, "choices");
      const done = (k: number) => {
        window.removeEventListener("keydown", onKey);
        this.dialogue.style.display = "none";
        this.busy = false;
        this.lastClosed = performance.now();
        document.body.classList.remove("talking");
        sfx.blip();
        resolve(k);
      };
      const onKey = (e: KeyboardEvent) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= options.length) done(n - 1);
      };
      options.forEach((o, k) => {
        const b = el("button", undefined, undefined, box);
        const key = el("kbd", undefined, undefined, b);
        key.textContent = String(k + 1);
        b.append(o);
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          done(k);
        });
      });
      window.addEventListener("keydown", onKey);
      this.dialogue.replaceChildren(who, txt, box);
      this.dialogue.style.display = "block";
    });
  }

  async fadeOut(ms = 600) {
    this.fade.style.transition = `opacity ${ms}ms`;
    this.fade.style.opacity = "1";
    await new Promise((r) => setTimeout(r, ms));
  }

  async fadeIn(ms = 600) {
    this.fade.style.transition = `opacity ${ms}ms`;
    this.fade.style.opacity = "0";
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Multiple-choice quiz. Resolves with the number answered correctly. */
  quiz(title: string, questions: { q: string; options: string[]; answer: number; code?: string }[]): Promise<number> {
    return new Promise((resolve) => {
      this.busy = true;
      this.overlay.classList.add("on");
      let i = 0;
      let right = 0;
      const card = el("div", undefined, "card plate");
      this.overlay.replaceChildren(card);
      const show = () => {
        const q = questions[i];
        card.innerHTML = `<h2>${title}</h2><div style="font-size:12px">Question ${i + 1} of ${questions.length}</div><div class="q"></div><div class="opts"></div>`;
        card.querySelector(".q")!.textContent = q.q;
        if (q.code) {
          // Code to read (C output tracing and the like), monospaced and unwrapped.
          const pre = el("pre", undefined, undefined);
          pre.style.cssText = "background:#11151c;color:#d7e0ea;padding:8px 10px;border-radius:6px;font:13px/1.45 ui-monospace,Menlo,monospace;overflow:auto;margin:6px 0";
          pre.textContent = q.code;
          card.querySelector(".q")!.after(pre);
        }
        const opts = card.querySelector(".opts")!;
        let answered = false;
        const pick = (k: number, buttons: HTMLButtonElement[]) => {
          if (answered) return;
          answered = true;
          window.removeEventListener("keydown", onKey);
          buttons[q.answer].classList.add("right");
          if (k === q.answer) {
            right++;
            sfx.coin();
          } else {
            buttons[k].classList.add("wrong");
            sfx.missionFailed();
          }
          setTimeout(() => {
            i++;
            if (i < questions.length) show();
            else {
              this.overlay.classList.remove("on");
              this.busy = false;
              resolve(right);
            }
          }, 900);
        };
        const buttons = q.options.map((o, k) => {
          const b = el("button", undefined, undefined, opts as HTMLElement);
          b.textContent = `${k + 1}. ${o}`;
          b.addEventListener("click", () => pick(k, buttons));
          return b;
        });
        const onKey = (e: KeyboardEvent) => {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= buttons.length) pick(n - 1, buttons);
        };
        window.addEventListener("keydown", onKey);
      };
      show();
    });
  }

  /**
   * The IRIS password minigame: type a password that satisfies rules which
   * appear one at a time, against the clock. Resolves true on success.
   */
  passwordGame(rules: { text: string; test: (s: string) => boolean }[], seconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      this.busy = true;
      this.overlay.classList.add("on");
      const card = el("div", undefined, "card plate");
      card.innerHTML = `<h2>IRIS — set your password</h2><div style="font-size:12px">New rules appear as you satisfy the old ones. Enter to submit.</div><div class="timer" style="font-size:20px;font-weight:800;color:#c0392b;margin-top:6px"></div><input autocomplete="off" spellcheck="false" /><div class="rules"></div>`;
      this.overlay.replaceChildren(card);
      const input = card.querySelector("input")!;
      const rulesEl = card.querySelector(".rules")!;
      const timerEl = card.querySelector(".timer")!;
      let shown = 1;
      let left = seconds;
      const render = () => {
        const v = input.value;
        let allOk = true;
        rulesEl.innerHTML = "";
        for (let k = 0; k < shown; k++) {
          const ok = rules[k].test(v);
          allOk &&= ok;
          const d = el("div", undefined, ok ? "ok" : "bad", rulesEl as HTMLElement);
          d.textContent = `${ok ? "✓" : "✗"} ${rules[k].text}`;
        }
        if (allOk && shown < rules.length) {
          shown++;
          sfx.blip();
          render();
        }
        return allOk && shown === rules.length;
      };
      const finish = (ok: boolean) => {
        clearInterval(tick);
        this.overlay.classList.remove("on");
        this.busy = false;
        resolve(ok);
      };
      const tick = window.setInterval(() => {
        left -= 1;
        timerEl.textContent = `${left}s`;
        if (left <= 0) finish(false);
      }, 1000);
      timerEl.textContent = `${left}s`;
      input.addEventListener("input", render);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && render()) finish(true);
      });
      render();
      // Swallow the key press that closed the last dialogue line.
      input.readOnly = true;
      setTimeout(() => {
        input.value = "";
        input.readOnly = false;
        input.focus();
        render();
      }, 350);
    });
  }

  /** A blank overlay card for minigames; call closeOverlay() when done. */
  openOverlay(width = 560): HTMLDivElement {
    this.busy = true;
    document.body.classList.add("talking");
    this.overlay.classList.add("on");
    const card = el("div", undefined, "card plate");
    card.style.width = `min(${width}px, calc(100vw - 32px))`;
    this.overlay.replaceChildren(card);
    return card;
  }

  closeOverlay() {
    this.overlay.classList.remove("on");
    this.overlay.replaceChildren();
    this.busy = false;
    this.lastClosed = performance.now();
    document.body.classList.remove("talking");
  }

  titleCard(opts: { title: string; blurb: string; hasSave: boolean; story: boolean }): Promise<"new" | "continue" | "explore"> {
    return new Promise((resolve) => {
      this.titlecard.classList.add("on");
      document.body.classList.add("titling");
      // "NITK: FRESHER YEAR" -> NITK in the text colour, the rest in gold.
      const [first, ...rest] = opts.title.split(":");
      this.titlecard.innerHTML = `<div class="cap">National Institute of Technology Karnataka, Surathkal</div><h1>${rest.length ? `${first}<br><em>${rest.join(":").trim()}</em>` : first}</h1><p>${opts.blurb}</p>`;
      const row = el("div", undefined, undefined, this.titlecard);
      row.style.cssText = "display:flex;gap:14px;flex-wrap:wrap;justify-content:center";
      const go = (v: "new" | "continue" | "explore") => {
        this.titlecard.classList.remove("on");
        document.body.classList.remove("titling");
        resolve(v);
      };
      const mode = (title: string, sub: string) => {
        const box = el("div", undefined, undefined, row);
        box.className = "mode";
        const h = el("div", undefined, undefined, box);
        h.className = "name";
        h.textContent = title;
        const p = el("div", undefined, undefined, box);
        p.className = "sub";
        p.textContent = sub;
        return box;
      };
      if (opts.story) {
        const story = mode("STORY MODE", "Your fresher year at NITK: missions, classes, clubs, chapters.");
        if (opts.hasSave) {
          const c = el("button", undefined, undefined, story);
          c.textContent = "Continue";
          c.addEventListener("click", () => go("continue"));
          const n = el("button", undefined, "ghost", story);
          n.textContent = "New game";
          n.addEventListener("click", () => go("new"));
        } else {
          const b = el("button", undefined, undefined, story);
          b.textContent = "Start Fresher Year";
          b.addEventListener("click", () => go("new"));
        }
      }
      const explore = mode("EXPLORE MODE", "Free roam the real campus. Walk into the library, the auditorium, the Mega Mess and more.");
      const e = el("button", undefined, undefined, explore);
      e.textContent = "Explore";
      e.addEventListener("click", () => go("explore"));
      const hint = el("div", undefined, "hint", this.titlecard);
      hint.innerHTML = [
        ["W A S D", "walk"],
        ["Shift", "run"],
        ["E", "interact"],
        ["J", "journal"],
        ["Y", "yearbook"],
        ["M", "map"],
        ["F", "drone"],
      ]
        .map(([k, what]) => `<span>${k.split(" ").map((x) => `<kbd>${x}</kbd>`).join("")} ${what}</span>`)
        .join("");
    });
  }
}
