/**
 * Your courses, Bully-style. You're a first-year Computer Science &
 * Engineering student in section S7, on NITK's real Semester I plan
 * (UG Curriculum 2025: CY110, CY111, MA110, CS110, CS111, WO110, CV110).
 *
 * Lectures meet in LHC-C and LHC-D, the C lab in the Central Computer
 * Centre, the chemistry lab in the Science Block (Chemistry and Physics). Turn up in the
 * room when a class is on and press E: each course is its own minigame.
 * Pass one and the course levels up (to 5); every level unlocks a perk, the
 * way Bully's classes did.
 */
import type { Game } from "./index";
import type { GameState } from "./state";
import type { PlaceKey } from "./places";
import type { GameUI } from "./ui";
import { sfx } from "./audio";
import { hhmm } from "./util";

export type CourseId = "CS110" | "CS111" | "MA110" | "CY110" | "CY111" | "WO110" | "CV110";

export type Course = {
  id: CourseId;
  title: string;
  /** Lecture-Tutorial-Practical hours and credits, as in the curriculum. */
  ltp: string;
  prof: string;
  room: PlaceKey;
  roomName: string;
  game: "quiz" | "bugs" | "sprint" | "titration";
  /** What each level (1-5) gives you. */
  perks: [string, string, string, string, string];
};

export const COURSES: Record<CourseId, Course> = {
  CS110: {
    id: "CS110",
    title: "C Programming",
    ltp: "3-0-0 · 3 credits",
    prof: "Dr. Nayak",
    room: "lhcC",
    roomName: "LHC-C",
    game: "quiz",
    perks: ["Hello, World", "+20 s on terminal minigames", "Seniors pay you ₹100 a day to debug", "+20 s more on terminals", "₹200 a day in debugging gigs"],
  },
  CS111: {
    id: "CS111",
    title: "C Programming Lab",
    ltp: "0-0-3 · 2 credits",
    prof: "Ashwin (TA)",
    room: "labDesk",
    roomName: "Central Computer Centre",
    game: "bugs",
    perks: ["Lab record signed", "+20 s on terminal minigames", "Faster bug hunts", "+₹50 a day fixing lab PCs", "The TA lets you skip viva"],
  },
  MA110: {
    id: "MA110",
    title: "Engineering Mathematics – I",
    ltp: "3-0-0 · 3 credits",
    prof: "Dr. Bhat",
    room: "lhcD",
    roomName: "LHC-D",
    game: "sprint",
    perks: ["Energy drains 5% slower", "10% slower", "15% slower", "20% slower", "25% slower: you plan your day like a proof"],
  },
  CY110: {
    id: "CY110",
    title: "Chemistry",
    ltp: "3-0-0 · 3 credits",
    prof: "Dr. D'Souza",
    room: "lhcD",
    roomName: "LHC-D",
    game: "quiz",
    perks: ["Food fills you 5% more", "10% more", "15% more", "20% more", "25% more: you know exactly what's in the sambar"],
  },
  CY111: {
    id: "CY111",
    title: "Chemistry Laboratory",
    ltp: "0-0-3 · 2 credits",
    prof: "Shankar (lab attendant)",
    room: "scienceBlock",
    roomName: "Science Block",
    game: "titration",
    perks: ["Food fills you 5% more", "10% more", "15% more", "20% more", "25% more: titrate your chai to taste"],
  },
  WO110: {
    id: "WO110",
    title: "Engineering Mechanics",
    ltp: "3-0-0 · 3 credits",
    prof: "Prof. Hegde",
    room: "lhcC",
    roomName: "LHC-C",
    game: "quiz",
    perks: ["Cycle 4% faster (you oiled the chain)", "8% faster", "12% faster", "16% faster", "20% faster: free-body diagram of a racing roadster"],
  },
  CV110: {
    id: "CV110",
    title: "Environmental Studies",
    ltp: "1-0-0 · 1 credit",
    prof: "Dr. Kini",
    room: "lhcC",
    roomName: "LHC-C",
    game: "quiz",
    perks: ["Clubs respect +3", "Clubs respect +3", "Clubs respect +3", "Clubs respect +3", "Clubs respect +3: the NSS wants you"],
  },
};

/**
 * Section S7's week, Bully-style: a morning class at 9 and an afternoon
 * class (or lab) at 2, Monday (0) to Friday (4). Weekends are free.
 */
