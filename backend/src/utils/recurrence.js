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

function dueTimeInTz(date, timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

/** Add calendar days in IST, preserving due time-of-day in IST. */
export function addCalendarDaysInTz(date, days, timeZone = APP_TIMEZONE) {
  const key = calendarDayKeyInTz(date, timeZone);
  const anchor = new Date(`${key}T12:00:00+05:30`);
  anchor.setDate(anchor.getDate() + days);
  const nextKey = calendarDayKeyInTz(anchor, timeZone);
  const time = dueTimeInTz(date, timeZone);
  return new Date(`${nextKey}T${time}+05:30`);
}

function dayOfWeekInTz(date, timeZone = APP_TIMEZONE) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(new Date(date));
  return DAY_INDEX[name] ?? 0;
}

function addInterval(date, taskType, timeZone = APP_TIMEZONE) {
  switch (taskType) {
    case "daily":
      return addCalendarDaysInTz(date, 1, timeZone);
    case "weekly":
      return addCalendarDaysInTz(date, 7, timeZone);
    case "fortnightly":
      return addCalendarDaysInTz(date, 14, timeZone);
    case "monthly": {
      const key = calendarDayKeyInTz(date, timeZone);
      const anchor = new Date(`${key}T12:00:00+05:30`);
      anchor.setMonth(anchor.getMonth() + 1);
      const nextKey = calendarDayKeyInTz(anchor, timeZone);
      return new Date(`${nextKey}T${dueTimeInTz(date, timeZone)}+05:30`);
    }
    case "quarterly": {
      const key = calendarDayKeyInTz(date, timeZone);
      const anchor = new Date(`${key}T12:00:00+05:30`);
      anchor.setMonth(anchor.getMonth() + 3);
      const nextKey = calendarDayKeyInTz(anchor, timeZone);
      return new Date(`${nextKey}T${dueTimeInTz(date, timeZone)}+05:30`);
    }
    case "yearly": {
      const key = calendarDayKeyInTz(date, timeZone);
      const anchor = new Date(`${key}T12:00:00+05:30`);
      anchor.setFullYear(anchor.getFullYear() + 1);
      const nextKey = calendarDayKeyInTz(anchor, timeZone);
      return new Date(`${nextKey}T${dueTimeInTz(date, timeZone)}+05:30`);
    }
    default:
      return null;
  }
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
  let next = addInterval(base, task.taskType, APP_TIMEZONE);
  if (!next) return null;

  const weekOff = task.recurrence?.weekOff || "Sunday";
  const includeSunday = task.recurrence?.includeSunday === true;
  const weekOffIdx = DAY_INDEX[weekOff] ?? 0;

  if (task.taskType === "daily" && !includeSunday && dayOfWeekInTz(next, APP_TIMEZONE) === weekOffIdx) {
    next = addCalendarDaysInTz(next, 1, APP_TIMEZONE);
  }

  const forever = task.recurrence?.forever === true;
  const endDate = task.recurrence?.endDate ? new Date(task.recurrence.endDate) : null;
  if (!forever && endDate && next > endDate) return null;

  return next;
}

/** Step one occurrence backward from fromDate (mirrors computeNextDueDate). */
export function computePreviousDueDate(task, fromDate) {
  if (!isRecurring(task?.taskType)) return null;
  const base = fromDate ? new Date(fromDate) : task.dueDate ? new Date(task.dueDate) : new Date();
  let prev;
  switch (task.taskType) {
    case "daily":
      prev = addCalendarDaysInTz(base, -1, APP_TIMEZONE);
      break;
    case "weekly":
      prev = addCalendarDaysInTz(base, -7, APP_TIMEZONE);
      break;
    case "fortnightly":
      prev = addCalendarDaysInTz(base, -14, APP_TIMEZONE);
      break;
    case "monthly": {
      const key = calendarDayKeyInTz(base, APP_TIMEZONE);
      const anchor = new Date(`${key}T12:00:00+05:30`);
      anchor.setMonth(anchor.getMonth() - 1);
      const prevKey = calendarDayKeyInTz(anchor, APP_TIMEZONE);
      prev = new Date(`${prevKey}T${dueTimeInTz(base, APP_TIMEZONE)}+05:30`);
      break;
    }
    case "quarterly": {
      const key = calendarDayKeyInTz(base, APP_TIMEZONE);
      const anchor = new Date(`${key}T12:00:00+05:30`);
      anchor.setMonth(anchor.getMonth() - 3);
      const prevKey = calendarDayKeyInTz(anchor, APP_TIMEZONE);
      prev = new Date(`${prevKey}T${dueTimeInTz(base, APP_TIMEZONE)}+05:30`);
      break;
    }
    case "yearly": {
      const key = calendarDayKeyInTz(base, APP_TIMEZONE);
      const anchor = new Date(`${key}T12:00:00+05:30`);
      anchor.setFullYear(anchor.getFullYear() - 1);
      const prevKey = calendarDayKeyInTz(anchor, APP_TIMEZONE);
      prev = new Date(`${prevKey}T${dueTimeInTz(base, APP_TIMEZONE)}+05:30`);
      break;
    }
    default:
      return null;
  }

  const weekOff = task.recurrence?.weekOff || "Sunday";
  const includeSunday = task.recurrence?.includeSunday === true;
  const weekOffIdx = DAY_INDEX[weekOff] ?? 0;
  if (task.taskType === "daily" && !includeSunday && dayOfWeekInTz(prev, APP_TIMEZONE) === weekOffIdx) {
    prev = addCalendarDaysInTz(prev, -1, APP_TIMEZONE);
  }

  return prev;
}

/**
 * Occurrence due date for the cycle active when the assignee submitted.
 * Walks backward from startFromDue (or task.dueDate) so future misdated rows are corrected.
 */
export function resolveOccurrenceDueForSubmitTime(task, submittedAt, startFromDue) {
  if (!submittedAt || !task?.taskType || !isRecurring(task.taskType)) {
    return startFromDue || task?.dueDate || null;
  }
  const subKey = calendarDayKeyInTz(submittedAt);
  let due = new Date(startFromDue || task.dueDate || submittedAt);
  let best = due;

  for (let i = 0; i < 500; i++) {
    const dueKey = calendarDayKeyInTz(due);
    if (dueKey >= subKey) {
      best = due;
      const previous = computePreviousDueDate(task, due);
      if (!previous) break;
      const prevKey = calendarDayKeyInTz(previous);
      if (prevKey < subKey) break;
      due = previous;
    } else {
      break;
    }
  }
  return best;
}
