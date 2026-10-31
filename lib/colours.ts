// Colour choices for request lines (categories with colour options, e.g.
// BASES). A colour is a filament from Materials; null means "Any colour".

// A row from the colour_options view (0010_colours.sql): names and stock
// only, so the requester can read it.
export type ColourOption = {
  id: string;
  name: string; // e.g. "PLA Black"
  colour: string; // e.g. "Black"
  available: boolean; // offered as a colour, in stock and in use
  in_stock: boolean;
};

export const ANY_COLOUR = "Any colour";

// What to call a colour in a dropdown or list.
export const colourName = (option: Pick<ColourOption, "name" | "colour">) =>
  option.colour || option.name;

// A CSS colour for the little swatch, from the material's colour name.
// Common filament names are mapped by hand; anything else is tried as a
// CSS colour name ("Sky Blue" → "skyblue"), and the swatch's border keeps
// it visible if the browser doesn't know it.
const SWATCHES: Record<string, string> = {
  black: "#111111",
  white: "#ffffff",
  grey: "#9ca3af",
  gray: "#9ca3af",
  silver: "#c0c0c0",
  red: "#dc2626",
  orange: "#f97316",
  yellow: "#facc15",
  green: "#16a34a",
  blue: "#2563eb",
  "sky blue": "#7dd3fc",
  purple: "#9333ea",
  pink: "#f472b6",
  brown: "#92400e",
  gold: "#d4a017",
  marble: "linear-gradient(135deg, #f5f5f4 0%, #d6d3d1 35%, #f5f5f4 55%, #a8a29e 100%)",
};

export function swatchBackground(colour: string) {
  const key = colour.trim().toLowerCase();
  return SWATCHES[key] ?? key.replace(/\s+/g, "");
}
