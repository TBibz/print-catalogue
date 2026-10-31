import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadMaterials } from "@/lib/data";
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
  let materials;
  try {
    materials = await loadMaterials(supabase);
  } catch (error) {
    console.error("Loading materials failed:", error);
    return (
      <p role="alert" className="text-red-700">
        Sorry, the materials couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <MaterialsList materials={materials} />;
}
