# Progress

Where the build stands against the phases in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
Update this file and commit it at the end of every task.

_Last updated: 2026-10-31 (after commit 964a0f7, "Phase 5: printers, materials and settings")_

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Done (deploy to Vercel: please confirm) |
| 2 | Requests | Done |
| 3 | Notepad + model admin | Done |
| 4 | Images | Done |
| 5 | Materials and printers | Done |
| 6 | Print jobs | **Not started (next)** |
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
- The "printing" amount is carried on every line but is always 0 until Phase 6

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

### 6. Print jobs: Not started
Everything is still to do: `print_jobs` + `print_job_items` tables, RPCs to start / complete / partial / cancel / edit / revert, `/admin/jobs`, "Start print" from the queue with the printer-specific form, costs and charges, printing status and printed totals on the catalogue, NEW badge auto-off, BASES colour choice.

Hooks already left in the code for this phase:
- `lib/data.ts:86`: replace the body with a sum of `quantity_planned` from printing jobs
- `lib/requests.ts:27` and `app/actions/requests.ts:57`: enforce "can't go below what's printing"
- `lib/catalogue.ts:44`: printed total is 0 until jobs exist
- `app/(app)/admin/models/model-editor.tsx:367`: slot for BASES colour options
- `request_lines` needs a `colour_material_id` column and a wider unique rule
- `print_job_items` must reference `models` **without** cascade, so print history blocks model deletion (see `0004_model_delete.sql`)
- A view exposing just the BASES colour names to the requester

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

Also in `supabase/snippets/`: `make-admin.sql` (one-off, makes your account admin).

## Known bugs, loose ends and decisions

**Loose ends**
- No `/admin/categories` page yet (the brief lists it but no phase owns it). Categories can only be changed in Supabase for now, including `has_colour_options` for BASES (needed in Phase 6).
- The queue page doesn't yet show the unticked notepad count the brief asks for.
- On this computer `node_modules` is missing: run `npm install` before `npm run dev`. `.env.local` is present.

**Decisions made along the way**
- Request lines are shared by both accounts (no per-user owner), hence "Show all current requests".
- Models are edited inline on `/admin/models`; the separate new/edit pages were removed.
- Materials and printers are retired with an `active` flag instead of being deleted when they are in use.
- Image paths are random so browsers can cache images; the old file is removed on replace.
- Every server-side Supabase client awaits `connection()` first, because Cache Components rejects `Date.now()` during prerendering.
- Client views reload their rows when fresh server data arrives, because Cache Components keeps visited pages alive.

**Bugs fixed (for reference)**
- Prerender error from `Date.now()` in the Supabase client (26a8a12)
- Queue / catalogue showing stale rows after navigating back (b017780)

No open bugs are recorded in the code or commit messages.
