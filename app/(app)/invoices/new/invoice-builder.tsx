"use client";

// The invoice builder: the catalogue with a tick box and a quantity per
// model. Typing a quantity ticks the row; unticking clears it. The bar at
// the bottom shows the running total and makes the draft.
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { createInvoice } from "@/app/actions/invoices";
import { CategoryButton, CategoryTag } from "@/components/category-nav";
import { useImagePreview } from "@/components/image-preview";
import { stickyHeadings } from "@/components/sticky-headings";
import { ROW_ALT } from "@/lib/row-highlights";
import { compareCategories, compareModels, type Category } from "@/lib/catalogue";
import type { CategoryCounts } from "@/lib/data";
import type { InvoiceModel } from "@/lib/invoice-data";
import { imageUrl } from "@/lib/images";
import { formatMoney } from "@/lib/money";

const ALL = "all";
// Snug columns: the whole builder is at most 1000px wide (invoices/layout.tsx),
// so Price and Qty stay close to the name. Long names are cut short with "…".
const COLUMNS = "grid-cols-[1.25rem_minmax(0,1fr)_4.75rem_3.75rem] md:grid-cols-[1.25rem_7rem_5rem_minmax(0,1fr)_4.75rem_3.75rem]";

type Row = InvoiceModel & { categoryName: string; categoryColour: string; categorySort: number };

