import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/data";
import { ModelForm } from "../model-form";

export const metadata: Metadata = { title: "Add model · Print Catalogue" };

export default function NewModelPage() {
  return (
    <>
      <Link href="/admin/models" className="text-sm text-neutral-600 hover:underline">
        ← All models
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Add a model</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <NewModelForm />
      </Suspense>
    </>
  );
}

async function NewModelForm() {
  await requireAdmin();
  const categories = await loadCategories(await createClient());
  return <ModelForm model={null} categories={categories} />;
}
