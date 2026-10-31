"use client";

// One material row while it is being edited (or added). Same idea as the
// model editor: main fields in the row's columns, Save where Edit was, the
// rest in a panel underneath.

import { formatMoney, formatMoneyInput, parseMoney } from "@/lib/money";
import { MoneyInput } from "@/components/money-input";
import { useEffect, useState, useTransition } from "react";
import { deleteMaterial, saveMaterial, type MaterialInput } from "@/app/actions/materials";
import {
  DEFAULT_CHARGE_MULTIPLIER,
  per1000Label,
  TYPE_LABELS,
  unitFor,
  type Material,
  type MaterialType,
} from "@/lib/materials";
import { DEFAULT_COLOUR_HEX } from "@/lib/colours";
import { ColourLabel } from "@/components/colour-label";

// Column widths shared by the list rows and the editor (md screens and up).
export const MATERIAL_GRID =
  "md:grid-cols-[minmax(0,1fr)_7rem_8rem_7rem_9rem_4.5rem_6rem]";

const box =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

// Numbers are kept as typed text in the form.
const num = (n: number) => String(Number(n));

function inputFrom(m: Material | null): MaterialInput {
  return {
    id: m?.id ?? null,
    type: m?.type ?? "fdm",
    name: m?.name ?? "",
    colour: m?.colour ?? "",
    colourHex: m?.colour_hex ?? DEFAULT_COLOUR_HEX,
    packSize: m ? num(m.pack_size) : "1000",
    packCost: m ? formatMoneyInput(m.pack_cost) : "",
    chargePer1000: m ? formatMoneyInput(m.charge_per_unit * 1000) : "",
    chargeOverridden: m?.charge_overridden ?? false,
    inStock: m?.in_stock ?? true,
    offerAsColour: m?.offer_as_colour ?? false,
    active: m?.active ?? true,
  };
}