export const MORNING = 9 * 60;
export const AFTERNOON = 14 * 60;
export const TIMETABLE: [number, CourseId][][] = [
  [[MORNING, "MA110"], [AFTERNOON, "CS111"]],
  [[MORNING, "CS110"], [AFTERNOON, "CY111"]],
  [[MORNING, "WO110"], [AFTERNOON, "CV110"]],
  [[MORNING, "CY110"], [AFTERNOON, "CS111"]],
  [[MORNING, "MA110"], [AFTERNOON, "CS110"]],
];

/** Classes run once the first lecture ("Roll Call") has happened. */
export function classesStarted(st: GameState): boolean {
  return !!st.flags.classes;
}

export type Slot = { key: string; start: number; course: Course };

export function level(st: GameState, id: CourseId): number {
  return Number(st.flags[`lvl:${id}`] ?? 0);
}

function slotsToday(st: GameState): Slot[] {
  if (!classesStarted(st) || st.weekday >= 5) return [];
  return TIMETABLE[st.weekday].map(([start, id]) => ({ key: `${st.day}-${start}`, start, course: COURSES[id] }));
}

/** The class whose door is open right now (15 min before to 10 min after the start). */
export function classNow(st: GameState): Slot | null {
  return slotsToday(st).find((s) => st.minutes >= s.start - 15 && st.minutes <= s.start + 10) ?? null;
}

export function nextClassText(st: GameState): string {
  if (!classesStarted(st)) return "Classes haven't started yet.";
  if (st.weekday >= 5) return "Weekend. No classes.";
  const now = classNow(st);
  if (now && st.flags.attended !== now.key) return `Now: ${now.course.id} ${now.course.title}, ${now.course.roomName}`;
  const next = slotsToday(st).find((s) => s.start > st.minutes);
  if (!next) return "No more classes today.";
  return `Next: ${next.course.id} at ${hhmm(next.start)}, ${next.course.roomName}`;
}

/** Close attendance on class windows that have passed. Returns courses just missed. */
export function closeMissed(st: GameState): Course[] {
  const missed: Course[] = [];
  for (const s of slotsToday(st)) {
    if (st.minutes > s.start + 10 && st.minutes < s.start + 180 && st.flags[`held-${s.key}`] === undefined) {
      st.flags[`held-${s.key}`] = true;
      st.classesHeld++;
      if (st.flags.attended !== s.key) missed.push(s.course);
    }
  }
  return missed;
}

/* ---------------- perks ---------------- */

export const perks = {
  /** Cycle top-speed multiplier (Engineering Mechanics). */
  cycle: (st: GameState) => 1 + 0.04 * level(st, "WO110"),
  /** Energy and hunger drain multiplier (Maths). */
  drain: (st: GameState) => 1 - 0.05 * level(st, "MA110"),
  /** Food value multiplier (Chemistry and its lab). */
  food: (st: GameState) => 1 + 0.05 * (level(st, "CY110") + level(st, "CY111")),
  /** Extra seconds on terminal minigames (C and its lab). */
  terminal: (st: GameState) => (level(st, "CS110") >= 2 ? 20 : 0) + (level(st, "CS110") >= 4 ? 20 : 0) + (level(st, "CS111") >= 2 ? 20 : 0),
  /** Rupees a day from debugging gigs. */
  income: (st: GameState) => (level(st, "CS110") >= 3 ? 100 : 0) + (level(st, "CS110") >= 5 ? 100 : 0) + (level(st, "CS111") >= 4 ? 50 : 0),
};

/* ---------------- attending ---------------- */

const OPENERS: Record<CourseId, string[]> = {
  CS110: ["'Main returns int. It always returns int. Write that on your hand.'", "'Today: pointers. Half of you will leave this room confused. The other half will be wrong.'"],
  CS111: ["'Log in, open a terminal, and do NOT type rm -rf anything.'", "'The lab record is due at five. The lab closes at five. Think about that.'"],
  MA110: ["'Calculus is the study of change. Your attendance is the study of no change, please.'", "'Pens down. Mental maths first. Five questions. Go.'"],
  CY110: ["'Chemistry is everywhere. Especially in the mess sambar.'", "'Quiz first, then enthalpy. You will remember neither.'"],
  CY111: ["'Goggles. Coat. Phenolphthalein. If it goes deep pink you've gone too far, like my patience.'", "'Burette, pipette, conical flask. Faint pink, then STOP.'"],
  WO110: ["'Free-body diagram first. Always. Even for your breakfast.'", "'Everything is in equilibrium until the mid-sems.'"],
  CV110: ["'The Western Ghats catch the monsoon. This class catches you sleeping.'", "'One credit. Full attendance. Those are the rules.'"],
};

