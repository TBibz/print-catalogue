"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { saveMoneySettings, saveMonthlyMoney } from "@/app/actions/money";
import { MoneyInput } from "@/components/money-input";
import { formatMoney, formatMoneyInput, moneyTone, parseMoney, toPence } from "@/lib/money";
import {
  monthLabel,
  type MoneyMonth,
  type MoneySettings,
  type PrinterStats,
  type TopModel,
} from "@/lib/money-data";

const TYPING_PAUSE_MS = 800;
const SAVED_MESSAGE_MS = 2500;
const COLUMNS = "md:grid-cols-[6.5rem_minmax(0,1fr)_7rem_9.5rem_11.5rem_8rem]";

export function MoneyView({
  months: serverMonths,
  settings,
  printerStats,
  topModels,
}: {
  months: MoneyMonth[];
  settings: MoneySettings;
  printerStats: PrinterStats[];
  topModels: TopModel[];
}) {
  const [months, setMonths] = useState(serverMonths);

  // Next.js keeps this page alive between visits; take fresh data when the
  // server sends it (e.g. after a job was completed, or the start month moved).
  const [synced, setSynced] = useState({ serverMonths, version: 0 });
  if (serverMonths !== synced.serverMonths) {
    setSynced({ serverMonths, version: synced.version + 1 });
    setMonths(serverMonths);
  }

  const handleSaved = useCallback((month: string, payments: number, costs: number) => {
    setMonths((prev) =>
      prev.map((m) =>
        m.month === month ? { ...m, payments, costs, difference: toPence(payments - (m.charge + costs)) } : m,
      ),
    );
  }, []);

  // Running total: the opening balance plus every month's difference.
  const total = toPence(settings.openingBalance + months.reduce((sum, m) => sum + m.difference, 0));

  return (
    <div className="space-y-8">
      <section aria-labelledby="total-heading" className="rounded-lg border border-neutral-200 p-5">
        <h2 id="total-heading" className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Running total
        </h2>
        <p className={`mt-1 text-4xl font-semibold tabular-nums ${moneyTone(total)}`}>{formatMoney(total)}</p>
        <p className="mt-1 text-sm text-neutral-600">
          Opening balance {formatMoney(settings.openingBalance)} plus every month’s difference (payments minus
          charges and costs).
        </p>
      </section>

      <StartingBalance key={`${settings.openingBalance}|${settings.startMonth}`} settings={settings} />

      <section aria-labelledby="months-heading">
        <h2 id="months-heading" className="mb-3 text-lg font-semibold">
          By month
        </h2>
        {months.length === 0 ? (
          <p className="py-8 text-center text-neutral-500">
            The start month is in the future. Change it under Starting balance.
          </p>
        ) : (
          <div className="border-t border-neutral-200">
            <div
              className={`hidden gap-3 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${COLUMNS}`}
            >
              <span>Month</span>
              <span>Print jobs</span>
              <span className="text-right">Charge</span>
              <span className="text-right">Payments</span>
              <span className="text-right">Costs</span>
              <span className="text-right">Difference</span>
            </div>
            <ul>
              {months.map((m) => (
                <MonthRow key={`${m.month}@${synced.version}`} month={m} onSaved={handleSaved} />
              ))}
            </ul>
          </div>
        )}
      </section>

      <Stats printerStats={printerStats} topModels={topModels} />
    </div>
  );
}

// ---- Starting balance --------------------------------------------------------

