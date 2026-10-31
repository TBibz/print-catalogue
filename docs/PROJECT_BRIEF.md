# Print Catalogue — Project Brief

This is the source of truth for the project. Read it before starting any task. Only build what the current prompt asks for, but design so later phases fit without rewrites.

## 1. What this is

A private web app for a household 3D-printing setup:
- **Tomi (admin)** prints models on two printers and manages the catalogue, print queue, print jobs, materials and money.
- **Dad (requester)** browses the catalogue and requests models (quantity, urgency, note), mostly from a laptop.

It replaces two Google Sheets: "PRICELIST + ORDERS" (catalogue/requests) and "3d Prints" (print log, materials, cost vs revenue).

Only these two users. No public sign-up.

## 2. Tech and conventions

- Next.js 16 (App Router, TypeScript, Cache Components on), Tailwind CSS
- Supabase: Postgres, Auth (email + password), Storage (model images, public `model-images` bucket with random file paths; only the admin can write)
- Hosted on Vercel, deployed from GitHub
- Use `@supabase/ssr` for auth in server components, server actions and the proxy (`proxy.ts`, Next.js 16's name for middleware). The proxy requires a session on every page except `/login`.
- All tables have Row Level Security (RLS) enabled
- Database changes go in numbered SQL files in `supabase/migrations/` (e.g. `0001_init.sql`). Tomi runs them by hand in the Supabase SQL Editor, so each file must be safe to read and run top to bottom.
- Multi-step data changes that must happen together (e.g. completing a print job) are Postgres functions called via RPC, not several separate client calls.
- UK English in the UI. Currency is GBP (£).
- Money everywhere is shown as "£1,234.56" (two decimals, thousands separators) and negatives as "−£12.34" (`formatMoney` in `lib/money.ts`). Money boxes have a fixed "£" inside on the left; only the number is typed, and "12", "12.5" and "1,200" are all accepted (`components/money-input.tsx`). Amounts are stored pence-accurate (`numeric(…, 2)`).
- **Desktop/laptop first**, but layouts must still work on a phone. Installable as a home-screen / dock app ("Print Catalogue", `public/manifest.webmanifest`, opens without browser bars).
- **Reads never get silently cut off:** Supabase returns at most "Max rows" rows per request. Lists are read with `fetchAll()` (`lib/fetch-all.ts`) in pages with a stable order; counts and totals come from the database (e.g. `category_model_counts`); a deliberate cap says so ("Showing latest 200 of N"). See CLAUDE.md.
- Clean, minimal look: white/light background (model renders are on pure white), clear typography, no clutter. Large enough click targets for an older user.
- Tomi is a beginner coder. Keep code readable, add short comments on non-obvious logic, and always finish a task with a plain-English checklist of anything Tomi must do by hand.

## 3. Roles and permissions

- `admin` (Tomi): full read/write on everything.
- `requester` (Dad): read the catalogue (except admin-only fields); create, update and delete request lines; read print status for his requests; write notepad lines and edit/delete his own. Cannot see costs, charges, materials, printers, print job details or admin notes.
- A `profiles` table links each auth user to a role. Provide an SQL helper `is_admin()` used by RLS policies.
- Admin-only columns (e.g. `models.admin_notes`) are exposed to the requester only through a view or select that excludes them.

## 4. Data model (target design)

Build tables only when their phase is reached. Names and fields below are the target.

### profiles
- `id` (uuid, = auth.users.id), `display_name`, `role` (`admin` | `requester`), `created_at`
- A trigger creates a profile (role `requester` by default) when an auth user is created.

### categories
- `id`, `name` (unique, e.g. "STAR WARS"), `sort_order` (int: the category's position, 1 = first; set by drag-and-drop on the Categories page and saved with `reorder_categories()`; new categories go last), `has_colour_options` (bool, default false; `0010_colours.sql` sets it for BASES), `colour_hex` (default grey; highlights the category in the catalogue sidebar)
- `category_model_counts` view: total and visible (not retired) models per category, for the sidebar and Categories page.
- `set_category_default_scale(category, scale, only_unset, add_scales, dry_run)`: sets the default scale on a category's models (only those with none, or all), optionally adding other sizes; the dry run returns how many would change.

### models
- `id`, `code` (unique, text, e.g. "SW001", "Base001", "WW2 001", "DN020a", "DN005a+b")
- `name`, `category_id`
- `default_scale` (text, nullable, e.g. "70mm"), `other_scales` (text[], default empty). Usual scales: 28mm, 54mm, 60mm, 70mm, 80mm, 100mm, but any text is allowed.
- `availability`: `available` | `coming_soon` | `hidden`
  - coming_soon = greyed out and labelled "Not ready" (the label never wraps), but **can still be requested**
  - hidden = retired; not shown in the catalogue, kept for history
- `image_path` (nullable; some models have no image). Images are shrunk in the browser to 1000px on white (WebP, JPEG fallback) before upload.
- `show_new_badge` (bool). The NEW badge shows when this is true AND the model's successful printed total is < 4.
- `admin_notes` (admin-only), `created_at`, `updated_at`
- `code_key` (generated: lower(code) with spaces removed), used to match image file names

**Category is chosen per model. It is NOT derived from the code prefix** (MISC codes span several categories, SF spans DR WHO and SCI-FI, etc.).

### request_lines (Phase 2)
One row per model + option combination that Dad currently wants.
- `id`, `model_id`, `scale` (nullable text; null = model default), `colour_material_id` (nullable, FK materials; null = "Any colour"; only for models whose category has colour options)
- `quantity` (int > 0: outstanding amount still wanted), `urgency` (nullable: `ASAP` | `URGENT` | `PRIORITY`), `note` (text)
- `created_at`, `updated_at`
- Unique on (model_id, scale, colour_material_id), treating nulls as equal.
- A colour must be a filament that is offered as a colour, in stock and in use when it is chosen (database trigger `request_lines_colour_check`). A line keeps its colour if it later goes out of stock, and lines recreated by edit/revert/delete keep theirs too.
- Deleting a model deletes its request lines (cascade).
- Setting the quantity to 0/blank deletes the row (the item goes back to blank).
- Nobody can set the quantity below the amount currently printing for that line, delete a line that is printing, or change its size. A database trigger enforces this (`request_lines_printing_guard`), and the UI shows the same message.

### printers (Phase 5)
- `id`, `name` ("Saturn 4 Ultra", "Centauri Carbon"), `type` (`resin` | `fdm`), `active`, `colour_hex` (default grey; shown as a stripe in Start print and on Jobs)

### materials (Phase 5)
The material stock index. It replaces the price table in "Centauri Prints" (cols I–M) and the "Resins" tab.
- `id`, `type` (`resin` | `fdm`), `name` (e.g. "PLA Black", "ABS 2.0 Grey"), `colour` (name, e.g. "Black"), `colour_hex` (e.g. `#111111`, picked with a colour picker; the only source of a material's displayed colour)
- `unit` (`ml` | `g`), `pack_size` (e.g. 1000), `pack_cost` (£)
- `cost_per_unit` (derived: pack_cost / pack_size), `charge_per_unit` (£ per g for FDM charges; default 2 × cost_per_unit, editable)
- `charge_overridden` (bool): false = a trigger keeps `charge_per_unit` at 2 × cost; true = set by hand and left alone
- `in_stock` (bool), `offer_as_colour` (bool: shown as a colour choice for categories with colour options, while also in stock)
- `active` (bool): false = retired, kept for history, hidden from new print jobs
- Printers, materials and settings are admin-only. The requester sees colours only through the `colour_options` view (id, name, colour, colour_hex, available, in_stock; no prices): every filament offered as a colour (in stock or not, but not retired), plus any colour an existing request still uses.
- Later: individual spools/bottles and remaining amount.

### print_jobs (Phase 6) — one job = one plate
- `id`, `printer_id`, `title` (optional), `status`: `printing` | `completed` | `cancelled`
- `started_at`, `completed_at`, `cancelled_at`, `created_by`
- Shared: `notes`. Success or failure is recorded per item (`quantity_succeeded`).
- **The job form changes with the printer type. Choose the printer first, then show only the fields for that type:**
  - **Resin (Saturn 4 Ultra)**, required: `est_material_ml`, `est_weight_g`, `print_hours` + `print_minutes`, `est_cost` (£, typed in from the slicer). Optional: `layer_height_mm` (default 0.05), `material_id` (resin bottle).
  - **FDM (Centauri Carbon)**, required: `est_weight_g`, `material_id` (dropdown of FDM materials). `my_cost` and `charge` are calculated from the material. Optional: `print_hours` + `print_minutes`.
- Store all of these as nullable columns on print_jobs. Validate the required set per printer type in the form and in the RPC.
- Money (all editable): `my_cost` + `my_cost_overridden`, `charge` + `charge_overridden` (bool). When not overridden, the database recalculates them whenever the job changes.
- Admin only (RLS). The requester sees printing amounts only through the `request_line_printing` view (request_line_id + printing, nothing else) and printed totals through `model_print_totals` (model_id + printed_total).

### print_job_items (Phase 6)
- `id`, `job_id`, `model_id` (nullable, no cascade: print history blocks deleting a model), `free_text_name` (for things not in the catalogue), `request_line_id` (nullable; set to null if the line is deleted), `scale`, `colour_material_id` (copied from the request line; null = any colour)
- `from_request` (bool: the item came from a request line, even after that line is gone), `request_urgency` + `request_note` (copies taken from the line, so a deleted line can be recreated the same way)
- `quantity_planned`, `quantity_succeeded` (null until completed), `quantity_applied_to_request` (how much was actually taken off the request line, so edits and reverts are exact)

### notepad_lines (Phase 3)
- `id`, `text`, `created_by`, `created_at`, `done` (bool), `done_at`, `position`

### settings (Phase 5)
- Key/value. `resin_charge_divisor` = 15; `opening_balance` (£, can be negative); `money_start_month` (first day of the first month on the Money page; defaults to the month of the first completed job).

### monthly_money (Phase 7)
One row per month, only once something has been typed in (a month without a row counts as £0).
- `month` (date, primary key: the first day of the month), `payments` (£ received from Dad, default 0), `costs` (£ spent, default 0), `note` (optional), `updated_at`
- Admin only (RLS).

### Money by month (Phase 7)
`money_by_month()` returns one row per month from `money_start_month` to the current month (newest first), using Europe/London month boundaries and every job in the database:
- `plates` = completed print jobs (by `completed_at`), `items` = sum of their `quantity_succeeded`
- `charge` = sum of their `charge`, `job_costs` = sum of their `my_cost` (reference only)
- `payments`, `costs` from `monthly_money` (0 if no row)
- `difference` = payments − (charge + costs)

The running total = `opening_balance` + the sum of every month's difference. Months are generated, never created by hand, so a new month appears by itself when it starts.

`print_stats_by_printer()` returns all-time completed plates, items and charge per printer.

## 5. Core rules

**Sorting**
- Catalogue: category position (the order on the Categories page), then code in natural order (use `Intl.Collator('en', { numeric: true, sensitivity: 'base' })`).
- Print queue: urgency (ASAP → URGENT → PRIORITY → none), then code in natural order.

**Urgency colours** (match the old sheet)
- ASAP: dark red pill, white text
- URGENT: light pink pill, dark red text
- PRIORITY: light green pill, dark green text
- none: blank

**Printing quantity**
- "Printing" for a request line = sum of `quantity_planned` on its items in jobs with status `printing`.

**Completing a job** (one RPC)
- For each item, Tomi enters `quantity_succeeded` (default = planned).
- Reduce the linked request line's quantity by min(succeeded, line quantity). Store that amount in `quantity_applied_to_request`. Delete the line if it reaches 0.
- Failed or unsuccessful units simply stop being "printing", so the request still shows them as wanted.
- Mark the job completed.

**Starting a job** (one RPC): items are request lines (quantity at most line quantity − already printing), catalogue models nobody requested, or free-text items.

**Editing a completed result / reverting** (one RPC each)
- Adjusting `quantity_succeeded` re-applies only the difference: fewer succeeded puts the extra back (recreating the request line if needed, with the same model, size, urgency and note, or adding to an existing line for that model and size); more succeeded takes more off the line if it still wants some (never below what other jobs are printing).
- Reverting a completed job puts back `quantity_applied_to_request` and sets the job back to `printing`. Cancelled jobs can't be reverted (start a new plate instead).

**RPC functions** (`0008_print_jobs.sql`, admin only, one transaction each): `start_print_job`, `complete_print_job`, `update_completed_result`, `revert_print_job`, `cancel_print_job`, `update_print_job_details`, and `delete_print_job` (`0009_delete_print_job.sql`: a completed job is reverted first, then the job and its items are deleted; a printing or cancelled job is just deleted). They raise plain-English messages that the app shows as they are.

**Cancelling a printing job:** nothing is counted.

**Printed total per model** = sum of `quantity_succeeded` on items in completed jobs.

**NEW badge:** shown if `show_new_badge` is true and printed total < 4. NEW models' catalogue rows and grid cards also get a light gold background (over the alternating grey). It turns off automatically after 4 successful prints. Imported models start with it off unless flagged.

**Charges (Phase 6)**
- Resin job: `charge` = est_weight_g ÷ resin_charge_divisor (15). `my_cost` = the `est_cost` typed in from the slicer.
- FDM job: `charge` = est_weight_g × material charge_per_unit. `my_cost` = est_weight_g × material cost_per_unit.
- Charges are always editable (`charge_overridden`). Cancelled jobs, and jobs where nothing succeeded, are not charged by default. A partly successful job is charged in full.

## 6. Pages

Header (every page): "Print Catalogue" (the app name, links to the catalogue), "Notepad", then for the admin only Queue, Jobs, Money, Models, Categories, Upload, Materials, Printers, Settings (in an "Admin" drop-down below 1280px wide, where they don't fit), and Sign out on the right. The current page's link is highlighted. Pages are up to 96rem wide.

**Colours are shown one way everywhere** (`components/colour-label.tsx`): a solid 6px vertical stripe of the material's `colour_hex`, full text height with slightly rounded corners, immediately left of the colour name in normal dark text. Very light colours (worked out from the hex's luminance) get a thin grey outline. "Any colour" has no stripe. In the catalogue's colour dropdown the chosen colour's stripe sits inside the box, left of the name.

Request controls (quantity, urgency, note, size, colour, plate) are all 30px high with 14px text, for spreadsheet density. Catalogue list and queue rows are one line where possible, vertically centred, with about 4px padding, and alternate white / soft lavender grey (#f3f1f8). Long names are cut short with "…" (full name on hover). Another size or colour is added with a small "+" right of the size or colour dropdown (tooltip "Add another size/colour").

Everyone:
- `/login`
- `/catalogue`: categories in a left-hand sidebar (All + each category, with model counts from the database; on "All" each row shows a small category tag (colour stripe + name) in its own column, and no category is shown inside a category; the selected category is filled with its colour, text dark or white for contrast, "All" black; unselected ones show a stripe of their colour; a category dropdown above the list below 1024px wide), global search across code/name/category/note, list view (default) and grid view toggle (remembered per browser), hover preview of the image in list view (follows the pointer), click the code/name (list) or image (grid) to open a large pop-out, "Show all current requests" toggle (request lines are shared by both accounts, so it shows every requested model, whoever asked). Search also matches request notes. Models in a category with colour options get a colour dropdown ("Any colour" plus every filament offered as a colour; out-of-stock ones are greyed out, marked "(out of stock)" and can't be chosen, but a line already using one keeps showing it) and "+ another colour" for another line in a different colour. Size and colour are locked while some are printing. Rows show code, name, scale, availability, NEW badge, and (Phase 2) quantity, urgency and note controls that autosave with a small "Saved ✓", plus "N requested · M printing". From 1280px wide each list row is on one line (Note is the widest control; "Saved ✓" shows inside the Note box, other messages on a line underneath); narrower, the controls sit under the name.
- `/notepad`: handwritten-style font sitting straight on the plain white page (no card, paper or ruled lines), bullet per line, Enter makes a new line. Admin sees a tick box per line; ticked lines are struck through.

Admin only:
- `/admin/queue`: all request lines sorted by the queue rule, with "N requested · M printing". Tick lines, set how many go on this plate (default = what's left to print), add catalogue models (search) or free-text items, choose printer, see my cost and charge live, "Start print". Colour items show their colour stripe and name; on a filament printer, if every coloured item on the plate is the same colour, that filament is pre-selected (still changeable). Shows "N unticked notepad notes" at the top, linking to /notepad.
- `/admin/jobs` ("Jobs" in the header): "Printing now" (Complete with succeeded per item, or "All succeeded" / "All failed", which apply straight away; Edit details, Cancel), and "History" of completed and cancelled jobs, newest first (latest 200, with "Showing latest 200 of N" when there are more), with date, printer, items, succeeded/planned, my cost and charge. Open a history row to edit details, edit the result or revert. Any job (printing, completed or cancelled) can be deleted for good, after an in-page confirmation.
- `/admin/models` also shows each model's printed total.
- `/admin/models`: one searchable list; Edit opens the row inline (code, name, category, default size, availability) with a panel below for extra sizes, admin notes, NEW badge, image (upload/replace/remove) and delete. "+ Add model" opens a blank row. Delete warns how many open requests go with it; print history (Phase 6) will block it.
- `/admin/upload`: bulk image upload; match file name to `code_key`, create new models for unknown codes (choose a category for the batch), ask before replacing an existing image.
- `/admin/categories`: each category with its model count; drag-and-drop order (⠿ handle, plus ↑ ↓ buttons), saved immediately; rename, colour (picker), colour options, add; delete only when it has no models; "Set scale…" opens an in-page panel to set the default scale in bulk (shows how many models will change before confirming).
- `/admin/materials`: each material shows its colour stripe; adding or editing uses a native colour picker for `colour_hex`.
- `/admin/materials`, `/admin/printers` (each printer has a colour picker)
- `/admin/money` ("Money" in the header): the running total at the top, large, red if negative, green if positive, grey at zero. A "Starting balance" section (opening balance and first month shown, saved to settings). A table, newest month first: Month ("Oct 2026"), Print jobs ("12 plates · 47 items"), Charge, Payments, Costs, Difference. Payments and Costs are £ boxes that autosave ("Saved ✓"), with "Materials from jobs: £x.xx" in grey under Costs. Difference is coloured like the total. Below: all-time stats (plates and items per printer, total charge, top 10 most printed models).
- `/admin/settings`

## 7. Phases

1. **Foundations:** project setup, auth, profiles/roles, categories + models, catalogue import from CSV, read-only catalogue list view with category tabs and search. Deploy.
2. **Requests:** request_lines, inline quantity/urgency/note with autosave, scale choice, "Show all current requests" toggle, admin queue (read-only, plus admin can edit quantities).
3. **Notepad + model admin:** notepad page; admin add/edit/retire models, scales, NEW badge.
4. **Images:** storage bucket, bulk upload, grid view, hover preview.
5. **Materials and printers:** materials index, printers, settings. These come first because the job form needs them.
6. **Print jobs**, in two parts:
   - **6a:** start print from the queue with the printer-specific form, complete/partial/cancel/edit/revert, costs and charges, printing status on the catalogue, printed totals, NEW badge auto-off.
   - **6b:** colour choice for categories with colour options such as BASES (`colour_material_id` on request lines and job items), `/admin/categories` page, unticked notepad count on the queue.
7. **Money and stats:** monthly payments and costs, charges from completed jobs, difference and running total with an opening balance, print stats.
8. **Future-proofing and polish:** no silent row limits, compact rows, alternating and gold NEW rows, "Not ready", category and printer colours, one-click job results, bulk default scale, installable home-screen app. (Custom domain still to do.)

## 8. Catalogue import (Phase 1)

Source: `data/CATALOGUE.csv` (any capitalisation is found), exported from the CATALOGUE tab. Columns in order:
`(flag)`, `ITEM CODE`, `ITEM`, `CATEGORY`, `Note`, `Requests`, `URGENCY`

- Header row is the first row. The first column has no heading.
- flag = `*` → `show_new_badge = true`
- Note = `NOT READY` → `availability = coming_soon`; otherwise `available`
- Ignore Note's other text, Requests and URGENCY (requests start fresh)
- Trim whitespace on all values. Create categories from distinct CATEGORY values.
- Skip empty rows. Report duplicates or blank names and do not import them.
- Upsert by `code`, so re-running is safe.
- Run with the service role key from `.env.local`, never from the browser. Support a `--dry-run` flag that prints what would happen.
- **Initial setup only.** Once models are edited in the app, don't re-run it: it would overwrite names, categories, availability and NEW badges from the CSV.
