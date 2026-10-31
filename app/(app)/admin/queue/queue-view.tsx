"use client";

import { useCallback, useRef, useState } from "react";
import { compareQueue, scaleLabel, type RequestLine, type Urgency } from "@/lib/requests";
import { useLineAutosave } from "@/lib/use-line-autosave";
import {
  NoteInput,
  QuantityInput,
  SaveStatusText,
  UrgencySelect,
} from "@/components/request-fields";
import type { JobFormOptions } from "@/lib/jobs";
import { StartPrintPanel, type PickableModel } from "./start-print-panel";

export type QueueRow = {
  line: RequestLine;
  code: string;
  name: string;
  categoryName: string;
  defaultScale: string | null;
  urgency: Urgency | null; // copy of line.urgency, used for sorting
};

const COLUMNS =
  "lg:grid-cols-[2rem_6rem_minmax(0,1fr)_7rem_5rem_4.5rem_7.5rem_minmax(0,14rem)_4.5rem_7.5rem]";

// What's left to put on a plate: wanted minus already printing.
export const unclaimed = (line: RequestLine) => Math.max(0, line.quantity - line.printing);

export function QueueView({
  initialRows,
  models,
  options,
}: {
  initialRows: QueueRow[];
  models: PickableModel[];
  options: JobFormOptions;
}) {
  const [rows, setRows] = useState(initialRows);
  // Ticked lines and how many of each go on this plate (as typed).
  const [plate, setPlate] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  // Next.js keeps this page alive in the background when you visit another
  // page. When the server sends fresh rows on your way back (e.g. new
  // requests from the catalogue), show those. `version` reloads the boxes.
  const [synced, setSynced] = useState({ initialRows, version: 0 });
  if (initialRows !== synced.initialRows) {
    setSynced({ initialRows, version: synced.version + 1 });
    setRows(initialRows);
    // Drop ticks for lines that are gone or have nothing left to print.
    setPlate((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([id]) => {
          const row = initialRows.find((r) => r.line.id === id);
          return row && unclaimed(row.line) > 0;
        }),
      ),
    );
  }

  const toggle = useCallback((line: RequestLine, ticked: boolean) => {
    setPlate((prev) => {
      const next = { ...prev };
      if (ticked) next[line.id] = String(unclaimed(line));
      else delete next[line.id];
      return next;
    });
  }, []);

  const setPlateQty = useCallback((id: string, value: string) => {
    setPlate((prev) => (id in prev ? { ...prev, [id]: value } : prev));
  }, []);

  const handleSaved = useCallback((id: string, line: RequestLine) => {
    setRows((prev) =>
      prev.map((r) => (r.line.id === id ? { ...r, line, urgency: line.urgency } : r)),
    );
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.line.id !== id));
  }, []);

  // Rows don't jump around while you edit; this puts them back in order.
  const resort = () => setRows((prev) => [...prev].sort(compareQueue));

  const items = rows.reduce((sum, r) => sum + r.line.quantity, 0);
  const printing = rows.reduce((sum, r) => sum + r.line.printing, 0);
  const plateRows = rows.filter((r) => r.line.id in plate);
  const plateItems = plateRows.reduce((sum, r) => sum + (Number(plate[r.line.id]) || 0), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-lg">
          <strong>{rows.length}</strong> {rows.length === 1 ? "line" : "lines"} ·{" "}
          <strong>{items}</strong> {items === 1 ? "item" : "items"}
          {printing > 0 && (
            <>
              {" "}
              · <strong>{printing}</strong> printing
            </>
          )}
        </p>
        <button
          type="button"
          onClick={resort}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Sort again
        </button>
      </div>

      <div ref={panelRef} className="mb-6 scroll-mt-4">
        <StartPrintPanel
          plateRows={plateRows}
          plate={plate}
          onPlateQty={setPlateQty}
          onUntick={(line) => toggle(line, false)}
          onStarted={() => setPlate({})}
          models={models}
          options={options}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">Nothing has been requested.</p>
      ) : (
        <div className="border-t border-neutral-200">
          <div
            className={`hidden gap-3 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase lg:grid ${COLUMNS}`}
          >
            <span className="sr-only">On this plate</span>
            <span>Code</span>
            <span>Name</span>
            <span>Category</span>
            <span>Size</span>
            <span className="text-center">Qty</span>
            <span>Urgency</span>
            <span>Note</span>
            <span className="text-center">Plate</span>
            <span />
          </div>
          <ul>
            {rows.map((r) => (
              <QueueLine
                key={`${r.line.id}@${synced.version}`}
                row={r}
                plateQty={plate[r.line.id]}
                onToggle={toggle}
                onPlateQty={setPlateQty}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
              />
            ))}
          </ul>
        </div>
      )}

      {/* While lines are ticked, a bar at the bottom leads to the panel. */}
      {plateRows.length > 0 && (
        <div className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-neutral-300 bg-white px-4 py-3 shadow-lg">
          <span>
            <strong>{plateRows.length}</strong> {plateRows.length === 1 ? "line" : "lines"} ticked ·{" "}
            <strong>{plateItems}</strong> {plateItems === 1 ? "item" : "items"} on this plate
          </span>
          <button
            type="button"
            onClick={() => panelRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Start print…
          </button>
        </div>
      )}
    </div>
  );
}

