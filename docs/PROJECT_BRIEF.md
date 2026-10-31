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
- **Desktop/laptop first**, but layouts must still work on a phone.
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
- `id`, `name` (unique, e.g. "STAR WARS"), `sort_order` (int, default by name), `has_colour_options` (bool, default false; true for BASES)

### models
- `id`, `code` (unique, text, e.g. "SW001", "Base001", "WW2 001", "DN020a", "DN005a+b")
- `name`, `category_id`
- `default_scale` (text, nullable, e.g. "70mm"), `other_scales` (text[], default empty). Usual scales: 28mm, 54mm, 60mm, 70mm, 80mm, 100mm, but any text is allowed.
- `availability`: `available` | `coming_soon` | `hidden`
  - coming_soon = greyed out and labelled "Model Not Ready", but **can still be requested**
  - hidden = retired; not shown in the catalogue, kept for history
- `image_path` (nullable; some models have no image). Images are shrunk in the browser to 1000px on white (WebP, JPEG fallback) before upload.
- `show_new_badge` (bool). The NEW badge shows when this is true AND the model's successful printed total is < 4.
- `admin_notes` (admin-only), `created_at`, `updated_at`
- `code_key` (generated: lower(code) with spaces removed), used to match image file names

**Category is chosen per model. It is NOT derived from the code prefix** (MISC codes span several categories, SF spans DR WHO and SCI-FI, etc.).

### request_lines (Phase 2)
One row per model + option combination that Dad currently wants.
- `id`, `model_id`, `scale` (nullable text; null = model default), `colour_material_id` (nullable, FK materials; Phase 6, BASES only)
- `quantity` (int > 0: outstanding amount still wanted), `urgency` (nullable: `ASAP` | `URGENT` | `PRIORITY`), `note` (text)
- `created_at`, `updated_at`
- Unique on (model_id, scale, colour_material_id), treating nulls as equal. (Currently unique on (model_id, scale); Phase 6 adds `colour_material_id` and widens the rule.)
- Deleting a model deletes its request lines (cascade).
- Setting the quantity to 0/blank deletes the row (the item goes back to blank).
- Nobody can set the quantity below the amount currently printing for that line, delete a line that is printing, or change its size. A database trigger enforces this (`request_lines_printing_guard`), and the UI shows the same message.

### printers (Phase 5)
- `id`, `name` ("Saturn 4 Ultra", "Centauri Carbon"), `type` (`resin` | `fdm`), `active`

### materials (Phase 5)
The material stock index. It replaces the price table in "Centauri Prints" (cols I–M) and the "Resins" tab.
- `id`, `type` (`resin` | `fdm`), `name` (e.g. "PLA Black", "ABS 2.0 Grey"), `colour`
- `unit` (`ml` | `g`), `pack_size` (e.g. 1000), `pack_cost` (£)
- `cost_per_unit` (derived: pack_cost / pack_size), `charge_per_unit` (£ per g for FDM charges; default 2 × cost_per_unit, editable)
- `charge_overridden` (bool): false = a trigger keeps `charge_per_unit` at 2 × cost; true = set by hand and left alone
- `in_stock` (bool), `offer_as_colour` (bool: shown as a colour choice for categories with colour options)
- `active` (bool): false = retired, kept for history, hidden from new print jobs
- Printers, materials and settings are admin-only. Phase 6 will expose just the BASES colour names to the requester through a separate view.
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
- `id`, `job_id`, `model_id` (nullable, no cascade: print history blocks deleting a model), `free_text_name` (for things not in the catalogue), `request_line_id` (nullable; set to null if the line is deleted), `scale`, `colour_material_id` (Phase 6b, not yet added)
- `from_request` (bool: the item came from a request line, even after that line is gone), `request_urgency` + `request_note` (copies taken from the line, so a deleted line can be recreated the same way)
- `quantity_planned`, `quantity_succeeded` (null until completed), `quantity_applied_to_request` (how much was actually taken off the request line, so edits and reverts are exact)

### notepad_lines (Phase 3)
- `id`, `text`, `created_by`, `created_at`, `done` (bool), `done_at`, `position`

### settings (Phase 5)
- Key/value. `resin_charge_divisor` = 15.

### purchases and payments (Phase 7)
- `purchases`: date, description, amount (material/equipment costs; replaces the "Invoices" tab)
- `payments`: date, amount, type, note (money received from Dad)

