"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AVAILABILITY_LABELS,
  compareCategories,
  compareModels,
  showNewBadge,
  type CatalogueModel,
  type Category,
} from "@/lib/catalogue";
import { imageUrl } from "@/lib/images";
import { scaleLabel, scaleOptions, type RequestLine } from "@/lib/requests";
import { useLineAutosave } from "@/lib/use-line-autosave";
import type { ColourOption } from "@/lib/colours";
import type { CategoryCounts } from "@/lib/data";
import {
  ColourSelect,
  NoteInput,
  QuantityInput,
  SaveStatusText,
  ScaleSelect,
  UrgencySelect,
} from "@/components/request-fields";

type Row = CatalogueModel & {
  categoryName: string;
  categorySort: number;
  hasColours: boolean; // the category offers colour choices (e.g. BASES)
  printedTotal: number;
};

// One set of request controls under a model. A model normally has one slot;
// "+ another size" adds more. `line` is null until something is saved.
type Slot = {
  key: string;
  line: RequestLine | null;
  scale: string | null;
  colour: string | null; // colour material id; null = any colour
};

// One request line per model + size + colour, so that pair identifies a slot.
const comboKey = (scale: string | null, colour: string | null) => `${scale ?? ""}|${colour ?? ""}`;

const ALL = "all";

// ---- List / grid choice, remembered in this browser ----------------------
type ViewMode = "list" | "grid";
const VIEW_KEY = "catalogue-view";
const viewListeners = new Set<() => void>();

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list"; // storage blocked (e.g. private window)
  }
}

function saveView(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    // Not remembered, but the switch still works for this visit.
  }
  viewListeners.forEach((notify) => notify());
}

function subscribeView(notify: () => void) {
  viewListeners.add(notify);
  return () => viewListeners.delete(notify);
}

// The server always renders the list; the browser then switches if needed.
function useViewMode() {
  return useSyncExternalStore(subscribeView, readView, () => "list" as ViewMode);
}

function slotsFromLines(lines: RequestLine[]) {
  const map: Record<string, Slot[]> = {};
  for (const line of lines) {
    (map[line.model_id] ??= []).push({
      key: line.id,
      line,
      scale: line.scale,
      colour: line.colour_material_id,
    });
  }
  return map;
}

// The blank slot every model shows when it has no request lines. Its key
// stays the same once saved, so the boxes keep focus while you type.
const blankSlot = (modelId: string): Slot => ({
  key: `blank-${modelId}`,
  line: null,
  scale: null,
  colour: null,
});

