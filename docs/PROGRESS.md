# Progress

Where the build stands against the phases in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
Update this file and commit it at the end of every task.

_Last updated: 2026-10-31 (Phase 6a: print jobs)_

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Done (deploy to Vercel: please confirm) |
| 2 | Requests | Done |
| 3 | Notepad + model admin | Done |
| 4 | Images | Done |
| 5 | Materials and printers | Done |
| 6a | Print jobs | Done (needs `0008` run, then testing) |
| 6b | BASES colours, categories page, notepad count | **Not started (next)** |
| 7 | Money and stats | Not started |
| 8 | Polish | Not started |

### 1. Foundations: Done
- Next.js 16 app, Supabase email/password login, sign out, proxy guarding every page except `/login`
- `profiles` + role trigger, `is_admin()`, `categories`, `models` (generated `code_key`), `catalogue_models` view without `admin_notes`
- CSV import script (`npm run import:catalogue`, with `--dry-run`). Initial setup only.
- `/catalogue`: category tabs, search, list view
- The brief says "Deploy". Nothing in the repo shows whether Vercel is set up. **Please confirm.**

### 2. Requests: Done
- `request_lines` (unique per model + scale), autosaving quantity / urgency / note on the catalogue, size dropdown, "+ another size"
- "Show all current requests" toggle (renamed from "Show my requests only")
- `/admin/queue`: all lines sorted by urgency then code, editable, totals, hides retired models
- The "printing" amount is carried on every line (filled in from Phase 6a)

### 3. Notepad + model admin: Done
- `/notepad`: handwriting font, Enter / Backspace line handling, autosave, admin tick boxes
- `/admin/models`: inline row editing, extra sizes, admin notes, NEW badge, availability (retire = hidden), delete with confirmation

### 4. Images: Done
- `model-images` bucket, browser-side resize, single upload / replace / remove in the model editor
- `/admin/upload` bulk upload matched on `code_key`
- Grid / list toggle (remembered per browser), hover preview, click-to-enlarge pop-out
- "On its way" label renamed to "Model Not Ready"

### 5. Materials and printers: Done
- `printers` (seeded with Saturn 4 Ultra and Centauri Carbon), `materials` (cost per unit generated; trigger keeps the charge at 2 × cost unless set by hand), `settings` (`resin_charge_divisor` = 15)
- 12 materials seeded (9 PLA, 3 resin)
- `/admin/materials`, `/admin/printers`, `/admin/settings`; "Admin" menu in the header

### 6a. Print jobs: Done (not yet tested against the real database)
- `0008_print_jobs.sql`: `print_jobs` and `print_job_items` (admin only), `request_line_printing` and `model_print_totals` views (no job details or costs), a trigger stopping anyone lowering a request below what's printing, and six RPC functions: start, complete, update result, revert, cancel, edit details
- The SQL was checked in a local Postgres (PGlite) with the full test scenario: start, complete, partial, edit result up and down (line deleted and recreated with its urgency and note), revert, cancel, over-claiming refused, requester can't read jobs or call the functions, resin and FDM charge maths
- `/admin/queue`: tick boxes, "Plate" amount per line (default = what's left), Start a print panel (add catalogue models or free-text items, printer first, then that printer's fields, my cost and charge live, editable), bottom bar while lines are ticked, "N requested · M printing"
- `/admin/jobs` ("Jobs" in the header): Printing now (Complete with All succeeded / All failed, Edit details, Cancel) and History (Open → Edit details, Edit result, Revert)
- Catalogue: "N requested · M printing", NEW badge hides at 4 printed, clear message when trying to go below what's printing
- `/admin/models`: "Printed N" per model, "NEW ended" when the badge has turned itself off

### 6b. BASES colours, categories page, notepad count: Not started
- `colour_material_id` on `request_lines` and `print_job_items`; widen the request line unique rule to (model, scale, colour); add the colour to the line matching in `pj_put_back` (marked "Phase 6b" in `0008_print_jobs.sql`)
- A view exposing just the colour names (materials with `offer_as_colour`) to the requester
- Colour choice in the catalogue for categories with `has_colour_options`; colour slot in `app/(app)/admin/models/model-editor.tsx:367`
- `/admin/categories` page (including `has_colour_options`)
- Unticked notepad count on the queue

### 7. Money and stats: Not started
### 8. Polish: Not started

## Migrations

Run by hand, in order, in the Supabase SQL Editor. Please tick off which ones you've run.

| File | Phase | What it does | Run? |
|------|-------|--------------|------|
| `0001_init.sql` | 1 | profiles, `is_admin()`, categories, models, `catalogue_models` view, RLS | ☐ |
| `0002_requests.sql` | 2 | `request_lines` + RLS and grants | ☐ |
| `0003_notepad.sql` | 3 | `notepad_lines` + RLS and guard trigger | ☐ |
| `0004_model_delete.sql` | 3 | request lines cascade when a model is deleted | ☐ |
| `0005_images.sql` | 4 | `model-images` storage bucket + policies | ☐ |
| `0006_materials_printers.sql` | 5 | printers, materials, settings (admin-only) | ☐ |
| `0007_seed_materials.sql` | 5 | seeds 9 PLA filaments and 3 resins | ☐ |
| `0008_print_jobs.sql` | 6a | print jobs, items, printing views, request guard, job RPC functions | ☐ |

Also in `supabase/snippets/`: `make-admin.sql` (one-off, makes your account admin).

## Known bugs, loose ends and decisions

**Loose ends**
- Phase 6a pages haven't been clicked through in a browser yet: that needs `0008` run in Supabase first. Use the Phase 6a test script.
- The catalogue and queue read the new `request_line_printing` view, so they show an error until `0008` has been run.
- History shows the latest 200 jobs only (enough for now; add paging later if needed).
- Items on a printing job can't be edited; cancel it and start a new plate instead.
- Cancelled jobs can't be reverted.
- No `/admin/categories` page and no notepad count on the queue yet (Phase 6b).

**Decisions made along the way**
- Request lines are shared by both accounts (no per-user owner), hence "Show all current requests".
- Models are edited inline on `/admin/models`; the separate new/edit pages were removed.
- Materials and printers are retired with an `active` flag instead of being deleted when they are in use.
- Image paths are random so browsers can cache images; the old file is removed on replace.
- Every server-side Supabase client awaits `connection()` first, because Cache Components rejects `Date.now()` during prerendering.
- Client views reload their rows when fresh server data arrives, because Cache Components keeps visited pages alive.
- Job server actions call `refresh()` (from `next/cache`) so the queue and jobs pages reload after a change.
- The "can't go below printing" rule applies to the admin too, not just the requester, and also blocks deleting a printing line or changing its size. Cancel the job first if a request really has to shrink.
- `my_cost` has its own `my_cost_overridden` flag (not in the original brief), so a hand-typed cost isn't recalculated over.
- A partly successful job is charged in full; jobs where nothing succeeded, and cancelled jobs, are charged 0 unless set by hand.
- Job RPCs are `security definer` with an admin check at the top; helper functions are not callable by the app.

**Bugs fixed (for reference)**
- Prerender error from `Date.now()` in the Supabase client (26a8a12)
- Queue / catalogue showing stale rows after navigating back (b017780)

No open bugs are recorded in the code or commit messages.
