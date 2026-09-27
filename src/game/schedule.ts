/**
 * The shape of a day, the way Bully keeps one: classes in the morning and
 * afternoon on weekdays, missions that only show up in their hours, a
 * curfew at 11 PM when you should be in your hostel (the warden's patrol
 * is out after that), and passing out at 2 AM if you're still up.
 *
 * Nothing is tied to calendar dates: days count up as you sleep, and the
 * season changes with the chapter.
 */
import type { GameState } from "./state";
import { hhmm } from "./util";

/** Minutes since midnight. */
export const CURFEW = 23 * 60;
export const CURFEW_WARNING = 22 * 60 + 30;
export const PASS_OUT = 2 * 60;
/** You come round, or wake from sleep, at this time. */
export const WAKE = 7 * 60;
/** Missions are open from breakfast to curfew unless they say otherwise. */
export const DEFAULT_HOURS: [number, number] = [7 * 60, CURFEW];

export type Hours = { hours?: [number, number]; days?: "weekday" | "weekend" };

/** True when `min` falls in [from, to); windows may wrap past midnight. */
export function within(min: number, [from, to]: [number, number]): boolean {
  return from <= to ? min >= from && min < to : min >= from || min < to;
}

export function isWeekend(st: GameState): boolean {
  return st.weekday >= 5;
}

/** After curfew and before dawn. */
export function afterCurfew(min: number): boolean {
  return min >= CURFEW || min < 5 * 60;
}

export function openNow(st: GameState, h: Hours): boolean {
  if (h.days === "weekday" && isWeekend(st)) return false;
  if (h.days === "weekend" && !isWeekend(st)) return false;
  return within(st.minutes, h.hours ?? DEFAULT_HOURS);
}

/** "4:00 PM – 6:30 PM, weekends" for the journal. */
export function hoursText(h: Hours): string {
  const [a, b] = h.hours ?? DEFAULT_HOURS;
  const days = h.days === "weekday" ? ", weekdays" : h.days === "weekend" ? ", weekends" : "";
  return `${hhmm(a)} – ${hhmm(b % 1440)}${days}`;
}
