import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadMoneyMonths, loadMoneySettings, loadPrinterStats, loadTopModels } from "@/lib/data";
import { MoneyView } from "./money-view";

export const metadata: Metadata = { title: "Money · Print Catalogue" };

export default function MoneyPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Money</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading money…</p>}>
        <MoneyData />
      </Suspense>
    </>
  );
}

async function MoneyData() {
  await requireAdmin();
  const supabase = await createClient();

  let data = null;
  try {
    const [months, settings, printerStats, topModels] = await Promise.all([
      loadMoneyMonths(supabase),
      loadMoneySettings(supabase),
      loadPrinterStats(supabase),
      loadTopModels(supabase),
    ]);
    data = { months, settings, printerStats, topModels };
  } catch (error) {
    console.error("Loading money failed:", error);
  }

  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the money page couldn’t be loaded. Please refresh the page. (Has 0012_money.sql been run?)
      </p>
    );
  }
  return <MoneyView {...data} />;
}
