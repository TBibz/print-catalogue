// Types and rules for request lines, shared by the catalogue and the queue.
import { naturalCollator } from "@/lib/catalogue";

// Listed in the order they appear in the dropdown (blank first).
export const URGENCIES = ["PRIORITY", "ASAP"] as const;
export type Urgency = (typeof URGENCIES)[number];

export function isUrgency(value: unknown): value is Urgency {
  return URGENCIES.includes(value as Urgency);
}

// A row from the request_lines table.
export type RequestLineRow = {
  id: string;
  model_id: string;
  scale: string | null; // null = the model's default scale
  colour_material_id: string | null; // null = any colour
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
  "id, model_id, scale, colour_material_id, quantity, urgency, note, created_at, updated_at";

// Pill colours from Settings → Colours (lib/theme.ts), text white or dark to
// suit. Written out in full so Tailwind finds the classes.
export const URGENCY_STYLES: Record<Urgency | "none", string> = {
  ASAP: "bg-[var(--colour-urgency-asap)] text-[var(--colour-urgency-asap-text)] border-[var(--colour-urgency-asap)]",
  PRIORITY:
    "bg-[var(--colour-urgency-priority)] text-[var(--colour-urgency-priority-text)] border-[var(--colour-urgency-priority)]",
  none: "bg-white text-neutral-500 border-neutral-300",
};

// Queue order: ASAP → PRIORITY → none, then code in natural order.
const URGENCY_RANK: Record<Urgency, number> = { ASAP: 0, PRIORITY: 1 };

export function compareQueue(
  a: { urgency: Urgency | null; code: string },
  b: { urgency: Urgency | null; code: string },
) {
  const rank = (u: Urgency | null) => (u ? URGENCY_RANK[u] : 2);
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
