// Types and rules for request lines, shared by the catalogue and the queue.
import { naturalCollator } from "@/lib/catalogue";

// Listed in the order they appear in the dropdown (blank first).
export const URGENCIES = ["PRIORITY", "URGENT", "ASAP"] as const;
export type Urgency = (typeof URGENCIES)[number];

export function isUrgency(value: unknown): value is Urgency {
  return URGENCIES.includes(value as Urgency);
}

// A row from the request_lines table.
export type RequestLineRow = {
  id: string;
  model_id: string;
  scale: string | null; // null = the model's default scale
  quantity: number;
  urgency: Urgency | null;
  note: string;
  created_at: string;
  updated_at: string;
};

// What the pages work with: the row plus how many are currently printing.
export type RequestLine = RequestLineRow & {
  // Sum of quantity_planned on this line's items in printing jobs.
  // Nobody can set the quantity below this.
  printing: number;
};

export const REQUEST_LINE_COLUMNS =
  "id, model_id, scale, quantity, urgency, note, created_at, updated_at";

// Pill colours, matching the old sheet (brief section 5).
export const URGENCY_STYLES: Record<Urgency | "none", string> = {
  ASAP: "bg-red-800 text-white border-red-800",
  URGENT: "bg-pink-100 text-red-800 border-pink-200",
  PRIORITY: "bg-green-100 text-green-800 border-green-200",
  none: "bg-white text-neutral-500 border-neutral-300",
};

// Queue order: ASAP → URGENT → PRIORITY → none, then code in natural order.
const URGENCY_RANK: Record<Urgency, number> = { ASAP: 0, URGENT: 1, PRIORITY: 2 };

export function compareQueue(
  a: { urgency: Urgency | null; code: string },
  b: { urgency: Urgency | null; code: string },
) {
  const rank = (u: Urgency | null) => (u ? URGENCY_RANK[u] : 3);
  return rank(a.urgency) - rank(b.urgency) || naturalCollator.compare(a.code, b.code);
}

// All the sizes a model can be requested in. `null` stands for the default.
export function scaleOptions(model: {
  default_scale: string | null;
  other_scales: string[];
}) {
  const others = model.other_scales.filter((s) => s && s !== model.default_scale);
  return [null, ...others] as (string | null)[];
}

// What to show for a scale value (null = the model's default).
export function scaleLabel(scale: string | null, defaultScale: string | null) {
  return scale ?? defaultScale ?? "Standard";
}