export async function attend(g: Game, slot: Slot): Promise<void> {
  const st = g.state;
  const c = slot.course;
  st.flags.attended = slot.key;
  st.classesAttended++;
  // Count it as held now too, so attendance never reads over 100%.
  if (st.flags[`held-${slot.key}`] === undefined) {
    st.flags[`held-${slot.key}`] = true;
    st.classesHeld++;
  }
  await g.ui.fadeOut(400);
  st.minutes = Math.max(st.minutes, slot.start + 5);
  await g.ui.fadeIn(400);
  const lv = level(st, c.id);
  const lines = OPENERS[c.id];
  await g.say([[c.prof, lines[(st.day + slot.start) % lines.length].replace(/^'|'$/g, "")]]);
  const passed = await play(g.ui, c, lv);
  // A class takes the morning or the afternoon: out at 11, or at 4.
  st.minutes = slot.start + 120;
  if (passed && lv < 5) {
    st.flags[`lvl:${c.id}`] = lv + 1;
    sfx.missionPassed();
    g.ui.showBanner(`${c.id} · LEVEL ${lv + 1}`, c.perks[lv], "pass", 3200);
    if (c.id === "CV110") g.rep("Clubs", 3);
    g.applyPerks();
  } else if (passed) {
    g.ui.toast(`${c.id}: full marks again. Top of the class.`, "#1e6f5c");
  } else {
    g.ui.toast(`${c.id}: not this time. Attendance counted; try again next class.`, "#c0392b");
  }
  st.flags.prep = Number(st.flags.prep ?? 0) + (passed ? 2 : 1);
}

function play(ui: GameUI, c: Course, lv: number): Promise<boolean> {
  if (c.game === "sprint") return mathSprint(ui, lv);
  if (c.game === "titration") return titration(ui, lv);
  if (c.game === "bugs") return bugHunt(ui, lv);
  const bank = BANKS[c.id as keyof typeof BANKS];
  const qs = pick(bank, lv, 3);
  return ui.quiz(`${c.id} ${c.title} — level ${lv + 1}`, qs).then((right) => right >= 2);
}

type Q = { q: string; options: string[]; answer: number; code?: string; tier: 1 | 2 | 3 };

/** Three questions, harder as the course levels up. */
function pick(bank: Q[], lv: number, n: number): Q[] {
  const tier = lv <= 1 ? 1 : lv <= 3 ? 2 : 3;
  const pool = bank.filter((q) => q.tier === tier);
  const rest = bank.filter((q) => q.tier !== tier);
  const out: Q[] = [];
  const take = (from: Q[]) => from.splice(Math.floor(Math.random() * from.length), 1)[0];
  while (out.length < n && pool.length) out.push(take(pool));
  while (out.length < n && rest.length) out.push(take(rest));
  return out;
}

/* ---------------- question banks ---------------- */

