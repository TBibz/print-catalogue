"use client";

// The colour picker used for materials, categories and printers: the
// browser's own colour chooser in a 44px square. Values are "#rrggbb".
export function ColourPicker({
  value,
  onChange,
  label,
  className = "",
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string; // aria-label, e.g. "Colour of BASES"
  className?: string;
}) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.toLowerCase())}
      className={`h-11 w-14 shrink-0 cursor-pointer rounded-md border border-neutral-300 bg-white p-1 ${className}`}
    />
  );
}
