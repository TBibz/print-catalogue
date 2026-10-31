"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  compareModels,
  naturalCollator,
  showNewBadge,
  type CatalogueModel,
  type Category,
} from "@/lib/catalogue";
import { scaleLabel, scaleOptions, type RequestLine } from "@/lib/requests";
import { useLineAutosave } from "@/lib/use-line-autosave";
import {
  NoteInput,
  QuantityInput,
  SaveStatusText,
  ScaleSelect,
  UrgencySelect,
} from "@/components/request-fields";

type Row = CatalogueModel & { categoryName: string };

// One set of request controls under a model. A model normally has one slot;
// "+ another size" adds more. `line` is null until something is saved.
type Slot = { key: string; line: RequestLine | null; scale: string | null };

const ALL = "all";

function slotsFromLines(lines: RequestLine[]) {
  const map: Record<string, Slot[]> = {};
  for (const line of lines) {
    (map[line.model_id] ??= []).push({ key: line.id, line, scale: line.scale });
  }
  return map;
}

// The blank slot every model shows when it has no request lines. Its key
// stays the same once saved, so the boxes keep focus while you type.
const blankSlot = (modelId: string): Slot => ({
  key: `blank-${modelId}`,
  line: null,
  scale: null,
});

export function CatalogueView({
  categories,
  models,
  lines,
}: {
  categories: Category[];
  models: CatalogueModel[];
  lines: RequestLine[];
}) {
  const [activeTab, setActiveTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  // Shows only models with a request line, whoever asked for it.
  const [requestedOnly, setRequestedOnly] = useState(false);

  // Request slots per model, starting from the saved lines.
  const [slotsByModel, setSlotsByModel] = useState(() => slotsFromLines(lines));

  // Next.js keeps this page alive in the background when you visit another
  // page, so coming back shows the old state. When the server sends fresh
  // lines (e.g. after edits in the queue), reload them. Tabs, search and the
  // filter stay as they were. `version` makes the boxes reload too.
  const [synced, setSynced] = useState({ lines, version: 0 });
  if (lines !== synced.lines) {
    setSynced({ lines, version: synced.version + 1 });
    setSlotsByModel(slotsFromLines(lines));
  }

  // Attach the category name to each model, and sort once.
  const rows = useMemo(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return models
      .map((m) => ({ ...m, categoryName: names.get(m.category_id) ?? "" }))
      .sort(compareModels);
  }, [categories, models]);

  // How many models each category has (shown on its tab).
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category_id, (map.get(r.category_id) ?? 0) + 1);
    return map;
  }, [rows]);

  // Only show tabs for categories that have something in them.
  const tabs = useMemo(() => {
    return categories
      .filter((c) => counts.has(c.id))
      .sort((a, b) => naturalCollator.compare(a.name, b.name));
  }, [categories, counts]);

  // ---- Slot changes (all use the "prev =>" form so they stay stable) ----
  const handleSaved = useCallback((modelId: string, key: string, line: RequestLine) => {
    setSlotsByModel((prev) => {
      const list = prev[modelId] ?? [];
      const exists = list.some((s) => s.key === key);
      const next = exists
        ? list.map((s) => (s.key === key ? { ...s, line, scale: line.scale } : s))
        : [...list, { key, line, scale: line.scale }];
      return { ...prev, [modelId]: next };
    });
  }, []);

  // A deleted line's slot goes back to blank if it's the model's only one
  // (so "Saved ✓" stays visible); extra size slots disappear.
  const handleRemoved = useCallback((modelId: string, key: string) => {
    setSlotsByModel((prev) => {
      const list = prev[modelId] ?? [];
      const next =
        list.length <= 1
          ? list.map((s) => (s.key === key ? { ...s, line: null } : s))
          : list.filter((s) => s.key !== key);
      return { ...prev, [modelId]: next };
    });
  }, []);

  const handleAddSize = useCallback((modelId: string, scale: string | null) => {
    setSlotsByModel((prev) => {
      // If only the implicit blank slot was showing, keep it as the first.
      const list = prev[modelId]?.length ? prev[modelId] : [blankSlot(modelId)];
      const key = `extra-${modelId}-${Date.now()}`;
      return { ...prev, [modelId]: [...list, { key, line: null, scale }] };
    });
  }, []);

  // ---- Filtering -------------------------------------------------------
  const savedLines = (modelId: string) =>
    (slotsByModel[modelId] ?? []).flatMap((s) => (s.line ? [s.line] : []));

  const requestedLines = Object.values(slotsByModel).flat().filter((s) => s.line);
  const requestedItems = requestedLines.reduce((sum, s) => sum + (s.line?.quantity ?? 0), 0);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  // While searching, look across every category (the tab is ignored).
  // Each word typed must appear in the code, name, category or a note.
  const visible = rows.filter((r) => {
    const lines = savedLines(r.id);
    if (requestedOnly && lines.length === 0) return false;
    if (searching) {
      const notes = lines.map((l) => l.note).join(" ");
      const haystack = `${r.code} ${r.name} ${r.categoryName} ${notes}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }
    return activeTab === ALL || r.category_id === activeTab;
  });

  const shownTab = searching ? ALL : activeTab;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label htmlFor="catalogue-search" className="sr-only">
          Search the catalogue
        </label>
        <input
          id="catalogue-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, name, category or note…"
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
        />
        <label className="flex cursor-pointer items-center gap-2.5 py-1 text-base select-none">
          <input
            type="checkbox"
            checked={requestedOnly}
            onChange={(e) => setRequestedOnly(e.target.checked)}
            className="h-5 w-5 cursor-pointer accent-neutral-900"
          />
          Show all current requests
        </label>
      </div>

      <div role="tablist" aria-label="Categories" className="mb-4 flex flex-wrap gap-2">
        <TabButton
          label="All"
          count={rows.length}
          selected={shownTab === ALL}
          onClick={() => {
            setActiveTab(ALL);
            setQuery("");
          }}
        />
        {tabs.map((c) => (
          <TabButton
            key={c.id}
            label={c.name}
            count={counts.get(c.id) ?? 0}
            selected={shownTab === c.id}
            onClick={() => {
              setActiveTab(c.id);
              setQuery("");
            }}
          />
        ))}
      </div>

      <p className="mb-2 text-sm text-neutral-500" aria-live="polite">
        {visible.length} {visible.length === 1 ? "model" : "models"}
        {searching && " found across all categories"}
        {" · "}
        {requestedItems} {requestedItems === 1 ? "item" : "items"} requested on{" "}
        {requestedLines.length} {requestedLines.length === 1 ? "line" : "lines"}
      </p>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">
          {requestedOnly && !searching
            ? "Nothing has been requested in this view yet."
            : `Nothing matches “${query}”.`}
        </p>
      ) : (
        <div className="border-t border-neutral-200">
          {/* Column headings (laptop/desktop only) */}
          <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,40rem)] gap-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase lg:grid">
            <span>Code</span>
            <span>Name</span>
            <span className="grid grid-cols-[6rem_4.5rem_8rem_minmax(0,1fr)_5.5rem] gap-2">
              <span>Size</span>
              <span className="text-center">Qty</span>
              <span>Urgency</span>
              <span>Note</span>
              <span />
            </span>
          </div>
          <ul>
            {visible.map((r) => (
              <ModelRow
                key={r.id}
                model={r}
                slots={slotsByModel[r.id]}
                version={synced.version}
                onSaved={handleSaved}
                onRemoved={handleRemoved}
                onAddSize={handleAddSize}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        selected
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 text-neutral-700 hover:border-neutral-500 hover:text-neutral-900"
      }`}
    >
      {label} <span className={selected ? "text-neutral-300" : "text-neutral-400"}>{count}</span>
    </button>
  );
}

