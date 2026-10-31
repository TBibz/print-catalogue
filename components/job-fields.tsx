"use client";

// The print job details form, used by "Start print" on the queue and by
// "Edit details" on the jobs page. Choose the printer first; then only the
// fields for that printer type are shown (brief section 4).
import { calculateMoney, type JobForm, type JobFormOptions } from "@/lib/jobs";
import { formatGBP, TYPE_LABELS } from "@/lib/materials";

const box =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

export function JobFields({
  form,
  onChange,
  options,
  noCharge = false,
  idPrefix,
}: {
  form: JobForm;
  onChange: (patch: Partial<JobForm>) => void;
  options: JobFormOptions;
  // true for cancelled jobs and jobs where nothing succeeded: charge 0.
  noCharge?: boolean;
  idPrefix: string;
}) {
  const printer = options.printers.find((p) => p.id === form.printerId);
  // Retired printers only show if this job already uses one.
  const printers = options.printers.filter((p) => p.active || p.id === form.printerId);
  const type = printer?.type;
  // Materials for this printer type that are in use (or already chosen).
  const materials = options.materials.filter(
    (m) => m.type === type && (m.active || m.id === form.materialId),
  );
  const material = materials.find((m) => m.id === form.materialId);
  const money = calculateMoney(form, type, material, options.divisor, noCharge);
  const id = (name: string) => `${idPrefix}-${name}`;

  // Changing printer type clears a material of the wrong type.
  function choosePrinter(printerId: string) {
    const next = options.printers.find((p) => p.id === printerId);
    const keepMaterial = options.materials.find((m) => m.id === form.materialId)?.type === next?.type;
    onChange({ printerId, materialId: keepMaterial ? form.materialId : "" });
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-medium">Printer</legend>
        <div className="flex flex-wrap gap-2">
          {printers.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3.5 py-2.5 ${
                form.printerId === p.id
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 hover:bg-neutral-100"
              }`}
            >
              <input
                type="radio"
                name={id("printer")}
                value={p.id}
                checked={form.printerId === p.id}
                onChange={() => choosePrinter(p.id)}
                className="sr-only"
              />
              {p.name}
              <span className={`text-xs ${form.printerId === p.id ? "text-neutral-300" : "text-neutral-500"}`}>
                {TYPE_LABELS[p.type]}
              </span>
            </label>
          ))}
          {printers.length === 0 && (
            <p className="text-sm text-neutral-600">No printers yet. Add one on the Printers page.</p>
          )}
        </div>
      </fieldset>

      {type && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {type === "resin" && (
              <Field label="Est. resin (ml)" htmlFor={id("ml")} required>
                <NumberBox id={id("ml")} value={form.estMaterialMl} onChange={(v) => onChange({ estMaterialMl: v })} />
              </Field>
            )}
            <Field label="Est. weight (g)" htmlFor={id("weight")} required>
              <NumberBox id={id("weight")} value={form.estWeightG} onChange={(v) => onChange({ estWeightG: v })} />
            </Field>
            <Field label="Print time" htmlFor={id("hours")} required={type === "resin"}>
              <div className="flex items-center gap-1.5">
                <NumberBox
                  id={id("hours")}
                  value={form.printHours}
                  onChange={(v) => onChange({ printHours: v })}
                  whole
                  ariaLabel="Hours"
                />
                <span className="text-sm text-neutral-500">h</span>
                <NumberBox
                  id={id("minutes")}
                  value={form.printMinutes}
                  onChange={(v) => onChange({ printMinutes: v })}
                  whole
                  ariaLabel="Minutes"
                />
                <span className="text-sm text-neutral-500">m</span>
              </div>
            </Field>
            {type === "resin" && (
              <Field label="Est. cost (£, from slicer)" htmlFor={id("estcost")} required>
                <NumberBox id={id("estcost")} value={form.estCost} onChange={(v) => onChange({ estCost: v })} />
              </Field>
            )}
            {type === "resin" && (
              <Field label="Layer height (mm)" htmlFor={id("layer")}>
                <NumberBox id={id("layer")} value={form.layerHeightMm} onChange={(v) => onChange({ layerHeightMm: v })} />
              </Field>
            )}
            <div className={type === "fdm" ? "col-span-2" : "col-span-2 sm:col-span-3"}>
              <Field
                label={type === "fdm" ? "Filament" : "Resin (optional)"}
                htmlFor={id("material")}
                required={type === "fdm"}
              >
                <select
                  id={id("material")}
                  value={form.materialId}
                  onChange={(e) => onChange({ materialId: e.target.value })}
                  className={`${box} cursor-pointer`}
                >
                  <option value="">{type === "fdm" ? "Choose…" : "—"}</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.in_stock ? "" : " (out of stock)"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title (optional)" htmlFor={id("title")}>
              <input
                id={id("title")}
                value={form.title}
                maxLength={200}
                onChange={(e) => onChange({ title: e.target.value })}
                className={box}
              />
            </Field>
            <Field label="Notes (optional)" htmlFor={id("notes")}>
              <input
                id={id("notes")}
                value={form.notes}
                maxLength={2000}
                onChange={(e) => onChange({ notes: e.target.value })}
                className={box}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField
              label="My cost"
              id={id("mycost")}
              calculated={money.myCost}
              value={form.myCost}
              overridden={form.myCostOverridden}
              onType={(v) => onChange({ myCost: v, myCostOverridden: true })}
              onReset={() => onChange({ myCost: "", myCostOverridden: false })}
              explain={
                type === "resin"
                  ? "The slicer's estimated cost."
                  : material
                    ? `${form.estWeightG || 0} g × ${formatGBP(Number(material.cost_per_unit) * 1000)} per kg`
                    : "Choose the filament to work this out."
              }
            />
            <MoneyField
              label="Charge"
              id={id("charge")}
              calculated={money.charge}
              value={form.charge}
              overridden={form.chargeOverridden}
              onType={(v) => onChange({ charge: v, chargeOverridden: true })}
              onReset={() => onChange({ charge: "", chargeOverridden: false })}
              explain={
                noCharge
                  ? "Nothing to charge: cancelled, or nothing succeeded."
                  : type === "resin"
                    ? `${form.estWeightG || 0} g ÷ ${options.divisor}`
                    : material
                      ? `${form.estWeightG || 0} g × ${formatGBP(Number(material.charge_per_unit) * 1000)} per kg`
                      : "Choose the filament to work this out."
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm text-neutral-700">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      {children}
    </div>
  );
}

function NumberBox({
  id,
  value,
  onChange,
  whole = false,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  whole?: boolean;
  ariaLabel?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      inputMode={whole ? "numeric" : "decimal"}
      autoComplete="off"
      aria-label={ariaLabel}
      value={value}
      // Digits only (and one decimal point where allowed).
      onChange={(e) => {
        const v = e.target.value.replace(whole ? /[^0-9]/g : /[^0-9.]/g, "");
        if (!whole && (v.match(/\./g) ?? []).length > 1) return;
        onChange(v);
      }}
      className={`${box} tabular-nums`}
    />
  );
}

// Shows the calculated amount; typing a different one sets it by hand, and
// "Use calculated" goes back.
function MoneyField({
  label,
  id,
  calculated,
  value,
  overridden,
  onType,
  onReset,
  explain,
}: {
  label: string;
  id: string;
  calculated: number;
  value: string;
  overridden: boolean;
  onType: (value: string) => void;
  onReset: () => void;
  explain: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-neutral-500">£</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={overridden ? value : calculated.toFixed(2)}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            if ((v.match(/\./g) ?? []).length > 1) return;
            onType(v);
          }}
          className={`${box} w-32 tabular-nums`}
        />
        {overridden ? (
          <button type="button" onClick={onReset} className="text-sm text-neutral-600 underline hover:no-underline">
            Use calculated ({formatGBP(calculated)})
          </button>
        ) : (
          <span className="text-xs text-neutral-500">calculated</span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">{overridden ? "Set by hand." : explain}</p>
    </div>
  );
}
