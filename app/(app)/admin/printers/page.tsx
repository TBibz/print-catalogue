import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRINTER_COLUMNS, type Printer } from "@/lib/materials";
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
  const { data, error } = await supabase
    .from("printers")
    .select(PRINTER_COLUMNS)
    .order("created_at")
    .returns<Printer[]>();

  if (error) {
    console.error("Loading printers failed:", error.message);
    return (
      <p role="alert" className="text-red-700">
        Sorry, the printers couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <PrintersList printers={data} />;
}
