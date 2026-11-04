// The app's customisable colours (Settings → Colours): row highlights,
// table headers, the invoice document and the urgency pills.
//
// They're stored in settings under colour_ keys (0021_theme_colours.sql),
// which everyone logged in can read and only the admin can change. The app
// layout turns them into CSS variables (components/theme-style.tsx), so a
// change shows everywhere at once; the invoice PDF reads them directly.
// Each colour's default is the colour the app used before.
import { textColourOn } from "@/lib/colours";

export type ThemeGroup = "rows" | "headers" | "urgency";

export const THEME_COLOURS = [
  // Row highlights. When more than one applies, the first wins:
  // printing > new > requested > alternate stripe.
  { key: "colour_row_printing", group: "rows", label: "Currently printing", help: "Models on a plate that's printing now.", defaultValue: "#dbeafe" },
  { key: "colour_row_new", group: "rows", label: "New models", help: "Models with the NEW badge.", defaultValue: "#fef7d7" },
  { key: "colour_row_requested", group: "rows", label: "Requested", help: "Catalogue and Models rows with an open request.", defaultValue: "#e3f5e8" },
  { key: "colour_row_alt", group: "rows", label: "Alternate rows", help: "Every other row in tables.", defaultValue: "#f3f1f8" },
  // Table headers (the sticky row of column names).
  { key: "colour_head_catalogue", group: "headers", label: "Catalogue header", help: "", defaultValue: "#3b2a5c" },
  { key: "colour_head_queue", group: "headers", label: "Queue header", help: "", defaultValue: "#3b2a5c" },
  { key: "colour_head_models", group: "headers", label: "Models header", help: "", defaultValue: "#3b2a5c" },
  { key: "colour_head_builder", group: "headers", label: "Invoice builder header", help: "Also the invoices list.", defaultValue: "#3b2a5c" },
  { key: "colour_head_reports", group: "headers", label: "Reports header", help: "Also the Reports chart bars.", defaultValue: "#3b2a5c" },
  { key: "colour_invoice", group: "headers", label: "Invoice document", help: "The header row and Grand Total box on the invoice page and PDF.", defaultValue: "#3b2a5c" },
  // Urgency pills.
  { key: "colour_urgency_asap", group: "urgency", label: "ASAP pill", help: "", defaultValue: "#9f0712" },
  { key: "colour_urgency_priority", group: "urgency", label: "PRIORITY pill", help: "", defaultValue: "#dcfce7" },
] as const satisfies readonly { key: string; group: ThemeGroup; label: string; help: string; defaultValue: string }[];

export type ThemeKey = (typeof THEME_COLOURS)[number]["key"];
export type Theme = Record<ThemeKey, string>;

export const isThemeKey = (key: string): key is ThemeKey => THEME_COLOURS.some((c) => c.key === key);
export const isHexColour = (value: string) => /^#[0-9a-f]{6}$/.test(value);

export const DEFAULT_THEME = Object.fromEntries(THEME_COLOURS.map((c) => [c.key, c.defaultValue])) as Theme;

// The theme from settings rows ({ key: value }); anything missing or not a
// "#rrggbb" colour falls back to its default.
export function themeFrom(settings: Record<string, string>): Theme {
  return Object.fromEntries(
    THEME_COLOURS.map((c) => {
      const v = (settings[c.key] ?? "").trim().toLowerCase();
      return [c.key, isHexColour(v) ? v : c.defaultValue];
    }),
  ) as Theme;
}

// CSS variable for a colour: colour_head_queue → --colour-head-queue.
// Headers, the invoice and pills also get a "-text" variable: white or dark,
// whichever reads better on the colour.
export const cssVar = (key: ThemeKey) => `--${key.replace(/_/g, "-")}`;

// The CSS that sets every variable, e.g. ":root{--colour-row-new:#fef7d7;…}".
export function themeCss(theme: Theme) {
  const vars = THEME_COLOURS.map((c) => {
    const hex = theme[c.key];
    const text = c.group === "rows" ? "" : `${cssVar(c.key)}-text:${textColourOn(hex)};`;
    return `${cssVar(c.key)}:${hex};${text}`;
  });
  return `:root{${vars.join("")}}`;
}
