import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAdminModels, loadCategories, loadRequestLines } from "@/lib/data";
import { ModelsList } from "./models-list";

export const metadata: Metadata = { title: "Models · Print Catalogue" };

export default function ModelsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Models</h1>
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
    const [categories, models, lines] = await Promise.all([
      loadCategories(supabase),
      loadAdminModels(supabase),
      loadRequestLines(supabase),
    ]);
    // How many open request lines each model has (shown when deleting).
    const requestCounts: Record<string, number> = {};
    for (const line of lines) {
      requestCounts[line.model_id] = (requestCounts[line.model_id] ?? 0) + 1;
    }
    data = { categories, models, requestCounts };
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
