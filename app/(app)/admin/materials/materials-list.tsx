"use client";

import { formatMoney } from "@/lib/money";
import { useCallback, useRef, useState } from "react";
import { setMaterialInStock } from "@/app/actions/materials";
import { naturalCollator } from "@/lib/catalogue";
import {
  per1000Label,
  TYPE_LABELS,
  type Material,
  type MaterialType,
} from "@/lib/materials";
import { MaterialEditor, MATERIAL_GRID } from "./material-editor";
import { ColourLabel } from "@/components/colour-label";

type Filter = "all" | MaterialType;
type Editing = string | "new" | null;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fdm", label: TYPE_LABELS.fdm },
  { value: "resin", label: TYPE_LABELS.resin },
];

export function MaterialsList({ materials: serverMaterials }: { materials: Material[] }) {
  const [materials, setMaterials] = useState(serverMaterials);
  const [filter, setFilter] = useState<Filter>("all");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const editorDirty = useRef(false);

  // Next.js keeps this page alive in the background between visits. When
  // the server sends fresh materials, show those.
  const [synced, setSynced] = useState(serverMaterials);
  if (serverMaterials !== synced) {
    setSynced(serverMaterials);
    setMaterials(serverMaterials);
    setEditing(null);
  }

  // Filament first, then resin; names in natural order.
  const sorted = [...materials].sort(
    (a, b) => a.type.localeCompare(b.type) || naturalCollator.compare(a.name, b.name),
  );
  const retiredCount = materials.filter((m) => !m.active).length;
  const visible = sorted.filter(
    (m) =>
      m.id === editing ||
      ((filter === "all" || m.type === filter) && (showRetired || m.active)),
  );

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

  function replace(saved: Material) {
    setMaterials((prev) =>
      prev.some((m) => m.id === saved.id)
        ? prev.map((m) => (m.id === saved.id ? saved : m))
        : [...prev, saved],
    );
  }

  async function toggleStock(material: Material, inStock: boolean) {
    replace({ ...material, in_stock: inStock }); // show it straight away
    const result = await setMaterialInStock(material.id, inStock);
    if (result.ok) replace(result.material);
    else {
      replace(material);
      setMessage({ text: result.error, error: true });
    }
  }

  const editorProps = {
    onSaved: (saved: Material) => {
      replace(saved);
      setMessage({ text: `${editing === "new" ? "Added" : "Saved"} ${saved.name} ✓` });
      editorDirty.current = false;
      setEditing(null);
    },
    onDeleted: (deleted: Material) => {
      setMaterials((prev) => prev.filter((m) => m.id !== deleted.id));
      setMessage({ text: `Deleted ${deleted.name}` });
      editorDirty.current = false;
      setEditing(null);
    },
    onCancel: () => openEditor(null),
    onDirtyChange: handleDirtyChange,
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="tablist" aria-label="Type" className="flex flex-wrap gap-2">
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
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm select-none">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-neutral-900"
          />
          Show retired ({retiredCount})
        </label>
        <button
          type="button"
          onClick={() => openEditor("new")}
          disabled={editing === "new"}
          className="ml-auto rounded-md bg-neutral-900 px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          + Add material
        </button>
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mb-3 rounded-md px-3 py-2 ${message.error ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}
        >
          {message.text}
        </p>
      )}

      <div className="border-t border-neutral-200">
        <div
          className={`hidden gap-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${MATERIAL_GRID}`}
        >
          <span>Name</span>
          <span>Type</span>
          <span>Pack</span>
          <span>Cost</span>
          <span>Charge</span>
          <span>In stock</span>
          <span />
        </div>
        <ul>
          {editing === "new" && <MaterialEditor key="new" material={null} {...editorProps} />}
          {visible.map((m) =>
            m.id === editing ? (
              <MaterialEditor key={m.id} material={m} {...editorProps} />
            ) : (
              <li
                key={m.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-3 py-3 md:py-2.5 ${MATERIAL_GRID} ${
                  m.active ? "" : "text-neutral-400"
                }`}
              >
                <span className="min-w-0">
                  <span className="break-words">{m.name}</span>
                  {!m.active && (
                    <span className="ml-2 rounded-full border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      Retired
                    </span>
                  )}
                  {m.offer_as_colour && (
                    <span className="ml-2 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                      Colour option
                    </span>
                  )}
                  <span className="block text-sm">
                    <ColourLabel hex={m.colour_hex} name={m.colour || m.name} />
                  </span>
                  <span className="block text-xs text-neutral-500 md:hidden">
                    {TYPE_LABELS[m.type]} · {formatMoney(m.pack_cost)} for {Number(m.pack_size)}
                    {m.unit} · charge {formatMoney(m.charge_per_unit * 1000)} {per1000Label(m.unit)}
                  </span>
                </span>
                <span className="hidden text-sm md:block">{TYPE_LABELS[m.type]}</span>
                <span className="hidden text-sm md:block">
                  {formatMoney(m.pack_cost)} / {Number(m.pack_size)}
                  {m.unit}
                </span>
                <span className="hidden text-sm md:block">
                  {formatMoney(m.cost_per_unit * 1000)}
                  <span className="block text-xs text-neutral-500">{per1000Label(m.unit)}</span>
                </span>
                <span className="hidden text-sm md:block">
                  {formatMoney(m.charge_per_unit * 1000)}
                  <span className="block text-xs text-neutral-500">
                    {per1000Label(m.unit)}
                    {m.charge_overridden ? " · set by hand" : ""}
                  </span>
                </span>
                <label className="col-start-1 flex w-fit cursor-pointer items-center gap-2 text-sm md:col-start-auto">
                  <input
                    type="checkbox"
                    checked={m.in_stock}
                    onChange={(e) => void toggleStock(m, e.target.checked)}
                    aria-label={`${m.name} in stock`}
                    className="h-5 w-5 cursor-pointer accent-neutral-900"
                  />
                  <span className="md:sr-only">In stock</span>
                </label>
                <button
                  type="button"
                  onClick={() => openEditor(m.id)}
                  className="col-start-2 row-span-2 row-start-1 self-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 md:col-start-auto md:row-span-1 md:row-start-auto"
                >
                  Edit
                </button>
              </li>
            ),
          )}
        </ul>
        {visible.length === 0 && editing !== "new" && (
          <p className="py-12 text-center text-neutral-500">No materials here yet.</p>
        )}
      </div>
    </div>
  );
}
