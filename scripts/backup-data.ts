/**
 * Back up every table in the database's public schema to JSON files.
 *
 *   npx tsx scripts/backup-data.ts
 *
 * Writes backups/<date>_<time>/<table>.json (one array of rows per table)
 * plus manifest.json (when it ran and how many rows each table had).
 * The backups/ folder is git-ignored: backups hold real data, so they
 * never go into the repository.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local, which bypasses RLS, so
 * every row is included. It only ever runs on your computer.
 *
 * Read-only: it never changes anything in the database.
 *
 * How it finds the tables: it asks the database's API (PostgREST) for its
 * description of the public schema, which lists every table and view and
 * marks primary-key columns. Anything with a primary key that can be
 * inserted into is a table and is backed up. Read-only views (e.g.
 * invoice_totals) are left out and listed at the end, so nothing is
 * skipped silently.
 *
 * Storage files (model images) are NOT included, only database rows.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchAll } from "../lib/fetch-all";

config({ path: ".env.local", quiet: true });

type Column = { description?: string };
type Definition = { properties?: Record<string, Column> };
type ApiDescription = {
  definitions?: Record<string, Definition>;
  paths?: Record<string, Record<string, unknown>>;
};

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// e.g. "2026-11-09_16-42-05" in UK time, safe for a folder name.
function folderStamp(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }

  // ---- 1. Which tables are there? ------------------------------------------
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) fail(`Couldn't read the list of tables (HTTP ${res.status}): ${await res.text()}`);
  const api = (await res.json()) as ApiDescription;

  const tables: { name: string; keys: string[] }[] = [];
  const skipped: string[] = [];
  for (const [name, def] of Object.entries(api.definitions ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    // PostgREST marks primary-key columns with "<pk/>" in their description.
    // (It also marks key columns it works out for some views, so that alone
    // doesn't tell a table from a view.)
    const keys = Object.entries(def.properties ?? {})
      .filter(([, col]) => col.description?.includes("<pk/>"))
      .map(([col]) => col);
    // Tables can be inserted into (the service role has every right on
    // them); read-only views like invoice_totals can't.
    const insertable = Boolean(api.paths?.[`/${name}`]?.post);
    if (keys.length > 0 && insertable) tables.push({ name, keys });
    else skipped.push(name);
  }
  if (tables.length === 0) fail("No tables found in the public schema.");

  // ---- 2. Export each table ---------------------------------------------------
  const startedAt = new Date();
  const dir = join("backups", folderStamp(startedAt));
  mkdirSync(dir, { recursive: true });
  console.log(`Backing up ${tables.length} tables to ${dir}/\n`);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const counts: Record<string, number> = {};
  let problems = 0;

  for (const { name, keys } of tables) {
    // Read in pages (Supabase returns at most "Max rows" per request),
    // ordered by the primary key so pages never overlap or skip rows.
    const rows = await fetchAll<Record<string, unknown>>((from, to) => {
      let query = supabase.from(name).select("*");
      for (const key of keys) query = query.order(key);
      return query.range(from, to);
    });

    // Double-check against the database's own count.
    const { count, error } = await supabase.from(name).select("*", { count: "exact", head: true });
    if (error) fail(`Couldn't count ${name}: ${error.message}`);
    const mismatch = count !== rows.length;
    if (mismatch) problems++;

    writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows, null, 2) + "\n");
    counts[name] = rows.length;
    console.log(
      `  ${name.padEnd(24)} ${String(rows.length).padStart(6)} rows` +
        (mismatch ? `  ⚠ database says ${count}` : ""),
    );
  }

  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      {
        created_at: startedAt.toISOString(),
        supabase_url: url,
        tables: counts,
        skipped_views: skipped,
        note: "Database rows only; storage files (model images) are not included.",
      },
      null,
      2,
    ) + "\n",
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n${total} rows in ${tables.length} tables.`);
  if (skipped.length) console.log(`Not backed up (views, not tables): ${skipped.join(", ")}`);
  if (problems) fail(`${problems} table(s) changed while backing up or didn't match their count. Run it again.`);
  console.log(`✓ Done: ${dir}/`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
