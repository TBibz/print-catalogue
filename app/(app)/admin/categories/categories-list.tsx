"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteCategory,
  reorderCategories,
  saveCategory,
  setCategoryDefaultScale,
  type CategoryInput,
} from "@/app/actions/categories";
import { compareCategories, USUAL_SCALES, type Category } from "@/lib/catalogue";
import { DEFAULT_COLOUR_HEX } from "@/lib/colours";
import { ColourPicker } from "@/components/colour-picker";

const GRID = "md:grid-cols-[6.5rem_minmax(0,1fr)_4rem_8rem_4.5rem_15.5rem]";
const box =
  "h-11 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

// Every category is editable in place: change it and press Save. The
// order is changed by dragging the ⠿ handle (or with the ↑ ↓ buttons) and
// saves straight away. The catalogue lists categories in this order.
export function CategoriesList({
  categories: serverCategories,
  modelCounts,
}: {
  categories: Category[];
  modelCounts: Record<string, number>;
}) {
  const [categories, setCategories] = useState(() => [...serverCategories].sort(compareCategories));
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();
  // Dragging: which row is being dragged, and the order before it started.
  const [dragId, setDragId] = useState<string | null>(null);
  const orderBeforeDrag = useRef<string[]>([]);

  // Take fresh data when Next.js shows this kept-alive page again.
  const [synced, setSynced] = useState(serverCategories);
  if (serverCategories !== synced) {
    setSynced(serverCategories);
    setCategories([...serverCategories].sort(compareCategories));
    setAdding(false);
  }

  // Saves the order now on screen; puts the old one back if that fails.
  function saveOrder(next: Category[], previous: Category[]) {
    const ids = next.map((c) => c.id);
    if (ids.join() === previous.map((c) => c.id).join()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await reorderCategories(ids);
      if (!result.ok) {
        setCategories(previous);
        setMessage({ ok: false, text: result.error });
        return;
      }
      setCategories(next.map((c, i) => ({ ...c, sort_order: i + 1 })));
      setMessage({ ok: true, text: "Order saved ✓" });
    });
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    saveOrder(next, categories);
  }

  // While dragging over another row, the dragged row moves into its place.
  function dragOver(overId: string) {
    if (!dragId || dragId === overId) return;
    setCategories((prev) => {
      const from = prev.findIndex((c) => c.id === dragId);
      const to = prev.findIndex((c) => c.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function dragEnd() {
    if (!dragId) return;
    setDragId(null);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const previous = orderBeforeDrag.current.flatMap((id) => byId.get(id) ?? []);
    saveOrder(categories, previous);
  }

  function handleSaved(saved: Category, isNew: boolean) {
    setCategories((prev) =>
      prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
    );
    setMessage({ ok: true, text: `${isNew ? "Added" : "Saved"} ${saved.name} ✓` });
    if (isNew) setAdding(false);
  }

  return (
    <div className="max-w-4xl">
      <p className="mb-4 text-sm text-neutral-600">
        Drag a category by its ⠿ handle (or use ↑ ↓) to change the order. The catalogue sidebar and
        the “All” list follow this order. A category’s colour highlights it in the sidebar. Categories
        with colour options let each request choose a colour.
      </p>

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setAdding(true);
          }}
          disabled={adding}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          + Add category
        </button>
      </div>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-3 rounded-md px-3 py-2 ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </p>
      )}

      <div className="border-t border-neutral-200">
        <div
          className={`hidden gap-3 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${GRID}`}
        >
          <span>Order</span>
          <span>Name</span>
          <span>Colour</span>
          <span>Colour options</span>
          <span className="text-right">Models</span>
          <span />
        </div>
        <ul>
          {adding && (
            <CategoryRow
              key="new"
              category={null}
              modelCount={0}
              onSaved={(c) => handleSaved(c, true)}
              onDeleted={() => {}}
              onCancelNew={() => setAdding(false)}
            />
          )}
          {categories.map((c, i) => (
            <CategoryRow
              key={c.id}
              category={c}
              modelCount={modelCounts[c.id] ?? 0}
              position={i}
              total={categories.length}
              dragging={dragId === c.id}
              onMove={(by) => move(i, by)}
              onDragStart={() => {
                orderBeforeDrag.current = categories.map((x) => x.id);
                setDragId(c.id);
              }}
              onDragOver={() => dragOver(c.id)}
              onDragEnd={dragEnd}
              onSaved={(saved) => handleSaved(saved, false)}
              onDeleted={() => {
                setCategories((prev) => prev.filter((x) => x.id !== c.id));
                setMessage({ ok: true, text: `Deleted ${c.name}` });
              }}
            />
          ))}
        </ul>
        {categories.length === 0 && !adding && (
          <p className="py-12 text-center text-neutral-500">No categories yet.</p>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  modelCount,
  position = 0,
  total = 0,
  dragging = false,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onSaved,
  onDeleted,
  onCancelNew,
}: {
  category: Category | null; // null = adding a new one
  modelCount: number;
  position?: number;
  total?: number;
  dragging?: boolean;
  onMove?: (by: -1 | 1) => void;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
  onSaved: (category: Category) => void;
  onDeleted: () => void;
  onCancelNew?: () => void;
}) {
  const [values, setValues] = useState<CategoryInput>({
    id: category?.id ?? null,
    name: category?.name ?? "",
    hasColourOptions: category?.has_colour_options ?? false,
    colourHex: category?.colour_hex ?? DEFAULT_COLOUR_HEX,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [scalePanel, setScalePanel] = useState(false);
  // The row can only be dragged by its handle, not from the name box.
  const [handleHeld, setHandleHeld] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = category?.name || "new category";

  const dirty =
    !category ||
    values.name.trim() !== category.name ||
    values.hasColourOptions !== category.has_colour_options ||
    values.colourHex !== category.colour_hex;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCategory(values);
      if (!result.ok) return setError(result.error);
      onSaved(result.category);
      setValues({
        id: result.category.id,
        name: result.category.name,
        hasColourOptions: result.category.has_colour_options,
        colourHex: result.category.colour_hex,
      });
    });
  }

  function remove() {
    if (!category) return;
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (!result.ok) {
        setConfirmingDelete(false);
        setError(result.error);
      } else onDeleted();
    });
  }

  const arrow =
    "flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white";

  return (
    <li
      draggable={Boolean(category) && handleHeld}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(e) => {
        e.preventDefault(); // allows dropping here
        onDragOver?.();
      }}
      onDrop={(e) => e.preventDefault()}
      onDragEnd={() => {
        setHandleHeld(false);
        onDragEnd?.();
      }}
      className={`border-b border-neutral-100 px-3 py-3 ${category ? "" : "bg-neutral-50"} ${
        dragging ? "bg-neutral-100 opacity-60" : ""
      }`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
        className={`grid grid-cols-2 items-center gap-3 ${GRID}`}
      >
        {category ? (
          <div className="col-span-2 flex items-center gap-1 md:col-span-1">
            <span
              aria-hidden
              title="Drag to reorder"
              onMouseDown={() => setHandleHeld(true)}
              onMouseUp={() => setHandleHeld(false)}
              className="flex h-9 w-6 cursor-grab items-center justify-center text-lg text-neutral-400 select-none hover:text-neutral-700 active:cursor-grabbing"
            >
              ⠿
            </span>
            <button
              type="button"
              onClick={() => onMove?.(-1)}
              disabled={position === 0}
              aria-label={`Move ${label} up`}
              className={arrow}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove?.(1)}
              disabled={position === total - 1}
              aria-label={`Move ${label} down`}
              className={arrow}
            >
              ↓
            </button>
          </div>
        ) : (
          <span className="col-span-2 text-sm text-neutral-500 md:col-span-1">Goes last</span>
        )}
        <input
          aria-label={`Name of ${label}`}
          placeholder="Category name"
          value={values.name}
          maxLength={60}
          autoFocus={!category}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className={`${box} col-span-2 md:col-span-1`}
        />
        <ColourPicker
          label={`Colour of ${label}`}
          value={values.colourHex}
          onChange={(v) => setValues((x) => ({ ...x, colourHex: v }))}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.hasColourOptions}
            onChange={(e) => setValues((v) => ({ ...v, hasColourOptions: e.target.checked }))}
            className="h-5 w-5 cursor-pointer accent-neutral-900"
          />
          Colours
        </label>
        <span className="text-sm text-neutral-600 tabular-nums md:text-right">
          <span className="md:hidden">Models: </span>
          {modelCount}
        </span>
        <div className="col-span-2 flex flex-wrap gap-2 md:col-span-1 md:justify-end">
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-30"
          >
            {pending ? "Saving…" : category ? "Save" : "Add"}
          </button>
          {category && (
            <button
              type="button"
              onClick={() => setScalePanel((open) => !open)}
              aria-expanded={scalePanel}
              disabled={modelCount === 0}
              title={modelCount === 0 ? "This category has no models" : "Set the default scale of its models"}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
            >
              Set scale…
            </button>
          )}
          {category ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending || modelCount > 0}
              title={modelCount > 0 ? "Only empty categories can be deleted" : undefined}
              className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-white"
            >
              Delete
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelNew}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-red-800">
          {error}
        </p>
      )}

      {scalePanel && category && (
        <ScalePanel category={category} onClose={() => setScalePanel(false)} />
      )}

      {confirmingDelete && category && (
        <div role="alertdialog" aria-label="Confirm delete" className="mt-2 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-red-900">Delete the empty category {category.name} for good?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={pending}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// "Set default scale": the scale, which models, optional extra sizes, and a
// confirm button that says how many models will change (asked of the
// database as you type, without changing anything).
function ScalePanel({ category, onClose }: { category: Category; onClose: () => void }) {
  const [scale, setScale] = useState("");
  const [onlyUnset, setOnlyUnset] = useState(true);
  const [extra, setExtra] = useState("");
  const [preview, setPreview] = useState<{ key: string; count: number } | { key: string; error: string } | null>(
    null,
  );
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const addScales = extra
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const key = JSON.stringify([scale.trim(), onlyUnset, addScales]);

  // Ask how many models would change, after a short pause in typing.
  useEffect(() => {
    if (!scale.trim()) return;
    const timer = setTimeout(async () => {
      const r = await setCategoryDefaultScale({
        categoryId: category.id,
        scale,
        onlyUnset,
        addScales,
        dryRun: true,
      });
      setPreview(r.ok ? { key, count: r.count } : { key, error: r.error });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers scale, onlyUnset and addScales
  }, [key, category.id]);

  const current = preview && preview.key === key ? preview : null;
  const count = current && "count" in current ? current.count : null;

  function apply() {
    startTransition(async () => {
      const r = await setCategoryDefaultScale({ categoryId: category.id, scale, onlyUnset, addScales, dryRun: false });
      if (!r.ok) return setResult({ ok: false, text: r.error });
      setResult({ ok: true, text: `Updated ${r.count} ${r.count === 1 ? "model" : "models"} ✓` });
      setPreview(null);
    });
  }

  const listId = `scales-${category.id}`;
  return (
    <div className="mt-3 rounded-md border border-neutral-300 bg-neutral-50 p-4">
      <h3 className="mb-3 font-medium">Set the default scale for {category.name}</h3>
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <label htmlFor={`${listId}-scale`} className="mb-1 block text-sm text-neutral-700">
            Default scale
          </label>
          <input
            id={`${listId}-scale`}
            list={listId}
            value={scale}
            maxLength={20}
            autoFocus
            placeholder="e.g. 70mm"
            onChange={(e) => {
              setScale(e.target.value);
              setResult(null);
            }}
            className={`${box} w-36`}
          />
          <datalist id={listId}>
            {USUAL_SCALES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm text-neutral-700">Which models</legend>
          <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="radio"
              checked={onlyUnset}
              onChange={() => setOnlyUnset(true)}
              className="h-4 w-4 accent-neutral-900"
            />
            Only models with no scale set
          </label>
          <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="radio"
              checked={!onlyUnset}
              onChange={() => setOnlyUnset(false)}
              className="h-4 w-4 accent-neutral-900"
            />
            All models in this category (overwrites)
          </label>
        </fieldset>
        <div>
          <label htmlFor={`${listId}-extra`} className="mb-1 block text-sm text-neutral-700">
            Other scales to add (optional)
          </label>
          <input
            id={`${listId}-extra`}
            value={extra}
            placeholder="e.g. 54mm, 100mm"
            onChange={(e) => {
              setExtra(e.target.value);
              setResult(null);
            }}
            className={`${box} w-56`}
          />
          <p className="mt-1 text-xs text-neutral-500">Separate with commas.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={pending || !scale.trim() || !count}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-30"
        >
          {pending
            ? "Updating…"
            : count === null
              ? "Set scale"
              : `Set ${scale.trim()} on ${count} ${count === 1 ? "model" : "models"}`}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Close
        </button>
        {scale.trim() && count === 0 && <span className="text-sm text-neutral-600">No models would change.</span>}
        {current && "error" in current && (
          <span role="alert" className="text-sm text-red-700">
            {current.error}
          </span>
        )}
        {result && (
          <span role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}
