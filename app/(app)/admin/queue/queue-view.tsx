"use client";

import { useCallback, useState } from "react";
import { compareQueue, scaleLabel, type RequestLine, type Urgency } from "@/lib/requests";
import { useLineAutosave } from "@/lib/use-line-autosave";
import {
  NoteInput,
  QuantityInput,
  SaveStatusText,
  UrgencySelect,
} from "@/components/request-fields";

export type QueueRow = {
  line: RequestLine;
  code: string;
  name: string;
  categoryName: string;
  defaultScale: string | null;
  urgency: Urgency | null; // copy of line.urgency, used for sorting
};

const COLUMNS =
  "lg:grid-cols-[6.5rem_minmax(0,1fr)_8rem_5.5rem_4.5rem_8rem_minmax(0,16rem)_5.5rem]";

export function QueueView({ initialRows }: { initialRows: QueueRow[] }) {
  const [rows, setRows] = useState(initialRows);

  // Next.js keeps this page alive in the background when you visit another
  // page. When the server sends fresh rows on your way back (e.g. new
  // requests from the catalogue), show those. `version` reloads the boxes.
  const [synced, setSynced] = useState({ initialRows, version: 0 });
  if (initialRows !== synced.initialRows) {
    setSynced({ initialRows, version: synced.version + 1 });
    setRows(initialRows);
  }

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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-lg">
          <strong>{rows.length}</strong> {rows.length === 1 ? "line" : "lines"} ·{" "}
          <strong>{items}</strong> {items === 1 ? "item" : "items"}
        </p>
        <button
          type="button"
          onClick={resort}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Sort again
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">Nothing has been requested.</p>
      ) : (
        <div className="border-t border-neutral-200">
          <div
            className={`hidden gap-3 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase lg:grid ${COLUMNS}`}
          >
            <span>Code</span>
            <span>Name</span>
            <span>Category</span>
            <span>Size</span>
            <span className="text-center">Qty</span>
            <span>Urgency</span>
            <span>Note</span>
            <span />
          </div>
          <ul>
            {rows.map((r) => (
              <QueueLine
                key={`${r.line.id}@${synced.version}`}
                row={r}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QueueLine({
  row,
  onSaved,
  onDeleted,
}: {
  row: QueueRow;
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

  return (
    <li
      className={`grid grid-cols-[4.5rem_8rem_minmax(0,1fr)] items-center gap-2 border-b border-neutral-100 px-3 py-3 lg:gap-3 lg:py-2.5 ${COLUMNS}`}
    >
      {/* Phone: code, name, category and size on one block above the controls */}
      <div className="col-span-3 lg:contents">
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
      <div className="col-span-3 min-h-5 text-sm lg:col-span-1">
        <SaveStatusText status={status} onRetry={retry} />
      </div>
    </li>
  );
}
