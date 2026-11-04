"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { stickyHeadings } from "@/components/sticky-headings";
import { formatMoney, moneyTone } from "@/lib/money";
import {
  formatGrams,
  periodLabel,
  type ReportPrinterRow,
  type ReportQuery,
  type ReportRow,
  type ReportTopModel,
  type ReportTotals,
  type ReportBounds,
  type ReportView,
} from "@/lib/reports";
import { ROW_ALT } from "@/lib/row-highlights";

// Reports → Printing: completed print jobs for a period and printer. All
// figures come from the database (0022); this page only shows them.

// Est weight and Cost are left out on narrow screens (they're in the cards).
const TABLE_COLUMNS =
  "grid-cols-[minmax(4.5rem,1fr)_3rem_4rem_5.5rem_5.5rem] md:grid-cols-[minmax(6rem,1fr)_4rem_6rem_6.5rem_6.5rem_6.5rem_6.5rem]";
const VIEWS: { view: ReportView; label: string }[] = [
  { view: "all", label: "All Time" },
  { view: "monthly", label: "Monthly" },
  { view: "yearly", label: "Yearly" },
  { view: "custom", label: "Custom range" },
];

export function PrintingView({
  query,
  bounds,
  printers,
  rows,
  totals,
  byPrinter,
  topModels,
}: {
  query: ReportQuery;
  // The start month (Settings → Money) and today, worked out on the server:
  // nothing before the start month is ever shown.
  bounds: ReportBounds;
  printers: { id: string; name: string }[];
  rows: ReportRow[];
  totals: ReportTotals;
  byPrinter: ReportPrinterRow[];
  topModels: ReportTopModel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Changing the view, dates or printer loads the report again.
  function show(next: Partial<ReportQuery>) {
    const q = { ...query, ...next };
    const params = new URLSearchParams();
    if (q.view !== "all") params.set("view", q.view);
    if (q.view === "monthly" && q.month) params.set("month", q.month);
    if (q.view === "custom" && q.from) params.set("from", q.from);
    if (q.view === "custom" && q.to) params.set("to", q.to);
    if (q.printerId) params.set("printer", q.printerId);
    const search = params.toString();
    startTransition(() => router.push(`/admin/reports${search ? `?${search}` : ""}`));
  }

  const unit = query.view === "yearly" ? "Year" : "Month";
  const nothing = totals.plates === 0;

  return (
    <div className={`space-y-8 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <Controls query={query} bounds={bounds} printers={printers} onShow={show} />

      <p className="text-sm text-neutral-600">{periodText(query)}</p>

      {/* ---- Summary cards ---- */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="Models printed" value={totals.models.toLocaleString("en-GB")} />
        <Card label="Est weight" value={formatGrams(totals.est_weight_g)} />
        <Card label="Cost" value={formatMoney(totals.cost)} />
        <Card label="Charge" value={formatMoney(totals.charge)} />
        <Card label="Margin" value={formatMoney(totals.margin)} tone={moneyTone(totals.margin)} />
      </section>

      {nothing ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-neutral-600">
          No completed print jobs in this period.
        </p>
      ) : (
        <>
          <ModelsChart rows={rows} view={query.view} />

          {/* ---- By month / year ---- */}
          <section aria-labelledby="table-heading">
            <h2 id="table-heading" className="mb-3 text-lg font-semibold">
              By {unit.toLowerCase()}
            </h2>
            <div className={`${stickyHeadings("reports")} grid gap-x-3 px-3 py-2 ${TABLE_COLUMNS}`}>
              <span>{unit}</span>
              <span className="text-right">Plates</span>
              <span className="text-right">Models</span>
              <span className="hidden text-right md:block">Est weight</span>
              <span className="hidden text-right md:block">Cost</span>
              <span className="text-right">Charge</span>
              <span className="text-right">Margin</span>
            </div>
            <ul>
              {rows.map((r) => (
                <li
                  key={r.period}
                  className={`grid items-center gap-x-3 border-b border-neutral-100 px-3 py-1.5 text-sm tabular-nums ${TABLE_COLUMNS} ${ROW_ALT}`}
                >
                  <Figures label={periodLabel(r.period, query.view)} row={r} />
                </li>
              ))}
              <li
                className={`grid items-center gap-x-3 border-t-2 border-neutral-300 px-3 py-2 text-sm font-semibold tabular-nums ${TABLE_COLUMNS}`}
              >
                <Figures label="Total" row={totals} />
              </li>
            </ul>
          </section>
        </>
      )}

      <Stats byPrinter={byPrinter} topModels={topModels} filtered={Boolean(query.printerId)} />
    </div>
  );
}

// "1 Nov 2026 – 4 Nov 2026" etc., so it's clear what the figures cover.
function periodText(q: ReportQuery) {
  const day = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${q.from ? day(q.from) : "…"} – ${q.to ? day(q.to) : "…"}. Completed print jobs only; cancelled jobs are not counted.`;
}

function Figures({ label, row }: { label: string; row: ReportTotals }) {
  return (
    <>
      <span>{label}</span>
      <span className="text-right">{row.plates}</span>
      <span className="text-right">{row.models.toLocaleString("en-GB")}</span>
      <span className="hidden text-right md:block">{formatGrams(row.est_weight_g)}</span>
      <span className="hidden text-right md:block">{formatMoney(row.cost)}</span>
      <span className="text-right">{formatMoney(row.charge)}</span>
      <span className={`text-right ${moneyTone(row.margin)}`}>{formatMoney(row.margin)}</span>
    </>
  );
}

function Card({ label, value, tone = "text-neutral-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

// ---- View buttons, dates and printer --------------------------------------------

function Controls({
  query,
  bounds,
  printers,
  onShow,
}: {
  query: ReportQuery;
  bounds: ReportBounds;
  printers: { id: string; name: string }[];
  onShow: (next: Partial<ReportQuery>) => void;
}) {
  const [from, setFrom] = useState(query.view === "custom" && query.from ? query.from : bounds.start);
  const [to, setTo] = useState(query.view === "custom" && query.to ? query.to : bounds.today);
  const thisMonth = bounds.today.slice(0, 7);
  const badRange = Boolean(from && to && from > to);
  const tooEarly = Boolean(from && from < bounds.start);

  const button = (active: boolean) =>
    `rounded-md border px-4 py-2 text-base ${
      active
        ? "border-neutral-900 bg-neutral-900 font-medium text-white"
        : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
    }`;
  const field =
    "h-10 rounded-md border border-neutral-300 bg-white px-3 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div role="group" aria-label="View" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.view}
            type="button"
            aria-pressed={query.view === v.view}
            onClick={() =>
              onShow(
                v.view === "custom"
                  ? { view: "custom", from, to }
                  : v.view === "monthly"
                    ? { view: "monthly", month: query.month ?? thisMonth }
                    : { view: v.view },
              )
            }
            className={button(query.view === v.view)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Monthly: which month (start month to this month). */}
      {query.view === "monthly" && (
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">Month</span>
          <input
            type="month"
            value={query.month ?? thisMonth}
            min={bounds.start.slice(0, 7)}
            max={thisMonth}
            onChange={(e) => {
              const month = e.target.value;
              if (month >= bounds.start.slice(0, 7) && month <= thisMonth) onShow({ view: "monthly", month });
            }}
            className={field}
          />
        </label>
      )}

      {query.view === "custom" && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!badRange && !tooEarly) onShow({ view: "custom", from, to });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-700">From</span>
            <input
              type="date"
              value={from}
              min={bounds.start}
              max={bounds.today}
              onChange={(e) => setFrom(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-700">To</span>
            <input
              type="date"
              value={to}
              min={bounds.start}
              max={bounds.today}
              onChange={(e) => setTo(e.target.value)}
              className={field}
            />
          </label>
          <button
            type="submit"
            disabled={!from || !to || badRange || tooEarly}
            className="h-10 rounded-md bg-neutral-900 px-4 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Show
          </button>
          {badRange && <span className="text-sm text-red-700">“From” is after “To”.</span>}
          {tooEarly && (
            <span className="text-sm text-red-700">
              Reports start in {periodLabel(bounds.start, "monthly")} (the start month in Settings → Money).
            </span>
          )}
        </form>
      )}

      <label className="block">
        <span className="mb-1 block text-sm text-neutral-700">Printer</span>
        <select
          value={query.printerId ?? ""}
          onChange={(e) => onShow({ printerId: e.target.value || null })}
          className={`${field} cursor-pointer`}
        >
          <option value="">All printers</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ---- Chart: models printed per month / year ---------------------------------------
// One series, so no legend (the heading names it). Bars in the Reports
// colour (Settings → Colours), oldest on the left; hover a bar for its
// figure. The table above has the same numbers as text.

function ModelsChart({ rows, view }: { rows: ReportRow[]; view: ReportView }) {
  const bars = [...rows].reverse();
  const max = Math.max(1, ...bars.map((b) => b.models));
  const top = niceCeiling(max);
  const peak = bars.reduce((best, b) => (b.models > best.models ? b : best), bars[0]);
  // With lots of bars, only label every few so the labels don't collide.
  const every = Math.ceil(bars.length / 12);

  return (
    <section aria-labelledby="chart-heading">
      <h2 id="chart-heading" className="mb-3 text-lg font-semibold">
        Models printed per {view === "yearly" ? "year" : "month"}
      </h2>
      <div className="flex gap-2" role="img" aria-label={`Bar chart of models printed per ${view === "yearly" ? "year" : "month"}`}>
        {/* Scale on the left: 0, half and the top. */}
        <div className="relative h-48 w-10 shrink-0 text-right text-xs text-neutral-500 tabular-nums">
          <span className="absolute right-0 -translate-y-1/2" style={{ top: 0 }}>
            {top}
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: "50%" }}>
            {top / 2}
          </span>
          <span className="absolute right-0 translate-y-[-50%]" style={{ top: "100%" }}>
            0
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48 border-b border-neutral-300">
            {/* Light grid lines at the top and half way. */}
            <div aria-hidden className="absolute inset-x-0 top-0 border-t border-neutral-100" />
            <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-neutral-100" />
            <div className="relative flex h-full items-end">
              {bars.map((b) => (
                <div
                  key={b.period}
                  data-tip={`${periodLabel(b.period, view)}: ${b.models.toLocaleString("en-GB")} ${b.models === 1 ? "model" : "models"}`}
                  className="flex h-full flex-1 flex-col items-center justify-end px-px"
                >
                  {b === peak && b.models > 0 && (
                    <span className="mb-1 text-xs font-medium text-neutral-700 tabular-nums">{b.models}</span>
                  )}
                  <div
                    className="w-full max-w-12 rounded-t bg-[var(--colour-head-reports)]"
                    style={{ height: `${(b.models / top) * 100}%`, minHeight: b.models > 0 ? 2 : 0 }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex pt-1 text-xs text-neutral-600">
            {bars.map((b, i) => (
              <span key={b.period} className="flex-1 truncate text-center">
                {i % every === 0 ? shortLabel(b.period, view) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// "Oct 26" under monthly bars, "2026" under yearly ones.
function shortLabel(period: string, view: ReportView) {
  const full = periodLabel(period, view);
  return view === "yearly" ? full : `${full.slice(0, 3)} ${full.slice(-2)}`;
}

// A round number at or above the highest bar (1, 2, 5, 10, 20, 50…).
function niceCeiling(n: number) {
  const power = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 5, 10]) if (step * power >= n) return step * power;
  return 10 * power;
}

// ---- Stats for the period (moved from the Money page) ------------------------------

function Stats({
  byPrinter,
  topModels,
  filtered,
}: {
  byPrinter: ReportPrinterRow[];
  topModels: ReportTopModel[];
  filtered: boolean;
}) {
  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="mb-3 text-lg font-semibold">
        Stats for this period{filtered ? " and printer" : ""}
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 font-medium">By printer</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 font-medium">Printer</th>
                <th className="py-1.5 text-right font-medium">Plates</th>
                <th className="py-1.5 text-right font-medium">Models</th>
                <th className="py-1.5 text-right font-medium">Charge</th>
              </tr>
            </thead>
            <tbody>
              {byPrinter.map((p) => (
                <tr key={p.printer_id} className="border-b border-neutral-100">
                  <td className="py-1.5">{p.printer_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.plates}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.models.toLocaleString("en-GB")}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(p.charge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 font-medium">Most printed models</h3>
          {topModels.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing printed in this period.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {topModels.map((m, i) => (
                <li key={m.model_id} className="flex items-baseline gap-2">
                  <span className="w-5 text-right text-neutral-400 tabular-nums">{i + 1}.</span>
                  <span className="font-mono">{m.code}</span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="tabular-nums">{m.printed}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