function StartingBalance({ settings }: { settings: MoneySettings }) {
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
    <section aria-labelledby="starting-heading" className="rounded-lg border border-neutral-200 p-4">
      <h2 id="starting-heading" className="mb-1 font-semibold">
        Starting balance
      </h2>
      <p className="mb-3 text-sm text-neutral-600">
        The balance before the first month below. Type a minus for a negative amount, e.g. -42.50.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-wrap items-end gap-4"
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

// ---- One month -------------------------------------------------------------------

type RowStatus = { kind: "idle" | "pending" | "saving" | "saved" } | { kind: "error"; message: string };

// Payments and costs save on their own: after a short pause in typing, or
// straight away when you leave the box. Saves run one at a time.
function MonthRow({
  month,
  onSaved,
}: {
  month: MoneyMonth;
  onSaved: (month: string, payments: number, costs: number) => void;
}) {
  const [payments, setPayments] = useState(formatMoneyInput(month.payments));
  const [costs, setCosts] = useState(formatMoneyInput(month.costs));
  const [status, setStatus] = useState<RowStatus>({ kind: "idle" });

  const latest = useRef({ payments, costs });
  const saved = useRef({ payments: month.payments, costs: month.costs });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const again = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    do {
      again.current = false;
      const { payments: p, costs: c } = latest.current;
      const pNum = parseMoney(p) ?? 0;
      const cNum = parseMoney(c) ?? 0;
      if (Number.isNaN(pNum) || Number.isNaN(cNum)) {
        setStatus({ kind: "error", message: "Enter an amount, e.g. 25 or 1,200.50" });
        break;
      }
      if (pNum === saved.current.payments && cNum === saved.current.costs) {
        setStatus((s) => (s.kind === "pending" ? { kind: "idle" } : s));
        continue;
      }
      setStatus({ kind: "saving" });
      const result = await saveMonthlyMoney(month.month, p, c);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        break;
      }
      saved.current = { payments: result.payments, costs: result.costs };
      onSaved(month.month, result.payments, result.costs);
      setStatus({ kind: "saved" });
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(
        () => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)),
        SAVED_MESSAGE_MS,
      );
    } while (again.current);
    busy.current = false;
  }, [month.month, onSaved]);

  function change(field: "payments" | "costs", value: string) {
    latest.current = { ...latest.current, [field]: value };
    if (field === "payments") setPayments(value);
    else setCosts(value);
    setStatus({ kind: "pending" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), TYPING_PAUSE_MS);
  }

  // Save anything still waiting if the row goes away.
  useEffect(() => {
    return () => {
      if (timer.current) void flush();
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [flush]);

  const label = monthLabel(month.month);

  return (
    <li
      className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 border-b border-neutral-100 px-3 py-3 ${COLUMNS}`}
    >
      {/* Phones: month and jobs, then charge and difference, then the two £
          boxes side by side (the order- classes rearrange them). */}
      <span className="col-span-2 font-medium md:col-span-1 md:pt-2.5">{label}</span>
      <span className="col-span-2 text-sm text-neutral-700 md:col-span-1 md:pt-2.5">
        {month.plates} {month.plates === 1 ? "plate" : "plates"} · {month.items}{" "}
        {month.items === 1 ? "item" : "items"}
      </span>
      <span className="tabular-nums md:pt-2.5 md:text-right">
        <span className="text-sm text-neutral-500 md:hidden">Charge </span>
        {formatMoney(month.charge)}
      </span>
      <div className="max-md:order-2">
        <span className="mb-1 block text-xs text-neutral-500 md:hidden">Payments</span>
        <MoneyInput
          label={`Payments in ${label}`}
          value={payments}
          onChange={(v) => change("payments", v)}
          onBlur={() => void flush()}
          className="w-full"
        />
      </div>
      <div className="max-md:order-2">
        <span className="mb-1 block text-xs text-neutral-500 md:hidden">Costs</span>
        <MoneyInput
          label={`Costs in ${label}`}
          value={costs}
          onChange={(v) => change("costs", v)}
          onBlur={() => void flush()}
          className="w-full"
        />
        <span className="mt-1 block text-right text-xs whitespace-nowrap text-neutral-400">
          Materials from jobs: {formatMoney(month.job_costs)}
        </span>
      </div>
      <div className="text-right max-md:order-1 md:pt-2.5">
        <span className="text-sm text-neutral-500 md:hidden">Difference </span>
        <span className={`font-medium tabular-nums ${moneyTone(month.difference)}`}>
          {formatMoney(month.difference)}
        </span>
        <span className="mt-1 block min-h-4 text-xs">
          {status.kind === "saving" && <span className="text-neutral-500">Saving…</span>}
          {status.kind === "saved" && <span className="text-green-700">Saved ✓</span>}
          {status.kind === "error" && (
            <span role="alert" className="text-red-700">
              {status.message}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

// ---- Stats -----------------------------------------------------------------------

function Stats({ printerStats, topModels }: { printerStats: PrinterStats[]; topModels: TopModel[] }) {
  const plates = printerStats.reduce((s, p) => s + p.plates, 0);
  const items = printerStats.reduce((s, p) => s + p.items, 0);
  const charge = printerStats.reduce((s, p) => s + p.charge, 0);

  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="mb-3 text-lg font-semibold">
        Stats (all time)
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-4">
          <p className="text-2xl font-semibold tabular-nums">
            {plates} {plates === 1 ? "plate" : "plates"} · {items} {items === 1 ? "item" : "items"}
          </p>
          <p className="mb-3 text-sm text-neutral-600">Total charge {formatMoney(charge)}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 font-medium">Printer</th>
                <th className="py-1.5 text-right font-medium">Plates</th>
                <th className="py-1.5 text-right font-medium">Items</th>
                <th className="py-1.5 text-right font-medium">Charge</th>
              </tr>
            </thead>
            <tbody>
              {printerStats.map((p) => (
                <tr key={p.printer_id} className="border-b border-neutral-100">
                  <td className="py-1.5">{p.printer_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.plates}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.items}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(p.charge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 font-medium">Most printed models</h3>
          {topModels.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing printed yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {topModels.map((m, i) => (
                <li key={m.code} className="flex items-baseline gap-2">
                  <span className="w-5 text-right text-neutral-400 tabular-nums">{i + 1}.</span>
                  <span className="font-mono">{m.code}</span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="tabular-nums">{m.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
