// Reports → Printing: what the page asks for and what the database sends
// back (the print_report functions in 0022_reports_notepad_undo.sql).
// Shared by the page, its view and the loaders in lib/report-data.ts.
import { ukToday } from "@/lib/invoices";

export type ReportView = "monthly" | "yearly" | "custom";
export type ReportTab = "printing" | "money";

// The period and printer the page shows. from / to are UK dates
// ("2026-11-04"); null = no limit.
export type ReportQuery = {
  view: ReportView;
  from: string | null;
  to: string | null;
  printerId: string | null; // null = all printers
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

// Reads the page's address (?view=…&from=…&to=…&printer=…). Monthly is the
// default: the last 12 months, this one included.
export function reportQueryFrom(params: Record<string, string | string[] | undefined>): ReportQuery {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const printerId = /^[0-9a-f-]{36}$/.test(get("printer")) ? get("printer") : null;
  const view = get("view");
  if (view === "yearly") return { view: "yearly", from: null, to: null, printerId };
  if (view === "custom") {
    const last12 = lastTwelveMonths();
    const from = DATE.test(get("from")) ? get("from") : last12.from;
    const to = DATE.test(get("to")) ? get("to") : last12.to;
    return { view: "custom", from, to, printerId };
  }
  return { view: "monthly", ...lastTwelveMonths(), printerId };
}

// The first day of the month 11 months ago, to today (UK).
export function lastTwelveMonths() {
  const today = ukToday();
  const [y, m] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 - 11, 1));
  return { from: start.toISOString().slice(0, 10), to: today };
}

// "2026" or "Oct 2026" for a row's period.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function periodLabel(period: string, view: ReportView) {
  const [y, m] = period.split("-").map(Number);
  return view === "yearly" ? String(y) : `${MONTHS[m - 1]} ${y}`;
}

// "1,234 g"
export const formatGrams = (g: number) => `${Math.round(g).toLocaleString("en-GB")} g`;
