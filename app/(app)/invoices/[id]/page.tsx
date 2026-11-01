import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isEmailConfigured } from "@/lib/email";
import {
  loadCompany,
  loadCustomers,
  loadInvoice,
  loadInvoiceLines,
  loadInvoiceModels,
} from "@/lib/invoice-data";
import { createClient } from "@/lib/supabase/server";
import { InvoiceView } from "./invoice-view";

export const metadata: Metadata = { title: "Invoice · Print Catalogue" };

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  return (
    <>
      <Link href="/invoices" className="text-sm text-neutral-600 hover:underline">
        ← Invoices
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading the invoice…</p>}>
        <InvoiceData params={params} />
      </Suspense>
    </>
  );
}

async function InvoiceData({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let data = null;
  try {
    const invoice = await loadInvoice(supabase, id);
    if (invoice) {
      const draft = invoice.status === "draft";
      const [lines, company, customers, models] = await Promise.all([
        loadInvoiceLines(supabase, id),
        loadCompany(supabase),
        loadCustomers(supabase),
        // Only drafts need the catalogue (for "+ Add model").
        draft ? loadInvoiceModels(supabase) : Promise.resolve([]),
      ]);
      data = { invoice, lines, company, customers, models };
    }
  } catch (error) {
    console.error("Loading the invoice failed:", error);
    return (
      <p role="alert" className="mt-4 text-red-700">
        Sorry, the invoice couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  if (!data) {
    return <p className="mt-4 text-neutral-600">That invoice doesn’t exist (it may have been deleted).</p>;
  }

  return (
    <InvoiceView
      // Start afresh when it's finalised or reopened (a different page).
      key={`${data.invoice.id}:${data.invoice.status}`}
      {...data}
      emailReady={isEmailConfigured()}
    />
  );
}
