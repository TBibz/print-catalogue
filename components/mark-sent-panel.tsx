"use client";

// "Mark as sent": for an invoice that went out some other way (by hand, from
// another email account…), possibly some time ago. Records the date and,
// optionally, who it went to, without emailing anything. Used on the
// invoice page and in the invoices list.
import { useState, useTransition } from "react";
import { markInvoiceSent } from "@/app/actions/invoices";
import { ukToday } from "@/lib/invoices";

const field =
  "h-10 rounded-md border border-neutral-300 bg-white px-3 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

export function MarkSentPanel({
  invoiceId,
  invoiceNumber,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  onClose: () => void;
}) {
  const today = ukToday();
  const [date, setDate] = useState(today);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    if (!date) return setError("Choose the date it was sent.");
    if (date > today) return setError("The date sent can't be in the future.");
    startTransition(async () => {
      const r = await markInvoiceSent(invoiceId, { date, to });
      // On success the page reloads with the invoice shown as sent.
      if (!r.ok) setError(r.error);
      else onClose();
    });
  }

  return (
    <form
      className="w-full max-w-2xl rounded-lg border border-neutral-300 bg-neutral-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <h2 className="mb-1 text-lg font-semibold">Mark {invoiceNumber ?? "this invoice"} as sent</h2>
      <p className="mb-3 text-sm text-neutral-600">
        For an invoice that was sent some other way. No email is sent from the site.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">Date sent</span>
          <input
            type="date"
            value={date}
            max={today}
            required
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-sm text-neutral-700">Sent to (optional)</span>
          <input
            value={to}
            maxLength={320}
            onChange={(e) => setTo(e.target.value)}
            placeholder="e.g. an email address or “By hand”"
            className={`${field} w-full min-w-[14rem]`}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Mark as sent"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
        {error && (
          <span role="alert" className="font-medium text-red-700">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
