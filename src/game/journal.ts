/**
 * The journal (J): the day, your stats and standing with every group, what
 * you've joined, the Next Year list, your courses and timetable, and every
 * mission by chapter.
 */
import type { Game } from "./index";
import { CHAPTERS, MISSIONS } from "./index";
import { CLUBS } from "./stalls";
import type { Faction } from "./state";
import { COURSES, TIMETABLE, level, type CourseId } from "./courses";
import { hhmm } from "./util";
import { hoursText, openNow } from "./schedule";
import { JOBS } from "./jobs";
import { CAST } from "./cast";

/** Clubs you join through a mission rather than at a recruitment stall. */
const MISSION_CLUBS: [string, string][] = [["farc", "Flying and Robotics Club"]];

const FACTIONS: Faction[] = ["Karavali", "Aravali", "Sahyadri", "Seniors", "IRIS", "Clubs"];

export function openJournal(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const st = g.state;
    // Section headings: small caps, not bold.
    const H = (t: string) => `<div style="font:400 12px var(--label);letter-spacing:.14em;text-transform:uppercase;color:#8a5a00;margin-bottom:3px">${t}</div>`;
    const card = g.ui.openOverlay(720);
    // Courses and two chapters make it tall: scroll inside the card.
    card.style.maxHeight = "calc(100vh - 40px)";
    card.style.overflowY = "auto";
    const bar = (v: number) => `<div style="flex:1;height:9px;border:1.5px solid #1b1f2a;border-radius:5px;background:#fff;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(0, Math.min(100, v * 2))}%;background:#1d3557"></i></div>`;
    const clubs = [...CLUBS.map((c) => [c.id, c.name] as [string, string]), ...MISSION_CLUBS].filter(([id]) => st.flags[`club:${id}`]).map(([, name]) => name);
    const next = String(st.flags.nextYear ?? "").split("|").filter(Boolean);
    const chapters = CHAPTERS.map((ch) => {
      const ms = MISSIONS.filter((m) => m.chapter === ch.name);
      if (!ms.length) return "";
      const unlocked = new Set(g.available().map((m) => m.id));
      const rows = ms
        .map((m) => {
          const done = st.completed.has(m.id);
          const open = !done && unlocked.has(m.id);
          const chip = done ? `<span class="chip done">Done</span>` : open ? `<span class="chip open">Open</span>` : `<span class="chip locked">Locked</span>`;
          const when = open && m.giver ? `<div style="margin-left:66px;font-size:11.5px;color:#6b6f78">${hoursText(m)} · ${CAST[m.giver].name}</div>` : "";
          return `<div style="margin:3px 0;opacity:${done || open ? 1 : 0.55}">${chip}${m.title}</div>${when}`;
        })
        .join("");
      return `<div style="margin-top:10px">${H(ch.name)}${rows}</div>`;
    }).join("");
    // Jobs: once a day each. "Now" when the giver's out, "Done" when you've done it today.
    const unlockedJobs = new Set(g.available().map((m) => m.id));
    const jobRows = JOBS.map((m) => {
      const doneToday = st.flags[`job:${m.id}`] === st.day;
      const unlocked = m.requires.every((r) => st.completed.has(r));
      const now = unlocked && !doneToday && unlockedJobs.has(m.id) && openNow(st, m);
      const chip = doneToday ? `<span class="chip done">Done</span>` : now ? `<span class="chip open">Now</span>` : `<span class="chip locked">${unlocked ? "Later" : "Locked"}</span>`;
      const pay = m.reward?.money ? ` <span style="opacity:.7">₹${m.reward.money}</span>` : "";
      const when = unlocked && m.giver ? `<div style="margin-left:66px;font-size:11.5px;color:#6b6f78">${hoursText(m)}${m.id === "job-films" ? " (Fridays)" : ""} · ${CAST[m.giver].name}</div>` : "";
      return `<div style="margin:3px 0;opacity:${unlocked ? 1 : 0.55}">${chip}${m.title}${pay}</div>${when}`;
    }).join("");
    const jobs = `<div style="margin-top:10px">${H("Campus jobs · once a day")}${jobRows}</div>`;
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const pips = (n: number) => "●".repeat(n) + "○".repeat(5 - n);
    const courses = (Object.keys(COURSES) as CourseId[])
      .map((id) => {
        const c = COURSES[id];
        const lv = level(st, id);
        return `<div title="${c.perks.map((p, i) => `L${i + 1}: ${p}`).join("&#10;")}"><span style="display:inline-block;width:52px">${id}</span><span style="display:inline-block;width:190px">${c.title}</span><span style="color:#b85c3e;letter-spacing:1px">${pips(lv)}</span> <span style="opacity:.7">${lv ? c.perks[lv - 1] : "not started"}</span></div>`;
      })
      .join("");
    const week = TIMETABLE.map((day, i) => `<div><span style="display:inline-block;width:34px">${DAYS[i]}</span>${day.map(([t, id]) => `${hhmm(t).replace(":00", "")} ${id} <span style="opacity:.6">(${COURSES[id].roomName})</span>`).join(" · ")}</div>`).join("");
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="margin:0">Journal</h2><span style="font-size:12px">J or Esc to close</span></div>
      <div style="font-size:13px;margin:2px 0 10px">${st.dateText()} · ${st.clockText()} · Semester I · ${st.season.name} · ₹${Math.round(st.money)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
        <div>
          ${H("You")}
          <div>Attendance: <span style="color:${st.attendance < 75 ? "#c0392b" : "#1e6f5c"}">${Math.round(st.attendance)}%</span> (${st.classesAttended}/${st.classesHeld} classes)</div>
          <div>Quiz answers right: ${Number(st.flags.prep ?? 0)}</div>
          <div>Mess: ${st.flags.mess ? String(st.flags.mess).replace(/^./, (c) => c.toUpperCase()) : "not registered"}</div>
          <div style="margin-top:10px">${H("Respect")}</div>
          ${FACTIONS.map((f) => `<div style="display:flex;gap:6px;align-items:center"><span style="width:70px">${f}</span>${bar(st.rep[f] ?? 0)}<span style="width:24px;text-align:right">${st.rep[f] ?? 0}</span></div>`).join("")}
          <div style="margin-top:10px">${H("Clubs")}${clubs.length ? clubs.join(", ") : "None yet"}</div>
          <div style="margin-top:8px">${H("Next year")}${next.length ? next.join(", ") : "Nothing yet"}</div>
        </div>
        <div>${chapters}${jobs}</div>
      </div>
      <div style="margin-top:12px;font-size:12.5px">
        ${H(`B.Tech Computer Science &amp; Engineering · Semester I · Section ${st.flags.section ?? "S7"}`)}
        <div style="margin-top:4px">${courses}</div>
        <div style="margin-top:10px">${H("Timetable · 9 AM and 2 PM, weekdays, once classes start")}</div>
        ${week}
      </div>`;
    const close = (e: KeyboardEvent) => {
      if (e.code !== "KeyJ" && e.code !== "Escape") return;
      e.preventDefault();
      window.removeEventListener("keydown", close);
      g.ui.closeOverlay();
      resolve();
    };
    // Defer so the J that opened it doesn't close it.
    setTimeout(() => window.addEventListener("keydown", close), 50);
  });
}