const BANKS: Record<"CS110" | "CY110" | "WO110" | "CV110", Q[]> = {
  CS110: [
    { tier: 1, q: "What does this print?", code: 'int a = 7, b = 2;\nprintf("%d", a / b);', options: ["3", "3.5", "4"], answer: 0 },
    { tier: 1, q: "What does this print?", code: 'int x = 5;\nx += 3;\nprintf("%d", x);', options: ["8", "53", "5"], answer: 0 },
    { tier: 1, q: "What does this print?", code: 'printf("%d", 10 % 3);', options: ["3", "1", "0"], answer: 1 },
    { tier: 2, q: "What does this print?", code: 'int i, s = 0;\nfor (i = 1; i <= 4; i++)\n  s += i;\nprintf("%d", s);', options: ["10", "4", "6"], answer: 0 },
    { tier: 2, q: "What does this print?", code: 'int a[] = {3, 1, 4, 1, 5};\nprintf("%d", a[2]);', options: ["1", "4", "3"], answer: 1 },
    { tier: 2, q: "What does this print?", code: 'int x = 3;\nif (x = 0) printf("zero");\nelse printf("nonzero");', options: ["zero", "nonzero", "compile error"], answer: 1 },
    { tier: 3, q: "What does this print?", code: 'int a = 5, *p = &a;\n*p = *p * 2;\nprintf("%d", a);', options: ["5", "10", "an address"], answer: 1 },
    { tier: 3, q: "What does this print?", code: 'char s[] = "NITK";\nprintf("%lu", sizeof(s));', options: ["4", "5", "8"], answer: 1 },
    { tier: 3, q: "What does this print?", code: 'int f(int n) { return n <= 1 ? 1 : n * f(n - 1); }\nprintf("%d", f(4));', options: ["24", "10", "4"], answer: 0 },
  ],
  CY110: [
    { tier: 1, q: "pH of pure water at 25 °C?", options: ["0", "7", "14"], answer: 1 },
    { tier: 1, q: "The bond in NaCl is…", options: ["Ionic", "Covalent", "Metallic"], answer: 0 },
    { tier: 1, q: "Phenolphthalein in a base turns…", options: ["Colourless", "Pink", "Blue"], answer: 1 },
    { tier: 2, q: "Hard water gets its hardness mostly from…", options: ["Ca²⁺ and Mg²⁺", "Na⁺ and K⁺", "Cl⁻ and F⁻"], answer: 0 },
    { tier: 2, q: "At the anode of a galvanic cell there is…", options: ["Reduction", "Oxidation", "No reaction"], answer: 1 },
    { tier: 2, q: "Rust is mostly…", options: ["Fe₂O₃·xH₂O", "FeCl₃", "FeS"], answer: 0 },
    { tier: 3, q: "ΔG < 0 means a reaction is…", options: ["Spontaneous", "At equilibrium", "Impossible"], answer: 0 },
    { tier: 3, q: "Degree of unsaturation of benzene (C₆H₆)?", options: ["3", "4", "6"], answer: 1 },
    { tier: 3, q: "The Nernst equation relates cell potential to…", options: ["Concentration", "Colour", "Mass"], answer: 0 },
  ],
  WO110: [
    { tier: 1, q: "A book lies on a table. The table pushes up with…", options: ["Zero force", "A force equal to its weight", "Twice its weight"], answer: 1 },
    { tier: 1, q: "Two 10 N forces at right angles. The resultant is about…", options: ["20 N", "14.1 N", "10 N"], answer: 1 },
    { tier: 1, q: "The moment of a 5 N force 2 m from a pivot is…", options: ["10 N·m", "2.5 N·m", "7 N·m"], answer: 0 },
    { tier: 2, q: "A body is in equilibrium when…", options: ["ΣF = 0 and ΣM = 0", "ΣF = 0 only", "It isn't moving"], answer: 0 },
    { tier: 2, q: "A simply supported 4 m beam carries 10 kN at its centre. Each reaction is…", options: ["5 kN", "10 kN", "2.5 kN"], answer: 0 },
    { tier: 2, q: "Friction coefficient 0.3, normal force 200 N. Limiting friction is…", options: ["60 N", "600 N", "30 N"], answer: 0 },
    { tier: 3, q: "The centroid of a triangle lies on each median, from the base, at…", options: ["1/3 of its height", "1/2 of its height", "2/3 of its height"], answer: 0 },
    { tier: 3, q: "A two-force member in equilibrium carries its forces…", options: ["Along the line joining the two points", "At right angles", "Anywhere"], answer: 0 },
    { tier: 3, q: "Moment of inertia of a rectangle b×h about its centroidal x-axis?", options: ["bh³/12", "bh³/3", "b³h/12"], answer: 0 },
  ],
  CV110: [
    { tier: 1, q: "The Western Ghats run along India's…", options: ["West coast", "East coast", "Northern border"], answer: 0 },
    { tier: 1, q: "Coastal Karnataka gets most of its rain from…", options: ["The south-west monsoon", "The north-east monsoon", "Snowmelt"], answer: 0 },
    { tier: 1, q: "Which of these is biodegradable?", options: ["Banana leaf", "PET bottle", "Styrofoam cup"], answer: 0 },
    { tier: 2, q: "Mangroves on this coast protect against…", options: ["Coastal erosion", "Earthquakes", "Drought"], answer: 0 },
    { tier: 2, q: "BOD in wastewater measures…", options: ["Oxygen demand of microbes", "Salt content", "Temperature"], answer: 0 },
    { tier: 2, q: "The Netravati river meets the sea at…", options: ["Mangaluru", "Karwar", "Udupi"], answer: 0 },
    { tier: 3, q: "An ecological pyramid of energy is always…", options: ["Upright", "Inverted", "Spindle-shaped"], answer: 0 },
    { tier: 3, q: "CRZ rules in India regulate building near…", options: ["The coast", "Forests", "Airports"], answer: 0 },
    { tier: 3, q: "Ozone-depleting CFCs were phased out by the…", options: ["Montreal Protocol", "Kyoto Protocol", "Paris Agreement"], answer: 0 },
  ],
};