// memo: a row only re-renders when its own slots change, which keeps
// typing smooth with hundreds of rows on screen.
const ModelRow = memo(function ModelRow({
  model,
  slots: storedSlots,
  version,
  onSaved,
  onRemoved,
  onAddSize,
}: {
  model: Row;
  slots: Slot[] | undefined;
  version: number;
  onSaved: (modelId: string, key: string, line: RequestLine) => void;
  onRemoved: (modelId: string, key: string) => void;
  onAddSize: (modelId: string, scale: string | null) => void;
}) {
  const slots = storedSlots?.length ? storedSlots : [blankSlot(model.id)];
  const comingSoon = model.availability === "coming_soon";
  const options = scaleOptions(model);
  const hasSizes = options.length > 1;
  const usedScales = slots.map((s) => s.line?.scale ?? s.scale);
  const unusedScale = options.find((o) => !usedScales.includes(o));

  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-b border-neutral-100 px-3 py-4 lg:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,40rem)] lg:items-start lg:gap-4 lg:py-3">
      {/* Coming-soon models are greyed out, but the controls stay normal. */}
      <span className={`pt-2 font-mono text-sm ${comingSoon ? "text-neutral-400" : ""}`}>
        {model.code}
      </span>

      <div className={`min-w-0 lg:pt-2 ${comingSoon ? "text-neutral-400" : ""}`}>
        <span className="break-words">{model.name}</span>
        {showNewBadge(model) && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-amber-800">
            NEW
          </span>
        )}
        {comingSoon && (
          <span className="ml-2 rounded border border-neutral-300 px-1.5 py-0.5 align-middle text-xs text-neutral-500 italic">
            On its way
          </span>
        )}
        <span className="block text-xs text-neutral-500">{model.categoryName}</span>
      </div>

      {/* On phones and tablets the controls sit under the name. */}
      <div className="col-span-2 space-y-2 lg:col-span-1">
        {slots.map((slot, i) => (
          <LineEditor
            key={`${slot.key}@${version}`}
            model={model}
            slot={slot}
            hasSizes={hasSizes}
            options={options}
            takenScales={usedScales.filter((_, j) => j !== i)}
            onSaved={onSaved}
            onRemoved={onRemoved}
            canRemove={i > 0 && !slot.line}
          />
        ))}
        {hasSizes && unusedScale !== undefined && (
          <button
            type="button"
            onClick={() => onAddSize(model.id, unusedScale)}
            className="py-1 text-sm text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            + another size
          </button>
        )}
      </div>
    </li>
  );
});

