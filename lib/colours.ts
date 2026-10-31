// Colour choices for request lines (categories with colour options, e.g.
// BASES). A colour is a filament from Materials; null means "Any colour".
// A material's true colour is materials.colour_hex (set with a colour
// picker on the Materials page), the only source of colour in the app.

// A row from colour_options() (0016): names, colour and stock only,
// so the requester can read it.
export type ColourOption = {
  id: string;
  name: string; // e.g. "PLA Black"
  colour: string; // e.g. "Black"
  colour_hex: string; // e.g. "#111111"
  available: boolean; // offered as a colour, in stock and in use
  in_stock: boolean;
};

export const ANY_COLOUR = "Any colour";
export const DEFAULT_COLOUR_HEX = "#9ca3af"; // neutral grey

// What to call a colour in a dropdown or list.
export const colourName = (option: { name: string; colour: string }) => option.colour || option.name;

// True for very light colours (e.g. white), which need an outline to show
// up on a white page. Uses the colour's relative luminance (0 = black,
// 1 = white), worked out from the hex.
export function isLightColour(hex: string) {
  return luminance(hex) > 0.8;
}

// Relative luminance of a "#rrggbb" colour (WCAG formula).
function luminance(hex: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return 0;
  const [r, g, b] = match.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Dark or white text, whichever reads better on this background colour
// (the one with the higher contrast ratio).
export function textColourOn(hex: string) {
  const l = luminance(hex);
  const contrastWithWhite = 1.05 / (l + 0.05);
  const contrastWithDark = (l + 0.05) / 0.0601; // #171717
  return contrastWithWhite >= contrastWithDark ? "#ffffff" : "#171717";
}

// The colour at low strength, for a light tint behind something selected.
export const tint = (hex: string, alpha = 0.18) =>
  `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
