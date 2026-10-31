import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAdminModels } from "@/lib/data";
import { BulkUpload, type UploadModel } from "./bulk-upload";

export const metadata: Metadata = { title: "Upload images · Print Catalogue" };

export default function UploadPage() {
  return (
    <>
      <Link href="/admin/models" className="text-sm text-neutral-600 hover:underline">
        ← Models
      </Link>
      <h1 className="mt-2 mb-2 text-2xl font-semibold">Upload images</h1>
      <p className="mb-6 max-w-2xl text-neutral-600">
        Choose image files named by model code (for example <span className="font-mono">SW001.png</span>
        ). Capitals and spaces don’t matter. Nothing uploads until you’ve checked the list and
        pressed Upload.
      </p>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <UploadData />
      </Suspense>
    </>
  );
}

async function UploadData() {
  await requireAdmin();
  const models = await loadAdminModels(await createClient());
  const slim: UploadModel[] = models.map((m) => ({
    id: m.id,
    code: m.code,
    code_key: m.code_key,
    name: m.name,
    image_path: m.image_path,
  }));
  return <BulkUpload models={slim} />;
}