export function MaterialEditor({
  material,
  onSaved,
  onDeleted,
  onCancel,
  onDirtyChange,
}: {
  material: Material | null; // null = adding a new one
  onSaved: (material: Material) => void;
  onDeleted: (material: Material) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [original] = useState(() => inputFrom(material));
  const [values, setValues] = useState(original);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(values) !== JSON.stringify(original);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function set<K extends keyof MaterialInput>(key: K, value: MaterialInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (error?.field === key) setError(null);
  }

  const unit = unitFor(values.type);
  // What the charge would be at 2 × cost, per kg / litre.
  const packSize = Number(values.packSize);
  const packCost = parseMoney(values.packCost) ?? NaN;
  const defaultCharge =
    packSize > 0 && packCost >= 0
      ? (DEFAULT_CHARGE_MULTIPLIER * packCost * 1000) / packSize
      : null;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveMaterial(values);
      if (!result.ok) setError({ message: result.error, field: result.field });
      else onSaved(result.material);
    });
  }

  function remove() {
    if (!material) return;
    startTransition(async () => {
      const result = await deleteMaterial(material.id);
      if (!result.ok) {
        setConfirmingDelete(false);
        setError({ message: result.error });
      } else onDeleted(material);
    });
  }

  const fieldError = (field: keyof MaterialInput) =>
    error?.field === field ? (
      <p role="alert" className="mt-1 text-sm text-red-700">
        {error.message}
      </p>
    ) : null;
  const fieldLabel = "mb-1 block text-xs font-medium text-neutral-600 md:sr-only";

  return (
    <li className="border-y-2 border-neutral-900 bg-neutral-50 px-3 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div className={`grid grid-cols-1 gap-3 md:items-start md:gap-4 ${MATERIAL_GRID}`}>
          <div>
            <label htmlFor="mat-name" className={fieldLabel}>
              Name
            </label>
            <input
              id="mat-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. PLA Black"
              autoComplete="off"
              autoFocus={!material}
              className={box}
            />
            {fieldError("name")}
          </div>
          <div>
            <label htmlFor="mat-type" className={fieldLabel}>
              Type
            </label>
            <select
              id="mat-type"
              value={values.type}
              onChange={(e) => set("type", e.target.value as MaterialType)}
              className={`${box} cursor-pointer text-sm`}
            >
              {(Object.keys(TYPE_LABELS) as MaterialType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mat-pack-size" className={fieldLabel}>
              Pack size ({unit})
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="mat-pack-size"
                inputMode="decimal"
                value={values.packSize}
                onChange={(e) => set("packSize", e.target.value.replace(/[^0-9.]/g, ""))}
                className={`${box} text-sm`}
              />
              <span className="text-sm text-neutral-600">{unit}</span>
            </div>
            {fieldError("packSize")}
          </div>
          <div>
            <label htmlFor="mat-pack-cost" className={fieldLabel}>
              Pack price (£)
            </label>
            <MoneyInput
              id="mat-pack-cost"
              value={values.packCost}
              onChange={(v) => set("packCost", v)}
              className="w-full"
            />
            {fieldError("packCost")}
          </div>
          <div>
            <span className={fieldLabel}>Charge {per1000Label(unit)}</span>
            {values.chargeOverridden ? (
              <>
                <label htmlFor="mat-charge" className="sr-only">
                  Charge {per1000Label(unit)} (£)
                </label>
                <MoneyInput
                  id="mat-charge"
                  value={values.chargePer1000}
                  onChange={(v) => set("chargePer1000", v)}
                  className="w-full"
                />
                <button
                  type="button"
                  onClick={() => set("chargeOverridden", false)}
                  className="mt-1 text-xs text-neutral-600 underline hover:no-underline"
                >
                  Use {DEFAULT_CHARGE_MULTIPLIER} × cost
                </button>
              </>
            ) : (
              <>
                <p className="py-2 text-sm">
                  {defaultCharge === null ? "—" : formatMoney(defaultCharge)}{" "}
                  <span className="text-xs text-neutral-500">({DEFAULT_CHARGE_MULTIPLIER} × cost)</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    set("chargeOverridden", true);
                    if (defaultCharge !== null) set("chargePer1000", formatMoneyInput(defaultCharge));
                  }}
                  className="text-xs text-neutral-600 underline hover:no-underline"
                >
                  Set by hand
                </button>
              </>
            )}
            {fieldError("chargePer1000")}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm md:pt-2.5">
            <input
              type="checkbox"
              checked={values.inStock}
              onChange={(e) => set("inStock", e.target.checked)}
              className="h-5 w-5 accent-neutral-900"
            />
            <span className="md:sr-only">In stock</span>
          </label>
          <div className="flex gap-2 md:flex-col">
            <button
              type="submit"
              disabled={pending || (material !== null && !dirty)}
              className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {pending ? "Saving…" : material ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>

        {error && !error.field && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-red-800">
            {error.message}
          </p>
        )}

        {/* ---- Panel ----------------------------------------------------- */}
        <div className="mt-4 grid gap-5 border-t border-neutral-200 pt-4 lg:grid-cols-3">
          <section>
            <label htmlFor="mat-colour" className="mb-2 block text-sm font-medium text-neutral-700">
              Colour
            </label>
            <div className="flex max-w-xs items-center gap-2">
              <input
                type="color"
                aria-label="Pick the colour"
                value={values.colourHex}
                onChange={(e) => set("colourHex", e.target.value)}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-neutral-300 bg-white p-1"
              />
              <input
                id="mat-colour"
                value={values.colour}
                onChange={(e) => set("colour", e.target.value)}
                placeholder="Colour name, e.g. Black"
                autoComplete="off"
                className={`${box} text-sm`}
              />
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Shown as:{" "}
              <ColourLabel hex={values.colourHex} name={values.colour.trim() || values.name.trim() || "Colour"} />
            </p>
            {fieldError("colour")}
            {fieldError("colourHex")}
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={values.offerAsColour}
                onChange={(e) => set("offerAsColour", e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-neutral-900"
              />
              <span>
                Offer as a colour choice
                <span className="block text-neutral-600">
                  For categories with colour options, like BASES.
                </span>
              </span>
            </label>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-neutral-700">Retire</h3>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={!values.active}
                onChange={(e) => set("active", !e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-neutral-900"
              />
              <span>
                Retired
                <span className="block text-neutral-600">
                  Kept for history, but not offered for new print jobs.
                </span>
              </span>
            </label>
          </section>

          {material && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-neutral-700">Delete</h3>
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete this material…
                </button>
              ) : (
                <div role="alertdialog" aria-label="Confirm delete" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
                  <p className="text-red-900">
                    Delete {material.name} for good? This can’t be undone. To keep it for
                    history, tick “Retired” instead.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={remove}
                      disabled={pending}
                      className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      {pending ? "Deleting…" : "Yes, delete permanently"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={pending}
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </form>
    </li>
  );
}
