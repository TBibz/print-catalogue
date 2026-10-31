"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveModel, type ModelInput } from "@/app/actions/models";
import {
  AVAILABILITY_LABELS,
  naturalCollator,
  USUAL_SCALES,
  type AdminModel,
  type Availability,
  type Category,
} from "@/lib/catalogue";

const box =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

const AVAILABILITY_HELP: Record<Availability, string> = {
  available: "Shown in the catalogue and can be requested.",
  coming_soon: "Shown greyed out as “On its way”. Can still be requested.",
  hidden:
    "Hidden from the catalogue and the queue, but kept for history. Use this instead of deleting.",
};

function initialInput(model: AdminModel | null): ModelInput {
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

export function ModelForm({
  model,
  categories,
}: {
  model: AdminModel | null; // null = adding a new model
  categories: Category[];
}) {
  const router = useRouter();
  const [original] = useState(() => initialInput(model));
  const [values, setValues] = useState(original);
  const [customScale, setCustomScale] = useState("");
  const [error, setError] = useState<{ message: string; field?: keyof ModelInput } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(values) !== JSON.stringify(original);
  const sortedCategories = [...categories].sort((a, b) => naturalCollator.compare(a.name, b.name));

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveModel(values);
      if (!result.ok) {
        setError({ message: result.error, field: result.field });
        return;
      }
      // Next.js keeps this page alive in the background, so empty the
      // "Add a model" form ready for the next one.
      if (!model) setValues(original);
      router.push(`/admin/models?saved=${encodeURIComponent(values.code.trim())}`);
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

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      {error && !error.field && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-800">
          {error.message}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <label htmlFor="code" className="mb-1 block font-medium">
            Code
          </label>
          <input
            id="code"
            value={values.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="e.g. SW342"
            autoComplete="off"
            className={`${box} font-mono`}
          />
          {fieldError("code")}
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block font-medium">
            Name
          </label>
          <input
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="off"
            className={box}
          />
          {fieldError("name")}
        </div>
      </div>
      {codeChanged && (
        <p className="-mt-3 text-sm text-amber-800">
          You’re renaming this code from <span className="font-mono">{original.code}</span>. Image
          files are matched by code, so a renamed model will need its image file renamed too.
        </p>
      )}

      <div>
        <label htmlFor="category" className="mb-1 block font-medium">
          Category
        </label>
        <select
          id="category"
          value={values.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          className={`${box} cursor-pointer sm:max-w-xs`}
        >
          <option value="">Choose a category…</option>
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fieldError("categoryId")}
      </div>

      <fieldset>
        <legend className="mb-1 font-medium">Sizes</legend>
        <div className="space-y-4 rounded-md border border-neutral-200 p-4">
          <div>
            <label htmlFor="default-scale" className="mb-1 block text-sm text-neutral-700">
              Default size (leave blank if it has none)
            </label>
            <input
              id="default-scale"
              list="usual-scales"
              value={values.defaultScale}
              onChange={(e) => set("defaultScale", e.target.value)}
              placeholder="e.g. 70mm"
              autoComplete="off"
              className={`${box} sm:max-w-40`}
            />
            <datalist id="usual-scales">
              {USUAL_SCALES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {fieldError("defaultScale")}
          </div>

          <div>
            <p className="mb-2 text-sm text-neutral-700">
              Other sizes it can be requested in
            </p>
            <div className="flex flex-wrap gap-2">
              {scaleChoices.map((s) => {
                const on = values.otherScales.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleScale(s)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm ${
                      on
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2 sm:max-w-xs">
              <label htmlFor="custom-scale" className="sr-only">
                Another size
              </label>
              <input
                id="custom-scale"
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
                className={box}
              />
              <button
                type="button"
                onClick={addCustomScale}
                className="shrink-0 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-100"
              >
                Add
              </button>
            </div>
            {fieldError("otherScales")}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-medium">Availability</legend>
        <div className="space-y-2">
          {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((a) => (
            <label
              key={a}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                values.availability === a ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
              }`}
            >
              <input
                type="radio"
                name="availability"
                value={a}
                checked={values.availability === a}
                onChange={() => set("availability", a)}
                className="mt-1 h-4 w-4 accent-neutral-900"
              />
              <span>
                <span className="block font-medium">{AVAILABILITY_LABELS[a]}</span>
                <span className="block text-sm text-neutral-600">{AVAILABILITY_HELP[a]}</span>
              </span>
            </label>
          ))}
        </div>
        {fieldError("availability")}
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={values.showNewBadge}
          onChange={(e) => set("showNewBadge", e.target.checked)}
          className="mt-1 h-5 w-5 accent-neutral-900"
        />
        <span>
          <span className="block font-medium">Show the NEW badge</span>
          <span className="block text-sm text-neutral-600">
            It switches itself off once 4 have been printed successfully.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="admin-notes" className="mb-1 block font-medium">
          Admin notes <span className="font-normal text-neutral-500">(only you can see these)</span>
        </label>
        <textarea
          id="admin-notes"
          rows={3}
          value={values.adminNotes}
          onChange={(e) => set("adminNotes", e.target.value)}
          className={box}
        />
        {fieldError("adminNotes")}
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-200 pt-5">
        <button
          type="submit"
          disabled={pending || (model !== null && !dirty)}
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : model ? "Save changes" : "Add model"}
        </button>
        <Link
          href="/admin/models"
          className="rounded-md px-4 py-2.5 text-base text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </Link>
        {model && !dirty && <span className="text-sm text-neutral-500">No changes yet</span>}
      </div>
    </form>
  );
}
