/**
 * Import the catalogue CSV into Supabase (brief section 8).
 *
 * ⚠️  FOR INITIAL SETUP ONLY. Once you start editing models in the app,
 *     don't re-run this: it would overwrite each model's name, category,
 *     availability and NEW badge with whatever is in the CSV.
 *
 *   npm run import:catalogue -- --dry-run     # show what would happen
 *   npm run import:catalogue                  # do it
 *   npm run import:catalogue -- path/to.csv   # use a different file
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local, which bypasses RLS.
 * It only ever runs on your computer, never in the browser.
 * Re-running during setup is safe: models are matched ("upserted") by code,
 * so nothing is duplicated.
 */
import { fetchAll } from "../lib/fetch-all";
import { readdirSync, readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvPath = args.find((a) => !a.startsWith("--")) ?? findDefaultCsv();

// Finds data/catalogue.csv whatever its capitalisation (e.g. CATALOGUE.csv).
function findDefaultCsv() {
  const match = readdirSync("data").find((f) => f.toLowerCase() === "catalogue.csv");
  return `data/${match ?? "catalogue.csv"}`;
}

type ParsedModel = {
  line: number; // line number in the CSV, for messages
  code: string;
  name: string;
  category: string;
  availability: "available" | "coming_soon";
  show_new_badge: boolean;
};

type Skipped = { line: number; code: string; reason: string };

// Same rule as the generated code_key column in the database.
const toCodeKey = (code: string) => code.replace(/ /g, "").toLowerCase();

async function main() {
  console.log(`${dryRun ? "DRY RUN — nothing will be written.\n" : ""}Reading ${csvPath}`);

  // ---- 1. Read and check the CSV ------------------------------------------
  const rows: string[][] = parse(readFileSync(csvPath, "utf8"), {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  });

  // Columns: (flag), ITEM CODE, ITEM, CATEGORY, Note, Requests, URGENCY.
  // Requests and URGENCY are ignored (requests start fresh).
  const candidates: ParsedModel[] = [];
  const skipped: Skipped[] = [];
  let emptyRows = 0;

  rows.slice(1).forEach((raw, i) => {
    const line = i + 2; // +1 for the header, +1 because lines start at 1
    const cells = raw.map((c) => (c ?? "").trim());
    const [flag = "", code = "", name = "", category = "", note = ""] = cells;

    if (cells.every((c) => c === "")) {
      emptyRows++;
      return;
    }
    if (!code) return skipped.push({ line, code: "(none)", reason: "no item code" });
    if (!name) return skipped.push({ line, code, reason: "blank name" });
    if (!category) return skipped.push({ line, code, reason: "no category" });

    candidates.push({
      line,
      code,
      name,
      category,
      availability: note.toUpperCase() === "NOT READY" ? "coming_soon" : "available",
      show_new_badge: flag === "*",
    });
  });

  // Duplicates: if a code (or its code_key, e.g. "WW2 001" vs "ww2001")
  // appears more than once, skip every copy so you can fix the sheet.
  const byKey = new Map<string, ParsedModel[]>();
  for (const m of candidates) {
    const key = toCodeKey(m.code);
    byKey.set(key, [...(byKey.get(key) ?? []), m]);
  }
  const models: ParsedModel[] = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      models.push(group[0]);
      continue;
    }
    const lines = group.map((m) => m.line).join(", ");
    for (const m of group) {
      skipped.push({ line: m.line, code: m.code, reason: `duplicate code (lines ${lines})` });
    }
  }

  const categoryNames = [...new Set(models.map((m) => m.category))].sort();

  // ---- 2. Compare with what is already in the database --------------------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const haveDb = Boolean(url && serviceKey);

  if (!haveDb && !dryRun) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  if (!haveDb) {
    console.log("(No Supabase keys in .env.local, so treating the database as empty.)\n");
  }

  const supabase = haveDb
    ? createClient(url!, serviceKey!, { auth: { persistSession: false } })
    : null;

  const existingCategories = new Map<string, string>(); // name -> id
  const existingModels = new Map<string, string>(); // code_key -> code

  if (supabase) {
    // Supabase returns at most "Max rows" per request, so read in pages
    // (see lib/fetch-all.ts).
    try {
      const cats = await fetchAll<{ id: string; name: string }>((from, to) =>
        supabase.from("categories").select("id, name").order("id").range(from, to),
      );
      for (const c of cats) existingCategories.set(c.name, c.id);
      const models = await fetchAll<{ code: string; code_key: string }>((from, to) =>
        supabase.from("models").select("code, code_key").order("id").range(from, to),
      );
      for (const m of models) existingModels.set(m.code_key, m.code);
    } catch (error) {
      fail(`Could not read the existing catalogue: ${(error as Error).message}`);
    }
  }

  // A CSV code that matches an existing model's code_key but is spelled
  // differently (e.g. "SW001" vs "sw001") would break the unique code_key.
  const toImport = models.filter((m) => {
    const existingCode = existingModels.get(toCodeKey(m.code));
    if (existingCode && existingCode !== m.code) {
      skipped.push({
        line: m.line,
        code: m.code,
        reason: `clashes with existing model "${existingCode}"`,
      });
      return false;
    }
    return true;
  });

  const newCategories = categoryNames.filter((n) => !existingCategories.has(n));
  const toCreate = toImport.filter((m) => !existingModels.has(toCodeKey(m.code)));
  const toUpdate = toImport.length - toCreate.length;

  // ---- 3. Write ------------------------------------------------------------
  if (!dryRun && supabase) {
    if (newCategories.length) {
      const { data, error } = await supabase
        .from("categories")
        .upsert(
          newCategories.map((name) => ({ name, has_colour_options: name === "BASES" })),
          { onConflict: "name" },
        )
        .select("id, name");
      if (error) fail(`Could not create categories: ${error.message}`);
      for (const c of data ?? []) existingCategories.set(c.name, c.id);
    }

    // Only the fields that come from the CSV are written, so scales, images
    // and admin notes set in the app are kept when re-importing.
    const records = toImport.map((m) => ({
      code: m.code,
      name: m.name,
      category_id: existingCategories.get(m.category)!,
      availability: m.availability,
      show_new_badge: m.show_new_badge,
    }));

    for (let i = 0; i < records.length; i += 500) {
      const { error } = await supabase
        .from("models")
        .upsert(records.slice(i, i + 500), { onConflict: "code" });
      if (error) fail(`Could not save models: ${error.message}`);
    }
  }

  // ---- 4. Summary ----------------------------------------------------------
  const verb = dryRun ? "would be" : "";
  console.log("\n================ Summary ================");
  console.log(`Rows read:            ${rows.length - 1}`);
  console.log(`Empty rows ignored:   ${emptyRows}`);
  console.log(`Categories created:   ${newCategories.length} ${verb}`.trimEnd());
  if (newCategories.length) console.log(`  ${newCategories.join(", ")}`);
  console.log(`Models created:       ${toCreate.length} ${verb}`.trimEnd());
  console.log(`Models updated:       ${toUpdate} ${verb}`.trimEnd());
  console.log(`  of which NEW badge: ${toImport.filter((m) => m.show_new_badge).length}`);
  console.log(`  of which Not ready: ${toImport.filter((m) => m.availability === "coming_soon").length}`);
  console.log(`Rows skipped:         ${skipped.length}`);
  for (const s of skipped.sort((a, b) => a.line - b.line)) {
    console.log(`  line ${s.line}  ${s.code}: ${s.reason}`);
  }
  console.log("=========================================");
  if (dryRun) console.log("Dry run finished. Run again without --dry-run to import.");
}

function fail(message: string): never {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

main();
