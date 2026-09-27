/**
 * Chapter 2's minigames, drawn in the overlay card: a penalty shootout,
 * a Linux terminal, and naming constellations in the August sky.
 */
import type { GameUI } from "./ui";
import { sfx } from "./audio";

/** Automated playtests (`?bot`) get deterministic minigames. */
const BOT = typeof location !== "undefined" && new URLSearchParams(location.search).has("bot");

/* ------------------------------------------------------------------ *
 * Penalty shootout: lock the aim, then the power. The keeper guesses.
 * ------------------------------------------------------------------ */

export function penalties(ui: GameUI, kicks = 5): Promise<number> {
  return new Promise((resolve) => {
    const card = ui.openOverlay(640);
    card.innerHTML = `<h2>Freshers Cup — penalty shootout</h2>
      <div style="font-size:13px">Space (or click) to lock <b>aim</b>, again to lock <b>power</b>. Aim for the corners; too much power sails over.</div>
      <canvas width="600" height="330" style="width:100%;margin-top:8px;border:2px solid #1b1f2a;border-radius:8px;background:#6fb44d;cursor:pointer"></canvas>
      <div class="score" style="font-weight:800;font-size:18px;margin-top:6px"></div>`;
    const cv = card.querySelector("canvas")!;
    const ctx = cv.getContext("2d")!;
    const scoreEl = card.querySelector(".score") as HTMLDivElement;
    const W = 600;
    const H = 330;
    const goal = { x: 150, y: 50, w: 300, h: 120 };
    let phase: "aim" | "power" | "shot" = "aim";
    let t = 0;
    let aim = 0;
    let power = 0;
    let kick = 0;
    let goals = 0;
    const results: boolean[] = [];
    let keeperX = 0.5;
    let keeperDive = 0.5;
    let ball = { x: W / 2, y: 290, tx: W / 2, ty: 110, k: 0 };
    let verdict = "";
    let raf = 0;
    let last = performance.now();

    const draw = () => {
      ctx.fillStyle = "#6fb44d";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "#6aae48" : "#74ba52";
        ctx.fillRect(0, 170 + i * 20, W, 20);
      }
      // Goal.
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      for (let x = goal.x; x < goal.x + goal.w; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, goal.y);
        ctx.lineTo(x, goal.y + goal.h);
        ctx.stroke();
      }
      // Keeper.
      const kx = goal.x + keeperX * goal.w;
      ctx.fillStyle = "#e67e22";
      ctx.fillRect(kx - 18, goal.y + 45, 36, 60);
      ctx.fillStyle = "#8d5524";
      ctx.beginPath();
      ctx.arc(kx, goal.y + 35, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e67e22";
      ctx.fillRect(kx - 40, goal.y + 50, 80, 10);
      // Aim marker and power bar.
      if (phase === "aim") {
        const ax = goal.x - 40 + aim * (goal.w + 80);
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ax, goal.y + 70, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (phase === "power") {
        ctx.fillStyle = "#1b1f2a";
        ctx.fillRect(540, 190, 30, 120);
        const hue = power < 0.75 ? "#7bd389" : "#e74c3c";
        ctx.fillStyle = hue;
        ctx.fillRect(543, 307 - power * 114, 24, power * 114);
        ctx.strokeStyle = "#ffd23f";
        ctx.strokeRect(540, 307 - 0.75 * 114, 30, 2);
      }
      // Ball.
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 10 - ball.k * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1b1f2a";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (verdict) {
        ctx.font = "900 44px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#1b1f2a";
        ctx.strokeText(verdict, W / 2, 230);
        ctx.fillStyle = verdict === "GOAL!" ? "#ffd23f" : "#fff";
        ctx.fillText(verdict, W / 2, 230);
      }
    };

    const status = () => {
      scoreEl.textContent = `Kick ${Math.min(kick + 1, kicks)} of ${kicks} · Goals ${goals}  ${results.map((r) => (r ? "⚽" : "✗")).join(" ")}`;
    };

    const press = () => {
      if (phase === "aim") {
        phase = "power";
        t = 0;
      } else if (phase === "power") {
        phase = "shot";
        const tx = goal.x - 40 + aim * (goal.w + 80);
        const over = power > 0.78;
        const ty = over ? goal.y - 40 : goal.y + 70 - power * 30;
        // The keeper guesses a side, and gets there if the shot is soft or central.
        keeperDive = Math.random() < 0.5 ? 0.18 : 0.82;
        if (Math.random() < 0.25) keeperDive = 0.5;
        const nx = (tx - goal.x) / goal.w;
        const reach = 0.16 + (1 - power) * 0.18;
        const inside = nx > 0.03 && nx < 0.97 && !over;
        const saved = inside && Math.abs(nx - keeperDive) < reach && !BOT;
        const scored = (inside && !saved) || BOT;
        verdict = over ? "OVER!" : !inside ? "WIDE!" : saved ? "SAVED!" : "GOAL!";
        ball = { x: W / 2, y: 290, tx, ty, k: 0 };
        results.push(scored);
        if (scored) {
          goals++;
          sfx.coin();
        } else sfx.missionFailed();
        verdict = "";
        setTimeout(() => {
          verdict = over ? "OVER!" : !inside ? "WIDE!" : saved ? "SAVED!" : "GOAL!";
        }, 450);
        setTimeout(() => {
          kick++;
          verdict = "";
          status();
          if (kick >= kicks) {
            cancelAnimationFrame(raf);
            window.removeEventListener("keydown", onKey);
            ui.closeOverlay();
            resolve(goals);
            return;
          }
          phase = "aim";
          keeperX = 0.5;
          ball = { x: W / 2, y: 290, tx: W / 2, ty: 110, k: 0 };
        }, 1600);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener("keydown", onKey);
    cv.addEventListener("click", press);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (phase === "aim") aim = 0.5 + 0.5 * Math.sin(t * 2.6 + kick);
      if (phase === "power") power = Math.abs(Math.sin(t * 2.2));
      if (phase === "shot") {
        ball.k = Math.min(1, ball.k + dt * 3);
        ball.x = W / 2 + (ball.tx - W / 2) * ball.k;
        ball.y = 290 + (ball.ty - 290) * ball.k;
        keeperX += (keeperDive - keeperX) * Math.min(1, dt * 6);
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    status();
    raf = requestAnimationFrame(loop);
  });
}

/* ------------------------------------------------------------------ *
 * The Linux terminal: fix Rohan's Wi-Fi, one command at a time.
 * ------------------------------------------------------------------ */

type Step = { task: string; hint: string; ok: RegExp; reply: string };

const STEPS: Step[] = [
  { task: "See which network interfaces exist.", hint: "ip a", ok: /^(ip (a|addr|link)( show)?|ifconfig( -a)?|nmcli( device)?( status)?)$/, reply: "2: wlp2s0: <BROADCAST,MULTICAST> state DOWN   ← there's your problem" },
  { task: "Bring the Wi-Fi interface wlp2s0 up.", hint: "sudo ip link set wlp2s0 up", ok: /^sudo (ip link set (dev )?wlp2s0 up|ifconfig wlp2s0 up|nmcli radio wifi on)$/, reply: "[sudo] password for rohan: ********\nwlp2s0: state UP" },
  { task: "Connect to the hostel network NITK-NET.", hint: "nmcli device wifi connect NITK-NET", ok: /^(sudo )?nmcli (d(ev(ice)?)? )?wifi connect ["']?NITK-NET["']?( password \S+)?$/i, reply: "Device 'wlp2s0' successfully activated. (Signal: 2 bars. It's a hostel.)" },
  { task: "Update the package lists.", hint: "sudo apt update", ok: /^sudo apt(-get)? update$/, reply: "Hit:1 http://archive.ubuntu.com … Reading package lists… Done" },
  { task: "Install an editor. Sid insists on vim.", hint: "sudo apt install vim", ok: /^sudo apt(-get)? install (-y )?(vim|neovim|emacs|nano)$/, reply: "Setting up vim … done.   (Sid nods approvingly. Or disapprovingly, if you chose nano.)" },
  { task: "Rohan opened vim by accident. Get him out.", hint: ":q!", ok: /^:(q!?|wq!?|x|qa!?)$/, reply: "…He's free. Rohan weeps openly." },
];

export function terminal(ui: GameUI, seconds = 180): Promise<boolean> {
  return new Promise((resolve) => {
    const card = ui.openOverlay(680);
    card.style.background = "#11151c";
    card.style.color = "#d7e0ea";
    card.innerHTML = `<h2 style="color:#7bd389;font-family:ui-monospace,Menlo,monospace">rohan@karavali-112: ~</h2>
      <div style="font-size:12px;opacity:.8">Type commands and press Enter. <b>Tab</b> shows a hint (costs 15 s).</div>
      <div class="timer" style="font-weight:800;color:#ff7b72;margin:4px 0"></div>
      <pre class="log" style="height:230px;overflow:auto;background:#0b0e13;padding:8px;border-radius:6px;font-size:13px;white-space:pre-wrap;margin:6px 0"></pre>
      <div style="display:flex;gap:6px;align-items:center;font-family:ui-monospace,Menlo,monospace"><span style="color:#7bd389">$</span><input style="flex:1;background:#0b0e13;color:#d7e0ea;border:1px solid #3a4250;font-family:ui-monospace,Menlo,monospace" autocomplete="off" spellcheck="false"/></div>`;
    const log = card.querySelector(".log") as HTMLPreElement;
    const input = card.querySelector("input") as HTMLInputElement;
    const timer = card.querySelector(".timer") as HTMLDivElement;
    let i = 0;
    let left = seconds;
    const print = (s: string, colour = "#d7e0ea") => {
      const span = document.createElement("span");
      span.style.color = colour;
      span.textContent = s + "\n";
      log.appendChild(span);
      log.scrollTop = log.scrollHeight;
    };
    const task = () => print(`# TODO: ${STEPS[i].task}`, "#e3b341");
    print("Rohan: 'I dual-booted to look cool and now the Wi-Fi is dead. Assignment due at midnight. HELP.'", "#8b949e");
    task();
    const finish = (ok: boolean) => {
      clearInterval(tick);
      setTimeout(() => {
        ui.closeOverlay();
        resolve(ok);
      }, ok ? 1400 : 600);
    };
    const tick = window.setInterval(() => {
      left--;
      timer.textContent = `Deadline: ${left}s`;
      if (left <= 0) {
        print("Rohan: 'Forget it. I'm submitting from the library.'", "#ff7b72");
        finish(false);
      }
    }, 1000);
    timer.textContent = `Deadline: ${left}s`;
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Tab") {
        e.preventDefault();
        left -= 15;
        print(`hint: try \`${STEPS[i].hint}\``, "#8b949e");
        return;
      }
      if (e.key !== "Enter") return;
      const cmd = input.value.trim();
      input.value = "";
      if (!cmd) return;
      print(`$ ${cmd}`, "#7bd389");
      if (STEPS[i].ok.test(cmd)) {
        print(STEPS[i].reply);
        sfx.blip();
        i++;
        if (i >= STEPS.length) {
          print("✓ All done. Sid: 'Welcome to the Linux Users Group.'", "#7bd389");
          sfx.coin();
          finish(true);
        } else task();
      } else if (/^sudo rm -rf/.test(cmd)) {
        print("Sid slaps your hand away from the keyboard. 'NO.'", "#ff7b72");
      } else if (/^(exit|quit)$/.test(cmd)) {
        print("Nice try. The Wi-Fi's still dead.", "#ff7b72");
      } else {
        print(`${cmd.split(" ")[0]}: that didn't help.`, "#ff7b72");
      }
    });
    // Swallow the key press that closed the last dialogue line.
    input.readOnly = true;
    setTimeout(() => {
      input.value = "";
      input.readOnly = false;
      input.focus();
    }, 350);
  });
}

