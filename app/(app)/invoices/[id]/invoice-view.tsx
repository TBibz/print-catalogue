"use client";

// One invoice. While it's a draft every line can be changed (saved
// automatically); once finalised it's read-only, with Send, Download,
// Reopen (if not sent) and Duplicate.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addFreeTextLine,
  addModelLine,
  deleteDraft,
  duplicateInvoice,
  finaliseInvoice,
  removeLine,
  reopenInvoice,
  sendInvoice,
  unmarkInvoiceSent,
  setInvoiceDate,
  updateLine,
} from "@/app/actions/invoices";
import { useImagePreview } from "@/components/image-preview";
import { InvoiceSheet, plainCell } from "@/components/invoice-sheet";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { MarkSentPanel } from "@/components/mark-sent-panel";
import { MoneyInput } from "@/components/money-input";
import type { InvoiceModel } from "@/lib/invoice-data";
import { imageUrl } from "@/lib/images";
import { formatMoney, formatMoneyInput, parseMoney } from "@/lib/money";
import {
  formatDateTime,
  formatInvoiceDate,
  formatSentDate,
  invoiceTitle,
  PDF_ATTACHED_LINE,
  linesTotals,
  type Company,
  type Customer,
  type Invoice,
  type InvoiceLine,
} from "@/lib/invoices";

const TYPING_PAUSE_MS = 800;
const button =
  "rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40";
const primary =
  "rounded-md bg-neutral-900 px-5 py-2.5 text-base font-semibold text-white hover:bg-neutral-700 disabled:opacity-40";

type Message = { ok: boolean; text: string } | null;

