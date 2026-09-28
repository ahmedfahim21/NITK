/**
 * The journal (J): the day at a glance, your standing with every group,
 * what you've joined, every mission by chapter and the campus jobs, your
 * courses and the timetable. The yearbook (Y) is one click away.
 */
import type { Game } from "./index";
import { CHAPTERS, JOB_COLOUR, MISSIONS, STORY_COLOUR } from "./index";
import { CLUBS } from "./stalls";
import type { Faction } from "./state";
import type { Mission } from "./chapter1";
import { COURSES, TIMETABLE, level, type CourseId } from "./courses";
import { hoursText, openNow } from "./schedule";
import { CAST } from "./cast";
import { JOBS } from "./jobs";
import { icon, type IconId } from "../ui/icons";
import { metCount, openYearbook } from "./yearbook";

export const FACTIONS: Record<Faction, { colour: string; icon: IconId; about: string }> = {
  Karavali: { colour: "#2f6fd6", icon: "hostel", about: "1st Block, your hostel" },
  Aravali: { colour: "#d9731f", icon: "hostel", about: "2nd Block, the rivals" },
  Sahyadri: { colour: "#2e9a52", icon: "hostel", about: "7th Block" },
  Seniors: { colour: "#b8860b", icon: "award", about: "Everyone above first year" },
  IRIS: { colour: "#7b5bd0", icon: "code", about: "The IRIS team" },
  Clubs: { colour: "#c9489a", icon: "users", about: "Every club on campus" },
};

/** Clubs you join through a mission rather than at a recruitment stall. */
const MISSION_CLUBS: { id: string; name: string; colour: string }[] = [{ id: "farc", name: "Flying and Robotics Club", colour: "#16a085" }];

const COURSE_ICON: Record<CourseId, IconId> = { CS110: "code", CS111: "terminal", MA110: "sigma", CY110: "flask", CY111: "flask", WO110: "wrench", CV110: "leaf" };
const COURSE_COLOUR: Record<CourseId, string> = { CS110: "#2f6fd6", CS111: "#1d3557", MA110: "#7b5bd0", CY110: "#16a085", CY111: "#138d75", WO110: "#b85c3e", CV110: "#2e9a52" };

const SEASON_ICON: Record<string, IconId> = { monsoon: "rain", postmonsoon: "leaf", winter: "snow", summer: "flower" };

/** A small coloured disc with an icon in it. */
export const disc = (ic: IconId, colour: string, size = 26) =>
  `<span class="jr-disc" style="width:${size}px;height:${size}px;background:${colour}">${icon(ic, Math.round(size * 0.56), { color: "#fff", stroke: 2.2 })}</span>`;

