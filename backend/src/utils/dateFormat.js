import { APP_TIMEZONE } from "./recurrence.js";

const DATE_OPTS = {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const DATETIME_OPTS = {
  ...DATE_OPTS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** DD/MM/YYYY */
export function formatAppDate(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  const s = String(value).trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(`${s}T12:00:00+05:30`);
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", DATE_OPTS).format(d);
}

/** DD/MM/YYYY, HH:mm */
export function formatAppDateTime(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  const s = String(value).trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(`${s}T12:00:00+05:30`);
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", DATETIME_OPTS).format(d);
}
