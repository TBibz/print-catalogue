import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadCustomers, loadInvoiceList } from "@/lib/invoice-data";
import { InvoicesList } from "./invoices-list";
import { CustomersSection } from "./customers-section";

export const metadata: Metadata = { title: "Invoices · Print Catalogue" };

// Both roles. Invoices and customers are shared by both accounts.
export default function InvoicesPage() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Link
          href="/invoices/new"
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-base font-medium text-white hover:bg-neutral-700"
        >
          + New invoice
        </Link>
      </div>
      <Suspense fallback={<p className="text-neutral-500">Loading invoices…</p>}>
        <InvoicesData />
      </Suspense>
    </>
  );
}

async function InvoicesData() {
  const supabase = await createClient();
  let data = null;
  try {
    const [invoices, customers] = await Promise.all([loadInvoiceList(supabase), loadCustomers(supabase)]);
    data = { invoices, customers };
  } catch (error) {
    console.error("Loading invoices failed:", error);
  }
  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the invoices couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return (
    <>
      <InvoicesList invoices={data.invoices} />
      <CustomersSection customers={data.customers} />
    </>
  );
}
