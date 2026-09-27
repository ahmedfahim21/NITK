/**
 * The journal (J): the day, your stats and standing with every group, what
 * you've joined, the Next Year list, and every mission by chapter.
 */
import type { Game } from "./index";
import { CHAPTERS, MISSIONS } from "./index";
import { CLUBS } from "./stalls";
import type { Faction } from "./state";
import { semesterOf } from "./seasons";

const FACTIONS: Faction[] = ["Karavali", "Aravali", "Sahyadri", "Seniors", "IRIS", "Clubs"];

export function openJournal(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const st = g.state;
    const card = g.ui.openOverlay(720);
    const bar = (v: number) => `<div style="flex:1;height:9px;border:1.5px solid #1b1f2a;border-radius:5px;background:#fff;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(0, Math.min(100, v * 2))}%;background:#1d3557"></i></div>`;
    const clubs = CLUBS.filter((c) => st.flags[`club:${c.id}`]).map((c) => c.name);
    const next = String(st.flags.nextYear ?? "").split("|").filter(Boolean);
    const chapters = CHAPTERS.map((ch) => {
      const ms = MISSIONS.filter((m) => m.chapter === ch.name);
      if (!ms.length) return "";
      const rows = ms
        .map((m) => {
          const done = st.completed.has(m.id);
          const open = !done && m.requires.every((r) => st.completed.has(r));
          const icon = done ? "✅" : open ? "❗" : "🔒";
          return `<div style="opacity:${done || open ? 1 : 0.5}">${icon} ${m.title}</div>`;
        })
        .join("");
      return `<div style="margin-top:8px"><b>${ch.name}</b>${rows}</div>`;
    }).join("");
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="margin:0">Journal</h2><span style="font-size:12px">J or Esc to close</span></div>
      <div style="font-size:13px;margin:2px 0 10px">${st.dateText()} · ${st.clockText()} · ${semesterOf(st.day)} · ${st.season.name} · ₹${Math.round(st.money)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
        <div>
          <b>You</b>
          <div>Attendance: <b style="color:${st.attendance < 75 ? "#c0392b" : "#1e6f5c"}">${Math.round(st.attendance)}%</b> (${st.classesAttended}/${st.classesHeld} classes)</div>
          <div>Quiz answers right: ${Number(st.flags.prep ?? 0)}</div>
          <div>Mess: ${st.flags.mess ? String(st.flags.mess).replace(/^./, (c) => c.toUpperCase()) : "not registered"}</div>
          <div style="margin-top:8px"><b>Respect</b></div>
          ${FACTIONS.map((f) => `<div style="display:flex;gap:6px;align-items:center"><span style="width:70px">${f}</span>${bar(st.rep[f] ?? 0)}<span style="width:24px;text-align:right">${st.rep[f] ?? 0}</span></div>`).join("")}
          <div style="margin-top:8px"><b>Clubs</b>: ${clubs.length ? clubs.join(", ") : "none yet"}</div>
          <div style="margin-top:4px"><b>Next Year</b>: ${next.length ? next.join(", ") : "—"}</div>
        </div>
        <div>${chapters}</div>
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
