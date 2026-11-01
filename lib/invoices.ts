// Types and helpers for invoices (Phase 9), used by pages and the PDF.

export type InvoiceStatus = "draft" | "finalised";

export type Invoice = {
  id: string;
  number: string | null; // "INV-0001", null until first finalised
  status: InvoiceStatus;
  invoice_date: string; // "2026-11-01"
  customer_id: string | null;
  created_by: string | null;
  finalised_at: string | null;
  sent_at: string | null;
  sent_to: string | null;
  created_at: string;
  updated_at: string;
};

export const INVOICE_COLUMNS =
  "id, number, status, invoice_date, customer_id, created_by, finalised_at, sent_at, sent_to, created_at, updated_at";

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  position: number;
  model_id: string | null; // null = free-text line
  code: string | null;
  description: string;
  quantity: number;
  unit_price: number | null; // £ per item, null = no price yet
  line_total: number | null;
};

export const INVOICE_LINE_COLUMNS =
  "id, invoice_id, position, model_id, code, description, quantity, unit_price, line_total";

// From the invoice_totals view (worked out in the database).
export type InvoiceTotals = {
  invoice_id: string;
  line_count: number;
  items: number;
  total: number;
  unpriced_lines: number;
};

export type InvoiceListRow = Invoice & { totals: InvoiceTotals };

export type Customer = {
  id: string;
  name: string;
  email: string;
  is_default: boolean;
  created_at: string;
};

export const CUSTOMER_COLUMNS = "id, name, email, is_default, created_at";

// The company details printed at the top of every invoice (settings with
// keys starting "company_", 0019_invoices.sql).
export type Company = {
  name: string;
  addressLines: string[];
  phone: string;
  email: string;
};

export const COMPANY_DEFAULTS = {
  company_name: "Alexanders Toy Soldiers",
  company_address_1: "14 Constance Road",
  company_address_2: "Twickenham",
  company_address_3: "TW2 7HY",
  company_phone: "020-8894-5925",
  company_email: "nik@ats-uk.net",
} as const;

export type CompanyKey = keyof typeof COMPANY_DEFAULTS;

export function companyFrom(settings: Record<string, string>): Company {
  const get = (k: CompanyKey) => (settings[k] ?? COMPANY_DEFAULTS[k]).trim();
  return {
    name: get("company_name"),
    addressLines: [get("company_address_1"), get("company_address_2"), get("company_address_3")].filter(Boolean),
    phone: get("company_phone"),
    email: get("company_email"),
  };
}

// "1 November 2026"
export function formatInvoiceDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "1 Nov 2026, 14:05" (UK time), for when something was sent.
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// "1 Nov 2026" (UK date), e.g. for "Sent 1 Nov 2026".
export function formatSentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

// Where an invoice is up to, for the status badge and the list filters:
// a draft, finalised but never emailed, or emailed (sent_at is the latest
// send, as each send overwrites it).
export type InvoiceSendState = "draft" | "not_sent" | "sent";

export function invoiceSendState(invoice: Pick<Invoice, "status" | "sent_at">): InvoiceSendState {
  if (invoice.status === "draft") return "draft";
  return invoice.sent_at ? "sent" : "not_sent";
}

// Always said in an invoice email, even if it's removed from the message.
export const PDF_ATTACHED_LINE = "The invoice is attached as a PDF.";

// "INV-0001 Alexanders Toy Soldiers.pdf" ("Draft …" before it has a number).
export function invoiceFileName(invoice: Pick<Invoice, "number" | "status">, companyName: string) {
  const label = invoice.status === "finalised" && invoice.number ? invoice.number : "Draft";
  return `${label} ${companyName}.pdf`.replace(/[\\/:*?"<>|]/g, "");
}

export function invoiceTitle(invoice: Pick<Invoice, "number" | "status">) {
  if (invoice.status === "finalised") return invoice.number ?? "Invoice";
  return invoice.number ? `${invoice.number} (reopened draft)` : "Draft invoice";
}

// Grand total and item count of a set of lines (lines without a price add
// nothing to the total).
export function linesTotals(lines: Pick<InvoiceLine, "quantity" | "unit_price">[]) {
  let total = 0;
  let items = 0;
  let unpriced = 0;
  for (const l of lines) {
    items += l.quantity;
    if (l.unit_price === null) unpriced++;
    else total += Math.round(l.quantity * Number(l.unit_price) * 100) / 100;
  }
  return { total: Math.round(total * 100) / 100, items, unpriced };
}
