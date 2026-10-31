import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MATERIAL_COLUMNS, type Material } from "@/lib/materials";
import { MaterialsList } from "./materials-list";

export const metadata: Metadata = { title: "Materials · Print Catalogue" };

export default function MaterialsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Materials</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading materials…</p>}>
        <MaterialsData />
      </Suspense>
    </>
  );
}

async function MaterialsData() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select(MATERIAL_COLUMNS)
    .order("type")
    .order("name")
    .returns<Material[]>();

  if (error) {
    console.error("Loading materials failed:", error.message);
    return (
      <p role="alert" className="text-red-700">
        Sorry, the materials couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <MaterialsList materials={data} />;
}
