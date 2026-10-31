# Progress

Where the build stands against the phases in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
Update this file and commit it at the end of every task.

_Last updated: 2026-10-31 (Phase 7: money and stats)_

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Done (deploy to Vercel: please confirm) |
| 2 | Requests | Done |
| 3 | Notepad + model admin | Done |
| 4 | Images | Done |
| 5 | Materials and printers | Done |
| 6a | Print jobs | Done (needs `0008` run, then testing) |
| 6b | Colours, categories page, notepad count | Done (needs `0010` run, then testing) |
| 7 | Money and stats | Done (needs `0012` run, then testing) |
| 8 | Polish | **Not started (next)** |

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

### UI fixes before 6b: Done (needs `0009` run)
- Notepad: no yellow card or ruled lines, just the handwriting on white
- Jobs: Delete on any job, with an in-page confirmation. `0009_delete_print_job.sql` reverts a completed job first, then deletes it and its items
- Charges checked against the brief: resin = weight ÷ divisor (45 g ÷ 15 = £3.00), FDM = weight × the material's charge per g (100 g PLA Black at the seeded £12.49/kg: charge £2.50, my cost £1.25). Both forms recalculate as you type; the live preview now rounds like the database
- Quantity, urgency, note and size controls are all 44px high (catalogue and queue, plus the queue's Plate box)
- Catalogue: category sidebar on laptops, category dropdown on phones and tablets; one-line rows from 1280px wide
- Header: app name links to the catalogue (Catalogue button removed), Notepad, then admin links in a row (Admin drop-down below 1280px), current page highlighted; pages widened to 80rem

### 6b. Colours, categories page, notepad count: Done (not yet tested against the real database)
- `0010_colours.sql`: `colour_material_id` on request lines and job items; one line per model + size + colour; `colour_options` view for the requester; a trigger checking new colour choices; the printing guard also locks the colour; `start_print_job` and `pj_put_back` (used by edit result, revert and delete) carry the colour; BASES marked as having colours
- The SQL was checked in PGlite: two colours plus "Any colour" of one base, duplicate and not-offered colours refused, colour carried onto the plate, colour locked while printing, lines recreated with an out-of-stock colour, delete restores colours. The whole Phase 6a test also still passes with 0010
- Catalogue: colour dropdown with swatches (same 44px height), "+ another colour", out-of-stock colours kept and marked; size and colour locked while printing; category sidebar follows the sort order
- `/admin/categories` (in the header): rename, sort order, colour options, add, delete when empty, model counts
- Queue and jobs: colour swatch and name next to items; on the Centauri, a plate whose coloured items all share one colour pre-selects that filament
- Queue: "N unticked notepad notes" linking to /notepad (blank lines aren't counted)

### Fixes before Phase 7: Done (needs `0011` run)
- `0011_colour_hex_category_order.sql`: `materials.colour_hex` (filled in once from the old name mapping, unknown names grey), `colour_options` now includes `colour_hex` and lists out-of-stock offered colours too, categories get positions 1, 2, 3… (A→Z the first time), `reorder_categories()`. Checked in PGlite, including running it twice
- One colour style everywhere (`components/colour-label.tsx`): a 6px stripe of the true colour beside the name; light colours get a grey outline worked out from the hex. Used in the catalogue dropdown (stripe inside the box), queue, start print panel, jobs and materials. The old dot and the name-based colour lookup are gone
- Materials: colour picker in the editor, stripe in the list
- Colour dropdown lists every offered colour; out-of-stock ones are greyed out with "(out of stock)" and can't be picked unless the line already uses it
- Categories: drag-and-drop order with ↑ ↓ buttons, saved immediately; new categories go last
- Why "sort order 1" went to the bottom: every category was at 0 and the order is "lowest first", so 1 sorted after all of them. (The 6b checklist said it would go to the top, which was wrong.) Fixed by giving every category its own position
- Queue headings: the tick-box heading cell was visually hidden (`sr-only`), which takes it out of the grid, so every heading shifted one column left. Now an empty cell; the Plate column shows "—" until ticked
- Catalogue headings: in mixed lists, base rows had an extra Colour column. Now every row keeps a Colour column whenever any row shown has colours. Jobs, models, materials, printers and categories headings were checked and already matched

### Catalogue row fixes: Done
- Colour dropdown: the stripe covered the first letter because the box's own `px-2.5` padding won over the extra left padding (and some browsers ignore padding on a native-looking `<select>`). Size and colour dropdowns now draw their own arrow (`appearance-none`) and set left/right padding separately; with a stripe the text starts after it with a 6px gap, "Any colour" keeps the normal padding. Fixed in `components/request-fields.tsx`, so grid view is fixed too
- Column widths (xl): Code 5rem, Size 5.5rem, Colour 12.5rem (fits "Sky Blue (out of stock)"), Qty 4rem, Urgency 7rem, Note takes the rest (about 15rem at 1280px, the widest). The status column is gone: "Saving…" / "Saved ✓" show inside the Note box, and errors / "N requested · M printing" / Remove on a line underneath
- Checked with sample data in the browser pane at 1280px (list and grid view), using a temporary preview page that wasn't committed

### 7. Money and stats: Done (not yet tested against the real database)
- `0012_money.sql`: `monthly_money` (admin only), settings `opening_balance` and `money_start_month` (defaults to the first completed job's month), `money_by_month()` (Europe/London months, every job, newest first) and `print_stats_by_printer()`. Checked in PGlite: a job finished at 23:30 UTC on 30 June counts in July, cancelled jobs don't count, Dad gets no rows, half-month dates are refused, safe to run twice
- `/admin/money` ("Money" in the header): running total, Starting balance (opening balance + first month), table newest first with autosaving Payments and Costs, "Materials from jobs" reference, coloured differences, all-time stats per printer and top 10 models
- Money formatting everywhere (`lib/money.ts`): "£1,234.56", "−£12.34"; £ boxes (`components/money-input.tsx`) with a fixed £ that accept "12", "12.5", "1,200". Used on Money, Jobs, the Start print panel (est. cost, my cost, charge) and Materials (pack price, charge)
- The page layout was checked with sample data in the browser pane (desktop and phone), using a temporary preview page that wasn't committed
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
| `0009_delete_print_job.sql` | 6a | `delete_print_job` (reverts a completed job first) | ☐ |
| `0010_colours.sql` | 6b | colours on request lines and job items, `colour_options` view, colour checks, BASES colours | ☐ |
| `0011_colour_hex_category_order.sql` | 6b | `materials.colour_hex`, `colour_options` with hex and out-of-stock colours, category positions, `reorder_categories()` | ☐ |
| `0012_money.sql` | 7 | `monthly_money`, money settings, `money_by_month()`, `print_stats_by_printer()` | ☐ |

Also in `supabase/snippets/`: `make-admin.sql` (one-off, makes your account admin).

## Known bugs, loose ends and decisions

**Loose ends**
- Phase 6a pages haven't been clicked through in a browser yet: that needs `0008` run in Supabase first. Use the Phase 6a test script.
- The catalogue and queue read the new `request_line_printing` view, so they show an error until `0008` has been run.
- History shows the latest 200 jobs only (enough for now; add paging later if needed).
- Items on a printing job can't be edited; cancel it and start a new plate instead.
- Cancelled jobs can't be reverted.
- None of the Phase 6a/6b screens or UI fixes have been checked in a browser yet (Claude can't log in). Lint and the build pass.
- Catalogue models added to a plate by search (not requested) can't be given a colour in the panel yet; the database supports it.
- Drag-and-drop on the Categories page needs a mouse; on a phone or tablet use the ↑ ↓ buttons.
- In the catalogue's colour dropdown, the open list is the browser's own, so it shows names without stripes; the chosen colour shows its stripe in the box.
- Colour names much longer than "Sky Blue (out of stock)" are cut off in the closed colour box (shown in full when it's open).

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
- Money: payments and costs are typed per month (not per purchase or payment). The running total only counts months from the start month; anything before goes in the opening balance.
- The month list is generated from the start month to this month, so a month with nothing typed still shows (as £0).
- Job RPCs are `security definer` with an admin check at the top; helper functions are not callable by the app.
- Colours are set per category (has_colour_options), not per model. The list of colours is every filament with "Offer as colour" ticked (out-of-stock ones greyed out).
- `materials.colour_hex` is the only source of a material's displayed colour.
- When a request line is recreated (edit result, revert, delete), it keeps its colour even if that colour is now out of stock: `pj_put_back` sets a transaction-only flag that the colour check respects.

**Bugs fixed (for reference)**
- Prerender error from `Date.now()` in the Supabase client (26a8a12)
- Queue / catalogue showing stale rows after navigating back (b017780)

No open bugs are recorded in the code or commit messages.
