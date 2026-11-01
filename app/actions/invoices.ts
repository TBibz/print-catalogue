"use server";

// Invoices (Phase 9). Both roles may use all of these. The database decides
// what's allowed (RLS, column grants and the guards in 0019_invoices.sql);
// these check the input and pass on its plain-English messages.
import { refresh } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { loadCompany, loadInvoice, loadInvoiceLines } from "@/lib/invoice-data";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import {
  CUSTOMER_COLUMNS,
  INVOICE_LINE_COLUMNS,
  invoiceFileName,
  type Customer,
  type InvoiceLine,
} from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string };
type Done = { ok: true } | Fail;

const MAX_QTY = 100000;
const MAX_PRICE = 100000;

function friendly(error: { code?: string; message: string }, what: string): Fail {
  console.error(`${what}:`, error.message);
  // P0001: a message raised on purpose by the database, shown as it is.
  if (error.code === "P0001") return { ok: false, error: error.message };
  if (error.code === "42501") return { ok: false, error: "You don't have permission to do that. Try logging in again." };
  if (error.code === "23505") return { ok: false, error: "That would be a duplicate. Refresh the page and try again." };
  return { ok: false, error: "Couldn't save. Please check your connection and try again." };
}

async function client() {
  if (!(await getCurrentProfile())) return null;
  return createClient();
}
const NOT_LOGGED_IN: Fail = { ok: false, error: "Please log in again." };

const toLine = (l: InvoiceLine): InvoiceLine => ({
  ...l,
  unit_price: l.unit_price === null ? null : Number(l.unit_price),
  line_total: l.line_total === null ? null : Number(l.line_total),
});

function checkQuantity(q: number) {
  return Number.isInteger(q) && q >= 1 && q <= MAX_QTY;
}
function checkPrice(p: number | null) {
  return p === null || (Number.isFinite(p) && p >= 0 && p <= MAX_PRICE);
}

// ---- Creating ---------------------------------------------------------------

// From the builder: [{ modelId, quantity }] → a new draft (copies of the
// models' codes, names and prices). Returns its id.
export async function createInvoice(
  lines: { modelId: string; quantity: number }[],
): Promise<{ ok: true; id: string } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  if (lines.length === 0) return { ok: false, error: "Tick at least one model first." };
  if (lines.some((l) => !checkQuantity(Number(l.quantity)))) {
    return { ok: false, error: "Every quantity must be a whole number of at least 1." };
  }
  const { data, error } = await supabase.rpc("create_invoice", {
    p_lines: lines.map((l) => ({ model_id: l.modelId, quantity: Number(l.quantity) })),
  });
  if (error) return friendly(error, "create_invoice");
  return { ok: true, id: String(data) };
}

export async function duplicateInvoice(id: string): Promise<{ ok: true; id: string } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { data, error } = await supabase.rpc("duplicate_invoice", { p_invoice_id: id });
  if (error) return friendly(error, "duplicate_invoice");
  return { ok: true, id: String(data) };
}

// ---- Draft lines --------------------------------------------------------------

async function readLine(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("invoice_lines")
    .select(INVOICE_LINE_COLUMNS)
    .eq("id", id)
    .maybeSingle<InvoiceLine>();
  if (error) return friendly(error, "invoice_lines");
  if (!data) return { ok: false as const, error: "That line no longer exists. Refresh the page." };
  return { ok: true as const, line: toLine(data) };
}

export async function addModelLine(
  invoiceId: string,
  modelId: string,
  quantity: number,
): Promise<{ ok: true; line: InvoiceLine } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  if (!checkQuantity(quantity)) return { ok: false, error: "The quantity must be a whole number of at least 1." };
  const { data, error } = await supabase.rpc("add_invoice_model_line", {
    p_invoice_id: invoiceId,
    p_model_id: modelId,
    p_quantity: quantity,
  });
  if (error) return friendly(error, "add_invoice_model_line");
  return readLine(supabase, String(data));
}

export async function addFreeTextLine(
  invoiceId: string,
  input: { description: string; quantity: number; price: number | null; position: number },
): Promise<{ ok: true; line: InvoiceLine } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const description = String(input.description ?? "").trim();
  if (!description) return { ok: false, error: "Type what the line is for." };
  if (description.length > 500) return { ok: false, error: "That description is too long (500 characters at most)." };
  if (!checkQuantity(input.quantity)) return { ok: false, error: "The quantity must be a whole number of at least 1." };
  if (!checkPrice(input.price)) return { ok: false, error: "Enter a price between £0 and £100,000." };

  const { data, error } = await supabase
    .from("invoice_lines")
    .insert({
      invoice_id: invoiceId,
      position: input.position,
      description,
      quantity: input.quantity,
      unit_price: input.price,
    })
    .select(INVOICE_LINE_COLUMNS)
    .single<InvoiceLine>();
  if (error) return friendly(error, "invoice_lines insert");
  return { ok: true, line: toLine(data) };
}

