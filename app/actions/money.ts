"use server";

// The Money page (admin only: RLS only lets the admin read or change
// monthly_money and settings, and requireAdmin() checks first).
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/money";

type Fail = { ok: false; error: string };
const MAX_AMOUNT = 10_000_000;

// Saves one month's payments and costs (typed in £ boxes, e.g. "1,200").
export async function saveMonthlyMoney(
  month: string,
  paymentsText: string,
  costsText: string,
): Promise<{ ok: true; payments: number; costs: number } | Fail> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, error: "Unknown month." };
  const payments = parseMoney(paymentsText) ?? 0;
  const costs = parseMoney(costsText) ?? 0;
  if (Number.isNaN(payments) || payments > MAX_AMOUNT) {
    return { ok: false, error: "Payments must be an amount, e.g. 25 or 1,200.50." };
  }
  if (Number.isNaN(costs) || costs > MAX_AMOUNT) {
    return { ok: false, error: "Costs must be an amount, e.g. 25 or 1,200.50." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_money").upsert({ month, payments, costs });
  if (error) {
    console.error("monthly_money:", error.message);
    return { ok: false, error: "Couldn't save. Please check your connection and try again." };
  }
  return { ok: true, payments, costs };
}

// Saves the opening balance (can be negative) and the first month shown.
export async function saveMoneySettings(
  openingBalanceText: string,
  startMonth: string, // "2026-07" from <input type="month">
): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  const opening = parseMoney(openingBalanceText, { allowNegative: true }) ?? 0;
  if (Number.isNaN(opening) || Math.abs(opening) > MAX_AMOUNT) {
    return { ok: false, error: "The opening balance must be an amount, e.g. 150 or -42.50." };
  }
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return { ok: false, error: "Choose the first month to show." };

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert([
    { key: "opening_balance", value: String(opening) },
    { key: "money_start_month", value: `${startMonth}-01` },
  ]);
  if (error) {
    console.error("money settings:", error.message);
    return { ok: false, error: "Couldn't save. Please check your connection and try again." };
  }
  // The months shown depend on the start month, so reload the page's data.
  refresh();
  return { ok: true };
}
