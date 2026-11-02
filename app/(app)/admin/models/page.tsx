import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAdminModels, loadCategories, loadModelPrinting, loadPrintTotals, loadRequestLines } from "@/lib/data";
import { ModelsList } from "./models-list";

export const metadata: Metadata = { title: "Models · Print Catalogue" };

export default function ModelsPage() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Models</h1>
        <Link href="/admin/upload" className="text-sm text-neutral-700 underline hover:no-underline">
          Upload images in bulk
        </Link>
      </div>
      <Suspense fallback={<p className="text-neutral-500">Loading models…</p>}>
        <ModelsData />
      </Suspense>
    </>
  );
}

async function ModelsData() {
  await requireAdmin();
  const supabase = await createClient();

  let data = null;
  try {
    const [categories, models, lines, printTotals, modelPrinting] = await Promise.all([
      loadCategories(supabase),
      loadAdminModels(supabase),
      loadRequestLines(supabase),
      loadPrintTotals(supabase),
      loadModelPrinting(supabase),
    ]);
    // How many open request lines each model has (shown when deleting).
    const requestCounts: Record<string, number> = {};
    for (const line of lines) {
      requestCounts[line.model_id] = (requestCounts[line.model_id] ?? 0) + 1;
    }
    data = { categories, models, requestCounts, printTotals, modelPrinting };
  } catch (error) {
    console.error("Loading models failed:", error);
  }

  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the models couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <ModelsList {...data} />;
}
