// An invoice's status as a large, coloured badge, used on the invoices list
// and at the top of each invoice:
//   Draft (grey) · Not sent (amber: finalised, never emailed) ·
//   Sent 1 Nov 2026 (green, the latest time it was emailed)
import { formatSentDate, invoiceSendState, type Invoice } from "@/lib/invoices";

const STYLES = {
  draft: "border-neutral-300 bg-neutral-100 text-neutral-800",
  not_sent: "border-amber-300 bg-amber-100 text-amber-900",
  sent: "border-green-300 bg-green-100 text-green-900",
};

export function InvoiceStatusBadge({ invoice }: { invoice: Pick<Invoice, "status" | "sent_at"> }) {
  const state = invoiceSendState(invoice);
  const label =
    state === "draft" ? "Draft" : state === "not_sent" ? "Not sent" : `Sent ${formatSentDate(invoice.sent_at!)}`;
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap ${STYLES[state]}`}
    >
      {label}
    </span>
  );
}
