"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteDraft } from "@/app/actions/invoices";
import { STICKY_HEADINGS } from "@/components/sticky-headings";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatInvoiceDate, type InvoiceListRow } from "@/lib/invoices";

const COLUMNS = "md:grid-cols-[8rem_9rem_5rem_8rem_9rem_minmax(0,1fr)_10rem]";

export function InvoicesList({ invoices: serverInvoices }: { invoices: InvoiceListRow[] }) {
  const [invoices, setInvoices] = useState(serverInvoices);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Next.js keeps this page alive in the background: take fresh rows when
  // the server sends them, and ask for them each time the page is shown
  // again (e.g. after creating or sending an invoice).
  const [synced, setSynced] = useState(serverInvoices);
  if (serverInvoices !== synced) {
    setSynced(serverInvoices);
    setInvoices(serverInvoices);
    setConfirming(null);
  }
  const router = useRouter();
  const shownBefore = useRef(false);
  useEffect(() => {
    if (shownBefore.current) router.refresh();
    shownBefore.current = true;
  }, [router]);

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteDraft(id);
      setConfirming(null);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setInvoices((prev) => prev.filter((i) => i.id !== id));
      setMessage({ ok: true, text: "Draft deleted." });
    });
  }

  if (invoices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-neutral-600">
        No invoices yet. Press <strong>+ New invoice</strong> to make one from the catalogue.
      </p>
    );
  }

  return (
    <div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-3 rounded-md px-3 py-2 ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </p>
      )}
      <div className={`${STICKY_HEADINGS} hidden gap-x-3 px-3 py-2 md:grid ${COLUMNS}`}>
        <span>Number</span>
        <span>Date</span>
        <span className="text-right">Items</span>
        <span className="text-right">Total</span>
        <span>Status</span>
        <span>Sent</span>
        <span />
      </div>
      <ul>
        {invoices.map((inv) => {
          const draft = inv.status === "draft";
          return (
            <li
              key={inv.id}
              className={`grid grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-neutral-100 px-3 py-2 text-sm even:bg-[#f3f1f8] ${COLUMNS}`}
            >
              <Link href={`/invoices/${inv.id}`} className="font-mono font-medium hover:underline">
                {inv.number ?? "Draft"}
              </Link>
              <span>{formatInvoiceDate(inv.invoice_date)}</span>
              <span className="tabular-nums md:text-right">
                {inv.totals.items} {inv.totals.items === 1 ? "item" : "items"}
              </span>
              <span className="font-medium tabular-nums md:text-right">{formatMoney(inv.totals.total)}</span>
              <span>
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${
                    draft ? "border-amber-300 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"
                  }`}
                >
                  {draft ? (inv.number ? "Reopened draft" : "Draft") : "Finalised"}
                </span>
              </span>
              <span className="text-neutral-600">
                {inv.sent_at ? `${formatDateTime(inv.sent_at)}${inv.sent_to ? ` · ${inv.sent_to}` : ""}` : "—"}
              </span>
              <span className="col-span-2 flex justify-end gap-2 md:col-span-1">
                <Link
                  href={`/invoices/${inv.id}`}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
                >
                  Open
                </Link>
                {/* Only drafts that never had a number can be deleted. */}
                {draft && !inv.number && (
                  <button
                    type="button"
                    onClick={() => setConfirming(inv.id)}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </span>
              {confirming === inv.id && (
                <div
                  role="alertdialog"
                  aria-label="Confirm delete"
                  className="col-span-full flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3"
                >
                  <span className="text-red-900">Delete this draft for good?</span>
                  <button
                    type="button"
                    onClick={() => remove(inv.id)}
                    disabled={pending}
                    className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {pending ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
                  >
                    Keep it
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
