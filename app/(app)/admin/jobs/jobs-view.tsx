"use client";

import { formatMoney } from "@/lib/money";
import { useState, useTransition } from "react";
import {
  cancelPrintJob,
  completePrintJob,
  deletePrintJob,
  revertPrintJob,
  updateCompletedResult,
  updatePrintJobDetails,
  type JobResult,
  type Results,
} from "@/app/actions/jobs";
import { ColourLabel } from "@/components/colour-label";
import { JobFields } from "@/components/job-fields";
import {
  finishedAt,
  formatDate,
  itemLabel,
  jobFormFrom,
  printTime,
  type Job,
  type JobForm,
  type JobItem,
  type JobFormOptions,
} from "@/lib/jobs";

// Which job has a form open, and which form.
type Open = {
  jobId: string;
  mode: "complete" | "cancel" | "details" | "result" | "revert" | "delete";
} | null;

// What deleting does, by status (see 0009_delete_print_job.sql).
const DELETE_TEXT: Record<Job["status"], string> = {
  printing:
    "Delete this job for good? Its items stop counting as printing, so the requests can go on another plate. This can't be undone.",
  completed:
    "Delete this job for good? Everything it took off the requests is put back first (recreating requests that had reached 0), and its prints no longer count towards printed totals. This can't be undone.",
  cancelled: "Delete this cancelled job for good? This can't be undone.",
};

const HISTORY_COLUMNS = "md:grid-cols-[8.5rem_8.5rem_minmax(0,1fr)_5.5rem_5rem_5rem_5rem]";

const STATUS_STYLES: Record<Job["status"], string> = {
  printing: "border-blue-200 bg-blue-50 text-blue-800",
  completed: "border-green-200 bg-green-50 text-green-800",
  cancelled: "border-neutral-300 bg-neutral-100 text-neutral-600",
};

