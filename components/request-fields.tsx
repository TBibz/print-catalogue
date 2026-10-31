"use client";

// The controls for one request line, used by the catalogue and the queue.
import { URGENCIES, URGENCY_STYLES, scaleLabel, type Urgency } from "@/lib/requests";
import type { SaveStatus } from "@/lib/use-line-autosave";

// Every control in a request row is the same height (h-11, 44px), so the
// quantity, urgency, note and size boxes line up.
const ROW_HEIGHT = "h-11";

const box = `${ROW_HEIGHT} rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900`;

export function QuantityInput({
  value,
  label,
  onChange,
  onBlur,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder="Qty"
      value={value}
      // Digits only, so stray letters never reach the save.
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${box} w-full text-center tabular-nums`}
    />
  );
}

export function UrgencySelect({
  value,
  label,
  onChange,
}: {
  value: Urgency | null;
  label: string;
  onChange: (value: Urgency | null) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Urgency | null)}
      className={`${ROW_HEIGHT} w-full cursor-pointer rounded-full border px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1 ${URGENCY_STYLES[value ?? "none"]}`}
    >
      <option value="" className="bg-white text-neutral-900">
        —
      </option>
      {URGENCIES.map((u) => (
        <option key={u} value={u} className="bg-white text-neutral-900">
          {u}
        </option>
      ))}
    </select>
  );
}

export function UrgencyPill({ value }: { value: Urgency | null }) {
  if (!value) return null;
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${URGENCY_STYLES[value]}`}
    >
      {value}
    </span>
  );
}

export function NoteInput({
  value,
  label,
  onChange,
  onBlur,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <input
      type="text"
      aria-label={label}
      placeholder="Note"
      maxLength={1000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${box} w-full`}
    />
  );
}

export function ScaleSelect({
  value,
  options,
  defaultScale,
  disabledOptions,
  label,
  onChange,
}: {
  value: string | null;
  options: (string | null)[];
  defaultScale: string | null;
  disabledOptions: (string | null)[]; // sizes another line already uses
  label: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${box} w-full cursor-pointer text-sm`}
    >
      {options.map((s) => (
        <option key={s ?? ""} value={s ?? ""} disabled={disabledOptions.includes(s)}>
          {scaleLabel(s, defaultScale)}
        </option>
      ))}
    </select>
  );
}

export function SaveStatusText({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  switch (status.kind) {
    case "saving":
      return <span className="text-neutral-500">Saving…</span>;
    case "saved":
      return <span className="text-green-700">Saved ✓</span>;
    case "hint":
      return <span className="text-neutral-500">{status.message}</span>;
    case "error":
      return (
        <span role="alert" className="text-red-700">
          {status.message}{" "}
          <button type="button" onClick={onRetry} className="underline hover:no-underline">
            Retry
          </button>
        </span>
      );
    default:
      return null;
  }
}
