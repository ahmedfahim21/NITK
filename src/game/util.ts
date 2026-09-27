export function hhmm(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${((h + 11) % 12) + 1}:${String(Math.floor(m % 60)).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