function LineEditor({
  model,
  slot,
  hasSizes,
  options,
  takenScales,
  onSaved,
  onRemoved,
  canRemove,
}: {
  model: Row;
  slot: Slot;
  hasSizes: boolean;
  options: (string | null)[];
  takenScales: (string | null)[];
  onSaved: (modelId: string, key: string, line: RequestLine) => void;
  onRemoved: (modelId: string, key: string) => void;
  canRemove: boolean; // an extra, unsaved size line can be removed
}) {
  const { fields, status, update, commit, retry } = useLineAutosave({
    modelId: model.id,
    line: slot.line,
    initialScale: slot.scale,
    onSaved: (line) => onSaved(model.id, slot.key, line),
    onDeleted: () => onRemoved(model.id, slot.key),
  });

  const what = `${model.code} ${model.name}`;
  // Keep a saved size selectable even if it's no longer in the model's list.
  const sizeOptions = options.includes(fields.scale) ? options : [...options, fields.scale];

  return (
    <div className="grid grid-cols-[4.5rem_8rem_minmax(0,1fr)] items-center gap-2 lg:grid-cols-[6rem_4.5rem_8rem_minmax(0,1fr)_5.5rem]">
      <div className="col-span-3 text-sm text-neutral-600 lg:col-span-1 lg:order-none">
        {hasSizes ? (
          <ScaleSelect
            label={`Size for ${what}`}
            value={fields.scale}
            options={sizeOptions}
            defaultScale={model.default_scale}
            disabledOptions={takenScales}
            onChange={(v) => update("scale", v, "now")}
          />
        ) : (
          <span className="lg:pl-1">
            <span className="text-neutral-400 lg:hidden">Size: </span>
            {scaleLabel(fields.scale, model.default_scale)}
          </span>
        )}
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
        {canRemove && status.kind !== "saving" && (
          <button
            type="button"
            onClick={() => onRemoved(model.id, slot.key)}
            className="ml-2 text-neutral-500 underline hover:text-neutral-900"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
