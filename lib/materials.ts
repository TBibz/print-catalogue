// Types and helpers for printers, materials and settings (admin only).

export type MaterialType = "resin" | "fdm";
export type MaterialUnit = "ml" | "g";

export const TYPE_LABELS: Record<MaterialType, string> = {
  resin: "Resin",
  fdm: "Filament",
};

// Filament is measured in g. Resin is bought by weight, so new resins are g
// too (0025); older resins may still be in ml until changed on the
// Materials page. New resin print jobs need a resin measured in g.
export const unitsFor = (type: MaterialType): MaterialUnit[] => (type === "resin" ? ["g", "ml"] : ["g"]);
// The unit a new material starts with.
export const unitFor = (type: MaterialType): MaterialUnit => unitsFor(type)[0];

// Prices are shown per 1000 units (per litre / per kg): easier to read and
// type than tiny per-gram amounts, and it matches how packs are sold.
export const per1000Label = (unit: MaterialUnit) => (unit === "g" ? "per kg" : "per litre");

export type Printer = {
  id: string;
  name: string;
  type: MaterialType;
  active: boolean;
  colour_hex: string; // shown in Start print and on the Jobs page
  created_at: string;
};

export const PRINTER_COLUMNS = "id, name, type, active, colour_hex, created_at";

export type Material = {
  id: string;
  type: MaterialType;
  name: string;
  colour: string;
  colour_hex: string; // e.g. "#111111", picked on the Materials page
  unit: MaterialUnit;
  pack_size: number;
  pack_cost: number;
  cost_per_unit: number;
  charge_per_unit: number;
  charge_overridden: boolean;
  in_stock: boolean;
  offer_as_colour: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export const MATERIAL_COLUMNS =
  "id, type, name, colour, colour_hex, unit, pack_size, pack_cost, cost_per_unit, charge_per_unit, charge_overridden, in_stock, offer_as_colour, active, created_at, updated_at";

// The charge a material gets unless it's set by hand (see 0006 migration).
export const DEFAULT_CHARGE_MULTIPLIER = 2;


// The settings the app knows about, with how to show them.
// kind "number" settings are short number boxes; "text" ones are wide.
// The company_ ones are printed at the top of every invoice (0019) and can
// be read by both roles.
export const SETTINGS = [
  {
    key: "resin_charge_divisor",
    label: "Resin charge divisor",
    help: "A resin print is charged at its estimated weight in grams divided by this number. Saving a new number also recalculates the charge on every printing and completed resin job (not ones typed by hand or not charged).",
    defaultValue: "15",
    kind: "number",
  },
  {
    key: "company_name",
    label: "Company name (on invoices)",
    help: "Large and bold at the top left of every invoice.",
    defaultValue: "Alexanders Toy Soldiers",
    kind: "text",
  },
  {
    key: "company_address_1",
    label: "Address line 1",
    help: "Top right of every invoice.",
    defaultValue: "14 Constance Road",
    kind: "text",
  },
  {
    key: "company_address_2",
    label: "Address line 2",
    help: "Leave blank to skip this line.",
    defaultValue: "Twickenham",
    kind: "text",
  },
  {
    key: "company_address_3",
    label: "Address line 3",
    help: "Leave blank to skip this line.",
    defaultValue: "TW2 7HY",
    kind: "text",
  },
  {
    key: "company_phone",
    label: "Phone",
    help: "Shown as “Tel: …” on invoices.",
    defaultValue: "020-8894-5925",
    kind: "text",
  },
  {
    key: "company_email",
    label: "Email",
    help: "Shown on invoices, and replies to invoice emails go here.",
    defaultValue: "nik@ats-uk.net",
    kind: "text",
  },
] as const;

export type SettingKey = (typeof SETTINGS)[number]["key"];
