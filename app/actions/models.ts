"use server";

// Adding and editing models (admin only: RLS on the models table only
// allows the admin, and requireAdmin() checks first for a clear message).
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Availability } from "@/lib/catalogue";

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
  | { ok: true; id: string }
  | { ok: false; error: string; field?: keyof ModelInput };

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
  const { data, error } = await query.select("id").maybeSingle<{ id: string }>();

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
  if (!data) return { ok: false, error: "This model no longer exists. Go back to the list." };

  return { ok: true, id: data.id };
}
