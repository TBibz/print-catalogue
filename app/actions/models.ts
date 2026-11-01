"use server";

// Adding and editing models (admin only: RLS on the models table only
// allows the admin, and requireAdmin() checks first for a clear message).
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_MODEL_COLUMNS, type AdminModel, type Availability } from "@/lib/catalogue";
import { IMAGE_BUCKET } from "@/lib/images";

export type ModelInput = {
  id: string | null; // null = a new model
  code: string;
  name: string;
  categoryId: string;
  defaultScale: string;
  otherScales: string[];
  availability: Availability;
  showNewBadge: boolean;
  adminNotes: string;
};

// `field` says which box the error belongs to, so the form can show it there.
export type ModelResult =
  | { ok: true; model: AdminModel }
  | { ok: false; error: string; field?: keyof ModelInput };

export type DeleteModelResult = { ok: true } | { ok: false; error: string };

const AVAILABILITIES: Availability[] = ["available", "coming_soon", "hidden"];

export async function saveModel(input: ModelInput): Promise<ModelResult> {
  await requireAdmin();

  // ---- Check everything again on the server -----------------------------
  const code = String(input.code ?? "").trim().replace(/\s+/g, " ");
  const name = String(input.name ?? "").trim();
  const defaultScale = String(input.defaultScale ?? "").trim() || null;
  const adminNotes = String(input.adminNotes ?? "").trim() || null;

  if (!code) return { ok: false, field: "code", error: "Please enter a code." };
  if (code.length > 30) return { ok: false, field: "code", error: "Codes can be at most 30 characters." };
  if (!name) return { ok: false, field: "name", error: "Please enter a name." };
  if (name.length > 200) return { ok: false, field: "name", error: "Names can be at most 200 characters." };
  if (!input.categoryId) return { ok: false, field: "categoryId", error: "Please choose a category." };
  if (defaultScale && defaultScale.length > 20) {
    return { ok: false, field: "defaultScale", error: "Sizes can be at most 20 characters." };
  }
  if (!AVAILABILITIES.includes(input.availability)) {
    return { ok: false, field: "availability", error: "Please choose an availability." };
  }
  if (adminNotes && adminNotes.length > 2000) {
    return { ok: false, field: "adminNotes", error: "Notes can be at most 2000 characters." };
  }

  // Tidy the extra sizes: trimmed, no blanks, no repeats, not the default.
  const otherScales: string[] = [];
  for (const raw of input.otherScales ?? []) {
    const s = String(raw).trim();
    if (!s || s === defaultScale || otherScales.includes(s)) continue;
    if (s.length > 20) {
      return { ok: false, field: "otherScales", error: "Sizes can be at most 20 characters." };
    }
    otherScales.push(s);
  }

  const values = {
    code,
    name,
    category_id: input.categoryId,
    default_scale: defaultScale,
    other_scales: otherScales,
    availability: input.availability,
    show_new_badge: Boolean(input.showNewBadge),
    admin_notes: adminNotes,
  };

  // ---- Save ------------------------------------------------------------
  const supabase = await createClient();
  const query = input.id
    ? supabase.from("models").update(values).eq("id", input.id)
    : supabase.from("models").insert(values);
  const { data, error } = await query.select(ADMIN_MODEL_COLUMNS).maybeSingle<AdminModel>();

  if (error) {
    console.error("models:", error.message);
    if (error.code === "23505") {
      // Unique code, or a code that only differs by case/spaces (code_key).
      return {
        ok: false,
        field: "code",
        error: "Another model already uses this code (ignoring capitals and spaces).",
      };
    }
    if (error.code === "23503") {
      return { ok: false, field: "categoryId", error: "That category no longer exists." };
    }
    return { ok: false, error: "Couldn't save. Please check your connection and try again." };
  }
  if (!data) return { ok: false, error: "This model no longer exists. Refresh the page." };

  return { ok: true, model: data };
}

// Deletes a model for good, along with its open request lines (the
// database does that part, see 0004_model_delete.sql).
export async function deleteModel(id: string): Promise<DeleteModelResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    .delete()
    .eq("id", id)
    .select("id, image_path")
    .maybeSingle<{ id: string; image_path: string | null }>();

  if (error) {
    console.error("models delete:", error.message);
    if (error.code === "P0001") {
      // Its open requests are being printed (see 0008_print_jobs.sql).
      return { ok: false, error: "Some of this model is being printed, so it can't be deleted. Retire it instead." };
    }
    if (error.code === "23503") {
      // Something still points at it: print history, or
      // open requests if 0004_model_delete.sql hasn't been run yet.
      return {
        ok: false,
        error: "This model is still in use (requests or print history), so it can't be deleted. Retire it instead.",
      };
    }
    return { ok: false, error: "Couldn't delete. Please check your connection and try again." };
  }
  if (!data) return { ok: false, error: "This model was already deleted. Refresh the page." };

  // Remove its image file too (not fatal if this fails).
  if (data.image_path) {
    const { error: removeError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .remove([data.image_path]);
    if (removeError) console.error("image remove:", removeError.message);
  }
  return { ok: true };
}

// ---- Prices (0018_urgency_prices.sql) ---------------------------------------

type PriceFail = { ok: false; error: string };

function priceError(error: { code?: string; message: string }, what: string): PriceFail {
  console.error(`${what}:`, error.message);
  // P0001: a message from the database function, e.g. "Enter a price, e.g. 12.50."
  if (error.code === "P0001") return { ok: false, error: error.message };
  return { ok: false, error: "Couldn't save the price. Please check your connection and try again." };
}

// One model's price, from the Price box on the Models page (autosaves).
// null clears it ("no price set").
export async function setModelPrice(
  id: string,
  price: number | null,
): Promise<{ ok: true; price: number | null } | PriceFail> {
  await requireAdmin();
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) {
    return { ok: false, error: "Enter a price between £0 and £100,000." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    .update({ price: price === null ? null : Math.round(price * 100) / 100 })
    .eq("id", id)
    .select("price")
    .maybeSingle<{ price: number | null }>();
  if (error) return priceError(error, "models price");
  if (!data) return { ok: false, error: "This model no longer exists. Refresh the page." };
  return { ok: true, price: data.price === null ? null : Number(data.price) };
}

// The same price on several models in one step (set_models_price). With
// dryRun it changes nothing and just says how many would change.
export async function setModelsPrice(input: {
  modelIds: string[];
  price: number;
  onlyUnset: boolean;
  dryRun: boolean;
}): Promise<{ ok: true; count: number } | PriceFail> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_models_price", {
    p_model_ids: input.modelIds,
    p_price: input.price,
    p_only_unset: input.onlyUnset,
    p_dry_run: input.dryRun,
  });
  if (error) return priceError(error, "set_models_price");
  return { ok: true, count: Number(data) || 0 };
}
