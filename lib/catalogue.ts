// Types and rules shared by the catalogue page (and later, admin pages).

export type Availability = "available" | "coming_soon" | "hidden";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  has_colour_options: boolean;
};

// A row from the catalogue_models view (models without admin_notes).
export type CatalogueModel = {
  id: string;
  code: string;
  code_key: string;
  name: string;
  category_id: string;
  default_scale: string | null;
  other_scales: string[];
  availability: Availability;
  image_path: string | null;
  show_new_badge: boolean;
};

// "Natural" order, so SW2 comes before SW10 and case doesn't matter.
export const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

// Catalogue order: category name A→Z, then code in natural order.
export function compareModels(
  a: { code: string; categoryName: string },
  b: { code: string; categoryName: string },
) {
  return (
    naturalCollator.compare(a.categoryName, b.categoryName) ||
    naturalCollator.compare(a.code, b.code)
  );
}

// The NEW badge shows while the flag is on AND fewer than 4 have been printed
// successfully (model_print_totals in 0008_print_jobs.sql).
export const NEW_BADGE_PRINT_LIMIT = 4;

export function showNewBadge(
  model: Pick<CatalogueModel, "show_new_badge">,
  printedTotal = 0,
) {
  return model.show_new_badge && printedTotal < NEW_BADGE_PRINT_LIMIT;
}

// The sizes usually printed. Any other text is allowed too.
export const USUAL_SCALES = ["28mm", "54mm", "60mm", "70mm", "80mm", "100mm"];

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Available",
  coming_soon: "Model Not Ready",
  hidden: "Retired",
};

// A full row from the models table, as only the admin can read it.
export type AdminModel = CatalogueModel & {
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export const ADMIN_MODEL_COLUMNS =
  "id, code, code_key, name, category_id, default_scale, other_scales, availability, image_path, show_new_badge, admin_notes, created_at, updated_at";
