"use client";

// Shrink + upload + link one image to a model. Used by the model editor and
// the bulk upload page.
import { setModelImage } from "@/app/actions/images";
import { createClient } from "@/lib/supabase/client";
import { IMAGE_BUCKET, newImagePath, shrinkImage } from "@/lib/images";

export async function uploadModelImage(
  modelId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  let blob: Blob;
  try {
    blob = await shrinkImage(file);
  } catch {
    return { ok: false, error: "This file couldn't be read as an image." };
  }

  const path = newImagePath(modelId, blob);
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) {
    console.error("image upload:", error.message);
    return { ok: false, error: "Upload failed. Please check your connection and try again." };
  }

  // Point the model at the new file (this also removes the old one).
  const result = await setModelImage(modelId, path);
  if (!result.ok) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path]); // tidy up
    return result;
  }
  return { ok: true, path };
}