/* ------------------------------------------------------------------ *
 * First Light: name the constellations in the August evening sky.
 * ------------------------------------------------------------------ */

type Constellation = { name: string; stars: [number, number][]; lines: [number, number][] };

const SKY: Constellation[] = [
  {
    name: "Saptarishi (Ursa Major's Big Dipper)",
    stars: [[0.12, 0.55], [0.3, 0.5], [0.45, 0.52], [0.58, 0.6], [0.62, 0.8], [0.84, 0.82], [0.88, 0.62]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    name: "Vrischika (Scorpius)",
    stars: [[0.2, 0.2], [0.26, 0.28], [0.32, 0.36], [0.4, 0.42], [0.48, 0.5], [0.52, 0.62], [0.54, 0.74], [0.62, 0.82], [0.72, 0.84], [0.8, 0.78], [0.84, 0.7], [0.16, 0.36], [0.26, 0.12]],
    lines: [[1, 0], [1, 11], [1, 12], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]],
  },
  {
    name: "Cassiopeia",
    stars: [[0.1, 0.4], [0.3, 0.65], [0.5, 0.45], [0.7, 0.68], [0.9, 0.38]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    name: "Cygnus (the Northern Cross)",
    stars: [[0.5, 0.1], [0.5, 0.32], [0.5, 0.52], [0.5, 0.9], [0.2, 0.42], [0.8, 0.4]],
    lines: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]],
  },
  {
    name: "Dhanu (Sagittarius, the Teapot)",
    stars: [[0.2, 0.5], [0.35, 0.35], [0.5, 0.3], [0.62, 0.42], [0.78, 0.35], [0.8, 0.6], [0.62, 0.7], [0.4, 0.68]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 1], [3, 4], [4, 5], [5, 6], [6, 3], [6, 7], [7, 0]],
  },
];

