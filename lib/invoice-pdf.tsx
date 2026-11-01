import "server-only";
// Makes the invoice PDF (see lib/invoice-pdf-document.tsx for the layout).
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/lib/invoice-pdf-document";
import type { Company, Invoice, InvoiceLine } from "@/lib/invoices";

export async function renderInvoicePdf(invoice: Invoice, lines: InvoiceLine[], company: Company) {
  return renderToBuffer(<InvoiceDocument invoice={invoice} lines={lines} company={company} />);
}
