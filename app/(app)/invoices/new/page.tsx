import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadCategories, loadCategoryCounts } from "@/lib/data";
import { loadInvoiceModels } from "@/lib/invoice-data";
import { InvoiceBuilder } from "./invoice-builder";

export const metadata: Metadata = { title: "New invoice · Print Catalogue" };

export default function NewInvoicePage() {
  return (
    <>
      <Link href="/invoices" className="text-sm text-neutral-600 hover:underline">
        ← Invoices
      </Link>
      <h1 className="mt-1 mb-1 text-2xl font-semibold">New invoice</h1>
      <p className="mb-4 text-neutral-600">
        Type how many of each model, then press <strong>Generate invoice</strong> at the bottom.
      </p>
      <Suspense fallback={<p className="text-neutral-500">Loading the catalogue…</p>}>
        <BuilderData />
      </Suspense>
    </>
  );
}

async function BuilderData() {
  const supabase = await createClient();
  let data = null;
  try {
    const [categories, models, categoryCounts] = await Promise.all([
      loadCategories(supabase),
      loadInvoiceModels(supabase),
      loadCategoryCounts(supabase),
    ]);
    data = { categories, models, categoryCounts };
  } catch (error) {
    console.error("Loading the invoice builder failed:", error);
  }
  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the catalogue couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <InvoiceBuilder {...data} />;
}
