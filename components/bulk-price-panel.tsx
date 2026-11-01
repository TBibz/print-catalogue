"use client";

// "Set price…" in bulk, used on the Categories page (a whole category) and
// the Models page (the ticked models). Works like "Set scale…": the amount,
// which models, and a confirm button that says how many will change (asked
// of the database as you type, without changing anything).
import { useEffect, useState, useTransition } from "react";
import { MoneyInput } from "@/components/money-input";
import { formatMoney, parseMoney } from "@/lib/money";

type Run = (
  price: number,
  onlyUnset: boolean,
  dryRun: boolean,
) => Promise<{ ok: true; count: number } | { ok: false; error: string }>;

export function BulkPricePanel({
  title,
  allLabel,
  run,
  onApplied,
  onClose,
}: {
  title: string; // e.g. "Set the price for DUNE"
  allLabel: string; // e.g. "All models in this category (overwrites)"
  run: Run;
  onApplied?: (price: number, onlyUnset: boolean) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [onlyUnset, setOnlyUnset] = useState(true);
  const [preview, setPreview] = useState<{ key: string; count: number } | { key: string; error: string } | null>(
    null,
  );
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const price = parseMoney(text);
  const valid = price !== null && !Number.isNaN(price);
  const key = JSON.stringify([price, onlyUnset]);

  // Ask how many models would change, after a short pause in typing.
  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(async () => {
      const r = await run(price, onlyUnset, true);
      setPreview(r.ok ? { key, count: r.count } : { key, error: r.error });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers price and onlyUnset
  }, [key]);

  const current = valid && preview && preview.key === key ? preview : null;
  const count = current && "count" in current ? current.count : null;

  function apply() {
    if (!valid) return;
    startTransition(async () => {
      const r = await run(price, onlyUnset, false);
      if (!r.ok) return setResult({ ok: false, text: r.error });
      setResult({ ok: true, text: `Updated ${r.count} ${r.count === 1 ? "model" : "models"} ✓` });
      setPreview(null);
      onApplied?.(price, onlyUnset);
    });
  }

  return (
    <div className="mt-3 rounded-md border border-neutral-300 bg-neutral-50 p-4">
      <h3 className="mb-3 font-medium">{title}</h3>
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <span className="mb-1 block text-sm text-neutral-700">Price</span>
          <MoneyInput
            label="Price"
            value={text}
            onChange={(v) => {
              setText(v);
              setResult(null);
            }}
          />
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
            Only models with no price set
          </label>
          <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="radio"
              checked={!onlyUnset}
              onChange={() => setOnlyUnset(false)}
              className="h-4 w-4 accent-neutral-900"
            />
            {allLabel}
          </label>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={pending || !valid || !count}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-30"
        >
          {pending
            ? "Updating…"
            : !valid || count === null
              ? "Set price"
              : `Set ${formatMoney(price)} on ${count} ${count === 1 ? "model" : "models"}`}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Close
        </button>
        {Number.isNaN(price) && <span className="text-sm text-red-700">Not a valid amount.</span>}
        {count === 0 && <span className="text-sm text-neutral-600">No models would change.</span>}
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
