const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function normalizeWeekOffDays(input) {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .map((x) => String(x || "").trim().toLowerCase())
    .filter((x) => DAY_NAMES.includes(x));
  return [...new Set(cleaned)];
}

export function dayNameForDate(d = new Date()) {
  return DAY_NAMES[d.getDay()];
}

export function isWeekOffToday(weekOffDays, d = new Date()) {
  const normalized = normalizeWeekOffDays(weekOffDays);
  const today = dayNameForDate(d);
  return normalized.includes(today);
}

export function isWeekOffOnDate(weekOffDays, dateInput) {
  const normalized = normalizeWeekOffDays(weekOffDays);
  if (!dateInput) return false;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return false;
  return normalized.includes(dayNameForDate(d));
}

