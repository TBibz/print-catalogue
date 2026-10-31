// A small round colour swatch with the colour's name, e.g. "● Black".
import { swatchBackground } from "@/lib/colours";

export function ColourChip({
  colour,
  name,
  note,
}: {
  colour: string; // the material's colour, e.g. "Black"
  name: string; // what to show
  note?: string; // e.g. "out of stock"
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-neutral-400"
        style={{ background: swatchBackground(colour) }}
      />
      {name}
      {note && <span className="text-xs text-neutral-500">({note})</span>}
    </span>
  );
}
