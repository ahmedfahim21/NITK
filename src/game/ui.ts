/**
 * Game UI: banners for chapters and mission results, a lower-third dialogue,
 * an objective tracker with a timer, the status card, interaction prompts,
 * toasts, and paper cards for the journal, quizzes and minigames. Styled in
 * ui.css on the tokens in src/styles.css (dark glass HUD, one gold accent).
 */
import { sfx } from "./audio";
import "./ui.css";


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
