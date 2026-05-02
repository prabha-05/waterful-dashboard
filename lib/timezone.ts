// IST timezone helpers — explicit instead of relying on server TZ env var
// (Vercel reserves the `TZ` name so we can't set it that way).
// India is UTC+5:30 with no DST, so a fixed offset is reliable.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getIstDateParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(), // 0-indexed
    day: ist.getUTCDate(),
    weekday: ist.getUTCDay(), // 0=Sun
  };
}

/**
 * Construct the UTC instant when IST clocks read year-month-day 00:00.
 * E.g. makeIstDate(2026, 4, 1) → 2026-04-30T18:30:00.000Z (= May 1 00:00 IST).
 */
function makeIstDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
}

/** UTC instant of IST midnight on the IST day containing `d`. */
export function startOfIstDay(d: Date): Date {
  const p = getIstDateParts(d);
  return makeIstDate(p.year, p.month, p.day);
}

/** UTC instant of IST midnight on the 1st of the IST month containing `d`. */
export function startOfIstMonth(d: Date): Date {
  const p = getIstDateParts(d);
  return makeIstDate(p.year, p.month, 1);
}

/** Add `days` to a Date (works regardless of TZ — pure ms math). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/** Add `months` to an IST-aligned date, preserving the day-of-month. */
export function addIstMonths(d: Date, months: number): Date {
  const p = getIstDateParts(d);
  let newMonth = p.month + months;
  let newYear = p.year;
  while (newMonth < 0) {
    newMonth += 12;
    newYear--;
  }
  while (newMonth > 11) {
    newMonth -= 12;
    newYear++;
  }
  return makeIstDate(newYear, newMonth, p.day);
}

/** 0=Sunday, 1=Monday, ..., 6=Saturday — based on IST weekday. */
export function istDayOfWeek(d: Date): number {
  return getIstDateParts(d).weekday;
}

/** Format as YYYY-MM-DD using IST date parts. */
export function formatIstYmd(d: Date): string {
  const p = getIstDateParts(d);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Format as e.g. "1 May" using IST date parts. */
export function formatIstShort(d: Date): string {
  const p = getIstDateParts(d);
  return `${p.day} ${MONTH_SHORT[p.month]}`;
}

/** Format as e.g. "May 2026" using IST date parts. */
export function formatIstMonthYear(d: Date): string {
  const p = getIstDateParts(d);
  return `${MONTH_SHORT[p.month]} ${p.year}`;
}
