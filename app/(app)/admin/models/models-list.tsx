"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AVAILABILITY_LABELS,
  compareModels,
  naturalCollator,
  type AdminModel,
  type Availability,
  type Category,
} from "@/lib/catalogue";
import { ModelEditor, MODEL_COLUMNS } from "./model-editor";

type Filter = "all" | Availability;

// Which row is open for editing: a model id, "new", or none.
type Editing = string | "new" | null;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: AVAILABILITY_LABELS.available },
  { value: "coming_soon", label: AVAILABILITY_LABELS.coming_soon },
  { value: "hidden", label: AVAILABILITY_LABELS.hidden },
];

const AVAILABILITY_STYLES: Record<Availability, string> = {
  available: "border-green-200 bg-green-50 text-green-800",
  coming_soon: "border-neutral-300 bg-neutral-50 text-neutral-600 italic",
  hidden: "border-neutral-300 bg-neutral-200 text-neutral-600",
};

export function ModelsList({
  categories,
  models: serverModels,
  requestCounts,
}: {
  categories: Category[];
  models: AdminModel[];
  requestCounts: Record<string, number>;
}) {
  const [models, setModels] = useState(serverModels);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editorDirty = useRef(false);

  // Next.js keeps this page alive in the background between visits. When
  // the server sends fresh models, show those.
  const [synced, setSynced] = useState(serverModels);
  if (serverModels !== synced) {
    setSynced(serverModels);
    setModels(serverModels);
    setEditing(null);
  }

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => naturalCollator.compare(a.name, b.name)),
    [categories],
  );

  const rows = useMemo(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return models
      .map((m) => ({ ...m, categoryName: names.get(m.category_id) ?? "" }))
      .sort(compareModels);
  }, [categories, models]);

  const missingImages = rows.filter((r) => !r.image_path).length;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, available: 0, coming_soon: 0, hidden: 0 };
    for (const r of rows) c[r.availability]++;
    return c;
  }, [rows]);

  // The row being edited always stays visible, whatever the search/filter.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = rows.filter((r) => {
    if (r.id === editing) return true;
    if (filter !== "all" && r.availability !== filter) return false;
    if (missingImageOnly && r.image_path) return false;
    const haystack = `${r.code} ${r.name} ${r.categoryName} ${r.admin_notes ?? ""}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });

  // Opening another row (or Add) asks first if there are unsaved changes.
  function openEditor(next: Editing) {
    if (editing && editing !== next && editorDirty.current) {
      if (!window.confirm("You have unsaved changes. Discard them?")) return;
    }
    editorDirty.current = false;
    setMessage(null);
    setEditing(next);
  }

  const handleDirtyChange = useCallback((dirty: boolean) => {
    editorDirty.current = dirty;
  }, []);

  function handleSaved(saved: AdminModel) {
    setModels((prev) =>
      prev.some((m) => m.id === saved.id)
        ? prev.map((m) => (m.id === saved.id ? saved : m))
        : [...prev, saved],
    );
    setMessage(`${editing === "new" ? "Added" : "Saved"} ${saved.code} ✓`);
    editorDirty.current = false;
    setEditing(null);
  }

  function handleDeleted(deleted: AdminModel) {
    setModels((prev) => prev.filter((m) => m.id !== deleted.id));
    setMessage(`Deleted ${deleted.code}`);
    editorDirty.current = false;
    setEditing(null);
  }

  // Image changes save straight away, without closing the editor.
  const handleImageChanged = useCallback((modelId: string, path: string | null) => {
    setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, image_path: path } : m)));
  }, []);

  const editorProps = {
    categories: sortedCategories,
    onSaved: handleSaved,
    onDeleted: handleDeleted,
    onCancel: () => openEditor(null),
    onDirtyChange: handleDirtyChange,
    onImageChanged: handleImageChanged,
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label htmlFor="models-search" className="sr-only">
          Search models
        </label>
        <input
          id="models-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, name, category or admin note…"
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
        />
        <button
          type="button"
          onClick={() => openEditor("new")}
          disabled={editing === "new"}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          + Add model
        </button>
      </div>

      <div role="tablist" aria-label="Availability" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              filter === f.value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-500 hover:text-neutral-900"
            }`}
          >
            {f.label}{" "}
            <span className={filter === f.value ? "text-neutral-300" : "text-neutral-400"}>
              {counts[f.value]}
            </span>
          </button>
        ))}
      </div>

      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2.5 text-sm select-none">
        <input
          type="checkbox"
          checked={missingImageOnly}
          onChange={(e) => setMissingImageOnly(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-neutral-900"
        />
        Without an image only ({missingImages})
      </label>

      {message && (
        <p role="status" className="mb-3 rounded-md bg-green-50 px-3 py-2 text-green-800">
          {message}
        </p>
      )}

      <p className="mb-2 text-sm text-neutral-500" aria-live="polite">
        {visible.length} {visible.length === 1 ? "model" : "models"}
      </p>

      <div className="border-t border-neutral-200">
        <div
          className={`hidden gap-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${MODEL_COLUMNS}`}
        >
          <span>Code</span>
          <span>Name</span>
          <span>Category</span>
          <span>Sizes</span>
          <span>Availability</span>
          <span />
        </div>
        <ul>
          {editing === "new" && (
            <ModelEditor key="new" model={null} requestCount={0} {...editorProps} />
          )}
          {visible.map((m) =>
            m.id === editing ? (
              <ModelEditor
                key={m.id}
                model={m}
                requestCount={requestCounts[m.id] ?? 0}
                {...editorProps}
              />
            ) : (
              <li
                key={m.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-3 py-3 md:py-2.5 ${MODEL_COLUMNS}`}
              >
                <span className="font-mono text-sm">{m.code}</span>
                <span className="col-start-1 min-w-0 md:col-start-auto">
                  <span className="break-words">{m.name}</span>
                  {m.show_new_badge && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-amber-800">
                      NEW
                    </span>
                  )}
                  {m.admin_notes && (
                    <span className="block truncate text-xs text-neutral-500" title={m.admin_notes}>
                      {m.admin_notes}
                    </span>
                  )}
                  <span className="block text-xs text-neutral-500 md:hidden">
                    {m.categoryName}
                    {m.default_scale && ` · ${[m.default_scale, ...m.other_scales].join(", ")}`}
                  </span>
                </span>
                <span className="hidden text-sm text-neutral-600 md:block">{m.categoryName}</span>
                <span className="hidden text-sm text-neutral-600 md:block">
                  {[m.default_scale, ...m.other_scales].filter(Boolean).join(", ") || "—"}
                </span>
                <span className="col-start-1 md:col-start-auto">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${AVAILABILITY_STYLES[m.availability]}`}
                  >
                    {AVAILABILITY_LABELS[m.availability]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openEditor(m.id)}
                  className="col-start-2 row-span-3 row-start-1 self-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 md:col-start-auto md:row-span-1 md:row-start-auto"
                >
                  Edit
                </button>
              </li>
            ),
          )}
        </ul>
        {visible.length === 0 && editing !== "new" && (
          <p className="py-12 text-center text-neutral-500">No models match.</p>
        )}
      </div>
    </div>
  );
}
