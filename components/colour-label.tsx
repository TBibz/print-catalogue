// The one way a colour is shown everywhere: a solid vertical stripe of the
// material's true colour, then its name in normal text. Very light colours
// get a thin grey outline so they show on a white page.
import { isLightColour } from "@/lib/colours";

export function ColourStripe({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[1.2em] w-1.5 shrink-0 rounded-[2px] ${
        isLightColour(hex) ? "ring-1 ring-neutral-400 ring-inset" : ""
      }`}
      style={{ backgroundColor: hex }}
    />
  );
}

export function ColourLabel({
  hex,
  name,
  note,
}: {
  hex: string; // the material's colour_hex
  name: string; // what to show, e.g. "Black"
  note?: string; // e.g. "out of stock"
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle whitespace-nowrap text-neutral-900">
      <ColourStripe hex={hex} />
      <span>{name}</span>
      {note && <span className="text-xs text-neutral-500">({note})</span>}
    </span>
  );
}
