// Types and rules for print jobs (admin only), shared by the queue's
// "Start print" panel and the jobs page.
import type { CatalogueModel, Category } from "@/lib/catalogue";
import type { Material, MaterialType, Printer } from "@/lib/materials";
import { formatMoneyInput, parseMoney } from "@/lib/money";

export type JobStatus = "printing" | "completed" | "cancelled";

export type JobItem = {
  id: string;
  model_id: string | null;
  free_text_name: string | null;
  request_line_id: string | null;
  from_request: boolean;
  scale: string | null;
  colour_material_id: string | null; // null = any colour
  quantity_planned: number;
  quantity_succeeded: number | null;
  quantity_applied_to_request: number;
  // From the models table (null for free-text items).
  models: { code: string; name: string; default_scale: string | null } | null;
};

export type Job = {
  id: string;
  printer_id: string;
  title: string;
  status: JobStatus;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  notes: string;
  est_material_ml: number | null;
  est_weight_g: number | null;
  print_hours: number | null;
  print_minutes: number | null;
  est_cost: number | null;
  layer_height_mm: number | null;
  material_id: string | null;
  my_cost: number;
  my_cost_overridden: boolean;
  charge: number;
  charge_overridden: boolean;
  chargeable: boolean; // false = not charged to Dad (charge always 0; 0024)
  print_job_items: JobItem[];
};

export const JOB_COLUMNS = `
  id, printer_id, title, status, started_at, completed_at, cancelled_at, notes,
  est_material_ml, est_weight_g, print_hours, print_minutes, est_cost,
  layer_height_mm, material_id, my_cost, my_cost_overridden, charge, charge_overridden, chargeable,
  print_job_items (
    id, model_id, free_text_name, request_line_id, from_request, scale, colour_material_id,
    quantity_planned, quantity_succeeded, quantity_applied_to_request,
    models ( code, name, default_scale )
  )`;

export const DEFAULT_LAYER_HEIGHT = "0.05";
export const DEFAULT_RESIN_DIVISOR = 15;

// ---- The job details form ---------------------------------------------------
// Kept as typed text, so boxes can be blank. The database checks it all again
// (pj_set_details in 0008_print_jobs.sql).

export type JobForm = {
  printerId: string;
  title: string;
  notes: string;
  estMaterialMl: string;
  estWeightG: string;
  printHours: string;
  printMinutes: string;
  estCost: string;
  layerHeightMm: string;
  materialId: string;
  myCost: string;
  myCostOverridden: boolean;
  charge: string;
  chargeOverridden: boolean;
  chargeable: boolean; // "Charge Dad for this job"
};

export const emptyJobForm = (): JobForm => ({
  printerId: "",
  title: "",
  notes: "",
  estMaterialMl: "",
  estWeightG: "",
  printHours: "",
  printMinutes: "",
  estCost: "",
  layerHeightMm: DEFAULT_LAYER_HEIGHT,
  materialId: "",
  myCost: "",
  myCostOverridden: false,
  charge: "",
  chargeOverridden: false,
  chargeable: true,
});

const text = (n: number | null) => (n === null || n === undefined ? "" : String(Number(n)));

export function jobFormFrom(job: Job): JobForm {
  return {
    printerId: job.printer_id,
    title: job.title,
    notes: job.notes,
    estMaterialMl: text(job.est_material_ml),
    estWeightG: text(job.est_weight_g),
    printHours: text(job.print_hours),
    printMinutes: text(job.print_minutes),
    estCost: job.est_cost === null ? "" : formatMoneyInput(job.est_cost),
    layerHeightMm: text(job.layer_height_mm) || DEFAULT_LAYER_HEIGHT,
    materialId: job.material_id ?? "",
    myCost: formatMoneyInput(job.my_cost),
    myCostOverridden: job.my_cost_overridden,
    charge: formatMoneyInput(job.charge),
    chargeOverridden: job.charge_overridden,
    chargeable: job.chargeable,
  };
}

// A £ box's text as the database expects it ("1,200.00" → "1200"); left as
// typed if it isn't a valid amount, so the database's own message shows.
function moneyForDb(text: string) {
  const n = parseMoney(text);
  return n === null || Number.isNaN(n) ? text : String(n);
}

