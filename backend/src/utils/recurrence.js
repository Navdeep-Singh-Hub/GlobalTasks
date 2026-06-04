export const RECURRING_TYPES = ["daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"];

const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export function isRecurring(taskType) {
  return RECURRING_TYPES.includes(taskType);
}

function addInterval(date, taskType) {
  const d = new Date(date);
  switch (taskType) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "fortnightly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return d;
}

/**
 * Compute the next due date for a recurring task by advancing from its current dueDate.
 * Honors recurrence.endDate (unless recurrence.forever is true) and skips the week-off day
 * for daily tasks when includeSunday === false.
 * Returns a Date, or null if the series has ended.
 */
export const APP_TIMEZONE = "Asia/Kolkata";

/** Calendar day YYYY-MM-DD in app timezone (for occurrence visibility). */
export function calendarDayKeyInTz(date, timeZone = APP_TIMEZONE) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/** Start of next calendar day in app timezone (India: +05:30). */
export function startOfNextCalendarDayInTz(now = new Date(), timeZone = APP_TIMEZONE) {
  const todayKey = calendarDayKeyInTz(now, timeZone);
  const anchor = new Date(`${todayKey}T12:00:00+05:30`);
  anchor.setDate(anchor.getDate() + 1);
  const nextKey = calendarDayKeyInTz(anchor, timeZone);
  return new Date(`${nextKey}T00:00:00+05:30`);
}

/** @deprecated Use isOccurrenceDueToday from recurringOccurrenceSync / applyTodayOnlyDueFilter */
export function isOccurrenceWorkableToday(dueDate, now = new Date(), timeZone = APP_TIMEZONE) {
  if (!dueDate) return false;
  return calendarDayKeyInTz(dueDate, timeZone) === calendarDayKeyInTz(now, timeZone);
}

export function computeNextDueDate(task) {
  if (!isRecurring(task.taskType)) return null;
  const base = task.dueDate ? new Date(task.dueDate) : new Date();
  let next = addInterval(base, task.taskType);
  if (!next) return null;

  const weekOff = task.recurrence?.weekOff || "Sunday";
  const includeSunday = task.recurrence?.includeSunday === true;
  const weekOffIdx = DAY_INDEX[weekOff] ?? 0;

  if (task.taskType === "daily" && !includeSunday && next.getDay() === weekOffIdx) {
    next.setDate(next.getDate() + 1);
  }

  const forever = task.recurrence?.forever === true;
  const endDate = task.recurrence?.endDate ? new Date(task.recurrence.endDate) : null;
  if (!forever && endDate && next > endDate) return null;

  return next;
}
