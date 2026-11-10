import { addDays, todayIso } from "../../shared/date";

/** The date ranges offered on reports. Weeks start on Monday. */
export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "this-week", label: "This week" },
  { key: "this-month", label: "This month" },
  { key: "month-to-date", label: "Month to date" },
  { key: "this-quarter", label: "This quarter" },
  { key: "quarter-to-date", label: "Quarter to date" },
  { key: "this-year", label: "This year" },
  { key: "year-to-date", label: "Year to date" },
  { key: "yesterday", label: "Previous day" },
  { key: "last-week", label: "Previous week" },
  { key: "last-month", label: "Previous month" },
  { key: "last-quarter", label: "Previous quarter" },
  { key: "last-year", label: "Previous year" },
  { key: "last-12-months", label: "Last 12 months" },
  { key: "custom", label: "Custom" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m, d));
  return date.toISOString().slice(0, 10);
};

/** The first and last day of a preset, relative to `today` (YYYY-MM-DD). */
export function periodRange(key: Exclude<PeriodKey, "custom">, today = todayIso()): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const month = m - 1;
  const quarter = Math.floor(month / 3) * 3;
  const weekday = (new Date(Date.UTC(y, month, d)).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -weekday);
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "this-week":
      return { from: monday, to: addDays(monday, 6) };
    case "last-week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "this-month":
      return { from: iso(y, month, 1), to: iso(y, month + 1, 0) };
    case "month-to-date":
      return { from: iso(y, month, 1), to: today };
    case "last-month":
      return { from: iso(y, month - 1, 1), to: iso(y, month, 0) };
    case "this-quarter":
      return { from: iso(y, quarter, 1), to: iso(y, quarter + 3, 0) };
    case "quarter-to-date":
      return { from: iso(y, quarter, 1), to: today };
    case "last-quarter":
      return { from: iso(y, quarter - 3, 1), to: iso(y, quarter, 0) };
    case "this-year":
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "year-to-date":
      return { from: iso(y, 0, 1), to: today };
    case "last-year":
      return { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) };
    case "last-12-months":
      return { from: addDays(iso(y - 1, month, d), 1), to: today };
  }
}
