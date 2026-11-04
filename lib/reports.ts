// Reports → Printing: what the page asks for and what the database sends
// back (the print_report functions in 0022_reports_notepad_undo.sql).
// Shared by the page, its view and the loaders in lib/report-data.ts.
import { ukToday } from "@/lib/invoices";

export type ReportView = "all" | "monthly" | "yearly" | "custom";
export type ReportTab = "printing" | "money";

// The period and printer the page shows. from / to are UK dates
// ("2026-11-04"); null = no limit.
export type ReportQuery = {
  view: ReportView;
  from: string | null;
  to: string | null;
  month: string | null; // Monthly: the month shown, "2026-11"
  printerId: string | null; // null = all printers
};

// Reports never go back before the start month (the money_start_month
// setting, also used by Reports → Money) and run to today. A new month
// appears by itself when it starts.
export type ReportBounds = {
  start: string; // first day of the start month, "2026-11-01"
  today: string; // UK date
};

// One month or year (or the whole period, for the totals).
export type ReportRow = {
  period: string; // first day of the month or year, "2026-10-01"
  plates: number;
  models: number; // successful prints
  est_weight_g: number;
  cost: number;
  charge: number;
  margin: number; // charge − cost
};
export type ReportTotals = Omit<ReportRow, "period">;

export type ReportPrinterRow = { printer_id: string; printer_name: string; plates: number; models: number; charge: number };
export type ReportTopModel = { model_id: string; code: string; name: string; printed: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The start month and today. A missing or future start month counts as
// this month.
export function reportBounds(startMonth: string): ReportBounds {
  const today = ukToday();
  const thisMonth = `${today.slice(0, 7)}-01`;
  const start = DATE.test(startMonth) ? `${startMonth.slice(0, 7)}-01` : thisMonth;
  return { start: start > thisMonth ? thisMonth : start, today };
}

// The last day of a month, "2026-11" → "2026-11-30".
function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Reads the page's address (?view=…&month=…&from=…&to=…&printer=…), always
// keeping inside the start month → today. All Time is the default.
export function reportQueryFrom(
  params: Record<string, string | string[] | undefined>,
  bounds: ReportBounds,
): ReportQuery {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const printerId = /^[0-9a-f-]{36}$/.test(get("printer")) ? get("printer") : null;
  const clamp = (d: string) => (d < bounds.start ? bounds.start : d > bounds.today ? bounds.today : d);
  const whole = { from: bounds.start, to: bounds.today, month: null, printerId };

  switch (get("view")) {
    case "monthly": {
      // One month, from the start month to this month (this month by default).
      const wanted = /^\d{4}-\d{2}$/.test(get("month")) ? get("month") : bounds.today.slice(0, 7);
      const month = clamp(`${wanted}-01`).slice(0, 7);
      return { view: "monthly", from: clamp(`${month}-01`), to: clamp(lastDay(month)), month, printerId };
    }
    case "yearly":
      return { view: "yearly", ...whole };
    case "custom": {
      const from = clamp(DATE.test(get("from")) ? get("from") : bounds.start);
      const to = clamp(DATE.test(get("to")) ? get("to") : bounds.today);
      return { view: "custom", from, to: to < from ? from : to, month: null, printerId };
    }
    default:
      return { view: "all", ...whole };
  }
}

// "2026" or "Oct 2026" for a row's period.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function periodLabel(period: string, view: ReportView) {
  const [y, m] = period.split("-").map(Number);
  return view === "yearly" ? String(y) : `${MONTHS[m - 1]} ${y}`;
}

// "1,234 g"
export const formatGrams = (g: number) => `${Math.round(g).toLocaleString("en-GB")} g`;
