import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogueModel, Category } from "@/lib/catalogue";
import {
  REQUEST_LINE_COLUMNS,
  type RequestLine,
  type RequestLineRow,
} from "@/lib/requests";

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

// Adds the "printing" amount to each line.
// Phase 6: replace the body with a query that sums quantity_planned from
// print_job_items whose job has status 'printing', grouped by request_line_id.
export async function addPrinting(
  _supabase: SupabaseClient,
  rows: RequestLineRow[],
): Promise<RequestLine[]> {
  return rows.map((row) => ({ ...row, printing: 0 }));
}
