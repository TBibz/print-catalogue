import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_MODEL_COLUMNS,
  type AdminModel,
  type CatalogueModel,
  type Category,
} from "@/lib/catalogue";
import {
  REQUEST_LINE_COLUMNS,
  type RequestLine,
  type RequestLineRow,
} from "@/lib/requests";
import type { ColourOption } from "@/lib/colours";
import type { MoneyMonth, MoneySettings } from "@/lib/money-data";
import { DEFAULT_RESIN_DIVISOR, JOB_COLUMNS, type Job, type JobFormOptions } from "@/lib/jobs";
import { MATERIAL_COLUMNS, PRINTER_COLUMNS, type Material, type Printer } from "@/lib/materials";
import { NOTE_LINE_COLUMNS, type NoteLine } from "@/lib/notepad";
import { fetchAll } from "@/lib/fetch-all";
import { DEFAULT_THEME, themeFrom, type Theme } from "@/lib/theme";

// Server-side data loading shared by the pages.
// Every query runs as the logged-in user, so RLS applies.
//
// Every list is read with fetchAll() (see lib/fetch-all.ts): Supabase only
// returns up to "Max rows" rows per request and silently drops the rest.
// Counts and totals are worked out in the database (functions).
//
// The requester's safe slices of admin-only tables (models without
// admin_notes, printing amounts, print totals, model counts, colours) are
// functions called with .rpc() (0016_security_advisor.sql). Filters, order
// and .range() work on them just like on a table.

// What a list query resolves to. .rpc() results can't use .returns<T[]>(),
// so they are cast to this instead.
type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function loadCategories(supabase: SupabaseClient) {
  return fetchAll<Category>((from, to) =>
    supabase
      .from("categories")
      .select("id, name, sort_order, has_colour_options, colour_hex")
      .order("sort_order")
      .order("id")
      .range(from, to)
      .returns<Category[]>(),
  );
}

// Model counts per category, counted in the database (0016).
export type CategoryCounts = Record<string, { total: number; visible: number }>;
type CountRow = { category_id: string; total_models: number; visible_models: number };

export async function loadCategoryCounts(supabase: SupabaseClient): Promise<CategoryCounts> {
  const rows = await fetchAll<CountRow>(
    (from, to) =>
      supabase
        .rpc("category_model_counts")
        .select("category_id, total_models, visible_models")
        .order("category_id")
        .range(from, to) as unknown as Rows<CountRow>,
  );
  return Object.fromEntries(
    rows.map((r) => [r.category_id, { total: r.total_models, visible: r.visible_models }]),
  );
}

// Models from catalogue_models() (no admin_notes). Retired ("hidden")
// models are left out unless asked for, e.g. by the queue, which must still
// show requests for them.
export async function loadModels(
  supabase: SupabaseClient,
  { includeHidden = false } = {},
) {
  return fetchAll<CatalogueModel>((from, to) => {
    let query = supabase
      .rpc("catalogue_models")
      .select(
        "id, code, code_key, name, category_id, default_scale, other_scales, availability, image_path, show_new_badge",
      );
    if (!includeHidden) query = query.neq("availability", "hidden");
    return query.order("code").range(from, to) as unknown as Rows<CatalogueModel>;
  });
}

// Every model straight from the models table, including admin_notes and
// retired ones. RLS only lets the admin do this.
export async function loadAdminModels(supabase: SupabaseClient) {
  return fetchAll<AdminModel>((from, to) =>
    supabase
      .from("models")
      .select(ADMIN_MODEL_COLUMNS)
      .order("code")
      .range(from, to)
      .returns<AdminModel[]>(),
  );
}

export async function loadRequestLines(supabase: SupabaseClient) {
  const rows = await fetchAll<RequestLineRow>((from, to) =>
    supabase
      .from("request_lines")
      .select(REQUEST_LINE_COLUMNS)
      .order("created_at")
      .order("id")
      .range(from, to)
      .returns<RequestLineRow[]>(),
  );
  return addPrinting(supabase, rows);
}

// Adds the "printing" amount to each line: the sum of quantity_planned on
// its items in printing jobs. Read from request_line_printing(), which
// the requester may read too (it holds only line ids and numbers).
export async function addPrinting(
  supabase: SupabaseClient,
  rows: RequestLineRow[],
): Promise<RequestLine[]> {
  if (rows.length === 0) return [];
  const printing = await fetchAll<{ request_line_id: string; printing: number }>((from, to) =>
    supabase
      .rpc("request_line_printing")
      .select("request_line_id, printing")
      .order("request_line_id")
      .range(from, to) as unknown as Rows<{ request_line_id: string; printing: number }>,
  );
  const byLine = new Map(printing.map((p) => [p.request_line_id, p.printing]));
  return rows.map((row) => ({ ...row, printing: byLine.get(row.id) ?? 0 }));
}

// Successful prints per model ({ model id: total }), for the NEW badge and
// the models page.
export async function loadPrintTotals(supabase: SupabaseClient) {
  const rows = await fetchAll<{ model_id: string; printed_total: number }>((from, to) =>
    supabase
      .rpc("model_print_totals")
      .select("model_id, printed_total")
      .order("model_id")
      .range(from, to) as unknown as Rows<{ model_id: string; printed_total: number }>,
  );
  return Object.fromEntries(rows.map((r) => [r.model_id, r.printed_total])) as Record<string, number>;
}

