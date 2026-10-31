"use client";

import { useState, useTransition } from "react";
import { deleteCategory, saveCategory, type CategoryInput } from "@/app/actions/categories";
import { compareCategories, type Category } from "@/lib/catalogue";

const GRID = "md:grid-cols-[minmax(0,1fr)_7rem_9rem_5rem_11rem]";
const box =
  "h-11 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

// Every category is editable in place: change it and press Save.
export function CategoriesList({
  categories: serverCategories,
  modelCounts,
}: {
  categories: Category[];
  modelCounts: Record<string, number>;
}) {
  const [categories, setCategories] = useState(serverCategories);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Take fresh data when Next.js shows this kept-alive page again.
  const [synced, setSynced] = useState(serverCategories);
  if (serverCategories !== synced) {
    setSynced(serverCategories);
    setCategories(serverCategories);
    setAdding(false);
  }

  const sorted = [...categories].sort(compareCategories);

  function handleSaved(saved: Category, isNew: boolean) {
    setCategories((prev) =>
      prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
    );
    setMessage(`${isNew ? "Added" : "Saved"} ${saved.name} ✓`);
    if (isNew) setAdding(false);
  }

  return (
    <div className="max-w-4xl">
      <p className="mb-4 text-sm text-neutral-600">
        The catalogue lists categories by sort order (lowest first), then by name. Leave the sort
        order at 0 for plain A→Z. Categories with colour options let each request choose a colour.
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
        <p role="status" className="mb-3 rounded-md bg-green-50 px-3 py-2 text-green-800">
          {message}
        </p>
      )}

      <div className="border-t border-neutral-200">
        <div
          className={`hidden gap-3 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${GRID}`}
        >
          <span>Name</span>
          <span>Sort order</span>
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
          {sorted.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              modelCount={modelCounts[c.id] ?? 0}
              onSaved={(saved) => handleSaved(saved, false)}
              onDeleted={() => {
                setCategories((prev) => prev.filter((x) => x.id !== c.id));
                setMessage(`Deleted ${c.name}`);
              }}
            />
          ))}
        </ul>
        {sorted.length === 0 && !adding && (
          <p className="py-12 text-center text-neutral-500">No categories yet.</p>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  modelCount,
  onSaved,
  onDeleted,
  onCancelNew,
}: {
  category: Category | null; // null = adding a new one
  modelCount: number;
  onSaved: (category: Category) => void;
  onDeleted: () => void;
  onCancelNew?: () => void;
}) {
  const initial: CategoryInput = {
    id: category?.id ?? null,
    name: category?.name ?? "",
    sortOrder: String(category?.sort_order ?? 0),
    hasColourOptions: category?.has_colour_options ?? false,
  };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = category?.name || "new category";

  const dirty =
    !category ||
    values.name.trim() !== category.name ||
    values.sortOrder.trim() !== String(category.sort_order) ||
    values.hasColourOptions !== category.has_colour_options;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCategory(values);
      if (!result.ok) return setError(result.error);
      onSaved(result.category);
      setValues({
        id: result.category.id,
        name: result.category.name,
        sortOrder: String(result.category.sort_order),
        hasColourOptions: result.category.has_colour_options,
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

  return (
    <li className={`border-b border-neutral-100 px-3 py-3 ${category ? "" : "bg-neutral-50"}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
        className={`grid grid-cols-2 items-center gap-3 ${GRID}`}
      >
        <input
          aria-label={`Name of ${label}`}
          placeholder="Category name"
          value={values.name}
          maxLength={60}
          autoFocus={!category}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className={`${box} col-span-2 md:col-span-1`}
        />
        <label className="text-sm text-neutral-600 md:contents">
          <span className="mb-1 block md:hidden">Sort order</span>
          <input
            aria-label={`Sort order of ${label}`}
            inputMode="numeric"
            value={values.sortOrder}
            onChange={(e) => setValues((v) => ({ ...v, sortOrder: e.target.value.replace(/[^0-9-]/g, "") }))}
            className={`${box} text-center tabular-nums`}
          />
        </label>
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
