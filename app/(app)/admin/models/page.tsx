import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAdminModels, loadCategories } from "@/lib/data";
import { ModelsList } from "./models-list";

export const metadata: Metadata = { title: "Models · Print Catalogue" };

export default function ModelsPage() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Models</h1>
        <Link
          href="/admin/models/new"
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-700"
        >
          + Add model
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
    const [categories, models] = await Promise.all([
      loadCategories(supabase),
      loadAdminModels(supabase),
    ]);
    data = { categories, models };
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