/* ---------------- CS111: spot the bug ---------------- */

const BUGS: { title: string; lines: string[]; bug: number; why: string }[] = [
  { title: "Sum of 1..n", lines: ["int n = 10, sum;", "for (int i = 1; i <= n; i++)", "    sum += i;", 'printf("%d\\n", sum);'], bug: 0, why: "sum is never initialised to 0." },
  { title: "Read a number", lines: ["int x;", 'printf("Enter x: ");', 'scanf("%d", x);', 'printf("%d\\n", x * 2);'], bug: 2, why: "scanf needs &x, the address." },
  { title: "Print an array", lines: ["int a[5] = {1, 2, 3, 4, 5};", "for (int i = 0; i <= 5; i++)", '    printf("%d ", a[i]);', "return 0;"], bug: 1, why: "i <= 5 reads a[5], one past the end." },
  { title: "Is it even?", lines: ["int n = 4;", "if (n % 2 = 0)", '    printf("even");', 'else printf("odd");'], bug: 1, why: "= assigns; comparison is ==." },
  { title: "Copy a string", lines: ["char dst[4];", 'char *src = "NITK";', "strcpy(dst, src);", 'printf("%s", dst);'], bug: 0, why: "\"NITK\" needs 5 bytes with the \\0." },
  { title: "Swap", lines: ["void swap(int a, int b) {", "    int t = a; a = b; b = t;", "}", "swap(x, y);"], bug: 0, why: "Pass pointers: swap(int *a, int *b)." },
  { title: "Average", lines: ["int total = 7, count = 2;", "float avg = total / count;", 'printf("%.1f", avg);', "return 0;"], bug: 1, why: "Integer division: 7 / 2 is 3, not 3.5." },
];

function bugHunt(ui: GameUI, lv: number): Promise<boolean> {
  return new Promise((resolve) => {
    const card = ui.openOverlay(620);
    const rounds = 3;
    const seconds = Math.max(10, 28 - lv * 4);
    const order = [...BUGS].sort(() => Math.random() - 0.5).slice(0, rounds);
    let r = 0;
    let right = 0;
    let left = seconds;
    let timer = 0;
    const show = () => {
      const b = order[r];
      left = seconds;
      card.innerHTML = `<h2>CS111 C Lab — find the bug</h2>
        <div style="font-size:12px">Round ${r + 1} of ${rounds} · <b>${b.title}</b> · click the broken line</div>
        <div class="t" style="font-weight:800;color:#c0392b;margin:4px 0"></div>
        <div class="code" style="background:#11151c;border-radius:6px;padding:6px;font:13px/1.6 ui-monospace,Menlo,monospace"></div>
        <div class="why" style="font-size:13px;margin-top:6px;min-height:1.3em"></div>`;
      const code = card.querySelector(".code") as HTMLDivElement;
      const t = card.querySelector(".t") as HTMLDivElement;
      const why = card.querySelector(".why") as HTMLDivElement;
      let done = false;
      const finish = (ok: boolean, clicked?: HTMLDivElement) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        const rows = code.querySelectorAll("div");
        (rows[b.bug] as HTMLDivElement).style.background = "#1e6f5c";
        if (clicked && !ok) clicked.style.background = "#8e2b2b";
        why.textContent = `${ok ? "Yes: " : "The bug: "}${b.why}`;
        if (ok) {
          right++;
          sfx.coin();
        } else sfx.missionFailed();
        setTimeout(() => {
          r++;
          if (r < rounds) show();
          else {
            ui.closeOverlay();
            resolve(right >= 2);
          }
        }, 1800);
      };
      b.lines.forEach((line, i) => {
        const row = document.createElement("div");
        row.textContent = `${String(i + 1).padStart(2)}  ${line}`;
        row.style.cssText = "color:#d7e0ea;padding:1px 6px;border-radius:4px;cursor:pointer;white-space:pre";
        row.addEventListener("mouseenter", () => !done && (row.style.background = "#2a3240"));
        row.addEventListener("mouseleave", () => !done && (row.style.background = ""));
        row.addEventListener("click", () => finish(i === b.bug, row));
        code.appendChild(row);
      });
      t.textContent = `${left}s`;
      timer = window.setInterval(() => {
        left--;
        t.textContent = `${left}s`;
        if (left <= 0) finish(false);
      }, 1000);
    };
    show();
  });
}

