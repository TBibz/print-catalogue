import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import {
  companyFrom,
  CUSTOMER_COLUMNS,
  INVOICE_COLUMNS,
  INVOICE_LINE_COLUMNS,
  type Company,
  type Customer,
  type Invoice,
  type InvoiceLine,
  type InvoiceListRow,
  type InvoiceTotals,
} from "@/lib/invoices";

// Server-side loading for the invoice pages and the PDF. Every query runs
// as the logged-in user, so RLS applies (both roles can see invoices).

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// Numbers come back from Postgres numeric columns as strings or numbers
// depending on size; make them numbers.
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toLine(l: InvoiceLine): InvoiceLine {
  return { ...l, unit_price: num(l.unit_price), line_total: num(l.line_total) };
}

export async function loadInvoiceList(supabase: SupabaseClient): Promise<InvoiceListRow[]> {
  const [invoices, totals] = await Promise.all([
    fetchAll<Invoice>((from, to) =>
      supabase
        .from("invoices")
        .select(INVOICE_COLUMNS)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
        .returns<Invoice[]>(),
    ),
    fetchAll<InvoiceTotals>(
      (from, to) =>
        supabase
          .from("invoice_totals")
          .select("invoice_id, line_count, items, total, unpriced_lines")
          .order("invoice_id")
          .range(from, to) as unknown as Rows<InvoiceTotals>,
    ),
  ]);
  const byId = new Map(totals.map((t) => [t.invoice_id, { ...t, total: Number(t.total) }]));
  return invoices.map((i) => ({
    ...i,
    totals: byId.get(i.id) ?? { invoice_id: i.id, line_count: 0, items: 0, total: 0, unpriced_lines: 0 },
  }));
}

export async function loadInvoice(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", id)
    .maybeSingle<Invoice>();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadInvoiceLines(supabase: SupabaseClient, invoiceId: string) {
  const lines = await fetchAll<InvoiceLine>((from, to) =>
    supabase
      .from("invoice_lines")
      .select(INVOICE_LINE_COLUMNS)
      .eq("invoice_id", invoiceId)
      .order("position")
      .order("created_at")
      .order("id")
      .range(from, to)
      .returns<InvoiceLine[]>(),
  );
  return lines.map(toLine);
}

export async function loadCustomers(supabase: SupabaseClient) {
  return fetchAll<Customer>((from, to) =>
    supabase
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .order("name")
      .order("id")
      .range(from, to)
      .returns<Customer[]>(),
  );
}

// The company_ settings (readable by both roles, 0019).
export async function loadCompany(supabase: SupabaseClient): Promise<Company> {
  const rows = await fetchAll<{ key: string; value: string }>((from, to) =>
    supabase
      .from("settings")
      .select("key, value")
      .like("key", "company_%")
      .order("key")
      .range(from, to)
      .returns<{ key: string; value: string }[]>(),
  );
  return companyFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

// Models for the builder and "+ Add model": not retired, with their saved
// price (from catalogue_models(), which both roles may call).
export type InvoiceModel = {
  id: string;
  code: string;
  name: string;
  category_id: string;
  price: number | null;
};

export async function loadInvoiceModels(supabase: SupabaseClient): Promise<InvoiceModel[]> {
  const rows = await fetchAll<InvoiceModel>(
    (from, to) =>
      supabase
        .rpc("catalogue_models")
        .select("id, code, name, category_id, price")
        .neq("availability", "hidden")
        .order("code")
        .range(from, to) as unknown as Rows<InvoiceModel>,
  );
  return rows.map((m) => ({ ...m, price: num(m.price) }));
}