// What gets sent to the database functions as "details".
export function detailsFrom(form: JobForm) {
  return {
    title: form.title,
    notes: form.notes,
    est_material_ml: form.estMaterialMl,
    est_weight_g: form.estWeightG,
    print_hours: form.printHours,
    print_minutes: form.printMinutes,
    est_cost: moneyForDb(form.estCost),
    layer_height_mm: form.layerHeightMm,
    material_id: form.materialId,
    my_cost: moneyForDb(form.myCost),
    my_cost_overridden: form.myCostOverridden,
    charge: moneyForDb(form.charge),
    charge_overridden: form.chargeOverridden,
    // Not charged to Dad: the database sets the charge to 0 (0024).
    chargeable: form.chargeable,
  };
}

// ---- Money (brief section 5) ------------------------------------------------
// The database works this out too (pj_refresh_money); this copy is only for
// showing the numbers live while typing.
//   resin: my cost = the slicer's estimated cost, charge = weight ÷ divisor
//   fdm:   my cost = weight × material cost per g, charge = weight × charge per g
// `noCharge`: cancelled jobs and jobs where nothing succeeded charge 0.
// A job that isn't charged to Dad (form.chargeable false) charges 0 too.
export function calculateMoney(
  form: JobForm,
  printerType: MaterialType | undefined,
  material: Material | undefined,
  divisor: number,
  noCharge = false,
) {
  const weight = Number(form.estWeightG) || 0;
  let myCost = 0;
  let charge = 0;
  if (printerType === "resin") {
    myCost = parseMoney(form.estCost) || 0;
    charge = divisor > 0 ? weight / divisor : 0;
  } else if (printerType === "fdm" && material) {
    myCost = weight * Number(material.cost_per_unit);
    charge = weight * Number(material.charge_per_unit);
  }
  return { myCost: round2(myCost), charge: noCharge || !form.chargeable ? 0 : round2(charge) };
}

// Rounds to pence like the database does (half up). EPSILON stops values
// such as 1.005 (stored as 1.00499999…) rounding down.
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Display helpers ----------------------------------------------------------

// Where a job's items came from:
//   "queue"  every item came from a request line
//   "custom" none did (free-text items and models nobody requested)
//   "mixed"  some did
export type JobKind = "queue" | "custom" | "mixed";

export function jobKind(job: Pick<Job, "print_job_items">): JobKind {
  const fromRequest = job.print_job_items.filter((i) => i.from_request).length;
  if (fromRequest === 0) return "custom";
  return fromRequest === job.print_job_items.length ? "queue" : "mixed";
}

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  queue: "Queue",
  custom: "Custom",
  mixed: "Mixed",
};

export function itemLabel(item: Pick<JobItem, "free_text_name" | "models" | "scale">) {
  if (!item.models) return item.free_text_name ?? "Item";
  const scale = item.scale ?? item.models.default_scale;
  return `${item.models.code} ${item.models.name}${scale ? ` (${scale})` : ""}`;
}

export function printTime(job: Pick<Job, "print_hours" | "print_minutes">) {
  if (job.print_hours === null && job.print_minutes === null) return "";
  return `${job.print_hours ?? 0}h ${String(job.print_minutes ?? 0).padStart(2, "0")}m`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "");

// The date a finished job is listed under: when it was completed or cancelled.
export const finishedAt = (job: Pick<Job, "completed_at" | "cancelled_at" | "started_at">) =>
  job.completed_at ?? job.cancelled_at ?? job.started_at;

// A catalogue model that can be added to a plate without a request
// (the Start print panel's search, on the queue and the Jobs page).
export type PickableModel = {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  default_scale: string | null;
  other_scales: string[];
  hasColourOptions: boolean; // its category offers colours (e.g. BASES)
};

export function pickableModels(models: CatalogueModel[], categories: Category[]): PickableModel[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return models.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    categoryName: byId.get(m.category_id)?.name ?? "",
    default_scale: m.default_scale,
    other_scales: m.other_scales,
    hasColourOptions: byId.get(m.category_id)?.has_colour_options ?? false,
  }));
}

// What the job form needs to know about printers and materials.
export type JobFormOptions = {
  printers: Printer[];
  materials: Material[];
  divisor: number;
};
