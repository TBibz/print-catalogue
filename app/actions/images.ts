"use server";

// Linking image files to models. The files themselves are uploaded from the
// browser (lib/upload-image.ts); these update the model and tidy old files.
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET, isValidImagePath } from "@/lib/images";

export type ImageResult = { ok: true } | { ok: false; error: string };

export async function setModelImage(modelId: string, path: string): Promise<ImageResult> {
  await requireAdmin();
  if (!isValidImagePath(modelId, path)) return { ok: false, error: "Invalid image path." };
  return replaceImage(modelId, path);
}

export async function removeModelImage(modelId: string): Promise<ImageResult> {
  await requireAdmin();
  return replaceImage(modelId, null);
}

async function replaceImage(modelId: string, path: string | null): Promise<ImageResult> {
  const supabase = await createClient();

  const { data: before, error: readError } = await supabase
    .from("models")
    .select("image_path")
    .eq("id", modelId)
    .maybeSingle<{ image_path: string | null }>();
  if (readError || !before) {
    return { ok: false, error: "That model no longer exists. Refresh the page." };
  }

  const { error } = await supabase.from("models").update({ image_path: path }).eq("id", modelId);
  if (error) {
    console.error("models image_path:", error.message);
    return { ok: false, error: "Couldn't save. Please check your connection and try again." };
  }

  // Remove the old file. If this fails the image still changed; the old
  // file just stays behind unused, so it isn't worth an error.
  if (before.image_path && before.image_path !== path) {
    const { error: removeError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .remove([before.image_path]);
    if (removeError) console.error("image remove:", removeError.message);
  }
  return { ok: true };
}
