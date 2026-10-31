"use server";

// Categories (admin only: RLS only lets the admin change them, and
// requireAdmin() checks first for a clear message).
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/catalogue";

export type CategoryInput = {
  id: string | null; // null = a new category
  name: string;
  hasColourOptions: boolean;
  colourHex: string; // "#rrggbb"
};

type Fail = { ok: false; error: string };

export async function saveCategory(
  input: CategoryInput,
): Promise<{ ok: true; category: Category } | Fail> {
  await requireAdmin();
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");

  if (!name) return { ok: false, error: "Please enter a name." };
  if (name.length > 60) return { ok: false, error: "Names can be at most 60 characters." };
  const colourHex = String(input.colourHex ?? "").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(colourHex)) return { ok: false, error: "Pick a colour." };

  const supabase = await createClient();
  const values = { name, has_colour_options: Boolean(input.hasColourOptions), colour_hex: colourHex };
  let query;
  if (input.id) {
    query = supabase.from("categories").update(values).eq("id", input.id);
  } else {
    // A new category goes at the end of the order.
    const { data: last } = await supabase
      .from("categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    query = supabase.from("categories").insert({ ...values, sort_order: (last?.sort_order ?? 0) + 1 });
  }
  const { data, error } = await query
    .select("id, name, sort_order, has_colour_options, colour_hex")
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

// Saves the order shown on the Categories page: positions 1, 2, 3… in the
// order of `ids` (one database call, see 0011_colour_hex_category_order.sql).
export async function reorderCategories(ids: string[]): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_categories", { p_ids: ids });
  if (error) {
    console.error("reorder_categories:", error.message);
    return { ok: false, error: "Couldn't save the new order. Please try again." };
  }
  return { ok: true };
}

// Sets the default scale on a category's models in one step (see
// 0015_bulk_default_scale.sql). With dryRun it changes nothing and just
// says how many models would change.
export async function setCategoryDefaultScale(input: {
  categoryId: string;
  scale: string;
  onlyUnset: boolean;
  addScales: string[];
  dryRun: boolean;
}): Promise<{ ok: true; count: number } | Fail> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_category_default_scale", {
    p_category_id: input.categoryId,
    p_scale: input.scale,
    p_only_unset: input.onlyUnset,
    p_add_scales: input.addScales,
    p_dry_run: input.dryRun,
  });
  if (error) {
    console.error("set_category_default_scale:", error.message);
    // P0001: a message from the function, e.g. "Enter a scale, e.g. 70mm."
    return { ok: false, error: error.code === "P0001" ? error.message : "Couldn't update the models. Please try again." };
  }
  return { ok: true, count: Number(data) || 0 };
}