export function InvoiceView({
  invoice,
  lines: serverLines,
  company,
  customers,
  models,
  emailReady,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  company: Company;
  customers: Customer[];
  models: InvoiceModel[];
  emailReady: boolean;
}) {
  const router = useRouter();
  const draft = invoice.status === "draft";
  const [lines, setLines] = useState(serverLines);
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Next.js keeps this page alive in the background: take fresh lines when
  // the server sends them, and ask for them when the page is shown again.
  const [synced, setSynced] = useState(serverLines);
  if (serverLines !== synced) {
    setSynced(serverLines);
    setLines(serverLines);
  }
  const shownBefore = useRef(false);
  useEffect(() => {
    if (shownBefore.current) router.refresh();
    shownBefore.current = true;
  }, [router]);

  // Saves still on their way (so Finalise waits for them).
  const savingRef = useRef(0);
  async function savesDone() {
    for (let i = 0; i < 50 && savingRef.current > 0; i++) await new Promise((r) => setTimeout(r, 100));
  }

  const totals = linesTotals(lines);
  const replaceLine = (line: InvoiceLine) => setLines((prev) => prev.map((l) => (l.id === line.id ? line : l)));

  // ---- Actions -----------------------------------------------------------
  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(action);
  }

  const finalise = () =>
    run(async () => {
      await savesDone();
      const r = await finaliseInvoice(invoice.id);
      if (!r.ok) setMessage({ ok: false, text: r.error });
      // On success the page reloads as the finalised invoice.
    });

  const reopen = () =>
    run(async () => {
      const r = await reopenInvoice(invoice.id);
      if (!r.ok) setMessage({ ok: false, text: r.error });
    });

  const duplicate = () =>
    run(async () => {
      const r = await duplicateInvoice(invoice.id);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      router.push(`/invoices/${r.id}`);
    });

  const remove = () =>
    run(async () => {
      const r = await deleteDraft(invoice.id);
      if (!r.ok) {
        setConfirmDelete(false);
        return setMessage({ ok: false, text: r.error });
      }
      router.push("/invoices");
    });

  // ---- Draft editing: cells --------------------------------------------------
  // Each model's image, for the hover preview on its lines (drafts load the
  // models for "+ Add model" anyway).
  const imagePaths = useMemo(() => new Map(models.map((m) => [m.id, m.image_path])), [models]);

  const editableCell = (line: InvoiceLine, key: string) => {
    const common = { line, onChange: replaceLine, savingRef };
    if (key === "amount") return <QuantityBox {...common} />;
    if (key === "each") return <PriceBox {...common} />;
    if (key === "item" && !line.model_id) return <DescriptionBox {...common} />;
    if ((key === "code" || key === "item") && line.model_id) {
      return (
        <PreviewCell line={line} imagePath={imagePaths.get(line.model_id) ?? null}>
          {plainCell(line, key as never)}
        </PreviewCell>
      );
    }
    return plainCell(line, key as never);
  };

  const removeButton = (line: InvoiceLine) => (
    <button
      type="button"
      data-tip="Remove this line"
      aria-label={`Remove ${line.code ?? line.description}`}
      onClick={() =>
        run(async () => {
          const r = await removeLine(line.id);
          if (!r.ok) return setMessage({ ok: false, text: r.error });
          setLines((prev) => prev.filter((l) => l.id !== line.id));
        })
      }
      className="h-7 w-7 rounded-full text-lg leading-none text-neutral-500 hover:bg-red-50 hover:text-red-700"
    >
      ×
    </button>
  );

  const nextPosition = lines.reduce((max, l) => Math.max(max, l.position), 0) + 1;
  const pdfHref = `/invoices/${invoice.id}/pdf`;

  return (
    <div className="mt-2">
      {/* ---- Title and buttons ------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="text-2xl font-semibold">{invoiceTitle(invoice)}</h1>
        <InvoiceStatusBadge invoice={invoice} />
        {draft && <span className="text-sm text-neutral-600">Changes save by themselves.</span>}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {draft ? (
          <>
            <button
              type="button"
              onClick={finalise}
              disabled={pending || lines.length === 0 || totals.unpriced > 0}
              className={primary}
            >
              {pending ? "Working…" : invoice.number ? `Finalise ${invoice.number} again` : "Finalise"}
            </button>
            <a href={pdfHref} download className={button}>
              Download PDF
            </a>
            {/* A draft that once had a number can't be deleted (no gaps). */}
            {!invoice.number && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} className={`${button} text-red-700`}>
                Delete draft
              </button>
            )}
            {totals.unpriced > 0 && (
              <span className="text-sm text-amber-800">
                Give every line a price to finalise ({totals.unpriced} without one).
              </span>
            )}
          </>
        ) : (
          <FinalisedActions
            invoice={invoice}
            company={company}
            customers={customers}
            emailReady={emailReady}
            pdfHref={pdfHref}
            pending={pending}
            onReopen={reopen}
            onDuplicate={duplicate}
          />
        )}
      </div>

      {confirmDelete && (
        <div role="alertdialog" aria-label="Confirm delete" className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3">
          <span className="text-red-900">Delete this draft for good?</span>
          <button type="button" onClick={remove} disabled={pending} className="rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50">
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={button}>
            Keep it
          </button>
        </div>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-4 rounded-md px-3 py-2 ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </p>
      )}

      {/* ---- The invoice ------------------------------------------------- */}
      <InvoiceSheet
        company={company}
        numberText={invoice.number ?? "DRAFT"}
        dateSlot={draft ? <DateBox invoice={invoice} onError={(text) => setMessage({ ok: false, text })} /> : formatInvoiceDate(invoice.invoice_date)}
        total={totals.total}
        lines={lines}
        cell={draft ? editableCell : undefined}
        rowAction={draft ? removeButton : undefined}
        draft={draft}
        afterTable={
          draft ? (
            <AddLines
              invoiceId={invoice.id}
              models={models}
              nextPosition={nextPosition}
              onAdded={(line) => setLines((prev) => [...prev, line])}
            />
          ) : undefined
        }
      />
      {draft && (
        <p className="mt-3 text-center text-sm text-neutral-500">
          Changing a price here changes this invoice only, not the model’s saved price.
        </p>
      )}
    </div>
  );
}

