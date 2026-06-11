/** App-wide display dates: DD/MM/YYYY (IST). */
export const APP_TIMEZONE = "Asia/Kolkata";

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function parseDate(value?: string | Date | null): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** DD/MM/YYYY */
export function formatAppDate(value?: string | Date | null, fallback = "—"): string {
  const d = parseDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-GB", DATE_OPTS).format(d);
}

/** DD/MM/YYYY, HH:mm */
export function formatAppDateTime(value?: string | Date | null, fallback = "—"): string {
  const d = parseDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-GB", DATETIME_OPTS).format(d);
}

/** Internal calendar key YYYY-MM-DD in IST (not for display). */
export function calendarDayKeyInTz(value?: string | Date | null, now = new Date()): string {
  const d = value ? parseDate(value) : parseDate(now);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** True when the due date-time has passed (earlier day, or same day after due time). */
export function isOccurrencePastDue(value?: string | Date | null, now = new Date()): boolean {
  const d = parseDate(value);
  if (!d) return false;
  const dueKey = calendarDayKeyInTz(d);
  const todayKey = calendarDayKeyInTz(now);
  if (dueKey < todayKey) return true;
  if (dueKey === todayKey) return d.getTime() < now.getTime();
  return false;
}