// Printers, materials and the resin divisor, for the job form (admin only).
export async function loadJobFormOptions(supabase: SupabaseClient): Promise<JobFormOptions> {
  const [printers, materials, setting] = await Promise.all([
    loadPrinters(supabase),
    loadMaterials(supabase),
    supabase.from("settings").select("value").eq("key", "resin_charge_divisor").maybeSingle<{ value: string }>(),
  ]);
  if (setting.error) throw new Error(setting.error.message);
  const divisor = Number(setting.data?.value);
  return { printers, materials, divisor: divisor > 0 ? divisor : DEFAULT_RESIN_DIVISOR };
}

export async function loadPrinters(supabase: SupabaseClient) {
  return fetchAll<Printer>((from, to) =>
    supabase.from("printers").select(PRINTER_COLUMNS).order("name").order("id").range(from, to).returns<Printer[]>(),
  );
}

export async function loadMaterials(supabase: SupabaseClient) {
  return fetchAll<Material>((from, to) =>
    supabase
      .from("materials")
      .select(MATERIAL_COLUMNS)
      .order("type")
      .order("name")
      .order("id")
      .range(from, to)
      .returns<Material[]>(),
  );
}

// The colours from Settings → Colours (0021). Readable by both roles. If
// they can't be read, the defaults are used rather than breaking the page.
export async function loadTheme(supabase: SupabaseClient): Promise<Theme> {
  try {
    const rows = await fetchAll<{ key: string; value: string }>((from, to) =>
      supabase
        .from("settings")
        .select("key, value")
        .like("key", "colour\\_%")
        .order("key")
        .range(from, to)
        .returns<{ key: string; value: string }[]>(),
    );
    return themeFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch (error) {
    console.error("Loading the colours failed:", error);
    return DEFAULT_THEME;
  }
}

// How many of each model are on plates printing right now ({ model id:
// number }), requested or not (model_printing() in 0021), for the
// "Currently printing" row highlight.
export async function loadModelPrinting(supabase: SupabaseClient) {
  const rows = await fetchAll<{ model_id: string; printing: number }>(
    (from, to) =>
      supabase
        .rpc("model_printing")
        .select("model_id, printing")
        .order("model_id")
        .range(from, to) as unknown as Rows<{ model_id: string; printing: number }>,
  );
  return Object.fromEntries(rows.map((r) => [r.model_id, r.printing])) as Record<string, number>;
}

export async function loadSettings(supabase: SupabaseClient) {
  return fetchAll<{ key: string; value: string }>((from, to) =>
    supabase.from("settings").select("key, value").order("key").range(from, to).returns<{ key: string; value: string }[]>(),
  );
}

export async function loadNoteLines(supabase: SupabaseClient) {
  return fetchAll<NoteLine>((from, to) =>
    supabase
      .from("notepad_lines")
      .select(NOTE_LINE_COLUMNS)
      .order("position")
      .order("created_at")
      .order("id")
      .range(from, to)
      .returns<NoteLine[]>(),
  );
}

// Jobs with their items (admin only). Every printing job; for history, the
// latest HISTORY_LIMIT finished jobs (a deliberate cap) plus how many
// finished jobs there are in all, so the page can say "latest 200 of N".
export const HISTORY_LIMIT = 200;

export async function loadPrintingJobs(supabase: SupabaseClient) {
  return fetchAll<Job>((from, to) =>
    supabase
      .from("print_jobs")
      .select(JOB_COLUMNS)
      .eq("status", "printing")
      .order("started_at")
      .order("id")
      .range(from, to)
      .returns<Job[]>(),
  );
}

export async function loadJobHistory(supabase: SupabaseClient) {
  const [jobs, count] = await Promise.all([
    fetchAll<Job>(
      (from, to) =>
        supabase
          .from("print_jobs")
          .select(JOB_COLUMNS)
          .neq("status", "printing")
          .order("started_at", { ascending: false })
          .order("id")
          .range(from, to)
          .returns<Job[]>(),
      { max: HISTORY_LIMIT },
    ),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).neq("status", "printing"),
  ]);
  if (count.error) throw new Error(count.error.message);
  return { jobs, total: count.count ?? jobs.length };
}

// Colours the catalogue's colour dropdown can show (names and stock only).
export async function loadColourOptions(supabase: SupabaseClient) {
  return fetchAll<ColourOption>((from, to) =>
    supabase
      .rpc("colour_options")
      .select("id, name, colour, colour_hex, available, in_stock")
      .order("name")
      .order("id")
      .range(from, to) as unknown as Rows<ColourOption>,
  );
}

// How many notepad lines are not ticked off yet (blank lines don't count).
export async function loadUntickedNoteCount(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("notepad_lines")
    .select("id", { count: "exact", head: true })
    .eq("done", false)
    .neq("text", "");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ---- Money page (admin only) ------------------------------------------------

export async function loadMoneyMonths(supabase: SupabaseClient) {
  // A set-returning function is limited by "Max rows" too, so read it in pages.
  const data = await fetchAll<MoneyMonth>((from, to) =>
    supabase.rpc("money_by_month").order("month", { ascending: false }).range(from, to) as unknown as PromiseLike<{
      data: MoneyMonth[] | null;
      error: { message: string } | null;
    }>,
  );
  // Amounts can arrive as text from numeric columns: make them numbers.
  return data.map((r) => ({
    ...r,
    charge: Number(r.charge),
    job_costs: Number(r.job_costs),
    payments: Number(r.payments),
    costs: Number(r.costs),
    difference: Number(r.difference),
  }));
}

export async function loadMoneySettings(supabase: SupabaseClient): Promise<MoneySettings> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["opening_balance", "money_start_month"])
    .returns<{ key: string; value: string }[]>();
  if (error) throw new Error(error.message);
  const get = (key: string) => data?.find((s) => s.key === key)?.value ?? "";
  return {
    openingBalance: Number(get("opening_balance")) || 0,
    startMonth: get("money_start_month"),
  };
}

