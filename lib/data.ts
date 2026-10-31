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
import { DEFAULT_RESIN_DIVISOR, JOB_COLUMNS, type Job, type JobFormOptions } from "@/lib/jobs";
import { MATERIAL_COLUMNS, PRINTER_COLUMNS, type Material, type Printer } from "@/lib/materials";

// Server-side data loading shared by the catalogue and the admin queue.
// Every query runs as the logged-in user, so RLS applies.

const PAGE_SIZE = 1000; // Supabase returns at most 1,000 rows per request

// Runs a query page by page until everything has been read.
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

export async function loadCategories(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order, has_colour_options")
    .returns<Category[]>();
  if (error) throw new Error(error.message);
  return data;
}

// Models from the catalogue_models view (no admin_notes). Retired ("hidden")
// models are left out unless asked for, e.g. by the queue, which must still
// show requests for them.
export async function loadModels(
  supabase: SupabaseClient,
  { includeHidden = false } = {},
) {
  return fetchAll<CatalogueModel>((from, to) => {
    let query = supabase
      .from("catalogue_models")
      .select(
        "id, code, code_key, name, category_id, default_scale, other_scales, availability, image_path, show_new_badge",
      );
    if (!includeHidden) query = query.neq("availability", "hidden");
    return query.order("code").range(from, to).returns<CatalogueModel[]>();
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
      .range(from, to)
      .returns<RequestLineRow[]>(),
  );
  return addPrinting(supabase, rows);
}

// Adds the "printing" amount to each line: the sum of quantity_planned on
// its items in printing jobs. Read from the request_line_printing view, which
// the requester may read too (it holds only line ids and numbers).
export async function addPrinting(
  supabase: SupabaseClient,
  rows: RequestLineRow[],
): Promise<RequestLine[]> {
  if (rows.length === 0) return [];
  const printing = await fetchAll<{ request_line_id: string; printing: number }>((from, to) =>
    supabase
      .from("request_line_printing")
      .select("request_line_id, printing")
      .range(from, to)
      .returns<{ request_line_id: string; printing: number }[]>(),
  );
  const byLine = new Map(printing.map((p) => [p.request_line_id, p.printing]));
  return rows.map((row) => ({ ...row, printing: byLine.get(row.id) ?? 0 }));
}

// Successful prints per model ({ model id: total }), for the NEW badge and
// the models page.
export async function loadPrintTotals(supabase: SupabaseClient) {
  const rows = await fetchAll<{ model_id: string; printed_total: number }>((from, to) =>
    supabase
      .from("model_print_totals")
      .select("model_id, printed_total")
      .range(from, to)
      .returns<{ model_id: string; printed_total: number }[]>(),
  );
  return Object.fromEntries(rows.map((r) => [r.model_id, r.printed_total])) as Record<string, number>;
}

// Printers, materials and the resin divisor, for the job form (admin only).
export async function loadJobFormOptions(supabase: SupabaseClient): Promise<JobFormOptions> {
  const [printers, materials, setting] = await Promise.all([
    supabase.from("printers").select(PRINTER_COLUMNS).order("name").returns<Printer[]>(),
    supabase.from("materials").select(MATERIAL_COLUMNS).order("name").returns<Material[]>(),
    supabase.from("settings").select("value").eq("key", "resin_charge_divisor").maybeSingle<{ value: string }>(),
  ]);
  for (const r of [printers, materials, setting]) if (r.error) throw new Error(r.error.message);
  const divisor = Number(setting.data?.value);
  return {
    printers: printers.data ?? [],
    materials: materials.data ?? [],
    divisor: divisor > 0 ? divisor : DEFAULT_RESIN_DIVISOR,
  };
}

// Jobs with their items (admin only). `status` "printing" gives every
// printing job; "history" the most recent finished ones.
export const HISTORY_LIMIT = 200;

export async function loadJobs(supabase: SupabaseClient, which: "printing" | "history") {
  let query = supabase.from("print_jobs").select(JOB_COLUMNS);
  query =
    which === "printing"
      ? query.eq("status", "printing").order("started_at")
      : query.neq("status", "printing").order("started_at", { ascending: false }).limit(HISTORY_LIMIT);
  const { data, error } = await query.returns<Job[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

// How many models (including retired ones) each category has: { id: count }.
// Admin only (reads the models table).
export async function loadModelCountsByCategory(supabase: SupabaseClient) {
  const rows = await fetchAll<{ category_id: string }>((from, to) =>
    supabase.from("models").select("category_id").range(from, to).returns<{ category_id: string }[]>(),
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.category_id] = (counts[r.category_id] ?? 0) + 1;
  return counts;
}

// Colours the catalogue's colour dropdown can show (names and stock only).
export async function loadColourOptions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("colour_options")
    .select("id, name, colour, colour_hex, available, in_stock")
    .order("name")
    .returns<ColourOption[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
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