export function CatalogueView({
  categories,
  models,
  lines,
  printTotals,
  colours,
  categoryCounts,
}: {
  categories: Category[];
  models: CatalogueModel[];
  lines: RequestLine[];
  // Successful prints per model, for the NEW badge.
  printTotals: Record<string, number>;
  // Colours the colour dropdown can show (e.g. for BASES).
  colours: ColourOption[];
  // Models per category, counted in the database.
  categoryCounts: CategoryCounts;
}) {
  const [activeTab, setActiveTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  // Shows only models with a request line, whoever asked for it.
  const [requestedOnly, setRequestedOnly] = useState(false);
  const view = useViewMode();
  // The model whose image is shown enlarged, if any.
  const [enlarged, setEnlarged] = useState<Row | null>(null);
  const openImage = useCallback((model: Row) => setEnlarged(model), []);
  const closeImage = useCallback(() => setEnlarged(null), []);

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
    const byId = new Map(categories.map((c) => [c.id, c]));
    return models
      .map((m) => ({
        ...m,
        categoryName: byId.get(m.category_id)?.name ?? "",
        categorySort: byId.get(m.category_id)?.sort_order ?? 0,
        hasColours: byId.get(m.category_id)?.has_colour_options ?? false,
        printedTotal: printTotals[m.id] ?? 0,
      }))
      .sort(compareModels);
  }, [categories, models, printTotals]);

  // How many models each category shows, counted in the database
  // (category_model_counts), so it's right however many models there are.
  const counts = useMemo(
    () => new Map(Object.entries(categoryCounts).map(([id, c]) => [id, c.visible])),
    [categoryCounts],
  );
  const allCount = [...counts.values()].reduce((sum, n) => sum + n, 0);

  // Only show categories that have something in them.
  const tabs = useMemo(() => {
    return categories
      .filter((c) => (counts.get(c.id) ?? 0) > 0)
      .sort(compareCategories);
  }, [categories, counts]);

  // ---- Slot changes (all use the "prev =>" form so they stay stable) ----
  const handleSaved = useCallback((modelId: string, key: string, line: RequestLine) => {
    setSlotsByModel((prev) => {
      const list = prev[modelId] ?? [];
      const exists = list.some((s) => s.key === key);
      const next = exists
        ? list.map((s) =>
            s.key === key ? { ...s, line, scale: line.scale, colour: line.colour_material_id } : s,
          )
        : [...list, { key, line, scale: line.scale, colour: line.colour_material_id }];
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

  // "+ another size" / "+ another colour": a new blank slot.
  const handleAddSlot = useCallback(
    (modelId: string, scale: string | null, colour: string | null) => {
      setSlotsByModel((prev) => {
        // If only the implicit blank slot was showing, keep it as the first.
        const list = prev[modelId]?.length ? prev[modelId] : [blankSlot(modelId)];
        const key = `extra-${modelId}-${Date.now()}`;
        return { ...prev, [modelId]: [...list, { key, line: null, scale, colour }] };
      });
    },
    [],
  );

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
  // When any row shown offers colours, every row gets a Colour column (blank
  // where there's no choice), so the headings line up with every row.
  const colourHeader = visible.some((r) => r.hasColours);

  // Choosing a category clears the search (search covers every category).
  const chooseCategory = (id: string) => {
    setActiveTab(id);
    setQuery("");
  };

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
        <div role="group" aria-label="View" className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
          {(["list", "grid"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => saveView(mode)}
              className={`px-3.5 py-2 ${
                view === mode ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {mode === "list" ? "List" : "Grid"}
            </button>
          ))}
        </div>
      </div>

      {/* Categories: a sidebar on laptops, a dropdown on phones and tablets.
          Search always looks across every category. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <aside className="hidden w-48 shrink-0 lg:block">
          <nav
            aria-label="Categories"
            className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto border-r border-neutral-200 pr-3"
          >
            <ul className="space-y-0.5">
              <li>
                <CategoryButton
                  label="All"
                  count={allCount}
                  selected={shownTab === ALL}
                  onClick={() => chooseCategory(ALL)}
                />
              </li>
              {tabs.map((c) => (
                <li key={c.id}>
                  <CategoryButton
                    label={c.name}
                    count={counts.get(c.id) ?? 0}
                    selected={shownTab === c.id}
                    onClick={() => chooseCategory(c.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 lg:hidden">
            <label htmlFor="catalogue-category" className="mb-1 block text-sm text-neutral-600">
              Category
            </label>
            <select
              id="catalogue-category"
              value={shownTab}
              onChange={(e) => chooseCategory(e.target.value)}
              className="h-11 w-full max-w-md cursor-pointer rounded-md border border-neutral-300 bg-white px-3 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
            >
              <option value={ALL}>All ({allCount})</option>
              {tabs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({counts.get(c.id) ?? 0})
                </option>
              ))}
            </select>
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
      ) : view === "grid" ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <ModelCard
              key={r.id}
              model={r}
              slots={slotsByModel[r.id]}
              version={synced.version}
              onSaved={handleSaved}
              onRemoved={handleRemoved}
              onAddSlot={handleAddSlot}
              colours={colours}
              colourColumn={false}
              onOpenImage={openImage}
            />
          ))}
        </ul>
      ) : (
        <div className="border-t border-neutral-200">
          {/* Column headings (laptop/desktop only) */}
          <div className="hidden grid-cols-[5rem_minmax(0,1fr)_minmax(0,46rem)] gap-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase xl:grid">
            <span>Code</span>
            <span>Name</span>
            <span className={`grid gap-1.5 ${colourHeader ? COLOUR_ROW : PLAIN_ROW}`}>
              <span>Size</span>
              {colourHeader && <span>Colour</span>}
              <span className="text-center">Qty</span>
              <span>Urgency</span>
              <span>Note</span>
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
                onAddSlot={handleAddSlot}
                colours={colours}
                colourColumn={colourHeader}
                onOpenImage={openImage}
              />
            ))}
          </ul>
        </div>
      )}
        </div>
      </div>

      {enlarged && <ImagePopout model={enlarged} onClose={closeImage} />}
    </div>
  );
}

function CategoryButton({
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
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      className={`flex w-full items-baseline justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        selected ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      <span className="min-w-0 break-words">{label}</span>
      <span className={`tabular-nums ${selected ? "text-neutral-300" : "text-neutral-400"}`}>{count}</span>
    </button>
  );
}

type SlotCallbacks = {
  onSaved: (modelId: string, key: string, line: RequestLine) => void;
  onRemoved: (modelId: string, key: string) => void;
  onAddSlot: (modelId: string, scale: string | null, colour: string | null) => void;
};

type ModelItemProps = SlotCallbacks & {
  model: Row;
  slots: Slot[] | undefined;
  version: number;
  colours: ColourOption[]; // for categories with colour options
  colourColumn: boolean; // list view: keep a Colour column on every row
};

type ImageProps = { onOpenImage: (model: Row) => void };

const PREVIEW_SIZE = 288; // px, the hover preview box
const PREVIEW_GAP = 20; // px between the pointer and the preview

// memo: a row only re-renders when its own slots change, which keeps
// typing smooth with hundreds of rows on screen.
const ModelRow = memo(function ModelRow({
  model,
  slots,
  version,
  onOpenImage,
  ...callbacks
}: ModelItemProps & ImageProps) {
  const comingSoon = model.availability === "coming_soon";
  const url = imageUrl(model.image_path);
  // Where the pointer is while hovering the code/name (null = not hovering).
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const open = () => {
    if (!url) return;
    setPointer(null);
    onOpenImage(model);
  };
  // Hover preview and click-to-enlarge only apply when there is an image.
  const imageHandlers = url
    ? {
        onMouseMove: (e: React.MouseEvent) => setPointer({ x: e.clientX, y: e.clientY }),
        onMouseLeave: () => setPointer(null),
        onClick: open,
      }
    : {};

  return (
    // Every other row has a very light grey background, like a spreadsheet.
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-neutral-100 px-3 py-2.5 even:bg-neutral-50 xl:grid-cols-[5rem_minmax(0,1fr)_minmax(0,46rem)] xl:items-start xl:gap-x-4 xl:py-1.5">
      {/* Coming-soon models are greyed out, but the controls stay normal. */}
      <span
        className={`font-mono text-sm leading-5 xl:pt-[7px] ${comingSoon ? "text-neutral-400" : ""} ${url ? "cursor-zoom-in" : ""}`}
        {...imageHandlers}
      >
        {model.code}
      </span>

      {/* Hover: preview to the right of the pointer. Click: enlarge. */}
      <div
        className={`min-w-0 xl:pt-[7px] ${url ? "cursor-zoom-in" : ""}`}
        {...imageHandlers}
        {...(url && {
          role: "button",
          tabIndex: 0,
          "aria-label": `${model.code} ${model.name}: show image`,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open();
            }
          },
        })}
      >
        <ModelInfo model={model} hasImage={Boolean(url)} />
      </div>
      {pointer && url && <HoverPreview url={url} pointer={pointer} />}

      {/* Below xl (phones, tablets, small laptops) the controls sit under the name. */}
      <div className="col-span-2 xl:col-span-1">
        <RequestSlots model={model} slots={slots} version={version} compact={false} {...callbacks} />
      </div>
    </li>
  );
});

// The small preview that follows the pointer, to its right (or to its left
// if there isn't room). Only on screens wide enough to have a pointer.
function HoverPreview({ url, pointer }: { url: string; pointer: { x: number; y: number } }) {
  const fitsRight = pointer.x + PREVIEW_GAP + PREVIEW_SIZE + 8 <= window.innerWidth;
  const left = fitsRight ? pointer.x + PREVIEW_GAP : pointer.x - PREVIEW_GAP - PREVIEW_SIZE;
  const top = Math.min(
    Math.max(8, pointer.y - PREVIEW_SIZE / 2),
    window.innerHeight - PREVIEW_SIZE - 8,
  );
  return (
    <div
      className="pointer-events-none fixed z-30 hidden rounded-lg border border-neutral-200 bg-white p-2 shadow-lg lg:block"
      style={{ left, top, width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

// Grid view: one card per model, image on top, controls underneath.
const ModelCard = memo(function ModelCard({
  model,
  slots,
  version,
  onOpenImage,
  ...callbacks
}: ModelItemProps & ImageProps) {
  const url = imageUrl(model.image_path);
  const comingSoon = model.availability === "coming_soon";

  return (
    <li className="flex flex-col rounded-lg border border-neutral-200 bg-white">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-t-lg border-b border-neutral-100 bg-white">
        {url ? (
          <button
            type="button"
            onClick={() => onOpenImage(model)}
            aria-label={`Enlarge image of ${model.code} ${model.name}`}
            className="h-full w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${model.code} ${model.name}`}
              loading="lazy"
              className={`h-full w-full object-contain ${comingSoon ? "opacity-50" : ""}`}
            />
          </button>
        ) : (
          <span className="text-sm text-neutral-400">No image yet</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div>
          <span className={`font-mono text-sm ${comingSoon ? "text-neutral-400" : "text-neutral-600"}`}>
            {model.code}
          </span>
          <ModelInfo model={model} hasImage={false} />
        </div>
        <RequestSlots model={model} slots={slots} version={version} compact {...callbacks} />
      </div>
    </li>
  );
});

// Name, badges and category.
function ModelInfo({ model, hasImage }: { model: Row; hasImage: boolean }) {
  const comingSoon = model.availability === "coming_soon";
  return (
    <div className={`text-sm leading-5 ${comingSoon ? "text-neutral-400" : ""}`}>
      <span className="break-words">{model.name}</span>
      {hasImage && (
        <span className="ml-1.5 align-middle text-neutral-400" title="Hover to see the image">
          <ImageIcon />
        </span>
      )}
      {showNewBadge(model, model.printedTotal) && (
        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-amber-800">
          NEW
        </span>
      )}
      {comingSoon && (
        <span className="ml-2 rounded border border-neutral-300 px-1.5 py-0.5 align-middle text-xs text-neutral-500 italic">
          {AVAILABILITY_LABELS.coming_soon}
        </span>
      )}
      {/* On the same line as the name, to keep rows short. */}
      <span className="text-neutral-500"> · {model.categoryName}</span>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="inline">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
      <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
      <path d="M2 12l4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" />
    </svg>
  );
}

// The one-line (xl) layout of a request row: size, [colour,] qty, urgency,
// note, status.
// The Note box takes whatever is left, so it's always the widest. The Colour
// box fits a long colour name plus "(out of stock)" (e.g. "Sky Blue (out of
// stock)"); longer names are cut off in the box but shown in full when open.
// "Saved ✓" shows inside the Note box, and longer messages (errors,
// "N requested · M printing") on a line underneath, so they need no column.
const PLAIN_ROW = "grid-cols-[5.5rem_4rem_7rem_minmax(0,1fr)]";
const COLOUR_ROW = "grid-cols-[5.5rem_12.5rem_4rem_7rem_minmax(0,1fr)]";
// The same with the xl: prefix, written out in full so Tailwind finds them.
const XL_PLAIN_ROW = "xl:grid-cols-[5.5rem_4rem_7rem_minmax(0,1fr)]";
const XL_COLOUR_ROW = "xl:grid-cols-[5.5rem_12.5rem_4rem_7rem_minmax(0,1fr)]";

// All the request lines for one model, plus "+ another size" and (for
// categories with colours) "+ another colour".
function RequestSlots({
  model,
  slots: storedSlots,
  version,
  colours,
  colourColumn,
  compact,
  onSaved,
  onRemoved,
  onAddSlot,
}: ModelItemProps & { compact: boolean }) {
  const slots = storedSlots?.length ? storedSlots : [blankSlot(model.id)];
  const options = scaleOptions(model);
  const hasSizes = options.length > 1;
  const combos = slots.map((s) => ({
    scale: s.line?.scale ?? s.scale,
    colour: s.line?.colour_material_id ?? s.colour,
  }));
  const used = new Set(combos.map((c) => comboKey(c.scale, c.colour)));
  // A size not yet requested (in "Any colour").
  const unusedScale = options.find((o) => !used.has(comboKey(o, null)));
  // A colour not yet requested in the first line's size.
  const firstScale = combos[0].scale;
  const unusedColour = model.hasColours
    ? [null, ...colours.filter((c) => c.available).map((c) => c.id)].find(
        (c) => !used.has(comboKey(firstScale, c)),
      )
    : undefined;

  return (
    <div className="space-y-1.5">
      {slots.map((slot, i) => {
        const others = combos.filter((_, j) => j !== i);
        const mine = combos[i];
        return (
          <LineEditor
            key={`${slot.key}@${version}`}
            model={model}
            slot={slot}
            hasSizes={hasSizes}
            options={options}
            // Sizes / colours another line already has with this line's colour / size.
            takenScales={others.filter((c) => c.colour === mine.colour).map((c) => c.scale)}
            takenColours={others.filter((c) => c.scale === mine.scale).map((c) => c.colour)}
            colours={colours}
            colourColumn={colourColumn}
            onSaved={onSaved}
            onRemoved={onRemoved}
            canRemove={i > 0 && !slot.line}
            compact={compact}
          />
        );
      })}
      {/* Only take up space when there's a button to show. */}
      {((hasSizes && unusedScale !== undefined) || unusedColour !== undefined) && (
        <div className="flex flex-wrap gap-x-4">
          {hasSizes && unusedScale !== undefined && (
            <button
              type="button"
              onClick={() => onAddSlot(model.id, unusedScale, null)}
              className="text-sm text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
            >
              + another size
            </button>
          )}
          {unusedColour !== undefined && (
            <button
              type="button"
              onClick={() => onAddSlot(model.id, firstScale, unusedColour)}
              className="text-sm text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
            >
              + another colour
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LineEditor({
  model,
  slot,
  hasSizes,
  options,
  takenScales,
  takenColours,
  colours,
  colourColumn,
  onSaved,
  onRemoved,
  canRemove,
  compact,
}: {
  model: Row;
  slot: Slot;
  hasSizes: boolean;
  options: (string | null)[];
  takenScales: (string | null)[];
  takenColours: (string | null)[];
  colours: ColourOption[];
  colourColumn: boolean;
  onSaved: (modelId: string, key: string, line: RequestLine) => void;
  onRemoved: (modelId: string, key: string) => void;
  canRemove: boolean; // an extra, unsaved size line can be removed
  compact: boolean; // true in grid cards: always the stacked layout
}) {
  const { fields, status, update, commit, retry } = useLineAutosave({
    modelId: model.id,
    line: slot.line,
    initialScale: slot.scale,
    initialColour: slot.colour,
    onSaved: (line) => onSaved(model.id, slot.key, line),
    onDeleted: () => onRemoved(model.id, slot.key),
  });

  const what = `${model.code} ${model.name}`;
  // Keep a saved size selectable even if it's no longer in the model's list.
  const sizeOptions = options.includes(fields.scale) ? options : [...options, fields.scale];
  // On wide screens (xl) the list view puts everything on one line.
  const wide = compact ? "" : "xl:col-span-1";
  // Size and colour can't change while some are printing (the database
  // refuses too).
  const printing = slot.line?.printing ?? 0;
  const locked = printing > 0;
  const quickStatus = status.kind === "saving" || status.kind === "saved";
  const slowStatus = status.kind === "error" || status.kind === "hint";
  const showRemove = canRemove && status.kind !== "saving";

  return (
    <div
      className={`grid grid-cols-[4.5rem_8rem_minmax(0,1fr)] items-center gap-1.5 ${
        compact ? "" : colourColumn ? XL_COLOUR_ROW : XL_PLAIN_ROW
      }`}
    >
      <div className={`col-span-3 text-sm text-neutral-600 ${wide}`}>
        {hasSizes ? (
          <ScaleSelect
            label={`Size for ${what}`}
            value={fields.scale}
            options={sizeOptions}
            defaultScale={model.default_scale}
            disabledOptions={takenScales}
            locked={locked}
            onChange={(v) => update("scale", v, "now")}
          />
        ) : (
          <span className={compact ? "" : "xl:pl-1"}>
            <span className={`text-neutral-400 ${compact ? "" : "xl:hidden"}`}>Size: </span>
            {scaleLabel(fields.scale, model.default_scale)}
          </span>
        )}
      </div>
      {/* No colour choice, but the list has a Colour column: keep its place. */}
      {!model.hasColours && colourColumn && !compact && <div aria-hidden className="hidden xl:block" />}
      {model.hasColours && (
        <div className={`col-span-3 ${wide}`}>
          <ColourSelect
            label={`Colour for ${what}`}
            value={fields.colourId}
            options={colours}
            disabledOptions={takenColours}
            locked={locked}
            onChange={(v) => update("colourId", v, "now")}
          />
        </div>
      )}
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
      <div className={`relative col-span-3 ${wide}`}>
        <NoteInput
          label={`Note for ${what}`}
          value={fields.note}
          onChange={(v) => update("note", v)}
          onBlur={commit}
          roomOnRight={quickStatus}
        />
        {/* "Saving…" / "Saved ✓" sit inside the box, so the row never jumps. */}
        {quickStatus && (
          <span
            aria-live="polite"
            className={`pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs ${
              status.kind === "saved" ? "text-green-700" : "text-neutral-500"
            }`}
          >
            {status.kind === "saved" ? "Saved ✓" : "Saving…"}
          </span>
        )}
      </div>
      {/* Messages that stay (errors, printing, Remove) get a line underneath. */}
      {(slowStatus || printing > 0 || showRemove) && (
        <div className="col-span-3 text-sm xl:col-span-full">
          {slowStatus && <SaveStatusText status={status} onRetry={retry} />}
          {printing > 0 && slot.line && (
            <span className={`text-neutral-600 ${slowStatus ? "ml-2" : ""}`}>
              {slot.line.quantity} requested · {printing} printing
            </span>
          )}
          {showRemove && (
            <button
              type="button"
              onClick={() => onRemoved(model.id, slot.key)}
              className="ml-2 text-neutral-500 underline hover:text-neutral-900 first:ml-0"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The enlarged image. Clicking anywhere outside it, the × button, or
// pressing Esc closes it.
function ImagePopout({ model, onClose }: { model: Row; onClose: () => void }) {
  const url = imageUrl(model.image_path);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while it's open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${model.code} ${model.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      {/* Clicks inside the white box don't close it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full w-full max-w-3xl flex-col rounded-lg bg-white p-4 shadow-2xl"
      >
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          ×
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${model.code} ${model.name}`}
          className="mx-auto max-h-[75vh] w-auto object-contain"
        />
        <p className="mt-3 pr-10">
          <span className="font-mono text-sm text-neutral-600">{model.code}</span>{" "}
          <span className="text-lg">{model.name}</span>
          <span className="block text-sm text-neutral-500">{model.categoryName}</span>
        </p>
      </div>
    </div>
  );
}
