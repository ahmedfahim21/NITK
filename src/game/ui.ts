/**
 * Game UI in the Bully register: chunky outlined banners for chapters and
 * mission results, a dialogue box with a speaker plate, an objective tracker
 * with a timer, stat bars, interaction prompts, toasts, and overlays for
 * quizzes and the typing minigame.
 */
import { sfx } from "./audio";

const CSS = `
#game-ui { position: fixed; inset: 0; pointer-events: none; font-family: "Noto Sans", system-ui, sans-serif; }
#game-ui .plate { background: rgba(251,247,238,0.94); border: 2px solid #1b1f2a; border-radius: 10px; box-shadow: 3px 3px 0 rgba(27,31,42,0.85); }
#stats { position: absolute; top: 92px; left: 14px; padding: 8px 10px; width: 210px; font-size: 12px; }
#stats .row { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
#stats .lbl { width: 58px; font-weight: 700; }
#stats .bar { flex: 1; height: 8px; border: 1.5px solid #1b1f2a; border-radius: 4px; overflow: hidden; background: #fff; }
#stats .bar i { display: block; height: 100%; }
#stats .clock { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 4px; }
#stats .money { color: #1e6f5c; }
#tracker { position: absolute; top: 212px; left: 14px; width: 260px; padding: 8px 10px; display: none; }
#tracker.on { display: block; }
#tracker .t { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #b85c3e; font-weight: 700; }
#tracker .o { font-size: 14px; font-weight: 700; margin-top: 2px; }
#tracker .timer { font-size: 22px; font-weight: 800; color: #c0392b; margin-top: 2px; font-variant-numeric: tabular-nums; }
#prompt { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%); padding: 6px 12px; font-weight: 700; font-size: 14px; display: none; }
#prompt kbd { display: inline-block; min-width: 22px; padding: 0 6px; margin-right: 6px; border: 2px solid #1b1f2a; border-bottom-width: 4px; border-radius: 5px; background: #ffd23f; text-align: center; font-family: inherit; }
#dialogue { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(720px, calc(100vw - 32px)); padding: 14px 18px 12px; display: none; pointer-events: auto; }
#dialogue .who { position: absolute; top: -16px; left: 16px; padding: 2px 12px; background: #1d3557; color: #fff; font-weight: 800; border: 2px solid #1b1f2a; border-radius: 6px; font-size: 14px; }
#dialogue .txt { font-size: 17px; line-height: 1.45; min-height: 50px; }
#dialogue .more { text-align: right; font-size: 12px; opacity: 0.7; margin-top: 4px; }
#dialogue .choices { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
#dialogue .choices button { text-align: left; font: inherit; font-size: 15px; font-weight: 700; padding: 7px 10px; border: 2px solid #1b1f2a; border-radius: 7px; background: #fff; cursor: pointer; }
#dialogue .choices button:hover { background: #ffd23f; }
#banner { position: absolute; left: 0; right: 0; top: 30%; text-align: center; display: none; }
#banner .big { font-size: clamp(34px, 7vw, 78px); font-weight: 900; letter-spacing: 0.04em; color: #ffd23f; -webkit-text-stroke: 3px #1b1f2a; paint-order: stroke fill; text-shadow: 5px 5px 0 #1b1f2a; transform: rotate(-2deg); }
#banner .big.fail { color: #e74c3c; }
#banner .big.chapter { color: #fbf7ee; }
#banner .small { font-size: clamp(16px, 2.4vw, 24px); font-weight: 800; color: #fff; text-shadow: 2px 2px 0 #1b1f2a, -1px -1px 0 #1b1f2a; margin-top: 8px; }
#banner.show { display: block; animation: slam 0.35s cubic-bezier(.2,1.6,.4,1); }
@keyframes slam { from { transform: scale(1.8); opacity: 0; } to { transform: none; opacity: 1; } }
#toasts { position: absolute; right: 14px; top: 250px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
#toasts .toast { padding: 5px 10px; font-weight: 700; font-size: 13px; animation: toastIn 0.25s ease-out; }
@keyframes toastIn { from { transform: translateX(30px); opacity: 0; } }
#fade { position: absolute; inset: 0; background: #0e1320; opacity: 0; transition: opacity 0.6s; }
#overlay { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(14,19,32,0.55); pointer-events: auto; }
#overlay.on { display: flex; }
#overlay .card { width: min(560px, calc(100vw - 32px)); padding: 18px 20px; }
#overlay h2 { margin: 0 0 6px; font-size: 20px; }
#overlay .q { font-size: 17px; font-weight: 700; margin: 10px 0; }
#overlay .opts { display: flex; flex-direction: column; gap: 6px; }
#overlay .opts button { text-align: left; font: inherit; font-size: 15px; font-weight: 700; padding: 8px 10px; border: 2px solid #1b1f2a; border-radius: 7px; background: #fff; cursor: pointer; }
#overlay .opts button.right { background: #7bd389; }
#overlay .opts button.wrong { background: #f28b82; }
#overlay .typing { font-family: ui-monospace, Menlo, monospace; font-size: 22px; letter-spacing: 0.08em; margin: 10px 0; }
#overlay .typing .done { color: #1e6f5c; }
#overlay .typing .next { background: #ffd23f; }
#overlay input { font: inherit; font-size: 18px; padding: 6px 8px; width: 100%; border: 2px solid #1b1f2a; border-radius: 6px; }
#overlay .rules { font-size: 13px; margin: 6px 0; }
#overlay .rules div.ok { color: #1e6f5c; }
#overlay .rules div.bad { color: #c0392b; }
#bubbles .bubble { position: absolute; left: 0; top: 0; max-width: 220px; padding: 4px 8px; font-size: 12px; font-weight: 700; background: #fff; border: 2px solid #1b1f2a; border-radius: 10px; white-space: normal; will-change: transform; }
#bubbles .bubble::after { content: ""; position: absolute; left: 50%; bottom: -8px; border: 6px solid transparent; border-top-color: #1b1f2a; transform: translateX(-50%); }
#titlecard { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: radial-gradient(circle at 50% 40%, rgba(40,64,107,0.85), rgba(14,19,32,0.92)); pointer-events: auto; color: #fbf7ee; text-align: center; }
#titlecard.on { display: flex; }
#titlecard h1 { margin: 0; font-size: clamp(40px, 8vw, 90px); font-weight: 900; color: #ffd23f; -webkit-text-stroke: 3px #1b1f2a; paint-order: stroke fill; text-shadow: 6px 6px 0 #1b1f2a; transform: rotate(-3deg); }
#titlecard p { margin: 0; max-width: 560px; font-size: 15px; opacity: 0.9; }
#titlecard button { font: inherit; font-size: 18px; font-weight: 800; padding: 10px 22px; border: 3px solid #1b1f2a; border-radius: 10px; background: #ffd23f; cursor: pointer; box-shadow: 4px 4px 0 #1b1f2a; }
#titlecard button.ghost { background: #fbf7ee; font-size: 14px; padding: 6px 14px; }
body.talking #help, body.talking #controls { display: none; }
@media (max-width: 700px) { #stats { top: 70px; width: 170px; } #tracker { top: 180px; width: 200px; } }
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

  setStats(s: StatsView) {
    const bar = (v: number, c: string) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div>`;
    const att = s.attendance;
    this.stats.innerHTML = `
      <div class="clock"><span>${s.clock}</span><span class="money">₹${Math.round(s.money)}</span></div>
      <div class="row"><span class="lbl">Energy</span>${bar(s.energy, s.energy < 20 ? "#e74c3c" : "#f5b400")}</div>
      <div class="row"><span class="lbl">Food</span>${bar(s.food, s.food < 20 ? "#e74c3c" : "#6ab04c")}</div>
      <div class="row"><span class="lbl">Attend.</span>${bar(att, att < 75 ? "#e74c3c" : "#3867d6")}<b style="width:34px;text-align:right">${Math.round(att)}%</b></div>
      ${s.next ? `<div style="margin-top:4px;font-size:11px">${s.next}</div>` : ""}`;
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
    this.prompt.style.display = "block";
    const html = `<kbd>${key}</kbd>${text}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  toast(text: string, colour = "#1b1f2a") {
    const t = el("div", undefined, "toast plate", this.toasts);
    t.style.color = colour;
    t.textContent = text;
    setTimeout(() => t.remove(), 3200);
  }

  showBanner(big: string, small = "", kind: "pass" | "fail" | "chapter" | "start" = "pass", ms = 3200) {
    this.banner.innerHTML = `<div class="big ${kind === "fail" ? "fail" : kind === "chapter" ? "chapter" : ""}">${big}</div>${small ? `<div class="small">${small}</div>` : ""}`;
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
        more.textContent = i < lines.length - 1 ? "E / Space ▸" : "E / Space ✓";
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
        b.textContent = `${k + 1}. ${o}`;
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
  quiz(title: string, questions: { q: string; options: string[]; answer: number }[]): Promise<number> {
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

  titleCard(opts: { title: string; blurb: string; hasSave: boolean }): Promise<"new" | "continue"> {
    return new Promise((resolve) => {
      this.titlecard.classList.add("on");
      this.titlecard.innerHTML = `<h1>${opts.title}</h1><p>${opts.blurb}</p>`;
      const row = el("div", undefined, undefined, this.titlecard);
      row.style.display = "flex";
      row.style.gap = "10px";
      const go = (v: "new" | "continue") => {
        this.titlecard.classList.remove("on");
        resolve(v);
      };
      if (opts.hasSave) {
        const c = el("button", undefined, undefined, row);
        c.textContent = "Continue";
        c.addEventListener("click", () => go("continue"));
        const n = el("button", undefined, "ghost", row);
        n.textContent = "New game";
        n.addEventListener("click", () => go("new"));
      } else {
        const b = el("button", undefined, undefined, row);
        b.textContent = "Start Fresher Year";
        b.addEventListener("click", () => go("new"));
      }
      const hint = el("p", undefined, undefined, this.titlecard);
      hint.style.fontSize = "12px";
      hint.textContent = "WASD walk · Shift run · E interact · M map · F drone · B cycle bell";
    });
  }
}
