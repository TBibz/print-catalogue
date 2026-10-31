"use client";

// "Start a print" on the queue: what's on the plate (ticked request lines,
// plus any catalogue models or free-text items added here), the printer and
// its details, and the money, then one click to start the job.
import Link from "next/link";
import { useState, useTransition } from "react";
import { startPrintJob, type PlateItem } from "@/app/actions/jobs";
import { JobFields } from "@/components/job-fields";
import { naturalCollator } from "@/lib/catalogue";
import { emptyJobForm, type JobForm, type JobFormOptions } from "@/lib/jobs";
import { scaleLabel, scaleOptions, type RequestLine } from "@/lib/requests";
import type { QueueRow } from "./queue-view";

export type PickableModel = {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  default_scale: string | null;
  other_scales: string[];
};

// Items added in this panel (not from the queue).
type Extra =
  | { key: string; kind: "model"; model: PickableModel; scale: string | null; quantity: string }
  | { key: string; kind: "free"; name: string; quantity: string };

const box =
  "rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";
const MAX_MATCHES = 8;

export function StartPrintPanel({
  plateRows,
  plate,
  onPlateQty,
  onUntick,
  onStarted,
  models,
  options,
}: {
  plateRows: QueueRow[];
  plate: Record<string, string>;
  onPlateQty: (lineId: string, value: string) => void;
  onUntick: (line: RequestLine) => void;
  onStarted: () => void;
  models: PickableModel[];
  options: JobFormOptions;
}) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [form, setForm] = useState<JobForm>(emptyJobForm);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasItems = plateRows.length > 0 || extras.length > 0;
  const update = (patch: Partial<JobForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    terms.length === 0
      ? []
      : models
          .filter((m) => {
            const haystack = `${m.code} ${m.name} ${m.categoryName}`.toLowerCase();
            return terms.every((t) => haystack.includes(t));
          })
          .sort((a, b) => naturalCollator.compare(a.code, b.code))
          .slice(0, MAX_MATCHES);

  function addModel(model: PickableModel) {
    setExtras((prev) => [...prev, { key: `m-${Date.now()}`, kind: "model", model, scale: null, quantity: "1" }]);
    setSearch("");
    setStarted(false);
  }

  function addFree() {
    setExtras((prev) => [...prev, { key: `f-${Date.now()}`, kind: "free", name: "", quantity: "1" }]);
    setStarted(false);
  }

  const changeExtra = (key: string, patch: Partial<Extra>) =>
    setExtras((prev) => prev.map((e) => (e.key === key ? ({ ...e, ...patch } as Extra) : e)));

  // Checks what's on the plate and turns it into what the server expects.
  function plateItems(): PlateItem[] | string {
    const items: PlateItem[] = [];
    for (const r of plateRows) {
      const qty = Number(plate[r.line.id]);
      const left = r.line.quantity - r.line.printing;
      if (!Number.isInteger(qty) || qty < 1) return `Enter how many of ${r.code} go on this plate.`;
      if (qty > left) return `${r.code} only has ${left} left to print.`;
      items.push({ kind: "request", requestLineId: r.line.id, quantity: qty });
    }
    for (const e of extras) {
      const qty = Number(e.quantity);
      if (e.kind === "free" && !e.name.trim()) return "Give each free-text item a name.";
      const what = e.kind === "model" ? e.model.code : e.name;
      if (!Number.isInteger(qty) || qty < 1) return `Enter how many of ${what} go on this plate.`;
      items.push(
        e.kind === "model"
          ? { kind: "model", modelId: e.model.id, scale: e.scale, quantity: qty }
          : { kind: "free", name: e.name.trim(), quantity: qty },
      );
    }
    return items;
  }

  function start() {
    const items = plateItems();
    if (typeof items === "string") {
      setError(items);
      return;
    }
    if (items.length === 0) {
      setError("Tick lines in the queue, or add an item, first.");
      return;
    }
    startTransition(async () => {
      const result = await startPrintJob(form, items);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Ready for the next plate on the same printer.
      setExtras([]);
      setForm({ ...emptyJobForm(), printerId: form.printerId });
      setStarted(true);
      onStarted();
    });
  }

  return (
    <section aria-labelledby="start-print-heading" className="rounded-lg border border-neutral-200 p-4">
      <h2 id="start-print-heading" className="mb-1 text-lg font-semibold">
        Start a print
      </h2>

      {started && !hasItems && (
        <p role="status" className="mb-3 rounded-md bg-green-50 px-3 py-2 text-green-800">
          Print started ✓{" "}
          <Link href="/admin/jobs" className="underline hover:no-underline">
            See it on the Jobs page
          </Link>
        </p>
      )}

      {!hasItems && (
        <p className="mb-3 text-sm text-neutral-600">
          Tick lines in the queue below, or add a catalogue model or a free-text item.
        </p>
      )}

      {hasItems && (
        <ul className="mb-3 divide-y divide-neutral-100 border-y border-neutral-100">
          {plateRows.map((r) => {
            const left = r.line.quantity - r.line.printing;
            return (
              <li key={r.line.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1">
                  <span className="mr-2 font-mono text-sm">{r.code}</span>
                  {r.name}
                  <span className="text-sm text-neutral-500"> · {scaleLabel(r.line.scale, r.defaultScale)}</span>
                </span>
                <QtyBox
                  label={`How many of ${r.code} on this plate`}
                  value={plate[r.line.id] ?? ""}
                  onChange={(v) => onPlateQty(r.line.id, v)}
                  invalid={Number(plate[r.line.id]) > left || Number(plate[r.line.id]) < 1}
                />
                <span className="w-16 text-sm text-neutral-500">of {left}</span>
                <RemoveButton label={`Take ${r.code} off the plate`} onClick={() => onUntick(r.line)} />
              </li>
            );
          })}
          {extras.map((e) => (
            <li key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              {e.kind === "model" ? (
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span>
                    <span className="mr-2 font-mono text-sm">{e.model.code}</span>
                    {e.model.name}
                    <span className="ml-2 text-xs text-neutral-500">not requested</span>
                  </span>
                  {scaleOptions(e.model).length > 1 ? (
                    <select
                      aria-label={`Size for ${e.model.code}`}
                      value={e.scale ?? ""}
                      onChange={(ev) => changeExtra(e.key, { scale: ev.target.value || null })}
                      className={`${box} cursor-pointer py-1.5 text-sm`}
                    >
                      {scaleOptions(e.model).map((s) => (
                        <option key={s ?? ""} value={s ?? ""}>
                          {scaleLabel(s, e.model.default_scale)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-neutral-500">· {scaleLabel(null, e.model.default_scale)}</span>
                  )}
                </span>
              ) : (
                <input
                  aria-label="Item name"
                  placeholder="What is it? e.g. Spare hinge"
                  value={e.name}
                  maxLength={200}
                  onChange={(ev) => changeExtra(e.key, { name: ev.target.value })}
                  className={`${box} min-w-0 flex-1`}
                />
              )}
              <QtyBox
                label="How many on this plate"
                value={e.quantity}
                onChange={(v) => changeExtra(e.key, { quantity: v })}
                invalid={Number(e.quantity) < 1}
              />
              <span className="w-16" />
              <RemoveButton
                label="Take this off the plate"
                onClick={() => setExtras((prev) => prev.filter((x) => x.key !== e.key))}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="relative w-full max-w-sm">
          <label htmlFor="plate-model-search" className="sr-only">
            Add a catalogue model
          </label>
          <input
            id="plate-model-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="+ Add a catalogue model (search)…"
            className={`${box} w-full`}
          />
          {matches.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => addModel(m)}
                    className="block w-full px-3 py-2 text-left hover:bg-neutral-100"
                  >
                    <span className="mr-2 font-mono text-sm">{m.code}</span>
                    {m.name}
                    <span className="block text-xs text-neutral-500">{m.categoryName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {terms.length > 0 && matches.length === 0 && (
            <p className="mt-1 text-sm text-neutral-500">No models match.</p>
          )}
        </div>
        <button
          type="button"
          onClick={addFree}
          className="rounded-md border border-neutral-300 px-3 py-2 text-base text-neutral-700 hover:bg-neutral-100"
        >
          + Free-text item
        </button>
      </div>

      {hasItems && (
        <>
          <JobFields form={form} onChange={update} options={options} idPrefix="start" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={start}
              disabled={pending || !form.printerId}
              className="rounded-md bg-neutral-900 px-5 py-2.5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {pending ? "Starting…" : "Start print"}
            </button>
            {!form.printerId && <span className="text-sm text-neutral-600">Choose a printer first.</span>}
            {error && (
              <span role="alert" className="text-red-700">
                {error}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function QtyBox({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      className={`w-16 rounded-md border bg-white px-2 py-2 text-center text-base tabular-nums outline-none focus:ring-1 ${
        invalid ? "border-red-600 focus:ring-red-600" : "border-neutral-300 focus:border-neutral-900 focus:ring-neutral-900"
      }`}
    />
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
    >
      ×
    </button>
  );
}
