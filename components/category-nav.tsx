"use client";

// The catalogue's category sidebar button and small category tag, shared
// with the invoice builder so both look the same.
import { ColourStripe } from "@/components/colour-label";
import { isLightColour, textColourOn } from "@/lib/colours";

// A category in the sidebar. Selected: filled with the category's colour,
// with dark or white text (whichever reads better on it). Unselected: a
// small stripe of its colour. "All" has no colour and goes black.
export function CategoryButton({
  label,
  count,
  selected,
  colour,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  colour?: string; // "#rrggbb"; none for "All"
  onClick: () => void;
}) {
  const filled = selected && colour ? { backgroundColor: colour, color: textColourOn(colour) } : undefined;
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      style={filled}
      title={label}
      className={`flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
        selected
          ? colour
            ? `font-medium ${isLightColour(colour) ? "ring-1 ring-neutral-300 ring-inset" : ""}`
            : "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      {/* Always one line: a name too long for the sidebar ends in "…" (full
          name on hover). */}
      <span className="flex min-w-0 items-center gap-1.5">
        {colour && !selected && <ColourStripe hex={colour} />}
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span className={`shrink-0 tabular-nums ${selected ? "opacity-70" : "text-neutral-400"}`}>{count}</span>
    </button>
  );
}

// A small category tag: its colour stripe and name.
export function CategoryTag({ name, colour }: { name: string; colour: string }) {
  return (
    <span className="inline-flex max-w-[8rem] min-w-0 shrink-0 items-center gap-1 text-xs text-neutral-600" title={name}>
      <ColourStripe hex={colour} />
      <span className="truncate">{name}</span>
    </span>
  );
}