/* ---------------- MA110: mental-maths sprint ---------------- */

function mathProblem(tier: number): { q: string; a: number } {
  const r = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const kind = r(0, tier >= 2 ? 4 : 2);
  if (kind === 0) {
    const a = r(2, 6);
    const n = r(2, 3);
    const x = r(1, 3);
    return { q: `d/dx (${a}x^${n}) at x = ${x}`, a: a * n * x ** (n - 1) };
  }
  if (kind === 1) {
    const [a, b, c, d] = [r(1, 6), r(1, 6), r(1, 6), r(1, 6)];
    return { q: `det [[${a}, ${b}], [${c}, ${d}]]`, a: a * d - b * c };
  }
  if (kind === 2) {
    const a = r(2, 9);
    return { q: `lim x→${a} of (x² − ${a * a}) / (x − ${a})`, a: 2 * a };
  }
  if (kind === 3) {
    const n = r(5, 12);
    return { q: `1 + 2 + … + ${n}`, a: (n * (n + 1)) / 2 };
  }
  const [a, b, c, d] = [r(1, 5), r(1, 5), r(1, 5), r(1, 5)];
  return { q: `(${a}, ${b}) · (${c}, ${d})`, a: a * c + b * d };
}

function mathSprint(ui: GameUI, lv: number): Promise<boolean> {
  return new Promise((resolve) => {
    const card = ui.openOverlay(520);
    const total = 5;
    const need = 4;
    let left = Math.max(30, 75 - lv * 8);
    const tier = lv <= 1 ? 1 : 2;
    let i = 0;
    let right = 0;
    let cur = mathProblem(tier);
    card.innerHTML = `<h2>MA110 — mental maths</h2>
      <div style="font-size:12px">${total} questions, ${need} to pass. Type the answer, press Enter. Pens down.</div>
      <div class="t" style="font-weight:800;color:#c0392b;margin:6px 0"></div>
      <div class="q" style="font:700 26px ui-monospace,Menlo,monospace;margin:10px 0"></div>
      <input inputmode="numeric" style="font:22px ui-monospace,Menlo,monospace;width:140px;padding:4px 8px;border:2px solid #1b1f2a;border-radius:6px" />
      <div class="s" style="margin-top:8px;font-size:13px"></div>`;
    const q = card.querySelector(".q") as HTMLDivElement;
    const t = card.querySelector(".t") as HTMLDivElement;
    const s = card.querySelector(".s") as HTMLDivElement;
    const input = card.querySelector("input") as HTMLInputElement;
    const render = () => {
      q.textContent = cur.q;
      s.textContent = `Question ${i + 1} of ${total} · ${right} right`;
      t.textContent = `${left}s`;
    };
    const end = () => {
      clearInterval(timer);
      input.disabled = true;
      s.textContent = `${right} of ${total}. ${right >= need ? "Dr. Bhat nods, once." : "Dr. Bhat sighs, audibly."}`;
      setTimeout(() => {
        ui.closeOverlay();
        resolve(right >= need);
      }, 1400);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key !== "Enter" || input.value.trim() === "") return;
      if (Number(input.value) === cur.a) {
        right++;
        sfx.coin();
      } else sfx.missionFailed();
      input.value = "";
      i++;
      if (i >= total) return end();
      cur = mathProblem(tier);
      render();
    });
    const timer = window.setInterval(() => {
      left--;
      t.textContent = `${left}s`;
      if (left <= 0) end();
    }, 1000);
    render();
    setTimeout(() => input.focus(), 50);
  });
}

/* ---------------- CY111: acid-base titration ---------------- */

