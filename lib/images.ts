// Model images: where they live, how they're shrunk and uploaded.

export const IMAGE_BUCKET = "model-images";

// Longest side after shrinking. Big enough for the grid and hover preview
// on a sharp screen, small enough to load ~700 of them quickly.
const MAX_SIZE = 1000;

// The public address of an image (paths are random, see 0005_images.sql).
export function imageUrl(path: string | null) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
}

// File name → the same key the database uses to match codes:
// lower case, spaces removed, extension dropped ("SW 001.PNG" → "sw001").
export function codeKeyFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/ /g, "").toLowerCase();
}

// Shrinks an image so its longest side is at most MAX_SIZE, on a white
// background (renders are on white, and this flattens any transparency).
// Saves as WebP, or JPEG on browsers that can't make WebP.
export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process images.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const webp = await toBlob("image/webp", 0.85);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg", 0.88);
  if (!jpeg) throw new Error("Couldn't convert the image.");
  return jpeg;
}

// A new, unguessable path for a model's image. A fresh path on every upload
// means browsers never show an old cached picture after a replace.
export function newImagePath(modelId: string, blob: Blob) {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return `${modelId}/${Date.now()}.${ext}`;
}

// Checks a path looks like one newImagePath() made for this model.
export function isValidImagePath(modelId: string, path: string) {
  return new RegExp(`^${modelId}/\\d+\\.(webp|jpg)$`).test(path);
}
