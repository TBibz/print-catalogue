// The invoice layout's measurements, shared by the on-screen sheet
// (components/invoice-sheet.tsx) and the PDF (lib/invoice-pdf.tsx), so the
// two look the same. Sizes are in points (pt): A4 is 595 × 842 pt, and
// CSS understands pt too.

export const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 40,
  marginTop: 40,
  marginBottom: 56, // room for "Page X of Y"
};

export const FONT = {
  company: 22, // company name, top left
  contact: 9, // address, phone, email, top right
  label: 8, // small capitals labels ("INVOICE NUMBER", table headings)
  value: 11, // invoice number and date
  totalLabel: 9,
  total: 18, // the grand total
  body: 9.5, // table lines
  footer: 8,
};

export const COLOURS = {
  text: "#171717",
  muted: "#525252",
  line: "#d4d4d4",
  // The header row and Grand Total box use the "Invoice document" colour
  // from Settings → Colours (lib/theme.ts), not a fixed colour.
  zebra: "#f3f1f8", // the app's soft lavender
  watermark: "#9ca3af",
};

// The table's columns, as fractions of the table width. Money columns are
// right-aligned.
export const COLUMNS = [
  { key: "code", label: "PRODUCT CODE", width: 0.16, align: "left" },
  { key: "item", label: "ITEM", width: 0.41, align: "left" },
  { key: "amount", label: "AMOUNT", width: 0.1, align: "right" },
  { key: "each", label: "PRICE PER ITEM", width: 0.18, align: "right" },
  { key: "total", label: "TOTAL PRICE", width: 0.15, align: "right" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

export const ROW = {
  padY: 5, // pt above and below each table line
  padX: 6,
  headerPadY: 6,
};