export function openJournal(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const st = g.state;
    const H = (ic: IconId, t: string, extra = "") => `<div class="jr-h">${icon(ic, 15)}<span>${t}</span>${extra}</div>`;
    const card = g.ui.openOverlay(1240);
    card.classList.add("jr");
    const unlocked = new Set(g.available().map((m) => m.id));

    /* ---- the day at a glance ---- */
    const att = Math.round(st.attendance);
    const tile = (ic: IconId, colour: string, big: string, small: string) =>
      `<div class="jr-tile"><span class="jr-tile-ic" style="color:${colour}">${icon(ic, 20)}</span><div><div class="big">${big}</div><div class="small">${small}</div></div></div>`;
    const tiles = [
      tile("calendar", "#2f6fd6", st.dateText(), "Semester I"),
      tile("clock", "#b8860b", st.clockText(), st.raining ? "Raining" : "Dry"),
      tile(SEASON_ICON[st.seasonId] ?? "sun", "#16a085", st.season.name, "Season"),
      tile("wallet", "#2e9a52", `₹${Math.round(st.money)}`, "In your UPI"),
      tile("grad", att < 75 ? "#c0392b" : "#1e6f5c", `${att}%`, `${st.classesAttended}/${st.classesHeld} classes`),
    ].join("");

    /* ---- standing ---- */
    const respect = (Object.keys(FACTIONS) as Faction[])
      .map((f) => {
        const v = st.rep[f] ?? 0;
        const look = FACTIONS[f];
        return `<div class="jr-rep" title="${look.about}">${disc(look.icon, look.colour, 22)}<span class="nm">${f}</span><span class="bar"><i style="width:${Math.max(0, Math.min(100, v * 2))}%;background:${look.colour}"></i></span><span class="n">${v}</span></div>`;
      })
      .join("");
    const clubs = [...CLUBS.map((c) => ({ id: c.id, name: c.name, colour: c.colour })), ...MISSION_CLUBS].filter((c) => st.flags[`club:${c.id}`]);
    const clubPills = clubs.length ? clubs.map((c) => `<span class="jr-pill" style="background:${c.colour}">${c.name}</span>`).join("") : `<span class="jr-muted">None yet. Recruitment Week is in Chapter 2.</span>`;
    const next = String(st.flags.nextYear ?? "").split("|").filter(Boolean);
    const met = metCount(st);

    /* ---- missions ---- */
    // Only what's appeared so far: done, or unlocked (open now, or later today).
    // Nothing still locked is listed or counted, so the journal never spoils what's coming.
    const row = (m: Mission, state: "done" | "open" | "later", colour: string, note: string) => {
      const d = state === "done" ? disc("check", "#50bd77") : state === "open" ? disc(m.icon, colour) : disc(m.icon, "#a9b1bf");
      const chip = { done: "Done", open: "Open", later: "Later" }[state];
      return `<div class="jr-m ${state}">${d}<div class="t"><div>${m.title}<span class="chip ${state === "later" ? "locked" : state}">${chip}</span></div>${note ? `<div class="sub">${note}</div>` : ""}</div></div>`;
    };
    const chapters = CHAPTERS.map((ch) => {
      const ms = MISSIONS.filter((m) => m.chapter === ch.name && (st.completed.has(m.id) || unlocked.has(m.id)));
      if (!ms.length) return "";
      const done = ms.filter((m) => st.completed.has(m.id)).length;
      // Open ones first, then later today, then the done ones.
      const rank = (m: Mission) => (st.completed.has(m.id) ? 2 : openNow(st, m) ? 0 : 1);
      const rows = [...ms]
        .sort((a, b) => rank(a) - rank(b))
        .map((m) => {
          if (st.completed.has(m.id)) return row(m, "done", STORY_COLOUR, "");
          const who = m.giver ? ` · ${CAST[m.giver].name}` : "";
          return row(m, openNow(st, m) ? "open" : "later", STORY_COLOUR, `${hoursText(m)}${who}`);
        })
        .join("");
      return `<div class="jr-sec">${H("scroll", ch.name, `<span class="jr-count">${done} done</span>`)}${rows}</div>`;
    }).join("");
    const jobList = JOBS.filter((m) => m.requires.every((r) => st.completed.has(r)));
    const jobs = jobList
      .map((m) => {
        const doneToday = st.flags[`job:${m.id}`] === st.day;
        const pay = m.reward?.money ? `₹${m.reward.money} · ` : "";
        const when = `${pay}${hoursText(m)}${m.id === "job-films" ? " (Fridays)" : ""}${m.giver ? ` · ${CAST[m.giver].name}` : ""}`;
        if (doneToday) return row(m, "done", JOB_COLOUR, "Done for today. Back tomorrow.");
        return row(m, unlocked.has(m.id) && openNow(st, m) ? "open" : "later", JOB_COLOUR, when);
      })
      .join("");

    /* ---- courses ---- */
    const courses = (Object.keys(COURSES) as CourseId[])
      .map((id) => {
        const c = COURSES[id];
        const lv = level(st, id);
        const pips = Array.from({ length: 5 }, (_, i) => `<i style="background:${i < lv ? COURSE_COLOUR[id] : "transparent"};border-color:${COURSE_COLOUR[id]}"></i>`).join("");
        return `<div class="jr-course" title="${c.perks.map((p, i) => `L${i + 1}: ${p}`).join("&#10;")}">${disc(COURSE_ICON[id], COURSE_COLOUR[id], 30)}<div class="t"><div><span class="code">${id}</span> ${c.title}</div><div class="pips">${pips}</div><div class="sub">${lv ? c.perks[lv - 1] : `Not started · ${c.roomName}`}</div></div></div>`;
      })
      .join("");
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const week = `<div class="jr-week"><span></span><span class="hd">9 AM</span><span class="hd">2 PM</span>${TIMETABLE.map((day, i) => `<span class="hd">${DAYS[i]}</span>${day.map(([, id]) => `<span class="slot" style="border-left-color:${COURSE_COLOUR[id]}">${id}<em>${COURSES[id].roomName}</em></span>`).join("")}`).join("")}</div>`;

    card.innerHTML = `
      <div class="jr-top">
        <div><div class="jr-cap">Semester I · B.Tech CSE · Section ${st.flags.section ?? "S7"}</div><h2>Journal</h2></div>
        <div class="jr-actions">
          <button class="jr-btn" data-yearbook>${icon("id", 16)}<span class="lbl">Yearbook</span><span class="jr-count">${met.met}/${met.total}</span><kbd>Y</kbd></button>
          <button class="jr-btn" data-close aria-label="Close">${icon("x", 16)}<span class="lbl">Close</span><kbd>J</kbd></button>
        </div>
      </div>
      <div class="jr-tiles">${tiles}</div>
      <div class="jr-tabs" role="tablist">
        <button role="tab" data-tab="you">You</button>
        <button role="tab" data-tab="missions">Missions</button>
        <button role="tab" data-tab="studies">Studies</button>
      </div>
      <div class="jr-cols">
        <div class="jr-col" data-col="you">
          <div class="jr-sec">${H("users", "Respect")}${respect}</div>
          <div class="jr-sec">${H("flag", "Clubs")}<div class="jr-pills">${clubPills}</div></div>
          <div class="jr-sec">${H("calendar", "Next year")}${next.length ? `<div class="jr-pills">${next.map((n) => `<span class="jr-pill ghost">${n}</span>`).join("")}</div>` : `<span class="jr-muted">Nothing yet</span>`}</div>
          <div class="jr-sec">${H("thali", "Mess")}<span>${st.flags.mess ? String(st.flags.mess).replace(/^./, (c) => c.toUpperCase()) : `<span class="jr-muted">Not registered</span>`}</span> <span class="jr-muted">· ${Number(st.flags.prep ?? 0)} quiz answers right</span></div>
        </div>
        <div class="jr-col" data-col="missions">${chapters || `<div class="jr-sec">${H("scroll", "Missions")}<span class="jr-muted">Nothing yet. Look for a gold marker.</span></div>`}${jobList.length ? `<div class="jr-sec">${H("briefcase", "Campus jobs", `<span class="jr-muted small">once a day</span>`)}${jobs}</div>` : ""}</div>
        <div class="jr-col" data-col="studies">
          <div class="jr-sec">${H("grad", "Courses")}<div class="jr-courses">${courses}</div></div>
          <div class="jr-sec">${H("clock", "Timetable", `<span class="jr-muted small">weekdays</span>`)}${week}</div>
        </div>
      </div>`;

    let closed = false;
    const close = (then?: () => void) => {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey);
      g.ui.closeOverlay();
      if (then) then();
      else resolve();
    };
    const toYearbook = () => close(() => void openYearbook(g).then(resolve));
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyY") {
        e.preventDefault();
        toYearbook();
        return;
      }
      if (e.code !== "KeyJ" && e.code !== "Escape") return;
      e.preventDefault();
      close();
    };
    // On narrow screens one column shows at a time, picked by the tabs; missions first.
    const setTab = (tab: string) => {
      card.dataset.tab = tab;
      card.querySelectorAll<HTMLButtonElement>(".jr-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    };
    setTab("missions");
    card.querySelectorAll<HTMLButtonElement>(".jr-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab!)));
    card.querySelector("[data-close]")!.addEventListener("click", () => close());
    card.querySelector("[data-yearbook]")!.addEventListener("click", toYearbook);
    // Defer so the J that opened it doesn't close it.
    setTimeout(() => window.addEventListener("keydown", onKey), 50);
  });
}

