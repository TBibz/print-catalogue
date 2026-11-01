"use client";

// One model row while it is being edited (or added). The main fields sit in
// the row's own columns; the rest open in a panel underneath. Save appears
// where the Edit button was.
//
// Adding an option later: add the
// field to ModelInput in app/actions/models.ts, then add a <PanelSection>
// below.

import { useEffect, useRef, useState, useTransition } from "react";
import { removeModelImage } from "@/app/actions/images";
import { deleteModel, saveModel, type ModelInput } from "@/app/actions/models";
import { imageUrl } from "@/lib/images";
import { uploadModelImage } from "@/lib/upload-image";
import {
  AVAILABILITY_LABELS,
  USUAL_SCALES,
  type AdminModel,
  type Availability,
  type Category,
} from "@/lib/catalogue";

// Column widths shared by the list rows and the editor (md screens and up).
// Tick box, code, name, category, sizes, price, availability, Edit.
export const MODEL_COLUMNS =
  "md:grid-cols-[1rem_6rem_minmax(8rem,1fr)_9rem_7rem_8rem_7rem_4.5rem]";

// The admin notes box: same look, but grows with its rows.
const textareaBox =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

// 30px high with 14px text, like the catalogue's controls.
const box =
  "h-7.5 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

function inputFrom(model: AdminModel | null): ModelInput {
  return {
    id: model?.id ?? null,
    code: model?.code ?? "",
    name: model?.name ?? "",
    categoryId: model?.category_id ?? "",
    defaultScale: model?.default_scale ?? "",
    otherScales: model?.other_scales ?? [],
    availability: model?.availability ?? "available",
    showNewBadge: model?.show_new_badge ?? false,
    adminNotes: model?.admin_notes ?? "",
  };
}

