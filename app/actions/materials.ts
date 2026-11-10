"use server";

// Printers, materials and settings (admin only: RLS allows only the admin,
// and requireAdmin() checks first for a clear message).
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  MATERIAL_COLUMNS,
  PRINTER_COLUMNS,
  SETTINGS,
  unitsFor,
  type Material,
  type MaterialType,
  type MaterialUnit,
  type Printer,
} from "@/lib/materials";
import { parseMoney } from "@/lib/money";
import { isHexColour, isThemeKey } from "@/lib/theme";

type Fail = { ok: false; error: string; field?: string };
const TYPES: MaterialType[] = ["resin", "fdm"];

// Something else (a print job, or a request in this colour) still uses it.
const IN_USE =
  "This is used by print jobs or requests, so it can't be deleted. Retire it instead.";

function friendly(error: { code?: string; message: string }, what: string): Fail {
  console.error(`${what}:`, error.message);
  if (error.code === "23505") {
    return { ok: false, field: "name", error: `Another ${what} already has this name.` };
  }
  if (error.code === "23503") return { ok: false, error: IN_USE };
  return { ok: false, error: "Couldn't save. Please check your connection and try again." };
}

// ---- Printers ---------------------------------------------------------------

export type PrinterInput = {
  id: string | null;
  name: string;
  type: MaterialType;
  active: boolean;
  colourHex: string; // "#rrggbb"
};

export async function savePrinter(input: PrinterInput): Promise<{ ok: true; printer: Printer } | Fail> {
  await requireAdmin();
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, field: "name", error: "Please enter a name." };
  if (name.length > 100) return { ok: false, field: "name", error: "Names can be at most 100 characters." };
  if (!TYPES.includes(input.type)) return { ok: false, field: "type", error: "Please choose a type." };
  const colourHex = String(input.colourHex ?? "").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(colourHex)) return { ok: false, field: "colourHex", error: "Pick a colour." };

  const supabase = await createClient();
  const values = { name, type: input.type, active: Boolean(input.active), colour_hex: colourHex };
  const query = input.id
    ? supabase.from("printers").update(values).eq("id", input.id)
    : supabase.from("printers").insert(values);
  const { data, error } = await query.select(PRINTER_COLUMNS).maybeSingle<Printer>();
  if (error) return friendly(error, "printer");
  if (!data) return { ok: false, error: "This printer no longer exists. Refresh the page." };
  return { ok: true, printer: data };
}

export async function deletePrinter(id: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("printers").delete().eq("id", id);
  if (error) return friendly(error, "printer");
  return { ok: true };
}

// ---- Materials --------------------------------------------------------------

export type MaterialInput = {
  id: string | null;
  type: MaterialType;
  unit: MaterialUnit; // filament: g; resin: g or ml (0025)
  name: string;
  colour: string;
  colourHex: string; // from the colour picker, e.g. "#111111"
  packSize: string;
  packCost: string;
  // Charge per 1000 units (per kg / per litre). Only used when overridden.
  chargePer1000: string;
  chargeOverridden: boolean;
  inStock: boolean;
  offerAsColour: boolean;
  active: boolean;
};