export function InvoiceBuilder({
  categories,
  models,
  categoryCounts,
}: {
  categories: Category[];
  models: InvoiceModel[];
  categoryCounts: CategoryCounts;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [tickedOnly, setTickedOnly] = useState(false);
  // How many of each model, as typed. A model is ticked when it has one.
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return models
      .map((m) => ({
        ...m,
        categoryName: byId.get(m.category_id)?.name ?? "",
        categoryColour: byId.get(m.category_id)?.colour_hex ?? "#9ca3af",
        categorySort: byId.get(m.category_id)?.sort_order ?? 0,
      }))
      .sort(compareModels);
  }, [categories, models]);

  // Model counts per category come from the database.
  const counts = useMemo(
    () => new Map(Object.entries(categoryCounts).map(([id, c]) => [id, c.visible])),
    [categoryCounts],
  );
  const allCount = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const tabs = useMemo(
    () => categories.filter((c) => (counts.get(c.id) ?? 0) > 0).sort(compareCategories),
    [categories, counts],
  );

  const setQuantity = useCallback((id: string, value: string) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (value === "" || value === "0") delete next[id];
      else next[id] = value;
      return next;
    });
  }, []);

  // ---- What's ticked, and the running total --------------------------------
  const ticked = rows.filter((r) => Number(quantities[r.id]) > 0);
  const items = ticked.reduce((sum, r) => sum + Number(quantities[r.id]), 0);
  const total = ticked.reduce(
    (sum, r) => sum + (r.price === null ? 0 : Math.round(Number(quantities[r.id]) * r.price * 100) / 100),
    0,
  );
  const noPrice = ticked.filter((r) => r.price === null).length;

  // ---- Filtering (search looks across every category) ------------------------
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const shownTab = searching ? ALL : activeTab;
  const visible = rows.filter((r) => {
    if (tickedOnly && !(Number(quantities[r.id]) > 0)) return false;
    if (searching) {
      const haystack = `${r.code} ${r.name} ${r.categoryName}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }
    return shownTab === ALL || r.category_id === shownTab;
  });

  function generate() {
    setError(null);
    startTransition(async () => {
      const r = await createInvoice(ticked.map((m) => ({ modelId: m.id, quantity: Number(quantities[m.id]) })));
      if (!r.ok) return setError(r.error);
      // Start fresh next time (Next.js keeps this page alive).
      setQuantities({});
      setTickedOnly(false);
      router.push(`/invoices/${r.id}`);
    });
  }

  function chooseCategory(id: string) {
    setActiveTab(id);
    setQuery("");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label htmlFor="builder-search" className="sr-only">
          Search the catalogue
        </label>
        <input
          id="builder-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, name or category…"
          className="h-11 w-full max-w-md rounded-md border border-neutral-300 px-3 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
        />
        <label className="flex cursor-pointer items-center gap-2.5 text-base select-none">
          <input
            type="checkbox"
            checked={tickedOnly}
            onChange={(e) => setTickedOnly(e.target.checked)}
            className="h-5 w-5 cursor-pointer accent-neutral-900"
          />
          Show ticked only
        </label>
      </div>

      <div className="lg:flex lg:gap-6">
        <aside className="hidden w-44 shrink-0 lg:block">
          <nav
            aria-label="Categories"
            className="sticky top-[calc(var(--nav-offset)+0.5rem)] max-h-[calc(100vh-var(--nav-offset)-6rem)] overflow-y-auto border-r border-neutral-200 pr-3 transition-[top] duration-200 ease-out"
          >
            <ul className="space-y-0.5">
              <li>
                <CategoryButton label="All" count={allCount} selected={shownTab === ALL} onClick={() => chooseCategory(ALL)} />
              </li>
              {tabs.map((c) => (
                <li key={c.id}>
                  <CategoryButton
                    label={c.name}
                    count={counts.get(c.id) ?? 0}
                    selected={shownTab === c.id}
                    colour={c.colour_hex}
                    onClick={() => chooseCategory(c.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 lg:hidden">
            <label htmlFor="builder-category" className="mb-1 block text-sm text-neutral-600">
              Category
            </label>
            <select
              id="builder-category"
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
          </p>

          {visible.length === 0 ? (
            <p className="py-12 text-center text-neutral-500">
              {tickedOnly ? "Nothing ticked here yet." : `Nothing matches “${query}”.`}
            </p>
          ) : (
            <div className="border-t border-neutral-200">
              <div className={`${stickyHeadings("builder")} grid items-center gap-x-3 px-3 py-2 ${COLUMNS}`}>
                <span />
                <span className="hidden md:block">Category</span>
                <span className="hidden md:block">Code</span>
                <span>Name</span>
                <span className="text-right">Price</span>
                <span className="text-center">Qty</span>
              </div>
              <ul>
                {visible.map((r) => (
                  <BuilderRow key={r.id} model={r} quantity={quantities[r.id] ?? ""} onChange={setQuantity} />
                ))}
              </ul>
            </div>
          )}

          {/* Stays at the bottom of the screen while scrolling, exactly as
              wide as the table above it. */}
          <div className="sticky bottom-0 z-30 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-t-lg border border-b-0 border-neutral-300 bg-white/95 px-3 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
            <p className="text-lg" aria-live="polite">
              <strong className="tabular-nums">{items}</strong> {items === 1 ? "item" : "items"} ·{" "}
              <strong className="tabular-nums">{formatMoney(total)}</strong>
              {noPrice > 0 && (
                <span className="ml-2 text-sm text-amber-800">
                  ({noPrice} without a price: set it on the draft)
                </span>
              )}
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={pending || ticked.length === 0}
              className="ml-auto rounded-md bg-neutral-900 px-6 py-3 text-base font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {pending ? "Making the invoice…" : "Generate invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// memo: only the row being typed in re-renders.
const BuilderRow = memo(function BuilderRow({
  model,
  quantity,
  onChange,
}: {
  model: Row;
  quantity: string;
  onChange: (id: string, value: string) => void;
}) {
  const ticked = Number(quantity) > 0;
  // Hovering the code or name shows the model's image, with its code and
  // name underneath (instead of the text tooltip). No image: just the tooltip.
  const url = imageUrl(model.image_path);
  const label = `${model.code} ${model.name}`;
  const preview = useImagePreview(url, label);
  return (
    <li
      className={`grid items-center gap-x-3 border-b border-neutral-100 px-3 py-1 text-sm ${COLUMNS} ${
        ticked ? "bg-green-50" : ROW_ALT
      }`}
    >
      <input
        type="checkbox"
        aria-label={`Add ${model.code} ${model.name}`}
        checked={ticked}
        // Ticking adds one; unticking clears the quantity.
        onChange={(e) => onChange(model.id, e.target.checked ? "1" : "")}
        className="h-4 w-4 cursor-pointer accent-neutral-900"
      />
      <span className="hidden min-w-0 md:flex">
        <CategoryTag name={model.categoryName} colour={model.categoryColour} />
      </span>
      <span className="hidden truncate font-mono md:block" data-tip={url ? undefined : model.code} {...preview.handlers}>
        {model.code}
      </span>
      <span className="min-w-0 truncate" data-tip={url ? undefined : label} {...preview.handlers}>
        <span className="font-mono text-neutral-500 md:hidden">{model.code} </span>
        {model.name}
      </span>
      <span className={`text-right tabular-nums ${model.price === null ? "text-xs text-neutral-500 italic" : ""}`}>
        {model.price === null ? "No price" : formatMoney(model.price)}
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`How many ${model.code} ${model.name}`}
        placeholder="0"
        value={quantity}
        onChange={(e) => onChange(model.id, e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
        className="h-7.5 w-full rounded-md border border-neutral-300 bg-white px-2 text-center text-sm tabular-nums outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
      />
      {preview.element}
    </li>
  );
});
