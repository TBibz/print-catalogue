import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCategories, loadJobFormOptions, loadModels, loadRequestLines } from "@/lib/data";
import { compareQueue } from "@/lib/requests";
import { QueueView, type QueueRow } from "./queue-view";
import type { PickableModel } from "./start-print-panel";

export const metadata: Metadata = { title: "Queue · Print Catalogue" };

export default function QueuePage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Print queue</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading queue…</p>}>
        <QueueData />
      </Suspense>
    </>
  );
}

async function QueueData() {
  // proxy.ts already sends non-admins away; this double-checks.
  await requireAdmin();

  const supabase = await createClient();
  let data = null;
  try {
    const [categories, models, lines, options] = await Promise.all([
      loadCategories(supabase),
      // Retired ("hidden") models are left out, so their lines don't show.
      loadModels(supabase),
      loadRequestLines(supabase),
      loadJobFormOptions(supabase),
    ]);
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const modelsById = new Map(models.map((m) => [m.id, m]));

    const rows: QueueRow[] = lines.flatMap((line) => {
      const model = modelsById.get(line.model_id);
      if (!model) return []; // a retired model
      return [
        {
          line,
          code: model.code,
          name: model.name,
          categoryName: categoryNames.get(model.category_id) ?? "",
          defaultScale: model.default_scale,
          urgency: line.urgency,
        },
      ];
    });
    rows.sort(compareQueue);

    // Models that can be added to a plate without a request.
    const pickable: PickableModel[] = models.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      categoryName: categoryNames.get(m.category_id) ?? "",
      default_scale: m.default_scale,
      other_scales: m.other_scales,
    }));
    data = { rows, pickable, options };
  } catch (error) {
    console.error("Loading the queue failed:", error);
  }

  if (!data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the queue couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <QueueView initialRows={data.rows} models={data.pickable} options={data.options} />;
}
