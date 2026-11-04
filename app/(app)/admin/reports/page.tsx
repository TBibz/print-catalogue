import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadMoneyMonths, loadMoneySettings, loadPrinters } from "@/lib/data";
import {
  loadPrintReport,
  loadPrintReportByPrinter,
  loadPrintReportTopModels,
  loadPrintReportTotals,
} from "@/lib/report-data";
import { reportBounds, reportQueryFrom, type ReportTab } from "@/lib/reports";
import { MoneyView } from "./money-view";
import { PrintingView } from "./printing-view";

export const metadata: Metadata = { title: "Reports · Print Catalogue" };

// Reports (admin only), two tabs: Printing (the default) and Money. What's
// shown is in the address (?tab=money, ?view=yearly&printer=…), so every
// change reloads the figures from the database.
export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Reports</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading reports…</p>}>
        <ReportsData searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReportsData({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const tab: ReportTab = params.tab === "money" ? "money" : "printing";
  const supabase = await createClient();

  // Load first, then show (one of these is filled in, for the tab shown).
  let money: React.ComponentProps<typeof MoneyView> | null = null;
  let printing: React.ComponentProps<typeof PrintingView> | null = null;
  try {
    if (tab === "money") {
      const [months, settings] = await Promise.all([loadMoneyMonths(supabase), loadMoneySettings(supabase)]);
      money = { months, settings };
    } else {
      // Reports start at the money start month (Settings → Money).
      const bounds = reportBounds((await loadMoneySettings(supabase)).startMonth);
      const query = reportQueryFrom(params, bounds);
      const [printers, rows, totals, byPrinter, topModels] = await Promise.all([
        loadPrinters(supabase),
        loadPrintReport(supabase, query),
        loadPrintReportTotals(supabase, query),
        loadPrintReportByPrinter(supabase, query),
        loadPrintReportTopModels(supabase, query),
      ]);
      printing = {
        query,
        bounds,
        printers: printers.map((p) => ({ id: p.id, name: p.name })),
        rows,
        totals,
        byPrinter,
        topModels,
      };
    }
  } catch (error) {
    console.error(`Loading reports (${tab}) failed:`, error);
  }

  return (
    <>
      <Tabs current={tab} />
      {money && <MoneyView {...money} />}
      {printing && <PrintingView {...printing} />}
      {!money && !printing && (
        <p role="alert" className="text-red-700">
          Sorry, the report couldn’t be loaded. Please refresh the page.
          {tab === "printing" && " (Has 0022_reports_notepad_undo.sql been run?)"}
        </p>
      )}
    </>
  );
}

function Tabs({ current }: { current: ReportTab }) {
  const tabs: { tab: ReportTab; label: string; href: string }[] = [
    { tab: "printing", label: "Printing", href: "/admin/reports" },
    { tab: "money", label: "Money", href: "/admin/reports?tab=money" },
  ];
  return (
    <nav aria-label="Reports" className="mb-6 flex gap-1 border-b border-neutral-200">
      {tabs.map((t) => (
        <Link
          key={t.tab}
          href={t.href}
          aria-current={current === t.tab ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-base ${
            current === t.tab
              ? "border-neutral-900 font-semibold text-neutral-900"
              : "border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