export function ModelEditor({
  model,
  categories,
  requestCount,
  onSaved,
  onDeleted,
  onCancel,
  onDirtyChange,
  onImageChanged,
  priceBox,
}: {
  model: AdminModel | null; // null = adding a new model
  categories: Category[]; // already sorted by name
  requestCount: number; // open request lines for this model
  onSaved: (model: AdminModel) => void;
  onDeleted: (model: AdminModel) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onImageChanged: (modelId: string, path: string | null) => void;
  // The model's autosaving Price box (it saves by itself, not with Save).
  priceBox: React.ReactNode;
}) {
  const [original] = useState(() => inputFrom(model));
  const [values, setValues] = useState(original);
  const [customScale, setCustomScale] = useState("");
  const [error, setError] = useState<{ message: string; field?: keyof ModelInput } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(values) !== JSON.stringify(original);

  // Let the list know, so it can ask before throwing changes away.
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof ModelInput>(key: K, value: ModelInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (error?.field === key) setError(null);
  }

  function toggleScale(scale: string) {
    set(
      "otherScales",
      values.otherScales.includes(scale)
        ? values.otherScales.filter((s) => s !== scale)
        : [...values.otherScales, scale],
    );
  }

  function addCustomScale() {
    const s = customScale.trim();
    if (s && !values.otherScales.includes(s) && s !== values.defaultScale.trim()) {
      set("otherScales", [...values.otherScales, s]);
    }
    setCustomScale("");
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveModel(values);
      if (!result.ok) setError({ message: result.error, field: result.field });
      else onSaved(result.model);
    });
  }

  function remove() {
    if (!model) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteModel(model.id);
      if (!result.ok) {
        setConfirmingDelete(false);
        setError({ message: result.error });
      } else onDeleted(model);
    });
  }

  const fieldError = (field: keyof ModelInput) =>
    error?.field === field ? (
      <p role="alert" className="mt-1 text-sm text-red-700">
        {error.message}
      </p>
    ) : null;

  // Usual sizes that aren't the default, plus any custom ones already set.
  const defaultScale = values.defaultScale.trim();
  const scaleChoices = [
    ...USUAL_SCALES,
    ...values.otherScales.filter((s) => !USUAL_SCALES.includes(s)),
  ].filter((s) => s !== defaultScale);
  const codeChanged = model !== null && values.code.trim() !== original.code;
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
        {/* ---- Row: the same columns as the list -------------------- */}
        <div className={`grid grid-cols-1 gap-2 text-sm md:items-start md:gap-x-3 ${MODEL_COLUMNS}`}>
          {/* The tick-box column stays empty while editing. */}
          <span className="hidden md:block" />
          <div>
            <label htmlFor="edit-code" className={fieldLabel}>
              Code
            </label>
            <input
              id="edit-code"
              value={values.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="Code"
              autoComplete="off"
              autoFocus={!model}
              className={`${box} font-mono text-sm`}
            />
            {fieldError("code")}
          </div>
          <div>
            <label htmlFor="edit-name" className={fieldLabel}>
              Name
            </label>
            <input
              id="edit-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Name"
              autoComplete="off"
              className={box}
            />
            {fieldError("name")}
          </div>
          <div>
            <label htmlFor="edit-category" className={fieldLabel}>
              Category
            </label>
            <select
              id="edit-category"
              value={values.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className={`${box} cursor-pointer text-sm`}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldError("categoryId")}
          </div>
          <div>
            <label htmlFor="edit-default-scale" className={fieldLabel}>
              Default size
            </label>
            <input
              id="edit-default-scale"
              list="usual-scales"
              value={values.defaultScale}
              onChange={(e) => set("defaultScale", e.target.value)}
              placeholder="e.g. 70mm"
              autoComplete="off"
              className={`${box} text-sm`}
            />
            <datalist id="usual-scales">
              {USUAL_SCALES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {fieldError("defaultScale")}
          </div>
          <div>
            <span className={fieldLabel}>Price</span>
            {priceBox ?? <p className="py-1 text-xs text-neutral-500">Add the model first</p>}
          </div>
          <div>
            <label htmlFor="edit-availability" className={fieldLabel}>
              Availability
            </label>
            <select
              id="edit-availability"
              value={values.availability}
              onChange={(e) => set("availability", e.target.value as Availability)}
              className={`${box} cursor-pointer text-sm`}
            >
              {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((a) => (
                <option key={a} value={a}>
                  {AVAILABILITY_LABELS[a]}
                </option>
              ))}
            </select>
            {fieldError("availability")}
          </div>
          {/* Where the Edit button was */}
          <div className="flex gap-2 md:flex-col">
            <button
              type="submit"
              disabled={pending || (model !== null && !dirty)}
              className="h-7.5 flex-1 rounded-md bg-neutral-900 px-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {pending ? "Saving…" : model ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="h-7.5 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-700 hover:bg-neutral-100"
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
        {codeChanged && (
          <p className="mt-2 text-sm text-amber-800">
            Renaming from <span className="font-mono">{original.code}</span>. Image files are
            matched by code, so its image file will need renaming too.
          </p>
        )}
        {values.availability === "hidden" && (
          <p className="mt-2 text-sm text-neutral-600">
            Retired models are hidden from the catalogue and the queue, but kept for history.
          </p>
        )}

        {/* ---- Panel: everything that needs more room ----------------- */}
        <div className="mt-4 grid gap-5 border-t border-neutral-200 pt-4 lg:grid-cols-2">
          <PanelSection title="Other sizes it can be requested in">
            <div className="flex flex-wrap gap-2">
              {scaleChoices.map((s) => {
                const on = values.otherScales.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleScale(s)}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      on
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex max-w-xs gap-2">
              <label htmlFor="edit-custom-scale" className="sr-only">
                Another size
              </label>
              <input
                id="edit-custom-scale"
                value={customScale}
                onChange={(e) => setCustomScale(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomScale();
                  }
                }}
                placeholder="Another size, e.g. 120mm"
                autoComplete="off"
                className={`${box} text-sm`}
              />
              <button
                type="button"
                onClick={addCustomScale}
                className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-100"
              >
                Add
              </button>
            </div>
            {fieldError("otherScales")}
          </PanelSection>

          <PanelSection title="Admin notes (only you can see these)">
            <label htmlFor="edit-admin-notes" className="sr-only">
              Admin notes
            </label>
            <textarea
              id="edit-admin-notes"
              rows={2}
              value={values.adminNotes}
              onChange={(e) => set("adminNotes", e.target.value)}
              className={`${textareaBox}`}
            />
            {fieldError("adminNotes")}
          </PanelSection>

          <PanelSection title="NEW badge">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={values.showNewBadge}
                onChange={(e) => set("showNewBadge", e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-neutral-900"
              />
              <span className="text-sm">
                Show the NEW badge
                <span className="block text-neutral-600">
                  It switches itself off once 4 have been printed successfully.
                </span>
              </span>
            </label>
          </PanelSection>

          {model && (
            <PanelSection title="Image">
              <ImageSection model={model} onImageChanged={onImageChanged} />
            </PanelSection>
          )}

          {/* Colours are set per category (Categories page), not per model. */}

          {model && (
            <PanelSection title="Delete">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete this model…
                </button>
              ) : (
                <div role="alertdialog" aria-label="Confirm delete" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
                  <p className="text-red-900">
                    Delete <span className="font-mono">{model.code}</span> for good? This can’t be
                    undone.
                    {requestCount > 0 &&
                      ` Its ${requestCount} open ${requestCount === 1 ? "request" : "requests"} will be deleted too.`}{" "}
                    To just hide it, choose “Retired” instead.
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
            </PanelSection>
          )}
        </div>
      </form>
    </li>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-neutral-700">{title}</h3>
      {children}
    </section>
  );
}

// Upload, replace or remove a model's image. Unlike the other fields this
// saves straight away (there's no Save needed).
function ImageSection({
  model,
  onImageChanged,
}: {
  model: AdminModel;
  onImageChanged: (modelId: string, path: string | null) => void;
}) {
  const [path, setPath] = useState(model.image_path);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);
  const url = imageUrl(path);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "busy" });
    const result = await uploadModelImage(model.id, file);
    if (fileInput.current) fileInput.current.value = "";
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setPath(result.path);
    onImageChanged(model.id, result.path);
    setStatus({ kind: "done" });
  }

  async function handleRemove() {
    if (!window.confirm(`Remove the image for ${model.code}?`)) return;
    setStatus({ kind: "busy" });
    const result = await removeModelImage(model.id);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setPath(null);
    onImageChanged(model.id, null);
    setStatus({ kind: "done" });
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${model.code} ${model.name}`} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-neutral-400">No image</span>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <label className={`cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-100 ${status.kind === "busy" ? "pointer-events-none opacity-50" : ""}`}>
            {url ? "Replace image…" : "Upload image…"}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={status.kind === "busy"}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-neutral-600">
          {status.kind === "busy" && "Uploading…"}
          {status.kind === "done" && <span className="text-green-700">Image saved ✓</span>}
          {status.kind === "error" && <span className="text-red-700">{status.message}</span>}
          {status.kind === "idle" && "Image changes save straight away."}
        </p>
      </div>
    </div>
  );
}
