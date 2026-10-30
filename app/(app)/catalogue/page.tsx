import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CatalogueModel, Category } from "@/lib/catalogue";
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

// Loads every category and visible model once. Filtering and search then
// happen in the browser (there are only about 1,000 models).
async function CatalogueData() {
  const supabase = await createClient();

  const [categoriesResult, models] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order, has_colour_options")
      .returns<Category[]>(),
    loadAllModels(supabase),
  ]);

  if (categoriesResult.error || models === null) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the catalogue couldn’t be loaded. Please refresh the page.
      </p>
    );
  }

  return <CatalogueView categories={categoriesResult.data} models={models} />;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Supabase returns at most 1,000 rows per request, so read in pages.
async function loadAllModels(supabase: Supabase) {
  const pageSize = 1000;
  const all: CatalogueModel[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("catalogue_models")
      .select(
        "id, code, code_key, name, category_id, default_scale, other_scales, availability, image_path, show_new_badge",
      )
      .neq("availability", "hidden") // retired models stay out of the catalogue
      .order("code")
      .range(from, from + pageSize - 1)
      .returns<CatalogueModel[]>();

    if (error) {
      console.error("Loading models failed:", error.message);
      return null;
    }
    all.push(...data);
    if (data.length < pageSize) return all;
  }
}
