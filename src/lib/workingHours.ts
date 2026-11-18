// Working calendar used for turnaround clocks: Monday to Friday,
// 11:00 to 19:00 IST (same calendar the Team & Turnaround page states).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const START_H = 11;
const END_H = 19;

export function workingHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  // Walk IST calendar days.
  const fromIst = new Date(from.getTime() + IST_OFFSET_MS);
  const toIst = new Date(to.getTime() + IST_OFFSET_MS);
  const day = new Date(Date.UTC(fromIst.getUTCFullYear(), fromIst.getUTCMonth(), fromIst.getUTCDate()));
  while (day.getTime() <= toIst.getTime()) {
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const s = Math.max(day.getTime() + START_H * 3600000, fromIst.getTime());
      const e = Math.min(day.getTime() + END_H * 3600000, toIst.getTime());
      if (e > s) total += e - s;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return total / 3600000;
}

export function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 8) return `${h.toFixed(1)}h`;
  return `${(h / 8).toFixed(1)} working days`;
}