const STATUS_LABELS: Record<Job["status"], string> = {
  printing: "Printing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function JobsView({
  printing,
  history,
  options,
  historyLimit,
}: {
  printing: Job[];
  history: Job[];
  options: JobFormOptions;
  historyLimit: number;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Next.js keeps this page alive between visits, and every change reloads
  // the server data. When fresh jobs arrive, close any open form.
  const [synced, setSynced] = useState(printing);
  if (printing !== synced) {
    setSynced(printing);
    setOpen(null);
  }

  const printerName = (id: string) => options.printers.find((p) => p.id === id)?.name ?? "—";
  const sortedHistory = [...history].sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)));

  const toggle = (jobId: string, mode: NonNullable<Open>["mode"]) => {
    setMessage(null);
    setOpen((o) => (o?.jobId === jobId && o.mode === mode ? null : { jobId, mode }));
  };
  const done = (text: string) => {
    setMessage(text);
    setOpen(null);
  };

  return (
    <div className="space-y-8">
      {message && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-green-800">
          {message}
        </p>
      )}

      <section aria-labelledby="printing-heading">
        <h2 id="printing-heading" className="mb-3 text-lg font-semibold">
          Printing now <span className="font-normal text-neutral-500">({printing.length})</span>
        </h2>
        {printing.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 py-8 text-center text-neutral-500">
            Nothing is printing. Start a print from the Queue.
          </p>
        ) : (
          <ul className="space-y-3">
            {printing.map((job) => {
              const mode = open?.jobId === job.id ? open.mode : null;
              return (
                <li key={job.id} className="rounded-lg border border-neutral-200 p-4">
                  <JobSummary job={job} printerName={printerName(job.printer_id)} options={options} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton primary active={mode === "complete"} onClick={() => toggle(job.id, "complete")}>
                      Complete
                    </ActionButton>
                    <ActionButton active={mode === "details"} onClick={() => toggle(job.id, "details")}>
                      Edit details
                    </ActionButton>
                    <ActionButton active={mode === "cancel"} onClick={() => toggle(job.id, "cancel")}>
                      Cancel job
                    </ActionButton>
                    <ActionButton danger active={mode === "delete"} onClick={() => toggle(job.id, "delete")}>
                      Delete
                    </ActionButton>
                  </div>
                  {mode === "complete" && (
                    <ResultForm
                      job={job}
                      submitLabel="Complete job"
                      onSubmit={(results) => completePrintJob(job.id, results)}
                      onDone={() => done(`Completed ${jobName(job)} ✓`)}
                      onClose={() => setOpen(null)}
                    />
                  )}
                  {mode === "details" && (
                    <DetailsForm
                      job={job}
                      options={options}
                      onDone={() => done(`Saved ${jobName(job)} ✓`)}
                      onClose={() => setOpen(null)}
                    />
                  )}
                  {mode === "delete" && (
                    <Confirm
                      danger
                      text={DELETE_TEXT[job.status]}
                      confirmLabel="Yes, delete job"
                      onConfirm={() => deletePrintJob(job.id)}
                      onDone={() => done(`Deleted ${jobName(job)}`)}
                      onClose={() => setOpen(null)}
                    />
                  )}
                  {mode === "cancel" && (
                    <Confirm
                      text="Cancel this job? Nothing on it is counted as printed, so every request still wants these items."
                      confirmLabel="Yes, cancel job"
                      onConfirm={() => cancelPrintJob(job.id)}
                      onDone={() => done(`Cancelled ${jobName(job)}`)}
                      onClose={() => setOpen(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          History
        </h2>
        {sortedHistory.length === 0 ? (
          <p className="py-8 text-center text-neutral-500">No finished jobs yet.</p>
        ) : (
          <div className="border-t border-neutral-200">
            <div
              className={`hidden gap-3 border-b border-neutral-200 px-3 py-2 text-xs font-medium tracking-wide text-neutral-500 uppercase md:grid ${HISTORY_COLUMNS}`}
            >
              <span>Date</span>
              <span>Printer</span>
              <span>Items</span>
              <span className="text-right">OK / planned</span>
              <span className="text-right">My cost</span>
              <span className="text-right">Charge</span>
              <span />
            </div>
            <ul>
              {sortedHistory.map((job) => {
                const isOpen = open?.jobId === job.id;
                const mode = isOpen ? open.mode : null;
                const planned = job.print_job_items.reduce((s, i) => s + i.quantity_planned, 0);
                const succeeded = job.print_job_items.reduce((s, i) => s + (i.quantity_succeeded ?? 0), 0);
                return (
                  <li key={job.id} className="border-b border-neutral-100">
                    <div
                      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-3 md:items-center md:py-2.5 ${HISTORY_COLUMNS}`}
                    >
                      <span className="text-sm">{formatDate(finishedAt(job))}</span>
                      <span className="col-start-1 text-sm text-neutral-600 md:col-start-auto">
                        {printerName(job.printer_id)}
                      </span>
                      <span className="col-start-1 min-w-0 md:col-start-auto">
                        {job.title && <span className="block font-medium">{job.title}</span>}
                        <span className="block text-sm break-words">
                          {job.print_job_items
                            .map((i) => {
                              const colour = colourOf(i, options);
                              return `${i.quantity_planned}× ${itemLabel(i)}${colour ? ` – ${colour.name}` : ""}`;
                            })
                            .join(", ")}
                        </span>
                        {job.status === "cancelled" && (
                          <span
                            className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES.cancelled}`}
                          >
                            Cancelled
                          </span>
                        )}
                      </span>
                      <span className="col-start-1 text-sm tabular-nums md:col-start-auto md:text-right">
                        <span className="md:hidden">Succeeded: </span>
                        {job.status === "completed" ? `${succeeded} / ${planned}` : `— / ${planned}`}
                      </span>
                      <span className="col-start-1 text-sm tabular-nums md:col-start-auto md:text-right">
                        <span className="md:hidden">My cost: </span>
                        {formatMoney(job.my_cost)}
                      </span>
                      <span className="col-start-1 text-sm font-medium tabular-nums md:col-start-auto md:text-right">
                        <span className="font-normal md:hidden">Charge: </span>
                        {formatMoney(job.charge)}
                      </span>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => (isOpen ? setOpen(null) : toggle(job.id, "details"))}
                        className="col-start-2 row-span-6 row-start-1 self-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 md:col-start-auto md:row-span-1 md:row-start-auto"
                      >
                        {isOpen ? "Close" : "Open"}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="mx-3 mb-4 rounded-lg border border-neutral-200 bg-white p-4">
                        <JobSummary job={job} printerName={printerName(job.printer_id)} options={options} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ActionButton active={mode === "details"} onClick={() => toggle(job.id, "details")}>
                            Edit details
                          </ActionButton>
                          {job.status === "completed" && (
                            <>
                              <ActionButton active={mode === "result"} onClick={() => toggle(job.id, "result")}>
                                Edit result
                              </ActionButton>
                              <ActionButton active={mode === "revert"} onClick={() => toggle(job.id, "revert")}>
                                Revert to printing
                              </ActionButton>
                            </>
                          )}
                          <ActionButton danger active={mode === "delete"} onClick={() => toggle(job.id, "delete")}>
                            Delete
                          </ActionButton>
                        </div>
                        {mode === "delete" && (
                          <Confirm
                            danger
                            text={DELETE_TEXT[job.status]}
                            confirmLabel="Yes, delete job"
                            onConfirm={() => deletePrintJob(job.id)}
                            onDone={() => done(`Deleted ${jobName(job)}`)}
                            onClose={() => setOpen(null)}
                          />
                        )}
                        {mode === "details" && (
                          <DetailsForm
                            job={job}
                            options={options}
                            onDone={() => done(`Saved ${jobName(job)} ✓`)}
                            onClose={() => setOpen(null)}
                          />
                        )}
                        {mode === "result" && (
                          <ResultForm
                            job={job}
                            submitLabel="Save result"
                            onSubmit={(results) => updateCompletedResult(job.id, results)}
                            onDone={() => done(`Updated the result of ${jobName(job)} ✓`)}
                            onClose={() => setOpen(null)}
                          />
                        )}
                        {mode === "revert" && (
                          <Confirm
                            text="Revert this job? Everything it took off the requests is put back (recreating requests that had reached 0), and the job goes back to Printing now."
                            confirmLabel="Yes, revert"
                            onConfirm={() => revertPrintJob(job.id)}
                            onDone={() => done(`Reverted ${jobName(job)}: it's printing again`)}
                            onClose={() => setOpen(null)}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {history.length >= historyLimit && (
              <p className="py-3 text-center text-sm text-neutral-500">
                Showing the latest {historyLimit} jobs.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// An item's colour, from the materials list (null = any colour / none).
function colourOf(item: JobItem, options: JobFormOptions) {
  const m = item.colour_material_id ? options.materials.find((x) => x.id === item.colour_material_id) : undefined;
  return m ? { hex: m.colour_hex, name: m.colour || m.name } : null;
}

function ItemColour({ item, options }: { item: JobItem; options: JobFormOptions }) {
  const colour = colourOf(item, options);
  if (!colour) return null;
  return (
    <span className="ml-2">
      <ColourLabel hex={colour.hex} name={colour.name} />
    </span>
  );
}

const jobName = (job: Job) => job.title || `the job started ${formatDate(job.started_at)}`;

// Everything about one job, read-only.
function JobSummary({ job, printerName, options }: { job: Job; printerName: string; options: JobFormOptions }) {
  const material = options.materials.find((m) => m.id === job.material_id);
  const facts = [
    job.est_material_ml !== null && `${Number(job.est_material_ml)} ml`,
    job.est_weight_g !== null && `${Number(job.est_weight_g)} g`,
    printTime(job),
    job.layer_height_mm !== null && `${Number(job.layer_height_mm)} mm layers`,
    material?.name,
  ].filter(Boolean);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{job.title || printerName}</span>
        {job.title && <span className="text-sm text-neutral-600">{printerName}</span>}
        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[job.status]}`}>
          {STATUS_LABELS[job.status]}
        </span>
        <span className="text-sm text-neutral-500">Started {formatDate(job.started_at)}</span>
      </div>
      {facts.length > 0 && <p className="mt-1 text-sm text-neutral-600">{facts.join(" · ")}</p>}
      {job.notes && <p className="mt-1 text-sm text-neutral-600 italic">{job.notes}</p>}
      <ul className="mt-2 space-y-0.5">
        {job.print_job_items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="tabular-nums">
              {item.quantity_succeeded !== null ? `${item.quantity_succeeded} of ` : ""}
              {item.quantity_planned}×
            </span>{" "}
            {itemLabel(item)}
            <ItemColour item={item} options={options} />
            {!item.from_request && item.models && (
              <span className="ml-1 text-xs text-neutral-500">(not requested)</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        My cost <strong className="tabular-nums">{formatMoney(job.my_cost)}</strong>
        {job.my_cost_overridden && <span className="text-neutral-500"> (set by hand)</span>} · Charge{" "}
        <strong className="tabular-nums">{formatMoney(job.charge)}</strong>
        {job.charge_overridden && <span className="text-neutral-500"> (set by hand)</span>}
      </p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  active,
  primary = false,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  primary?: boolean;
  danger?: boolean; // red, for Delete
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md border px-4 py-2 text-sm font-medium ${
        danger
          ? active
            ? "border-red-700 bg-red-700 text-white hover:bg-red-800"
            : "border-red-300 text-red-700 hover:bg-red-50"
          : primary || active
            ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700"
            : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

// Runs a server action, showing "Saving…" and any error.
function useRun(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<JobResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onDone();
      else setError(result.error);
    });
  };
  return { error, pending, run };
}

// How many succeeded, per item. Starts at the planned amount when
// completing, or at the saved result when editing it.
function ResultForm({
  job,
  submitLabel,
  onSubmit,
  onDone,
  onClose,
}: {
  job: Job;
  submitLabel: string;
  onSubmit: (results: Results) => Promise<JobResult>;
  onDone: () => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      job.print_job_items.map((i) => [i.id, String(i.quantity_succeeded ?? i.quantity_planned)]),
    ),
  );
  const { error, pending, run } = useRun(onDone);
  const setAll = (pick: (planned: number) => number) =>
    setValues(Object.fromEntries(job.print_job_items.map((i) => [i.id, String(pick(i.quantity_planned))])));

  function submit() {
    const results: Results = {};
    for (const item of job.print_job_items) {
      const n = Number(values[item.id]);
      if (values[item.id] === "" || !Number.isInteger(n) || n < 0 || n > item.quantity_planned) {
        return run(async () => ({
          ok: false,
          error: `Enter a number from 0 to ${item.quantity_planned} for ${itemLabel(item)}.`,
        }));
      }
      results[item.id] = n;
    }
    run(() => onSubmit(results));
  }

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-2 font-medium">How many succeeded?</span>
        <button
          type="button"
          onClick={() => setAll((p) => p)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          All succeeded
        </button>
        <button
          type="button"
          onClick={() => setAll(() => 0)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          All failed
        </button>
      </div>
      <ul className="space-y-2">
        {job.print_job_items.map((item) => {
          const n = Number(values[item.id]);
          const invalid = values[item.id] === "" || n > item.quantity_planned;
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`How many of ${itemLabel(item)} succeeded`}
                value={values[item.id]}
                onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value.replace(/[^0-9]/g, "") }))}
                className={`w-16 rounded-md border bg-white px-2 py-2 text-center text-base tabular-nums outline-none focus:ring-1 ${
                  invalid ? "border-red-600 focus:ring-red-600" : "border-neutral-300 focus:ring-neutral-900"
                }`}
              />
              <span className="text-sm text-neutral-600">of {item.quantity_planned}</span>
              <span className="min-w-0 flex-1">{itemLabel(item)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-neutral-600">
        Failed ones stay on the request, so they can go on another plate.
      </p>
      <FormButtons
        submitLabel={submitLabel}
        pending={pending}
        error={error}
        onSubmit={submit}
        onClose={onClose}
      />
    </div>
  );
}

function DetailsForm({
  job,
  options,
  onDone,
  onClose,
}: {
  job: Job;
  options: JobFormOptions;
  onDone: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<JobForm>(() => jobFormFrom(job));
  const { error, pending, run } = useRun(onDone);
  // Cancelled jobs, and jobs where nothing succeeded, charge 0 unless set by hand.
  const noCharge =
    job.status === "cancelled" ||
    (job.status === "completed" && !job.print_job_items.some((i) => (i.quantity_succeeded ?? 0) > 0));

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <JobFields
        form={form}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        options={options}
        noCharge={noCharge}
        idPrefix={`job-${job.id}`}
      />
      <FormButtons
        submitLabel="Save details"
        pending={pending}
        error={error}
        onSubmit={() => run(() => updatePrintJobDetails(job.id, form))}
        onClose={onClose}
      />
    </div>
  );
}

function Confirm({
  text,
  confirmLabel,
  onConfirm,
  onDone,
  onClose,
  danger = false,
}: {
  danger?: boolean;
  text: string;
  confirmLabel: string;
  onConfirm: () => Promise<JobResult>;
  onDone: () => void;
  onClose: () => void;
}) {
  const { error, pending, run } = useRun(onDone);
  return (
    <div
      className={`mt-4 rounded-md border p-4 ${danger ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
    >
      <p>{text}</p>
      <FormButtons
        danger={danger}
        submitLabel={confirmLabel}
        pending={pending}
        error={error}
        onSubmit={() => run(onConfirm)}
        onClose={onClose}
        closeLabel="No, keep it"
      />
    </div>
  );
}

function FormButtons({
  submitLabel,
  pending,
  error,
  onSubmit,
  onClose,
  closeLabel = "Cancel",
  danger = false,
}: {
  danger?: boolean;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending}
        className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${
          danger ? "bg-red-700 hover:bg-red-800" : "bg-neutral-900 hover:bg-neutral-700"
        }`}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        {closeLabel}
      </button>
      {error && (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
