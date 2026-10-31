@AGENTS.md

# Working on this project

At the start of every session, read:
1. `docs/PROJECT_BRIEF.md`: the full plan, rules and phases (the source of truth)
2. `docs/PROGRESS.md`: what has been built, which migrations exist, loose ends

At the end of every task:
- Update `docs/PROGRESS.md` (phase status, new migration files, loose ends, decisions)
- If the task changed how something works, update `docs/PROJECT_BRIEF.md` so it still matches the code
- Commit those doc changes along with the work

## Database reads

Supabase returns at most "Max rows" rows per request (1,000 by default) and silently drops the rest. So:
- Never do an unbounded `.select()` on a table or view that can grow. Read lists with `fetchAll()` from `lib/fetch-all.ts`, with a stable order ending in a unique column (e.g. `.order("created_at").order("id")`) and `.range(from, to)`.
- Work out counts and totals in the database (a view, an RPC, or `select("id", { count: "exact", head: true })`), not by counting rows fetched to the browser.
- A deliberate cap (e.g. the latest 200 jobs) uses `fetchAll(…, { max })` and the page must say "Showing latest N of M".
