"use server";

// Print jobs (admin only). Each action calls one database function (RPC),
// which does all of its changes in one transaction and checks everything
// again, including that the caller is the admin. See 0008_print_jobs.sql.
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { detailsFrom, type JobForm } from "@/lib/jobs";

export type JobResult = { ok: true } | { ok: false; error: string };

// One thing on the plate.
export type PlateItem =
  | { kind: "request"; requestLineId: string; quantity: number }
  | { kind: "model"; modelId: string; scale: string | null; quantity: number }
  | { kind: "free"; name: string; quantity: number };

// { item id: how many succeeded }
export type Results = Record<string, number>;

async function callRpc(fn: string, args: Record<string, unknown>): Promise<JobResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendly(fn, error) };
  // Reload the page's server data (queue, jobs) so it shows the change.
  refresh();
  return { ok: true };
}

export async function startPrintJob(form: JobForm, items: PlateItem[]): Promise<JobResult> {
  if (!form.printerId) return { ok: false, error: "Please choose a printer." };
  if (items.length === 0) return { ok: false, error: "Add at least one item to the plate." };
  return callRpc("start_print_job", {
    p_printer_id: form.printerId,
    p_details: detailsFrom(form),
    p_items: items.map((item) => {
      switch (item.kind) {
        case "request":
          return { request_line_id: item.requestLineId, quantity: item.quantity };
        case "model":
          return { model_id: item.modelId, scale: item.scale, quantity: item.quantity };
        case "free":
          return { free_text_name: item.name, quantity: item.quantity };
      }
    }),
  });
}

export async function completePrintJob(jobId: string, results: Results): Promise<JobResult> {
  return callRpc("complete_print_job", { p_job_id: jobId, p_results: results });
}

export async function updateCompletedResult(jobId: string, results: Results): Promise<JobResult> {
  return callRpc("update_completed_result", { p_job_id: jobId, p_results: results });
}

export async function revertPrintJob(jobId: string): Promise<JobResult> {
  return callRpc("revert_print_job", { p_job_id: jobId });
}

export async function cancelPrintJob(jobId: string): Promise<JobResult> {
  return callRpc("cancel_print_job", { p_job_id: jobId });
}

// Starts a new printing job (dated now) that copies an earlier one. Items
// are linked to any open requests for the same thing (see
// 0020_repeat_print_job.sql); the rest go on as "not requested".
export async function repeatPrintJob(jobId: string): Promise<JobResult> {
  return callRpc("repeat_print_job", { p_job_id: jobId });
}

// Deletes a job for good. A completed job is reverted first (see
// 0009_delete_print_job.sql), so requests get back what it took off them.
export async function deletePrintJob(jobId: string): Promise<JobResult> {
  return callRpc("delete_print_job", { p_job_id: jobId });
}

export async function updatePrintJobDetails(jobId: string, form: JobForm): Promise<JobResult> {
  if (!form.printerId) return { ok: false, error: "Please choose a printer." };
  return callRpc("update_print_job_details", {
    p_job_id: jobId,
    p_printer_id: form.printerId,
    p_details: detailsFrom(form),
  });
}

function friendly(fn: string, error: { code?: string; message: string }) {
  console.error(`${fn}:`, error.message);
  // P0001 = a message raised on purpose by the database functions. They're
  // written to be shown as they are, e.g. "SW001 only has 3 left to print".
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "You don't have permission to do that. Try logging in again.";
  if (error.code === "22P02") return "Please check the numbers you entered.";
  return "Couldn't save. Please check your connection and try again.";
}