## 5. Core rules

**Sorting**
- Catalogue: category name A→Z, then code in natural order (use `Intl.Collator('en', { numeric: true, sensitivity: 'base' })`).
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

**RPC functions** (`0008_print_jobs.sql`, admin only, one transaction each): `start_print_job`, `complete_print_job`, `update_completed_result`, `revert_print_job`, `cancel_print_job`, `update_print_job_details`. They raise plain-English messages that the app shows as they are.

**Cancelling a printing job:** nothing is counted.

**Printed total per model** = sum of `quantity_succeeded` on items in completed jobs.

**NEW badge:** shown if `show_new_badge` is true and printed total < 4. It turns off automatically after 4 successful prints. Imported models start with it off unless flagged.

**Charges (Phase 6)**
- Resin job: `charge` = est_weight_g ÷ resin_charge_divisor (15). `my_cost` = the `est_cost` typed in from the slicer.
- FDM job: `charge` = est_weight_g × material charge_per_unit. `my_cost` = est_weight_g × material cost_per_unit.
- Charges are always editable (`charge_overridden`). Cancelled jobs, and jobs where nothing succeeded, are not charged by default. A partly successful job is charged in full.

## 6. Pages

Everyone:
- `/login`
- `/catalogue`: category tabs (All + each category), global search across code/name/category/note, list view (default) and grid view toggle (remembered per browser), hover preview of the image in list view (follows the pointer), click the code/name (list) or image (grid) to open a large pop-out, "Show all current requests" toggle (request lines are shared by both accounts, so it shows every requested model, whoever asked). Search also matches request notes. Rows show code, name, scale, availability, NEW badge, and (Phase 2) quantity, urgency and note controls that autosave with a small "Saved ✓", plus "N requested · M printing".
- `/notepad`: handwritten-style font, bullet per line, Enter makes a new line. Admin sees a tick box per line; ticked lines are struck through.

Admin only:
- `/admin/queue`: all request lines sorted by the queue rule, with "N requested · M printing". Tick lines, set how many go on this plate (default = what's left to print), add catalogue models (search) or free-text items, choose printer, see my cost and charge live, "Start print". Shows the unticked notepad count (Phase 6b).
- `/admin/jobs` ("Jobs" in the header): "Printing now" (Complete with succeeded per item and All succeeded / All failed shortcuts, Edit details, Cancel), and "History" of completed and cancelled jobs, newest first (latest 200), with date, printer, items, succeeded/planned, my cost and charge. Open a history row to edit details, edit the result or revert.
- `/admin/models` also shows each model's printed total.
- `/admin/models`: one searchable list; Edit opens the row inline (code, name, category, default size, availability) with a panel below for extra sizes, admin notes, NEW badge, image (upload/replace/remove) and delete. "+ Add model" opens a blank row. Delete warns how many open requests go with it; print history (Phase 6) will block it.
- `/admin/upload`: bulk image upload; match file name to `code_key`, create new models for unknown codes (choose a category for the batch), ask before replacing an existing image.
- `/admin/categories`, `/admin/materials`, `/admin/printers`
- `/admin/money`: month-by-month costs (purchases), charges for prints, payments received, difference; plus print stats.
- `/admin/settings`

## 7. Phases

1. **Foundations:** project setup, auth, profiles/roles, categories + models, catalogue import from CSV, read-only catalogue list view with category tabs and search. Deploy.
2. **Requests:** request_lines, inline quantity/urgency/note with autosave, scale choice, "Show all current requests" toggle, admin queue (read-only, plus admin can edit quantities).
3. **Notepad + model admin:** notepad page; admin add/edit/retire models, scales, NEW badge.
4. **Images:** storage bucket, bulk upload, grid view, hover preview.
5. **Materials and printers:** materials index, printers, settings. These come first because the job form needs them.
6. **Print jobs**, in two parts:
   - **6a:** start print from the queue with the printer-specific form, complete/partial/cancel/edit/revert, costs and charges, printing status on the catalogue, printed totals, NEW badge auto-off.
   - **6b:** colour choice for BASES (`colour_material_id` on request lines and job items), `/admin/categories` page, unticked notepad count on the queue.
7. **Money and stats:** purchases, payments, monthly cost vs revenue, print stats.
8. **Polish:** installable home-screen app, custom domain, small UX fixes.

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