// ---- Autosaving boxes for one line ------------------------------------------

type BoxProps = {
  line: InvoiceLine;
  onChange: (line: InvoiceLine) => void;
  savingRef: React.RefObject<number>;
};

// Shared autosave: save after a pause in typing, or straight away on blur.
// `savingRef` counts saves that are waiting or running, so Finalise can wait
// for every last change to reach the database first.
type Change = Parameters<typeof updateLine>[1];

function useLineSave(line: InvoiceLine, savingRef: React.RefObject<number>, onChange: (l: InvoiceLine) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef<Change | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  // `counted`: this save was already counted in `savingRef` when it was queued.
  async function save(change: Change, counted = false) {
    if (!counted) savingRef.current++;
    setStatus({ kind: "saving" });
    try {
      const r = await updateLine(line.id, change);
      if (!r.ok) return setStatus({ kind: "error", message: r.error });
      onChange(r.line);
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)), 2000);
    } finally {
      savingRef.current--;
    }
  }

  // Save after a pause in typing.
  function later(change: Change) {
    if (timer.current) clearTimeout(timer.current);
    else savingRef.current++; // a new waiting save
    waiting.current = change;
    timer.current = setTimeout(() => {
      timer.current = null;
      const c = waiting.current!;
      waiting.current = null;
      void save(c, true);
    }, TYPING_PAUSE_MS);
  }

  // Save now: anything waiting goes straight away.
  function now(change: Change | null) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      const c = change ?? waiting.current!;
      waiting.current = null;
      void save(c, true);
    } else if (change) {
      void save(change);
    }
  }

  return { status, now, later };
}

// A model line's code or description: hovering shows the model's image
// (the same preview as the catalogue and the builder).
function PreviewCell({
  line,
  imagePath,
  children,
}: {
  line: InvoiceLine;
  imagePath: string | null;
  children: React.ReactNode;
}) {
  const preview = useImagePreview(imageUrl(imagePath), `${line.code ?? ""} ${line.description}`.trim());
  return (
    <span className="block" {...preview.handlers}>
      {children}
      {preview.element}
    </span>
  );
}

function Mark({ status }: { status: ReturnType<typeof useLineSave>["status"] }) {
  if (status.kind === "error") {
    return (
      <span role="alert" className="block text-left text-xs font-normal text-red-700">
        {status.message}
      </span>
    );
  }
  return null;
}

const smallBox =
  "h-7.5 rounded-md border border-neutral-300 bg-white px-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

function QuantityBox({ line, onChange, savingRef }: BoxProps) {
  const [text, setText] = useState(String(line.quantity));
  const { status, now, later } = useLineSave(line, savingRef, onChange);
  const parse = (t: string) => Number(t);
  const commit = (t: string, straightAway: boolean) => {
    const q = parse(t);
    if (!Number.isInteger(q) || q < 1 || q === line.quantity) return straightAway ? now(null) : undefined;
    onChange({ ...line, quantity: q }); // the totals follow straight away
    if (straightAway) now({ quantity: q });
    else later({ quantity: q });
  };
  return (
    <span className="inline-block">
      <input
        type="text"
        inputMode="numeric"
        aria-label={`How many ${line.code ?? line.description}`}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
          setText(t);
          commit(t, false);
        }}
        onBlur={() => {
          if (!(parse(text) >= 1)) setText(String(line.quantity)); // blank or 0: put it back
          else commit(text, true);
        }}
        className={`${smallBox} w-14 text-center tabular-nums ${status.kind === "error" ? "border-red-600" : ""}`}
      />
      <Mark status={status} />
    </span>
  );
}

