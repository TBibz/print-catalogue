"use server";

// Categories (admin only: RLS only lets the admin change them, and
// requireAdmin() checks first for a clear message).
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/catalogue";

export type CategoryInput = {
  id: string | null; // null = a new category
  name: string;
  sortOrder: string;
  hasColourOptions: boolean;
};

type Fail = { ok: false; error: string };

export async function saveCategory(
  input: CategoryInput,
): Promise<{ ok: true; category: Category } | Fail> {
  await requireAdmin();
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const sortText = String(input.sortOrder ?? "").trim();
  const sortOrder = sortText === "" ? 0 : Number(sortText);

  if (!name) return { ok: false, error: "Please enter a name." };
  if (name.length > 60) return { ok: false, error: "Names can be at most 60 characters." };
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) {
    return { ok: false, error: "The sort order must be a whole number, e.g. 10." };
  }

  const supabase = await createClient();
  const values = { name, sort_order: sortOrder, has_colour_options: Boolean(input.hasColourOptions) };
  const query = input.id
    ? supabase.from("categories").update(values).eq("id", input.id)
    : supabase.from("categories").insert(values);
  const { data, error } = await query
    .select("id, name, sort_order, has_colour_options")
    .maybeSingle<Category>();
  if (error) {
    console.error("categories:", error.message);
    if (error.code === "23505") return { ok: false, error: "Another category already has this name." };
    return { ok: false, error: "Couldn't save. Please check your connection and try again." };
  }
  if (!data) return { ok: false, error: "This category no longer exists. Refresh the page." };
  return { ok: true, category: data };
}

export async function deleteCategory(id: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) {
    console.error("categories delete:", error.message);
    // 23503: models still point at it (the database refuses).
    if (error.code === "23503") {
      return { ok: false, error: "This category still has models, so it can't be deleted. Move them first." };
    }
    return { ok: false, error: "Couldn't delete. Please check your connection and try again." };
  }
  return { ok: true };
}
