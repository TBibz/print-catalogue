import "server-only";
// Makes the invoice PDF (see lib/invoice-pdf-document.tsx for the layout).
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/lib/invoice-pdf-document";
import type { Company, Invoice, InvoiceLine } from "@/lib/invoices";

// accent: the "Invoice document" colour from Settings → Colours.
export async function renderInvoicePdf(invoice: Invoice, lines: InvoiceLine[], company: Company, accent: string) {
  return renderToBuffer(<InvoiceDocument invoice={invoice} lines={lines} company={company} accent={accent} />);
}
