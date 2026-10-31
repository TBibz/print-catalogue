import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  loadCategories,
  loadColourOptions,
  loadModels,
  loadPrintTotals,
  loadRequestLines,
} from "@/lib/data";
import { CatalogueView } from "./catalogue-view";

export const metadata: Metadata = { title: "Catalogue · Print Catalogue" };

export default function CataloguePage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Catalogue</h1>
      {/* Loading the data needs the login cookie, so it streams in here. */}
      <Suspense fallback={<p className="text-neutral-500">Loading catalogue…</p>}>
        <CatalogueData />
      </Suspense>
    </>
  );
}

// Loads every category, visible model and request line once. Filtering,
// search and editing then happen in the browser (about 1,000 models).
async function CatalogueData() {
  const supabase = await createClient();

  let data;
  try {
    const [categories, models, lines, printTotals, colours] = await Promise.all([
      loadCategories(supabase),
      loadModels(supabase),
      loadRequestLines(supabase),
      loadPrintTotals(supabase),
      loadColourOptions(supabase),
    ]);
    data = { categories, models, lines, printTotals, colours };
  } catch (error) {
    console.error("Loading the catalogue failed:", error);
    data = null;
  }

  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the catalogue couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <CatalogueView {...data} />;
}
