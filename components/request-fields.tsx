"use client";

// The controls for one request line, used by the catalogue and the queue.
import { ColourStripe } from "@/components/colour-label";
import { ANY_COLOUR, colourName, type ColourOption } from "@/lib/colours";
import { URGENCIES, URGENCY_STYLES, scaleLabel, type Urgency } from "@/lib/requests";
import type { SaveStatus } from "@/lib/use-line-autosave";

// Every control in a request row is the same height (h-7.5, 30px: as
// compact as the old spreadsheet), so the quantity, urgency, colour, size
// and note boxes line up. Text stays at 14px.
const ROW_HEIGHT = "h-7.5";

// Border, height and focus ring, without horizontal padding: each control
// sets its own left/right padding (mixing px- with pl-/pr- on one element
// lets whichever comes later in the CSS win, which is how the colour
// stripe ended up over the text).
const frame = `${ROW_HEIGHT} rounded-md border border-neutral-300 bg-white py-1 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900`;
const box = `${frame} px-2.5 text-sm`;

// Size and colour dropdowns draw their own arrow (appearance-none), because
// some browsers ignore the padding of a native-looking <select>.
const selectBox = `${frame} w-full cursor-pointer appearance-none pr-8 text-sm disabled:cursor-not-allowed disabled:bg-neutral-100`;

// Left padding of a dropdown's text (and where the colour box's overlay
// starts), so text in every box lines up.
const TEXT_LEFT = "pl-2.5";
const STRIPE_LEFT = "left-2.5";

function SelectArrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-neutral-500"
    >
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

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
      className={`${ROW_HEIGHT} w-full cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1 ${URGENCY_STYLES[value ?? "none"]}`}
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
  roomOnRight = false,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  roomOnRight?: boolean; // leave space for "Saved ✓" shown inside the box
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
      className={`${frame} w-full pl-2.5 text-sm ${roomOnRight ? "pr-20" : "pr-2.5"}`}
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
  locked = false,
}: {
  value: string | null;
  options: (string | null)[];
  defaultScale: string | null;
  disabledOptions: (string | null)[]; // sizes another line already uses
  label: string;
  onChange: (value: string | null) => void;
  locked?: boolean; // true while some are printing: the size can't change
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={locked}
        title={locked ? "Some are being printed, so the size can't be changed" : undefined}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${selectBox} ${TEXT_LEFT}`}
      >
        {options.map((s) => (
          <option key={s ?? ""} value={s ?? ""} disabled={disabledOptions.includes(s)}>
            {scaleLabel(s, defaultScale)}
          </option>
        ))}
      </select>
      <SelectArrow />
    </div>
  );
}

// "Any colour" plus every filament offered as a colour. Out-of-stock ones
// are listed (with "(out of stock)") but greyed out and can't be picked,
// except by a line that already uses one (it keeps showing it).
//
// The closed box shows the chosen colour drawn over the native <select>
// (whose own text is made transparent): its stripe, then its name, which
// is grey italic if it's out of stock (tooltip "Out of stock") and cut
// short with "…" if it's very long. The open list is the browser's own and
// keeps the full wording.
export function ColourSelect({
  value,
  options,
  disabledOptions,
  label,
  onChange,
  locked = false,
}: {
  value: string | null; // null = any colour
  options: ColourOption[];
  disabledOptions: (string | null)[]; // colours another line already uses
  label: string;
  onChange: (value: string | null) => void;
  locked?: boolean; // true while some are printing: the colour can't change
}) {
  const current = options.find((o) => o.id === value);
  const shownName = current ? colourName(current) : ANY_COLOUR;
  const unavailable = current && !current.available;
  const status = unavailable ? (current.in_stock ? "No longer offered" : "Out of stock") : null;
  const tooltip = [status ?? shownName, locked ? "Some are being printed, so the colour can't be changed" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={locked}
        title={tooltip}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${selectBox} ${TEXT_LEFT} text-transparent`}
      >
        <option value="" disabled={disabledOptions.includes(null)} className="text-neutral-900">
          {ANY_COLOUR}
        </option>
        {options.map((o) => {
          const mine = o.id === value;
          return (
            <option
              key={o.id}
              value={o.id}
              disabled={disabledOptions.includes(o.id) || (!o.available && !mine)}
              className="text-neutral-900"
            >
              {colourName(o)}
              {o.available ? "" : o.in_stock ? " (no longer offered)" : " (out of stock)"}
            </option>
          );
        })}
      </select>
      {/* What the closed box shows (laid over the select, clicks go through). */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 ${STRIPE_LEFT} right-8 flex min-w-0 items-center gap-1.5 text-sm`}
      >
        {current && <ColourStripe hex={current.colour_hex} />}
        <span className={`truncate ${unavailable ? "text-neutral-400 italic" : "text-neutral-900"}`}>
          {shownName}
        </span>
      </span>
      <SelectArrow />
    </div>
  );
}

// The small "+" right of a size or colour dropdown that adds another line
// for the same model (in another size or colour).
export function AddLineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${ROW_HEIGHT} w-7 shrink-0 rounded-md border border-neutral-300 bg-white text-base leading-none text-neutral-600 hover:border-neutral-500 hover:bg-neutral-100 hover:text-neutral-900`}
    >
      +
    </button>
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