function QueueLine({
  row,
  plateQty,
  onToggle,
  onPlateQty,
  onSaved,
  onDeleted,
}: {
  row: QueueRow;
  plateQty: string | undefined; // undefined = not ticked
  onToggle: (line: RequestLine, ticked: boolean) => void;
  onPlateQty: (id: string, value: string) => void;
  onSaved: (id: string, line: RequestLine) => void;
  onDeleted: (id: string) => void;
}) {
  const id = row.line.id;
  const { fields, status, update, commit, retry } = useLineAutosave({
    modelId: row.line.model_id,
    line: row.line,
    onSaved: (line) => onSaved(id, line),
    onDeleted: () => onDeleted(id),
  });
  const what = `${row.code} ${row.name}`;
  const left = unclaimed(row.line);
  const ticked = plateQty !== undefined;

  return (
    <li
      className={`grid grid-cols-[4.5rem_8rem_minmax(0,1fr)] items-center gap-2 border-b border-neutral-100 px-3 py-3 lg:gap-3 lg:py-2.5 ${COLUMNS}`}
    >
      {/* Phone: code, name, category and size on one block above the controls */}
      <div className="col-span-3 lg:contents">
        <input
          type="checkbox"
          checked={ticked}
          disabled={left === 0}
          onChange={(e) => onToggle(row.line, e.target.checked)}
          aria-label={`Put ${what} on this plate`}
          title={left === 0 ? "All of these are already printing" : "Put on this plate"}
          className="mr-3 h-5 w-5 cursor-pointer align-middle accent-neutral-900 disabled:cursor-not-allowed disabled:opacity-30"
        />
        <span className="mr-2 font-mono text-sm">{row.code}</span>
        <span className="min-w-0 break-words">{row.name}</span>
        <span className="block text-xs text-neutral-500 lg:text-sm lg:text-neutral-600">
          {row.categoryName}
          <span className="lg:hidden"> · {scaleLabel(fields.scale, row.defaultScale)}</span>
        </span>
        <span className="hidden text-sm text-neutral-600 lg:block">
          {scaleLabel(fields.scale, row.defaultScale)}
        </span>
      </div>
      <QuantityInput
        label={`Quantity for ${what}`}
        value={fields.quantity}
        onChange={(v) => update("quantity", v)}
        onBlur={commit}
      />
      <UrgencySelect
        label={`Urgency for ${what}`}
        value={fields.urgency}
        onChange={(v) => update("urgency", v, "now")}
      />
      <div className="col-span-3 lg:col-span-1">
        <NoteInput
          label={`Note for ${what}`}
          value={fields.note}
          onChange={(v) => update("note", v)}
          onBlur={commit}
        />
      </div>
      <div className="col-span-3 flex items-center gap-2 lg:col-span-1">
        {ticked && (
          <>
            <label htmlFor={`plate-${id}`} className="text-sm text-neutral-600 lg:sr-only">
              On this plate (of {left}):
            </label>
            <input
              id={`plate-${id}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={plateQty}
              onChange={(e) => onPlateQty(id, e.target.value.replace(/[^0-9]/g, ""))}
              title={`Up to ${left}`}
              className={`w-16 rounded-md border bg-white px-2 py-2 text-center text-base tabular-nums outline-none focus:ring-1 lg:w-full ${
                Number(plateQty) > left || Number(plateQty) < 1
                  ? "border-red-600 focus:ring-red-600"
                  : "border-neutral-900 focus:ring-neutral-900"
              }`}
            />
          </>
        )}
      </div>
      <div className="col-span-3 min-h-5 text-sm lg:col-span-1">
        <SaveStatusText status={status} onRetry={retry} />
        {status.kind === "idle" && row.line.printing > 0 && (
          <span className="text-neutral-600">
            {row.line.quantity} requested · {row.line.printing} printing
          </span>
        )}
      </div>
    </li>
  );
}