export function stargazing(ui: GameUI, rounds = 4): Promise<number> {
  return new Promise((resolve) => {
    const card = ui.openOverlay(620);
    card.style.background = "#0c1230";
    card.style.color = "#e8eeff";
    const order = [...SKY].sort(() => Math.random() - 0.5).slice(0, rounds);
    let r = 0;
    let right = 0;
    const show = () => {
      const c = order[r];
      card.innerHTML = `<h2 style="color:#ffd23f">First Light</h2>
        <div style="font-size:13px;opacity:.85">Meera's laser pointer traces a pattern in the sky over the Arabian Sea. What is it?</div>
        <canvas width="560" height="300" style="width:100%;margin:8px 0;border-radius:8px;background:radial-gradient(circle at 50% 120%, #1c2a55, #070b1f)"></canvas>
        <div class="opts" style="display:flex;flex-direction:column;gap:6px"></div>`;
      const cv = card.querySelector("canvas")!;
      const ctx = cv.getContext("2d")!;
      for (let k = 0; k < 140; k++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * 560, Math.random() * 300, 1.5, 1.5);
      }
      const P = ([x, y]: [number, number]) => [40 + x * 480, 20 + y * 260] as const;
      let drawn = 0;
      const anim = window.setInterval(() => {
        if (drawn >= c.lines.length) {
          clearInterval(anim);
          return;
        }
        const [a, b] = c.lines[drawn++];
        ctx.strokeStyle = "rgba(123,211,137,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(...P(c.stars[a]));
        ctx.lineTo(...P(c.stars[b]));
        ctx.stroke();
      }, 160);
      for (const s of c.stars) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(...P(s), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const others = SKY.filter((o) => o !== c).sort(() => Math.random() - 0.5).slice(0, 2);
      const options = [c, ...others].sort(() => Math.random() - 0.5);
      const box = card.querySelector(".opts")!;
      let done = false;
      const buttons = options.map((o, k) => {
        const b = document.createElement("button");
        if (BOT && o === c) b.dataset.answer = "1";
        b.textContent = `${k + 1}. ${o.name}`;
        b.style.cssText = "text-align:left;font:inherit;font-weight:700;padding:8px 10px;border:2px solid #1b1f2a;border-radius:7px;background:#fff;cursor:pointer;color:#1b1f2a";
        b.addEventListener("click", () => pick(k));
        box.appendChild(b);
        return b;
      });
      const pick = (k: number) => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", onKey);
        const ok = options[k] === c;
        buttons[options.indexOf(c)].style.background = "#7bd389";
        if (!ok) buttons[k].style.background = "#f28b82";
        if (ok) {
          right++;
          sfx.coin();
        } else sfx.missionFailed();
        setTimeout(() => {
          clearInterval(anim);
          r++;
          if (r < order.length) show();
          else {
            ui.closeOverlay();
            resolve(right);
          }
        }, 1100);
      };
      const onKey = (e: KeyboardEvent) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= options.length) pick(n - 1);
      };
      window.addEventListener("keydown", onKey);
    };
    show();
  });
}
