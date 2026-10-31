import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPrinters } from "@/lib/data";
import { PrintersList } from "./printers-list";

export const metadata: Metadata = { title: "Printers · Print Catalogue" };

export default function PrintersPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Printers</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading printers…</p>}>
        <PrintersData />
      </Suspense>
    </>
  );
}

async function PrintersData() {
  await requireAdmin();
  const supabase = await createClient();
  let printers;
  try {
    printers = await loadPrinters(supabase);
  } catch (error) {
    console.error("Loading printers failed:", error);
    return (
      <p role="alert" className="text-red-700">
        Sorry, the printers couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <PrintersList printers={printers} />;
}
