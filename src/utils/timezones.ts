/**
 * Time helpers for interviews. An interview is stored as a wall-clock date and time in its own timezone
 * (for example 2026-11-25 23:30 in Asia/Kolkata). These helpers turn that into the viewer's own local date
 * and time, so a candidate or interviewer in another timezone sees the right day and hour.
 */

const partsIn = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute") };
};

/** The absolute instant for a wall-clock time in `timeZone`. Handles daylight-saving changes. */
export function instantFromWallClock(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target;
  // Two passes converge on the right offset, including across a DST change.
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), timeZone);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += target - shown;
  }
  return new Date(guess);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The date (YYYY-MM-DD) and time (HH:MM) an instant shows on this browser's clock. */
export function viewerDateTime(instant: Date): { date: string; time: string } {
  return {
    date: `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`,
    time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}`,
  };
}

/** Local date and time for the viewer, from an interview's own timezone. Falls back to the stored values if unreadable. */
export function viewerTimeFor(date: string, time: string, timeZone?: string | null): { date: string; time: string } {
  if (!timeZone) return { date, time };
  try {
    return viewerDateTime(instantFromWallClock(date, time, timeZone));
  } catch {
    return { date, time };
  }
}

/** The browser's own timezone name, for labels. */
export const viewerTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
