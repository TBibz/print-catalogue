import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HISTORY_LIMIT, loadJobFormOptions, loadJobs } from "@/lib/data";
import { JobsView } from "./jobs-view";

export const metadata: Metadata = { title: "Jobs · Print Catalogue" };

export default function JobsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Print jobs</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading jobs…</p>}>
        <JobsData />
      </Suspense>
    </>
  );
}

async function JobsData() {
  await requireAdmin();
  const supabase = await createClient();

  let data = null;
  try {
    const [printing, history, options] = await Promise.all([
      loadJobs(supabase, "printing"),
      loadJobs(supabase, "history"),
      loadJobFormOptions(supabase),
    ]);
    data = { printing, history, options, historyLimit: HISTORY_LIMIT };
  } catch (error) {
    console.error("Loading jobs failed:", error);
  }

  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the jobs couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <JobsView {...data} />;
}