function PriceBox({ line, onChange, savingRef }: BoxProps) {
  const [text, setText] = useState(line.unit_price === null ? "" : formatMoneyInput(line.unit_price));
  const { status, now, later } = useLineSave(line, savingRef, onChange);
  const commit = (t: string, straightAway: boolean) => {
    const p = parseMoney(t);
    if (Number.isNaN(p) || p === line.unit_price) return straightAway ? now(null) : undefined;
    onChange({ ...line, unit_price: p });
    if (straightAway) now({ unitPrice: p });
    else later({ unitPrice: p });
  };
  return (
    <span className="inline-block">
      <MoneyInput
        compact
        className={`w-[6.5rem] ${line.unit_price === null ? "rounded-md ring-2 ring-amber-400" : ""}`}
        label={`Price per item for ${line.code ?? line.description}`}
        value={text}
        onChange={(t) => {
          setText(t);
          commit(t, false);
        }}
        onBlur={() => commit(text, true)}
      />
      <Mark status={status} />
    </span>
  );
}

function DescriptionBox({ line, onChange, savingRef }: BoxProps) {
  const [text, setText] = useState(line.description);
  const { status, now, later } = useLineSave(line, savingRef, onChange);
  const commit = (t: string, straightAway: boolean) => {
    const d = t.trim();
    if (!d || d === line.description) return straightAway ? now(null) : undefined;
    onChange({ ...line, description: d });
    if (straightAway) now({ description: d });
    else later({ description: d });
  };
  return (
    <span className="block">
      <input
        type="text"
        aria-label="Description"
        value={text}
        maxLength={500}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value, false);
        }}
        onBlur={() => {
          if (!text.trim()) setText(line.description);
          else commit(text, true);
        }}
        className={`${smallBox} w-full`}
      />
      <Mark status={status} />
    </span>
  );
}

function DateBox({ invoice, onError }: { invoice: Invoice; onError: (text: string) => void }) {
  const [date, setDate] = useState(invoice.invoice_date);
  const [saved, setSaved] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="date"
        aria-label="Invoice date"
        value={date}
        onChange={async (e) => {
          const value = e.target.value;
          if (!value) return;
          setDate(value);
          setSaved(false);
          const r = await setInvoiceDate(invoice.id, value);
          if (!r.ok) onError(r.error);
          else setSaved(true);
        }}
        className={`${smallBox} font-bold`}
      />
      {saved && <span className="text-xs font-normal text-green-700">Saved ✓</span>}
    </span>
  );
}

// ---- "+ Add model" and "+ Add free-text line" ---------------------------------

