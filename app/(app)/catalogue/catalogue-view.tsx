"use client";

import { useMemo, useState } from "react";
import {
  compareModels,
  naturalCollator,
  showNewBadge,
  type CatalogueModel,
  type Category,
} from "@/lib/catalogue";

type Row = CatalogueModel & { categoryName: string };

const ALL = "all";

export function CatalogueView({
  categories,
  models,
}: {
  categories: Category[];
  models: CatalogueModel[];
}) {
  const [activeTab, setActiveTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");

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

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  // While searching, look across every category (the tab is ignored).
  // Each word typed must appear somewhere in the code, name or category.
  const visible = rows.filter((r) => {
    if (searching) {
      const haystack = `${r.code} ${r.name} ${r.categoryName}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }
    return activeTab === ALL || r.category_id === activeTab;
  });

  const shownTab = searching ? ALL : activeTab;

  return (
    <div>
      <div className="mb-4">
        <label htmlFor="catalogue-search" className="sr-only">
          Search the catalogue
        </label>
        <input
          id="catalogue-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, name or category…"
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
        />
      </div>

      <div
        role="tablist"
        aria-label="Categories"
        className="mb-4 flex flex-wrap gap-2"
      >
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
      </p>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">
          Nothing matches “{query}”.
        </p>
      ) : (
        <ModelList rows={visible} />
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
  count?: number;
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
      {label}
      {count !== undefined && (
        <span className={selected ? "text-neutral-300" : "text-neutral-400"}>
          {" "}
          {count}
        </span>
      )}
    </button>
  );
}

function ModelList({ rows }: { rows: Row[] }) {
  return (
    <div className="border-t border-neutral-200">
      {/* Column headings (desktop only) */}
      <div className="hidden grid-cols-[8rem_1fr_10rem_6rem] gap-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 sm:grid">
        <span>Code</span>
        <span>Name</span>
        <span>Category</span>
        <span>Scale</span>
      </div>

      <ul>
        {rows.map((r) => {
          const comingSoon = r.availability === "coming_soon";
          return (
            <li
              key={r.id}
              className={`grid grid-cols-[6.5rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 border-b border-neutral-100 px-3 py-3 sm:grid-cols-[8rem_1fr_10rem_6rem] sm:gap-4 sm:py-2.5 ${
                comingSoon ? "opacity-55" : ""
              }`}
            >
              <span className="font-mono text-sm">{r.code}</span>

              <span className="min-w-0">
                <span className="break-words">{r.name}</span>
                {showNewBadge(r) && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-amber-800">
                    NEW
                  </span>
                )}
                {comingSoon && (
                  <span className="ml-2 rounded border border-neutral-300 px-1.5 py-0.5 align-middle text-xs italic text-neutral-500">
                    On its way
                  </span>
                )}
                {/* On phones the category sits under the name. */}
                <span className="block text-xs text-neutral-500 sm:hidden">
                  {r.categoryName}
                </span>
              </span>

              <span className="hidden text-sm text-neutral-600 sm:block">
                {r.categoryName}
              </span>
              <span className="text-sm text-neutral-600">
                {r.default_scale ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
