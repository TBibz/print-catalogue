// Types for the Money page (admin only), shared by the page, its view and
// its server actions.

// One row of money_by_month() (0012_money.sql). Amounts are in pounds.
export type MoneyMonth = {
  month: string; // first day of the month, "2026-10-01"
  plates: number; // completed print jobs
  items: number; // successful prints on them
  charge: number;
  job_costs: number; // my cost of those jobs, for reference
  payments: number;
  costs: number;
  difference: number; // payments − (charge + costs)
};

export type MoneySettings = {
  openingBalance: number;
  startMonth: string; // "2026-07-01"
};

// "Oct 2026" from "2026-10-01". Spelled out here because browsers differ
// (some write "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