function AddLines({
  invoiceId,
  models,
  nextPosition,
  onAdded,
}: {
  invoiceId: string;
  models: InvoiceModel[];
  nextPosition: number;
  onAdded: (line: InvoiceLine) => void;
}) {
  const [open, setOpen] = useState<"model" | "text" | null>(null);
  const [query, setQuery] = useState("");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return models
      .filter((m) => terms.every((t) => `${m.code} ${m.name}`.toLowerCase().includes(t)))
      .slice(0, 8);
  }, [models, query]);

  function addModel(m: InvoiceModel) {
    setError(null);
    startTransition(async () => {
      const r = await addModelLine(invoiceId, m.id, 1);
      if (!r.ok) return setError(r.error);
      onAdded(r.line);
      setQuery("");
    });
  }

  function addText() {
    setError(null);
    const p = parseMoney(price);
    if (Number.isNaN(p)) return setError("The price isn't a valid amount.");
    startTransition(async () => {
      const r = await addFreeTextLine(invoiceId, {
        description: desc,
        quantity: Number(qty),
        price: p,
        position: nextPosition,
      });
      if (!r.ok) return setError(r.error);
      onAdded(r.line);
      setDesc("");
      setQty("1");
      setPrice("");
    });
  }

  const tab = (which: "model" | "text", label: string) => (
    <button
      type="button"
      onClick={() => {
        setOpen(open === which ? null : which);
        setError(null);
      }}
      aria-expanded={open === which}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
        open === which ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    // Not part of the printed invoice: just under the table on screen.
    <div className="mt-4 rounded-md border border-dashed border-neutral-300 p-3 text-sm" style={{ fontSize: "14px" }}>
      <div className="flex flex-wrap gap-2">
        {tab("model", "+ Add model")}
        {tab("text", "+ Add free-text line")}
      </div>

      {open === "model" && (
        <div className="mt-3">
          <label htmlFor="add-model-search" className="mb-1 block text-neutral-700">
            Search by code or name, then click the model (it’s added with a quantity of 1)
          </label>
          <input
            id="add-model-search"
            type="search"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. SW001 or Vader"
            className="h-9 w-full max-w-sm rounded-md border border-neutral-300 px-2.5 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
          />
          {matches.length > 0 && (
            <ul className="mt-2 max-w-lg divide-y divide-neutral-100 rounded-md border border-neutral-200">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => addModel(m)}
                    disabled={pending}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-100 disabled:opacity-50"
                  >
                    <span className="w-20 shrink-0 font-mono">{m.code}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="shrink-0 text-neutral-600 tabular-nums">
                      {m.price === null ? "No price" : formatMoney(m.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && matches.length === 0 && <p className="mt-2 text-neutral-600">No models match.</p>}
        </div>
      )}

      {open === "text" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addText();
          }}
        >
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-neutral-700">Description</span>
            <input
              value={desc}
              autoFocus
              maxLength={500}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Postage and packing"
              className="h-9 w-full rounded-md border border-neutral-300 px-2.5 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
            />
          </label>
          <label>
            <span className="mb-1 block text-neutral-700">Quantity</span>
            <input
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
              className="h-9 w-20 rounded-md border border-neutral-300 px-2.5 text-center outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
            />
          </label>
          <div>
            <span className="mb-1 block text-neutral-700">Price per item</span>
            <MoneyInput compact className="w-28" label="Price per item" value={price} onChange={setPrice} />
          </div>
          <button
            type="submit"
            disabled={pending || !desc.trim() || !(Number(qty) >= 1)}
            className="h-9 rounded-md bg-neutral-900 px-4 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {pending ? "Adding…" : "Add line"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// ---- Finalised: Send, Mark as sent, Download, Reopen, Duplicate -------------

function FinalisedActions({
  invoice,
  company,
  customers,
  emailReady,
  pdfHref,
  pending,
  onReopen,
  onDuplicate,
}: {
  invoice: Invoice;
  company: Company;
  customers: Customer[];
  emailReady: boolean;
  pdfHref: string;
  pending: boolean;
  onReopen: () => void;
  onDuplicate: () => void;
}) {
  const [sendOpen, setSendOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoing, startUndo] = useTransition();
  const manual = invoice.sent_method === "manual";

  function undoMark() {
    setUndoError(null);
    startUndo(async () => {
      const r = await unmarkInvoiceSent(invoice.id);
      if (!r.ok) setUndoError(r.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSendOpen((o) => !o);
          setMarkOpen(false);
        }}
        disabled={!emailReady}
        aria-expanded={sendOpen}
        data-tip={emailReady ? undefined : "Add the SMTP_ settings (see Settings → Email) to turn on sending"}
        className={primary}
      >
        {emailReady ? "Send…" : "Email not set up yet"}
      </button>
      {/* For invoices that went out some other way. */}
      {!invoice.sent_at && (
        <button
          type="button"
          onClick={() => {
            setMarkOpen((o) => !o);
            setSendOpen(false);
          }}
          aria-expanded={markOpen}
          className={button}
        >
          Mark as sent…
        </button>
      )}
      <a href={pdfHref} download className={button}>
        Download PDF
      </a>
      {!invoice.sent_at && (
        <button type="button" onClick={onReopen} disabled={pending} className={button}>
          Reopen
        </button>
      )}
      <button type="button" onClick={onDuplicate} disabled={pending} className={button}>
        Duplicate as new draft
      </button>
      {invoice.sent_at && !manual && (
        <span className="text-sm text-neutral-600">
          Sent {formatDateTime(invoice.sent_at)}
          {invoice.sent_to ? ` to ${invoice.sent_to}` : ""}. Sent invoices can’t be reopened.
        </span>
      )}
      {invoice.sent_at && manual && (
        <>
          <span className="text-sm text-neutral-600">
            Marked as sent on {formatSentDate(invoice.sent_at)}
            {invoice.sent_to ? ` (${invoice.sent_to})` : ""}. No email went from the site.
          </span>
          <button type="button" onClick={undoMark} disabled={undoing} className={button}>
            {undoing ? "Undoing…" : "Undo mark as sent"}
          </button>
          {undoError && (
            <span role="alert" className="font-medium text-red-700">
              {undoError}
            </span>
          )}
        </>
      )}
      {markOpen && !invoice.sent_at && (
        <MarkSentPanel invoiceId={invoice.id} invoiceNumber={invoice.number} onClose={() => setMarkOpen(false)} />
      )}
      {sendOpen && emailReady && (
        <SendPanel invoice={invoice} company={company} customers={customers} onClose={() => setSendOpen(false)} />
      )}
    </>
  );
}

function SendPanel({
  invoice,
  company,
  customers,
  onClose,
}: {
  invoice: Invoice;
  company: Company;
  customers: Customer[];
  onClose: () => void;
}) {
  const start =
    customers.find((c) => c.id === invoice.customer_id && c.email) ?? customers.find((c) => c.is_default && c.email);
  const [to, setTo] = useState(start?.email ?? "");
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [subject, setSubject] = useState(`Invoice ${invoice.number} from ${company.name}`);
  const [text, setText] = useState(
    `Hello,\n\nPlease find attached invoice ${invoice.number} from ${company.name}.\n\n${PDF_ATTACHED_LINE}\n\nThank you,\n${company.name}`,
  );
  const [result, setResult] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const known = customers.some((c) => c.email.toLowerCase() === to.trim().toLowerCase());

  function send() {
    setResult(null);
    startTransition(async () => {
      const r = await sendInvoice(invoice.id, { to, subject, message: text, saveAsCustomer: saveCustomer && !known, customerName });
      setResult(r.ok ? { ok: true, text: `Sent to ${r.sentTo} ✓` } : { ok: false, text: r.error });
    });
  }

  const field =
    "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";
  return (
    <form
      className="w-full max-w-2xl rounded-lg border border-neutral-300 bg-neutral-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <h2 className="mb-3 text-lg font-semibold">Send {invoice.number} by email</h2>
      {invoice.sent_at && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sent before on {formatDateTime(invoice.sent_at)}
          {invoice.sent_to ? ` to ${invoice.sent_to}` : ""}. You can send it again.
        </p>
      )}
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">To</span>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className={field} />
        </label>
        {to.trim() && !known && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={saveCustomer}
                onChange={(e) => setSaveCustomer(e.target.checked)}
                className="h-4 w-4 accent-neutral-900"
              />
              Save as a customer
            </label>
            {saveCustomer && (
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Their name (optional)"
                aria-label="Customer name"
                className="h-9 rounded-md border border-neutral-300 bg-white px-2.5 outline-none focus:border-neutral-900"
              />
            )}
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">Message</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className={field} />
        </label>
        <p className="text-sm text-neutral-600">The invoice PDF is attached. Replies go to {company.email}.</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !to.trim()} className={primary}>
          {pending ? "Sending…" : "Send"}
        </button>
        <button type="button" onClick={onClose} className={button}>
          Close
        </button>
        {result && (
          <span role={result.ok ? "status" : "alert"} className={`font-medium ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.text}
          </span>
        )}
      </div>
    </form>
  );
}