export async function saveMaterial(
  input: MaterialInput,
): Promise<{ ok: true; material: Material } | Fail> {
  await requireAdmin();

  const name = String(input.name ?? "").trim();
  const colour = String(input.colour ?? "").trim();
  const colourHex = String(input.colourHex ?? "").trim().toLowerCase();
  const packSize = Number(input.packSize);
  // Typed in £ boxes, so they may have separators ("1,200.00").
  const packCost = parseMoney(input.packCost) ?? NaN;
  const charge = parseMoney(input.chargePer1000) ?? NaN;

  if (!TYPES.includes(input.type)) return { ok: false, field: "type", error: "Please choose a type." };
  if (!unitsFor(input.type).includes(input.unit)) {
    return { ok: false, field: "unit", error: "Choose the unit." };
  }
  if (!name) return { ok: false, field: "name", error: "Please enter a name." };
  if (name.length > 100) return { ok: false, field: "name", error: "Names can be at most 100 characters." };
  if (colour.length > 50) return { ok: false, field: "colour", error: "Colours can be at most 50 characters." };
  if (!/^#[0-9a-f]{6}$/.test(colourHex)) {
    return { ok: false, field: "colourHex", error: "Pick a colour." };
  }
  if (!(packSize > 0) || packSize > 100000) {
    return { ok: false, field: "packSize", error: "Enter the pack size, e.g. 1000." };
  }
  if (!(packCost >= 0) || packCost > 100000) {
    return { ok: false, field: "packCost", error: "Enter the pack price in £, e.g. 12.49." };
  }
  if (input.chargeOverridden && (!(charge >= 0) || charge > 100000)) {
    return { ok: false, field: "chargePer1000", error: "Enter the charge in £, e.g. 24.98." };
  }

  const values = {
    type: input.type,
    name,
    colour,
    colour_hex: colourHex,
    unit: input.unit,
    pack_size: packSize,
    pack_cost: Math.round(packCost * 100) / 100,
    charge_overridden: Boolean(input.chargeOverridden),
    // When not overridden, the database sets it to 2 × cost.
    ...(input.chargeOverridden ? { charge_per_unit: charge / 1000 } : {}),
    in_stock: Boolean(input.inStock),
    offer_as_colour: Boolean(input.offerAsColour),
    active: Boolean(input.active),
  };

  const supabase = await createClient();
  const query = input.id
    ? supabase.from("materials").update(values).eq("id", input.id)
    : supabase.from("materials").insert(values);
  const { data, error } = await query.select(MATERIAL_COLUMNS).maybeSingle<Material>();
  if (error) return friendly(error, "material");
  if (!data) return { ok: false, error: "This material no longer exists. Refresh the page." };
  return { ok: true, material: data };
}

// Quick tick box on the list: in stock or not.
export async function setMaterialInStock(
  id: string,
  inStock: boolean,
): Promise<{ ok: true; material: Material } | Fail> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .update({ in_stock: Boolean(inStock) })
    .eq("id", id)
    .select(MATERIAL_COLUMNS)
    .maybeSingle<Material>();
  if (error) return friendly(error, "material");
  if (!data) return { ok: false, error: "This material no longer exists. Refresh the page." };
  return { ok: true, material: data };
}

export async function deleteMaterial(id: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) return friendly(error, "material");
  return { ok: true };
}

// ---- Settings ---------------------------------------------------------------

// What a new resin charge divisor does to existing jobs (0026): the resin
// jobs (printing or completed, charged to Dad, charge not typed by hand)
// whose charge changes, and the total of those charges before and after.
export type DivisorChange = { jobsChanged: number; totalBefore: number; totalAfter: number };

// apply false: dry run, nothing changes. apply true: saves the setting and
// recalculates those charges (est. weight ÷ divisor), in one transaction.
export async function setResinChargeDivisor(
  value: string,
  apply: boolean,
): Promise<{ ok: true; change: DivisorChange } | Fail> {
  await requireAdmin();
  const n = Number(String(value ?? "").trim());
  if (!(n > 0) || n > 10000) return { ok: false, error: "Enter a number above 0, e.g. 15." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("set_resin_charge_divisor", { p_divisor: n, p_apply: apply })
    .single<{ jobs_changed: number; total_before: number; total_after: number }>();
  if (error) {
    console.error("set_resin_charge_divisor:", error.message);
    if (error.code === "P0001") return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't save. Please check your connection and try again." };
  }
  // The Jobs, Reports and Money pages show the new charges straight away.
  if (apply) refresh();
  return {
    ok: true,
    change: {
      jobsChanged: Number(data.jobs_changed),
      totalBefore: Number(data.total_before),
      totalAfter: Number(data.total_after),
    },
  };
}

export async function saveSetting(key: string, value: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  const colour = isThemeKey(key);
  if (!colour && !SETTINGS.some((s) => s.key === key)) return { ok: false, error: "Unknown setting." };

  const trimmed = String(value ?? "").trim();
  if (colour && !isHexColour(trimmed)) return { ok: false, error: "Choose a colour." };
  if (key.startsWith("company_")) {
    if (trimmed.length > 200) return { ok: false, error: "That's too long (200 characters at most)." };
    if (key === "company_name" && !trimmed) return { ok: false, error: "The company name can't be empty." };
    if (key === "company_email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "That doesn't look like an email address." };
    }
  }
  // The divisor also recalculates resin job charges, so it has its own
  // action (setResinChargeDivisor) with a dry run first.
  if (key === "resin_charge_divisor") return { ok: false, error: "Use Save on the resin charge divisor." };

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert({ key, value: trimmed });
  if (error) return friendly(error, "setting");
  // A new colour shows across the app straight away (the layout reloads it).
  if (colour) refresh();
  return { ok: true };
}
