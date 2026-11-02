// GET /invoices/[id]/pdf: the invoice as a PDF download, made on the server
// (lib/invoice-pdf.tsx). Drafts get a DRAFT watermark. Logged-in users only
// (proxy.ts), and the data is read as them, so RLS applies.
import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { loadCompany, loadInvoice, loadInvoiceLines } from "@/lib/invoice-data";
import { loadTheme } from "@/lib/data";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceFileName } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, ctx: RouteContext<"/invoices/[id]/pdf">) {
  if (!(await getCurrentProfile())) return new Response("Please log in.", { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createClient();

  const [invoice, lines, company, theme] = await Promise.all([
    loadInvoice(supabase, id),
    loadInvoiceLines(supabase, id),
    loadCompany(supabase),
    loadTheme(supabase),
  ]);
  if (!invoice) return new Response("That invoice doesn't exist.", { status: 404 });

  const pdf = await renderInvoicePdf(invoice, lines, company, theme.colour_invoice);
  const name = invoiceFileName(invoice, company.name);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // filename* carries the name safely even with unusual characters.
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