// Quantity, price or (free-text lines) description of one line. The price
// is this invoice's only: the model's saved price never changes.
export async function updateLine(
  id: string,
  change: { quantity?: number; unitPrice?: number | null; description?: string },
): Promise<{ ok: true; line: InvoiceLine } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const values: Record<string, unknown> = {};
  if (change.quantity !== undefined) {
    if (!checkQuantity(change.quantity)) return { ok: false, error: "The quantity must be a whole number of at least 1." };
    values.quantity = change.quantity;
  }
  if (change.unitPrice !== undefined) {
    if (!checkPrice(change.unitPrice)) return { ok: false, error: "Enter a price between £0 and £100,000." };
    values.unit_price = change.unitPrice;
  }
  if (change.description !== undefined) {
    const d = change.description.trim();
    if (!d) return { ok: false, error: "The description can't be empty." };
    if (d.length > 500) return { ok: false, error: "That description is too long (500 characters at most)." };
    values.description = d;
  }
  const { data, error } = await supabase
    .from("invoice_lines")
    .update(values)
    .eq("id", id)
    .select(INVOICE_LINE_COLUMNS)
    .maybeSingle<InvoiceLine>();
  if (error) return friendly(error, "invoice_lines update");
  if (!data) return { ok: false, error: "That line no longer exists. Refresh the page." };
  return { ok: true, line: toLine(data) };
}

export async function removeLine(id: string): Promise<Done> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { error } = await supabase.from("invoice_lines").delete().eq("id", id);
  if (error) return friendly(error, "invoice_lines delete");
  return { ok: true };
}

export async function setInvoiceDate(id: string, date: string): Promise<Done> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Choose a date." };
  const { error } = await supabase.from("invoices").update({ invoice_date: date }).eq("id", id);
  if (error) return friendly(error, "invoices date");
  return { ok: true };
}

// ---- Status ---------------------------------------------------------------------

export async function finaliseInvoice(id: string): Promise<{ ok: true; number: string } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { data, error } = await supabase.rpc("finalise_invoice", { p_invoice_id: id });
  if (error) return friendly(error, "finalise_invoice");
  refresh();
  return { ok: true, number: String(data) };
}

export async function reopenInvoice(id: string): Promise<Done> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { error } = await supabase.rpc("reopen_invoice", { p_invoice_id: id });
  if (error) return friendly(error, "reopen_invoice");
  refresh();
  return { ok: true };
}

export async function deleteDraft(id: string): Promise<Done> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { data, error } = await supabase.from("invoices").delete().eq("id", id).select("id");
  if (error) return friendly(error, "invoices delete");
  if (!data?.length) return { ok: false, error: "That invoice was already deleted." };
  return { ok: true };
}

// ---- Sending -----------------------------------------------------------------------

export async function sendInvoice(
  id: string,
  input: { to: string; subject: string; message: string; saveAsCustomer: boolean; customerName: string },
): Promise<{ ok: true; sentTo: string } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  if (!isEmailConfigured()) return { ok: false, error: "Email isn't set up yet." };

  const to = input.to.trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) {
    return { ok: false, error: "Enter one email address, e.g. name@example.com." };
  }
  const subject = input.subject.trim();
  if (!subject) return { ok: false, error: "The subject can't be empty." };

  const [invoice, lines, company] = await Promise.all([
    loadInvoice(supabase, id),
    loadInvoiceLines(supabase, id),
    loadCompany(supabase),
  ]);
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.status !== "finalised") return { ok: false, error: "Finalise the invoice before sending it." };

  const pdf = await renderInvoicePdf(invoice, lines, company);
  const sent = await sendEmail({
    fromName: company.name,
    replyTo: company.email,
    to,
    subject,
    text: input.message,
    attachments: [{ filename: invoiceFileName(invoice, company.name), content: pdf, contentType: "application/pdf" }],
  });
  if (!sent.ok) return sent;

  const { error } = await supabase.rpc("mark_invoice_sent", { p_invoice_id: id, p_to: to });
  if (error) {
    // The email went; only recording it failed. Say so plainly.
    console.error("mark_invoice_sent:", error.message);
    return { ok: false, error: "The email was sent, but it couldn't be recorded as sent. Refresh the page." };
  }

  if (input.saveAsCustomer) {
    const exists = await supabase.from("customers").select("id").ilike("email", to).limit(1);
    if (!exists.error && !exists.data?.length) {
      await supabase.from("customers").insert({ name: input.customerName.trim() || to, email: to });
    }
  }
  refresh();
  return { ok: true, sentTo: to };
}

// ---- Customers ------------------------------------------------------------------------

export async function saveCustomer(input: {
  id: string | null;
  name: string;
  email: string;
}): Promise<{ ok: true; customer: Customer } | Fail> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name && !email) return { ok: false, error: "Enter a name or an email address." };
  if (name.length > 200) return { ok: false, error: "That name is too long." };
  if (email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const values = { name, email };
  const query = input.id
    ? supabase.from("customers").update(values).eq("id", input.id)
    : supabase.from("customers").insert(values);
  const { data, error } = await query.select(CUSTOMER_COLUMNS).maybeSingle<Customer>();
  if (error) return friendly(error, "customers");
  if (!data) return { ok: false, error: "That customer no longer exists. Refresh the page." };
  return { ok: true, customer: data };
}

export async function deleteCustomer(id: string): Promise<Done> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return friendly(error, "customers delete");
  return { ok: true };
}

// null clears the default.
export async function setDefaultCustomer(id: string | null): Promise<Done> {
  const supabase = await client();
  if (!supabase) return NOT_LOGGED_IN;
  const { error } = await supabase.rpc("set_default_customer", { p_customer_id: id });
  if (error) return friendly(error, "set_default_customer");
  return { ok: true };
}
