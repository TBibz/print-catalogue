// Money: how amounts are shown and typed everywhere in the app.
//   Shown:  "£1,234.56", negatives as "−£12.34" (a real minus sign).
//   Typed:  just the number ("12", "12.5", "1,200"); the £ is fixed in the box.

const twoDecimals = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Rounds to whole pence (half up), avoiding floating-point slips like 1.005.
export const toPence = (value: number) => Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;

// "£1,234.56" / "−£12.34" / "£0.00".
export function formatMoney(value: number | string | null | undefined) {
  const n = toPence(Number(value) || 0);
  const text = `£${twoDecimals.format(Math.abs(n))}`;
  return n < 0 ? `−${text}` : text;
}

// The number as it sits in a £ box: "1,234.56" (no £, two decimals).
export function formatMoneyInput(value: number | string | null | undefined) {
  const n = toPence(Number(value) || 0);
  return `${n < 0 ? "-" : ""}${twoDecimals.format(Math.abs(n))}`;
}

// Reads what was typed in a £ box. Accepts "12", "12.5", "1,200", "£3.40"
// and (when allowed) "-5". Returns the amount in pounds rounded to pence,
// null for a blank box, or NaN if it isn't a valid amount.
export function parseMoney(text: string, { allowNegative = false } = {}): number | null {
  const cleaned = String(text ?? "").replace(/[£,\s]/g, "").replace(/^−/, "-");
  if (cleaned === "") return null;
  const pattern = allowNegative ? /^-?(\d+(\.\d*)?|\.\d+)$/ : /^(\d+(\.\d*)?|\.\d+)$/;
  if (!pattern.test(cleaned)) return NaN;
  return toPence(Number(cleaned));
}

// Text colour for an amount that can go either way (differences, totals).
export function moneyTone(value: number) {
  const n = toPence(value);
  if (n < 0) return "text-red-700";
  if (n > 0) return "text-green-700";
  return "text-neutral-500";
}
