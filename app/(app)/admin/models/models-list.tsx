"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setModelsPrice } from "@/app/actions/models";
import { BulkPricePanel } from "@/components/bulk-price-panel";
import {
  AVAILABILITY_LABELS,
  compareModels,
  naturalCollator,
  NEW_BADGE_PRINT_LIMIT,
  showNewBadge,
  type AdminModel,
  type Availability,
  type Category,
} from "@/lib/catalogue";
import { ModelEditor, MODEL_COLUMNS } from "./model-editor";
import { PriceCell } from "./price-cell";
import { STICKY_HEADINGS } from "@/components/sticky-headings";

// Row colours, the same as the catalogue: every other row soft lavender
// grey, NEW models light gold (which wins).
const ALT_ROW = "even:bg-[#f3f1f8]";
const NEW_ROW = "bg-amber-100/70";

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
  printTotals,
}: {
  categories: Category[];
  models: AdminModel[];
  requestCounts: Record<string, number>;
  // Successful prints per model (completed jobs).
  printTotals: Record<string, number>;
}) {
  const [models, setModels] = useState(serverModels);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editorDirty = useRef(false);
  // Ticked models (for "Set price for N selected").
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pricePanel, setPricePanel] = useState(false);

  // Next.js keeps this page alive in the background between visits. When
  // the server sends fresh models, show those.
  const [synced, setSynced] = useState(serverModels);
  if (serverModels !== synced) {
    setSynced(serverModels);
    setModels(serverModels);
    setEditing(null);
    setSelected(new Set());
    setPricePanel(false);
  }

  // Next.js keeps this page alive in the background, and the browser's Back
  // button can show it again without asking the server. Effects run again
  // each time the page is shown, so ask for fresh models then (not on the
  // very first showing, which already has fresh data). The rows above then
  // pick them up, e.g. prices or scales changed on the Categories page.
  const router = useRouter();
  const shownBefore = useRef(false);
  useEffect(() => {
    if (shownBefore.current) router.refresh();
    shownBefore.current = true;
  }, [router]);

  // Changing the search or filters clears the ticks, so a bulk change only
  // ever touches models you can see.
  function changeView(change: () => void) {
    change();
    setSelected(new Set());
    setPricePanel(false);
  }

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => naturalCollator.compare(a.name, b.name)),
    [categories],
  );

  const rows = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return models
      .map((m) => ({
        ...m,
        categoryName: byId.get(m.category_id)?.name ?? "",
        categorySort: byId.get(m.category_id)?.sort_order ?? 0,
      }))
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

  // A price saved in one model's Price box.
  const handlePriceSaved = useCallback((modelId: string, price: number | null) => {
    setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, price } : m)));
  }, []);

  const priceBox = (m: AdminModel) => (
    <PriceCell
      key={m.id}
      modelId={m.id}
      code={m.code}
      price={m.price}
      onSaved={handlePriceSaved}
    />
  );

  // ---- Ticking --------------------------------------------------------
  const shownIds = visible.map((m) => m.id);
  const allShownTicked = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const selectedIds = shownIds.filter((id) => selected.has(id));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllShown(on: boolean) {
    setSelected(on ? new Set(shownIds) : new Set());
    if (!on) setPricePanel(false);
  }

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
          onChange={(e) => changeView(() => setQuery(e.target.value))}
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
            onClick={() => changeView(() => setFilter(f.value))}
            className={`rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
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
          onChange={(e) => changeView(() => setMissingImageOnly(e.target.checked))}
          className="h-4 w-4 cursor-pointer accent-neutral-900"
        />
        Without an image only ({missingImages})
      </label>

      {message && (
        <p role="status" className="mb-3 rounded-md bg-green-50 px-3 py-2 text-green-800">
          {message}
        </p>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-neutral-500" aria-live="polite">
          {visible.length} {visible.length === 1 ? "model" : "models"}
        </span>
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={allShownTicked}
            disabled={shownIds.length === 0}
            onChange={(e) => toggleAllShown(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-neutral-900"
          />
          Select all {visible.length} shown
        </label>
        {selectedIds.length > 0 && (
          <>
            <span className="font-medium">{selectedIds.length} selected</span>
            <button
              type="button"
              onClick={() => setPricePanel((open) => !open)}
              aria-expanded={pricePanel}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Set price for {selectedIds.length} selected…
            </button>
            <button
              type="button"
              onClick={() => toggleAllShown(false)}
              className="text-neutral-600 underline hover:no-underline"
            >
              Clear selection
            </button>
          </>
        )}
      </div>

      {pricePanel && selectedIds.length > 0 && (
        <div className="mb-3">
          <BulkPricePanel
            title={`Set the price for ${selectedIds.length} selected ${selectedIds.length === 1 ? "model" : "models"}`}
            allLabel="All selected models (overwrites)"
            run={(price, onlyUnset, dryRun) =>
              setModelsPrice({ modelIds: selectedIds, price, onlyUnset, dryRun })
            }
            onApplied={(price, onlyUnset) => {
              // Show the new prices without reloading the page.
              setModels((prev) =>
                prev.map((m) =>
                  selectedIds.includes(m.id) && (!onlyUnset || m.price === null) ? { ...m, price } : m,
                ),
              );
            }}
            onClose={() => setPricePanel(false)}
          />
        </div>
      )}

      <div className="border-t border-neutral-200">
        {/* Same headings as the catalogue: dark purple, sticky under the header. */}
        <div className={`${STICKY_HEADINGS} hidden items-center gap-x-3 px-3 py-2 md:grid ${MODEL_COLUMNS}`}>
          <span className="flex">
            <input
              type="checkbox"
              aria-label={`Select all ${visible.length} shown`}
              checked={allShownTicked}
              disabled={shownIds.length === 0}
              onChange={(e) => toggleAllShown(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-white"
            />
          </span>
          <span>Code</span>
          <span>Name</span>
          <span>Category</span>
          <span>Sizes</span>
          <span className="pr-5 text-right">Price</span>
          <span>Availability</span>
          <span />
        </div>
        <ul>
          {editing === "new" && (
            <ModelEditor key="new" model={null} requestCount={0} priceBox={null} {...editorProps} />
          )}
          {visible.map((m) => {
            if (m.id === editing) {
              return (
                <ModelEditor
                  key={m.id}
                  model={m}
                  requestCount={requestCounts[m.id] ?? 0}
                  priceBox={priceBox(m)}
                  {...editorProps}
                />
              );
            }
            const printed = printTotals[m.id] ?? 0;
            const isNew = showNewBadge(m, printed);
            const sizes = [m.default_scale, ...m.other_scales].filter(Boolean).join(", ");
            return (
              <li
                key={m.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-neutral-100 px-3 py-1 text-sm ${MODEL_COLUMNS} ${
                  isNew ? NEW_ROW : ALT_ROW
                }`}
              >
                <span className="hidden md:flex">
                  <input
                    type="checkbox"
                    aria-label={`Select ${m.code}`}
                    checked={selected.has(m.id)}
                    onChange={(e) => toggle(m.id, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-neutral-900"
                  />
                </span>
                <span className="flex min-w-0 items-center gap-2 font-mono">
                  {/* On phones the tick box sits next to the code. */}
                  <input
                    type="checkbox"
                    aria-label={`Select ${m.code}`}
                    checked={selected.has(m.id)}
                    onChange={(e) => toggle(m.id, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-neutral-900 md:hidden"
                  />
                  <span className="truncate" data-tip={m.code}>
                    {m.code}
                  </span>
                </span>
                {/* One line: name (cut short with "…", full on hover), badges, notes. */}
                <span className="col-start-1 flex min-w-0 items-center gap-2 md:col-start-auto">
                  <span className="min-w-0 truncate" data-tip={m.name}>
                    {m.name}
                  </span>
                  {isNew ? (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">
                      NEW
                    </span>
                  ) : (
                    m.show_new_badge && (
                      <span
                        className="shrink-0 text-xs whitespace-nowrap text-neutral-500"
                        data-tip={`The NEW badge turns off once ${NEW_BADGE_PRINT_LIMIT} have been printed`}
                      >
                        NEW ended
                      </span>
                    )
                  )}
                  <span className="shrink-0 text-xs whitespace-nowrap text-neutral-500">Printed {printed}</span>
                  {m.admin_notes && (
                    // The note only gets the space left over, so the name keeps its room.
                    <span className="w-0 min-w-0 flex-1 truncate text-xs text-neutral-500" data-tip={m.admin_notes}>
                      {m.admin_notes}
                    </span>
                  )}
                </span>
                <span className="col-start-1 truncate text-xs text-neutral-500 md:hidden">
                  {m.categoryName}
                  {sizes && ` · ${sizes}`}
                </span>
                <span className="hidden truncate text-neutral-600 md:block" data-tip={m.categoryName}>
                  {m.categoryName}
                </span>
                <span className="hidden truncate text-neutral-600 md:block" data-tip={sizes || undefined}>
                  {sizes || "—"}
                </span>
                <span className="col-start-1 md:col-start-auto">{priceBox(m)}</span>
                <span className="col-start-1 md:col-start-auto">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${AVAILABILITY_STYLES[m.availability]}`}
                  >
                    {AVAILABILITY_LABELS[m.availability]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openEditor(m.id)}
                  className="col-start-2 row-span-5 row-start-1 h-7.5 self-center rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-100 md:col-start-auto md:row-span-1 md:row-start-auto"
                >
                  Edit
                </button>
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && editing !== "new" && (
          <p className="py-12 text-center text-neutral-500">No models match.</p>
        )}
      </div>
    </div>
  );
}
