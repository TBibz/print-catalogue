"use client";

// Settings → Money: the opening balance and the first month shown on
// Reports → Money (settings opening_balance and money_start_month). Moved
// here from the Money tab; it saves the same way, with saveMoneySettings.
import { useState, useTransition } from "react";
import { saveMoneySettings } from "@/app/actions/money";
import { MoneyInput } from "@/components/money-input";
import { formatMoneyInput, parseMoney } from "@/lib/money";
import type { MoneySettings } from "@/lib/money-data";

export function MoneySettingsForm({ settings }: { settings: MoneySettings }) {
  const [opening, setOpening] = useState(formatMoneyInput(settings.openingBalance));
  const [startMonth, setStartMonth] = useState(settings.startMonth.slice(0, 7)); // "2026-07"
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    parseMoney(opening, { allowNegative: true }) !== settings.openingBalance ||
    startMonth !== settings.startMonth.slice(0, 7);

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveMoneySettings(opening, startMonth);
      setStatus(result.ok ? { ok: true, text: "Saved ✓" } : { ok: false, text: result.error });
    });
  }

  return (
    // id="money": Reports → Money links straight here.
    <section id="money" aria-labelledby="money-heading" className="mt-10 max-w-2xl scroll-mt-24">
      <h2 id="money-heading" className="mb-1 text-xl font-semibold">
        Money
      </h2>
      <p className="mb-3 text-sm text-neutral-600">
        The starting balance for Reports → Money: the balance before the first month shown there. Type a minus
        for a negative amount, e.g. -42.50.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-wrap items-end gap-4 rounded-lg border border-neutral-200 p-4"
      >
        <div>
          <label htmlFor="opening-balance" className="mb-1 block text-sm text-neutral-700">
            Opening balance
          </label>
          <MoneyInput id="opening-balance" value={opening} onChange={setOpening} allowNegative className="w-40" />
        </div>
        <div>
          <label htmlFor="start-month" className="mb-1 block text-sm text-neutral-700">
            First month shown
          </label>
          <input
            id="start-month"
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="h-11 rounded-md border border-neutral-300 bg-white px-2.5 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !dirty}
          className="h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-30"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {status && (
          <span role={status.ok ? "status" : "alert"} className={`pb-3 text-sm ${status.ok ? "text-green-700" : "text-red-700"}`}>
            {status.text}
          </span>
        )}
      </form>
    </section>
  );
}
