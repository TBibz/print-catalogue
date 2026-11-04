"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveMonthlyMoney } from "@/app/actions/money";
import { MoneyInput } from "@/components/money-input";
import { formatMoney, formatMoneyInput, moneyTone, parseMoney, toPence } from "@/lib/money";
import { monthLabel, type MoneyMonth, type MoneySettings } from "@/lib/money-data";

const TYPING_PAUSE_MS = 800;
const SAVED_MESSAGE_MS = 2500;
const COLUMNS = "md:grid-cols-[6.5rem_minmax(0,1fr)_7rem_9.5rem_11.5rem_8rem]";

// Reports → Money. (The print stats that used to be at the bottom are on
// the Printing tab now, for any period and printer.)
export function MoneyView({ months: serverMonths, settings }: { months: MoneyMonth[]; settings: MoneySettings }) {
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
        {/* The opening balance and first month are set in Settings → Money. */}
        <p className="mt-1 text-sm text-neutral-500">
          Includes opening balance of {formatMoney(settings.openingBalance)} ·{" "}
          <Link href="/admin/settings#money" className="underline hover:no-underline">
            Edit in Settings
          </Link>
        </p>
      </section>

      <section aria-labelledby="months-heading">
        <h2 id="months-heading" className="mb-3 text-lg font-semibold">
          By month
        </h2>
        {months.length === 0 ? (
          <p className="py-8 text-center text-neutral-500">
            The first month shown is in the future. Change it in{" "}
            <Link href="/admin/settings#money" className="underline hover:no-underline">
              Settings → Money
            </Link>
            .
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
    </div>
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
