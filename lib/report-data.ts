import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import type { ReportPrinterRow, ReportQuery, ReportRow, ReportTopModel, ReportTotals } from "@/lib/reports";

// Reports → Printing data, all worked out in the database (0022). Admin only
// (the functions run as the caller, and RLS lets only the admin see jobs).

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const args = (q: ReportQuery) => ({ p_from: q.from, p_to: q.to, p_printer: q.printerId });

// Numbers can arrive as text from numeric columns: make them numbers.
const numbers = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]) => {
  const out = { ...row };
  for (const k of keys) out[k] = Number(row[k]) as T[keyof T];
  return out;
};
const MONEY_KEYS = ["plates", "models", "est_weight_g", "cost", "charge", "margin"] as const;

// One row per month (Monthly, Custom) or year (Yearly), newest first.
export async function loadPrintReport(supabase: SupabaseClient, q: ReportQuery): Promise<ReportRow[]> {
  const rows = await fetchAll<ReportRow>(
    (from, to) =>
      supabase
        .rpc("print_report", { ...args(q), p_group: q.view === "yearly" ? "year" : "month" })
        .order("period", { ascending: false })
        .range(from, to) as unknown as Rows<ReportRow>,
  );
  return rows.map((r) => numbers(r, [...MONEY_KEYS]));
}

export async function loadPrintReportTotals(supabase: SupabaseClient, q: ReportQuery): Promise<ReportTotals> {
  const { data, error } = await supabase.rpc("print_report_totals", args(q)).single<ReportTotals>();
  if (error) throw new Error(error.message);
  return numbers(data, [...MONEY_KEYS]);
}

export async function loadPrintReportByPrinter(supabase: SupabaseClient, q: ReportQuery) {
  const rows = await fetchAll<ReportPrinterRow>(
    (from, to) =>
      supabase
        .rpc("print_report_by_printer", args(q))
        .order("printer_name")
        .order("printer_id")
        .range(from, to) as unknown as Rows<ReportPrinterRow>,
  );
  return rows.map((r) => numbers(r, ["plates", "models", "charge"]));
}

// The most printed models in the period (a deliberate top 10).
export async function loadPrintReportTopModels(supabase: SupabaseClient, q: ReportQuery, limit = 10) {
  const { data, error } = await (supabase.rpc("print_report_top_models", { ...args(q), p_limit: limit }) as unknown as Rows<ReportTopModel>);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => numbers(r, ["printed"]));
}
