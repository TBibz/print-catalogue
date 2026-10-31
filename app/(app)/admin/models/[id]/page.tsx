import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/data";
import { ADMIN_MODEL_COLUMNS, type AdminModel } from "@/lib/catalogue";
import { ModelForm } from "../model-form";

export const metadata: Metadata = { title: "Edit model · Print Catalogue" };

export default function EditModelPage({ params }: PageProps<"/admin/models/[id]">) {
  return (
    <>
      <Link href="/admin/models" className="text-sm text-neutral-600 hover:underline">
        ← All models
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading…</p>}>
        <EditModelForm params={params} />
      </Suspense>
    </>
  );
}

async function EditModelForm({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [categories, { data: model }] = await Promise.all([
    loadCategories(supabase),
    supabase.from("models").select(ADMIN_MODEL_COLUMNS).eq("id", id).maybeSingle<AdminModel>(),
  ]);

  if (!model) {
    return <p className="mt-4 text-neutral-600">That model doesn’t exist (it may have been removed).</p>;
  }

  return (
    <>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">
        Edit <span className="font-mono">{model.code}</span>
      </h1>
      {/* key: start fresh if the model changed since this page was last open */}
      <ModelForm key={model.updated_at} model={model} categories={categories} />
    </>
  );
}
