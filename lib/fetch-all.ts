// Why this exists: Supabase returns at most "Max rows" rows per request
// (1,000 by default, set in the Supabase dashboard) and SILENTLY drops the
// rest. A plain .select() on a table that grows (models, request lines,
// jobs, notepad lines…) would one day just lose rows without any error.
//
// fetchAll() asks for one page at a time with .range() and keeps going
// until a page comes back empty, so it works whatever "Max rows" is set to
// (even lower than PAGE_SIZE). Rules for the query you pass in:
//   * it must have a stable order that ends in a unique column (e.g.
//     .order("created_at").order("id")), or pages can overlap or skip rows
//   * it must end in .range(from, to)
// Pass `max` for a deliberate cap (e.g. the latest 200 jobs).

export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(
  page: (from: number, to: number) => Page<T>,
  { max }: { max?: number } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const want = max === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, max - all.length);
    if (want <= 0) return all;
    const from = all.length;
    const { data, error } = await page(from, from + want - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return all;
    all.push(...data);
  }
}
