// Types and helpers for printers, materials and settings (admin only).

export type MaterialType = "resin" | "fdm";
export type MaterialUnit = "ml" | "g";

export const TYPE_LABELS: Record<MaterialType, string> = {
  resin: "Resin",
  fdm: "Filament",
};

// Resin is measured in ml, filament in g.
export const unitFor = (type: MaterialType): MaterialUnit => (type === "resin" ? "ml" : "g");

// Prices are shown per 1000 units (per litre / per kg): easier to read and
// type than tiny per-gram amounts, and it matches how packs are sold.
export const per1000Label = (unit: MaterialUnit) => (unit === "g" ? "per kg" : "per litre");

export type Printer = {
  id: string;
  name: string;
  type: MaterialType;
  active: boolean;
  created_at: string;
};

export const PRINTER_COLUMNS = "id, name, type, active, created_at";

export type Material = {
  id: string;
  type: MaterialType;
  name: string;
  colour: string;
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
  "id, type, name, colour, unit, pack_size, pack_cost, cost_per_unit, charge_per_unit, charge_overridden, in_stock, offer_as_colour, active, created_at, updated_at";

// The charge a material gets unless it's set by hand (see 0006 migration).
export const DEFAULT_CHARGE_MULTIPLIER = 2;

export function formatGBP(value: number) {
  return `£${Number(value).toFixed(2)}`;
}

// The settings the app knows about, with how to show them.
export const SETTINGS = [
  {
    key: "resin_charge_divisor",
    label: "Resin charge divisor",
    help: "A resin print is charged at its estimated weight in grams divided by this number.",
    defaultValue: "15",
  },
] as const;

export type SettingKey = (typeof SETTINGS)[number]["key"];
