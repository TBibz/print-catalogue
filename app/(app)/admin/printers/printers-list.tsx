"use client";

import { useState, useTransition } from "react";
import { deletePrinter, savePrinter, type PrinterInput } from "@/app/actions/materials";
import { TYPE_LABELS, type MaterialType, type Printer } from "@/lib/materials";

const GRID = "md:grid-cols-[minmax(0,1fr)_9rem_8rem_6rem]";
const box =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

export function PrintersList({ printers: serverPrinters }: { printers: Printer[] }) {
  const [printers, setPrinters] = useState(serverPrinters);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Take fresh data when Next.js shows this kept-alive page again.
  const [synced, setSynced] = useState(serverPrinters);
  if (serverPrinters !== synced) {
    setSynced(serverPrinters);
    setPrinters(serverPrinters);
    setEditing(null);
  }

  const editorProps = {
    onSaved: (saved: Printer) => {
      setPrinters((prev) =>
        prev.some((p) => p.id === saved.id)
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [...prev, saved],
      );
      setMessage(`${editing === "new" ? "Added" : "Saved"} ${saved.name} ✓`);
      setEditing(null);
    },
    onDeleted: (deleted: Printer) => {
      setPrinters((prev) => prev.filter((p) => p.id !== deleted.id));
      setMessage(`Deleted ${deleted.name}`);
      setEditing(null);
    },
    onCancel: () => setEditing(null),
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setEditing("new");
          }}
          disabled={editing === "new"}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          + Add printer
        </button>
      </div>

      {message && (
        <p role="status" className="mb-3 rounded-md bg-green-50 px-3 py-2 text-green-800">
          {message}
        </p>
      )}

      <div className="border-t border-neutral-200">
        <div
          className={`hidden gap-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${GRID}`}
        >
          <span>Name</span>
          <span>Type</span>
          <span>Status</span>
          <span />
        </div>
        <ul>
          {editing === "new" && <PrinterEditor key="new" printer={null} {...editorProps} />}
          {printers.map((p) =>
            p.id === editing ? (
              <PrinterEditor key={p.id} printer={p} {...editorProps} />
            ) : (
              <li
                key={p.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-3 py-3 ${GRID} ${
                  p.active ? "" : "text-neutral-400"
                }`}
              >
                <span>{p.name}</span>
                <span className="col-start-1 text-sm text-neutral-600 md:col-start-auto">
                  {TYPE_LABELS[p.type]}
                </span>
                <span className="col-start-1 text-sm md:col-start-auto">
                  {p.active ? "In use" : "Retired"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setEditing(p.id);
                  }}
                  className="col-start-2 row-span-3 row-start-1 self-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 md:col-start-auto md:row-span-1 md:row-start-auto"
                >
                  Edit
                </button>
              </li>
            ),
          )}
        </ul>
        {printers.length === 0 && editing !== "new" && (
          <p className="py-12 text-center text-neutral-500">No printers yet.</p>
        )}
      </div>
    </div>
  );
}

function PrinterEditor({
  printer,
  onSaved,
  onDeleted,
  onCancel,
}: {
  printer: Printer | null;
  onSaved: (printer: Printer) => void;
  onDeleted: (printer: Printer) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<PrinterInput>({
    id: printer?.id ?? null,
    name: printer?.name ?? "",
    type: printer?.type ?? "fdm",
    active: printer?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePrinter(values);
      if (!result.ok) setError(result.error);
      else onSaved(result.printer);
    });
  }

  function remove() {
    if (!printer) return;
    startTransition(async () => {
      const result = await deletePrinter(printer.id);
      if (!result.ok) {
        setConfirmingDelete(false);
        setError(result.error);
      } else onDeleted(printer);
    });
  }

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
        <div className={`grid grid-cols-1 gap-3 md:items-start md:gap-4 ${GRID}`}>
          <div>
            <label htmlFor="printer-name" className={fieldLabel}>
              Name
            </label>
            <input
              id="printer-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              autoComplete="off"
              autoFocus={!printer}
              className={box}
            />
          </div>
          <div>
            <label htmlFor="printer-type" className={fieldLabel}>
              Type
            </label>
            <select
              id="printer-type"
              value={values.type}
              onChange={(e) => setValues((v) => ({ ...v, type: e.target.value as MaterialType }))}
              className={`${box} cursor-pointer text-sm`}
            >
              {(Object.keys(TYPE_LABELS) as MaterialType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm md:pt-2.5">
            <input
              type="checkbox"
              checked={!values.active}
              onChange={(e) => setValues((v) => ({ ...v, active: !e.target.checked }))}
              className="h-5 w-5 accent-neutral-900"
            />
            Retired
          </label>
          <div className="flex gap-2 md:flex-col">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {pending ? "Saving…" : printer ? "Save" : "Add"}
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

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-red-800">
            {error}
          </p>
        )}
        {values.active === false && (
          <p className="mt-2 text-sm text-neutral-600">
            Retired printers are kept for history but not offered for new print jobs.
          </p>
        )}

        {printer && (
          <div className="mt-4 border-t border-neutral-200 pt-4 text-sm">
            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50"
              >
                Delete this printer…
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirm delete" className="rounded-md border border-red-300 bg-red-50 p-3">
                <p className="text-red-900">
                  Delete {printer.name} for good? This can’t be undone. To keep it for history,
                  tick “Retired” instead.
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
          </div>
        )}
      </form>
    </li>
  );
}
