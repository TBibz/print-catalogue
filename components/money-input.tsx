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
  compact = false,
}: {
  value: string; // as typed
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string; // aria-label, when there's no visible <label>
  id?: string;
  allowNegative?: boolean;
  className?: string; // width
  compact?: boolean; // 30px high with 14px text, for table rows
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
        className={`${compact ? "h-7.5 py-1 text-sm" : "h-11 py-2 text-base"} w-full rounded-md border bg-white pr-2.5 pl-6 text-right tabular-nums outline-none focus:ring-1 ${
          invalid
            ? "border-red-600 focus:ring-red-600"
            : "border-neutral-300 focus:border-neutral-900 focus:ring-neutral-900"
        }`}
      />
    </div>
  );
}
