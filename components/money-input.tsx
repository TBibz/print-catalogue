"use client";

// A £ box: the "£" is fixed inside on the left and only the number is typed.
// Accepts "12", "12.5" or "1,200"; when you leave the box it tidies the
// number to two decimals with separators ("1,200.00").
import { formatMoneyInput, parseMoney } from "@/lib/money";

export function MoneyInput({
  value,
  onChange,
  onBlur,
  label,
  id,
  allowNegative = false,
  className = "w-32",
}: {
  value: string; // as typed
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string; // aria-label, when there's no visible <label>
  id?: string;
  allowNegative?: boolean;
  className?: string; // width
}) {
  const invalid = Number.isNaN(parseMoney(value, { allowNegative }));
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-neutral-500">
        £
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(allowNegative ? /[^0-9.,\-−]/g : /[^0-9.,]/g, ""))}
        onBlur={() => {
          const n = parseMoney(value, { allowNegative });
          if (n !== null && !Number.isNaN(n)) onChange(formatMoneyInput(n));
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`h-11 w-full rounded-md border bg-white py-2 pr-2.5 pl-6 text-right text-base tabular-nums outline-none focus:ring-1 ${
          invalid
            ? "border-red-600 focus:ring-red-600"
            : "border-neutral-300 focus:border-neutral-900 focus:ring-neutral-900"
        }`}
      />
    </div>
  );
}