function titration(ui: GameUI, lv: number): Promise<boolean> {
  return new Promise((resolve) => {
    const card = ui.openOverlay(560);
    const endpoint = 16 + Math.random() * 8;
    const tolerance = 0.5 - lv * 0.07;
    card.innerHTML = `<h2>CY111 — titration</h2>
      <div style="font-size:12px">NaOH into HCl with phenolphthalein. Hold <b>Space</b> to run the burette, tap <b>D</b> for one drop. Press <b>Enter</b> at the first permanent faint pink.</div>
      <canvas width="520" height="300" style="width:100%;margin-top:8px;border:2px solid #1b1f2a;border-radius:8px;background:#f4f1ea"></canvas>
      <div class="r" style="font-weight:800;margin-top:6px"></div>`;
    const cv = card.querySelector("canvas")!;
    const ctx = cv.getContext("2d")!;
    const out = card.querySelector(".r") as HTMLDivElement;
    let v = 0;
    let running = false;
    let done = false;
    let last = performance.now();
    let raf = 0;
    const pinkness = () => (v < endpoint ? Math.max(0, 1 - (endpoint - v) / 0.6) * 0.25 : Math.min(1, 0.35 + (v - endpoint) * 0.6));
    const draw = () => {
      ctx.clearRect(0, 0, 520, 300);
      // Burette with its scale.
      ctx.fillStyle = "#e8eef2";
      ctx.fillRect(250, 10, 20, 170);
      ctx.strokeStyle = "#1b1f2a";
      ctx.strokeRect(250, 10, 20, 170);
      ctx.fillStyle = "#cfe3f2";
      const level = 10 + (v / 50) * 170;
      ctx.fillRect(251, level, 18, 180 - level);
      for (let k = 0; k <= 50; k += 5) {
        const y = 10 + (k / 50) * 170;
        ctx.fillStyle = "#1b1f2a";
        ctx.fillRect(270, y, k % 10 ? 5 : 9, 1);
        if (k % 10 === 0) ctx.fillText(String(k), 283, y + 4);
      }
      ctx.fillStyle = "#1b1f2a";
      ctx.fillRect(257, 180, 6, 22);
      // Conical flask; the colour is the whole game.
      const p = pinkness();
      ctx.beginPath();
      ctx.moveTo(240, 210);
      ctx.lineTo(280, 210);
      ctx.lineTo(320, 290);
      ctx.lineTo(200, 290);
      ctx.closePath();
      ctx.fillStyle = `rgba(${230 + 25 * p}, ${240 - 170 * p}, ${245 - 60 * p}, 1)`;
      ctx.fill();
      ctx.stroke();
      if (running) {
        ctx.fillStyle = "#cfe3f2";
        ctx.fillRect(259, 202, 2, 12);
      }
      ctx.fillStyle = "#1b1f2a";
      ctx.font = "700 16px ui-monospace,Menlo,monospace";
      ctx.fillText(`${v.toFixed(2)} mL`, 360, 60);
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running && !done) v += dt * 2.2;
      draw();
      if (!done && v > endpoint + 3) finish(false, "Deep magenta. Way past it. Rinse and redo next week.");
      raf = requestAnimationFrame(loop);
    };
    const finish = (ok: boolean, msg: string) => {
      if (done) return;
      done = true;
      running = false;
      out.textContent = msg;
      out.style.color = ok ? "#1e6f5c" : "#c0392b";
      if (ok) sfx.coin();
      else sfx.missionFailed();
      setTimeout(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", down, true);
        window.removeEventListener("keyup", up, true);
        ui.closeOverlay();
        resolve(ok);
      }, 1800);
    };
    const down = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (done) return;
      if (e.code === "Space") {
        e.preventDefault();
        running = true;
      } else if (e.code === "KeyD" && !e.repeat) v += 0.05;
      else if (e.code === "Enter") {
        const err = v - endpoint;
        if (err < 0) finish(false, `Still colourless at ${v.toFixed(2)} mL. The pink faded: you stopped early.`);
        else if (err <= tolerance) finish(true, `Endpoint at ${v.toFixed(2)} mL. Faint pink. Shankar initials your record.`);
        else finish(false, `${v.toFixed(2)} mL: overshot by ${err.toFixed(2)} mL. Too pink.`);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") running = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    raf = requestAnimationFrame(loop);
  });
}
