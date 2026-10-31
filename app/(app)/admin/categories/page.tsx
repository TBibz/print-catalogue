import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCategories, loadModelCountsByCategory } from "@/lib/data";
import { CategoriesList } from "./categories-list";

export const metadata: Metadata = { title: "Categories · Print Catalogue" };

export default function CategoriesPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Categories</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading categories…</p>}>
        <CategoriesData />
      </Suspense>
    </>
  );
}

async function CategoriesData() {
  await requireAdmin();
  const supabase = await createClient();

  let data = null;
  try {
    const [categories, modelCounts] = await Promise.all([
      loadCategories(supabase),
      loadModelCountsByCategory(supabase),
    ]);
    data = { categories, modelCounts };
  } catch (error) {
    console.error("Loading categories failed:", error);
  }

  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the categories couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <CategoriesList {...data} />;
}
