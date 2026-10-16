import * as chrono from "chrono-node";

export function parseDate(text, now = new Date()) {
  const parsed = chrono.parseDate(text, now, { forwardDate: true });
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

export function monthRange(month) {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function currentMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
