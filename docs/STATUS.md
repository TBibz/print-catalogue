# Status report

_Written 2026-11-09 from the code at commit `b0e1d75` ("Repeat job: migration renumbered to 0023, app tooltip"). Everything here is read from the code, migrations and config, not from what the brief says should exist. Where something can't be confirmed from the repo, it says so._

**What this report could not check:** whether any migration has actually been run in Supabase, whether the Vercel project exists and deploys, and how anything behaves in a browser while logged in. None of that can be seen from the repository.

---

## 1. Overview

### Stack (from `package.json`; installed versions in brackets)

| Package | Declared | Installed |
|---|---|---|
| next | 16.4.3 | 16.4.3 |
| react / react-dom | 19.3.0 | 19.3.0 |
| @supabase/ssr | ^0.12.7 | 0.12.7 |
| @supabase/supabase-js | ^2.118.0 | 2.118.0 |
| @react-pdf/renderer | ^4.9.0 | 4.9.0 |
| nodemailer | ^10.3.1 | 10.3.1 |
| server-only | ^0.0.1 | — |
| tailwindcss (+ @tailwindcss/turbopack) | ^4 | 4.3.3 |
| typescript | ^5 | 5.9.3 |
| eslint (+ eslint-config-next 16.4.3) | ^9 | 9.39.5 |
| tsx, csv-parse, dotenv | dev only | used by the import script |

- Scripts: `dev` (`next dev -p 4000`), `build`, `start`, `lint` (`eslint`), `import:catalogue` (`tsx scripts/import-catalogue.ts`).
- `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, Tailwind loaded through a Turbopack CSS rule, and two redirects: `/` → `/catalogue` (temporary) and `/admin/money` → `/admin/reports?tab=money` (permanent).
- `proxy.ts` (Next 16's middleware) runs on everything except `_next/static`, `_next/image`, `favicon.ico` and static files (svg, png, jpg, jpeg, gif, webp, ico, webmanifest).
- PWA: `public/manifest.webmanifest` plus `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.

### Deployment

- Vercel, as far as the repo shows. `vercel.json` pins two functions to London (`lhr1`): `app/**/invoices/?id?/page.tsx` (the invoice page, whose Send server action emails) and `app/**/admin/settings/page.tsx` (Send test email). Everything else uses the project's default region.
- There is no `.vercel/` folder and nothing else in the repo ties it to a Vercel project, so **I can't confirm it is deployed** or which domain it uses. PROGRESS.md also still has "deploy to Vercel: please confirm" against Phase 1.
- Database changes are run by hand in the Supabase SQL Editor. Nothing in the repo says which migrations have been run (every "Run?" box in PROGRESS.md is unticked).

### Environment variables (names only)

| Name | Used in | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/{client,server,proxy}.ts`, import script | browser-safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/{client,server,proxy}.ts` | browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/import-catalogue.ts` only | secret, local only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | `lib/email.ts` | secret, server only; without all five, Send says "Email not set up yet" |

All of these are listed in `.env.local.example`. No other `process.env` reads exist in `app/`, `lib/`, `components/`, `scripts/`, `proxy.ts` or `next.config.ts`.

---

## 2. Phase-by-phase status

Key: **Done** = the code for it exists and is wired up. "Done" here does not mean tested against the real database. PROGRESS.md says most screens were only checked with sample data on temporary preview pages, because Claude couldn't log in.

### Phase 1: Foundations

| Feature | Status | Main files |
|---|---|---|
| Next.js 16 app, Tailwind | Done | `app/layout.tsx`, `app/globals.css`, `next.config.ts` |
| Email + password login, sign out | Done | `app/login/*`, `app/actions/auth.ts` |
| Proxy: session required everywhere except `/login`; `/admin/*` requires the admin role | Done | `proxy.ts`, `lib/supabase/proxy.ts` |
| `profiles` + new-user trigger + `is_admin()` | Done | `0001_init.sql` |
| `categories`, `models` (generated `code_key`) | Done | `0001_init.sql` (+ later columns) |
| Requester reads models without `admin_notes` | Done, differently: `catalogue_models()` is a function (`0016`, `0018`), not the original view | `lib/data.ts` `loadModels()` |
| CSV import (`--dry-run`, upsert by code, service key) | Done | `scripts/import-catalogue.ts`, `data/CATALOGUE.csv` |
| Read-only catalogue with category navigation and search | Done (now a sidebar, not tabs) | `app/(app)/catalogue/*`, `components/category-nav.tsx` |
| Deploy | **Can't confirm** from the repo (see section 1) | `vercel.json` |

### Phase 2: Requests

| Feature | Status | Main files |
|---|---|---|
| `request_lines` table, unique per model + size (+ colour since 0010) | Done | `0002`, `0004`, `0010`, `0017`, `0018` |
| Inline quantity / urgency / note, autosaving with "Saved ✓" | Done | `components/request-fields.tsx`, `lib/use-line-autosave.ts`, `app/actions/requests.ts` |
| Size choice, "+" for another size | Done | `components/request-fields.tsx`, `catalogue-view.tsx` |
| "Show all current requests" toggle | Done | `catalogue-view.tsx` |
| Admin queue with editable lines | Done (later grew into the print-start screen) | `app/(app)/admin/queue/*` |

### Phase 3: Notepad + model admin

| Feature | Status | Main files |
|---|---|---|
| `/notepad`: handwriting font, ruled lines, Enter/Backspace, autosave, admin ticks | Done | `app/(app)/notepad/*`, `app/actions/notepad.ts`, `0003` |
| One-line display, shortened links, click-to-edit at the cursor | Done | `notepad-view.tsx`, `lib/links.ts` |
| Delete with "Note deleted · Undo" (`restore_notepad_line`) | Done | `notepad-view.tsx`, `0022` |
| `/admin/models`: inline edit, extra sizes, admin notes, NEW badge, availability, delete with warning | Done | `app/(app)/admin/models/*`, `app/actions/models.ts`, `0004` |

### Phase 4: Images

| Feature | Status | Main files |
|---|---|---|
| `model-images` public bucket, admin-only writes | Done | `0005`, `0016` |
| Shrink in the browser (1000px, WebP with JPEG fallback) | Done | `lib/upload-image.ts`, `lib/images.ts` |
| Single upload / replace / remove | Done | `model-editor.tsx`, `app/actions/images.ts` |
| Bulk upload matched on `code_key`, new models for unknown codes, ask before replacing | Done | `app/(app)/admin/upload/*` |
| Grid view (remembered per browser), hover preview, click-to-enlarge | Done | `catalogue-view.tsx`, `components/image-preview.tsx` |

### Phase 5: Materials and printers

| Feature | Status | Main files |
|---|---|---|
| `printers` (2 seeded), `materials` (generated cost per unit, 2 × cost charge trigger), `settings` | Done | `0006`, `0007`, `0011`, `0014` |
| `/admin/materials` (colour picker, stripe, in stock, offer as colour, retire) | Done | `app/(app)/admin/materials/*`, `app/actions/materials.ts` |
| `/admin/printers` (type, active, colour picker, delete) | Done | `app/(app)/admin/printers/*` |
| `/admin/settings` (resin divisor, company details, money, email, colours) | Done | `app/(app)/admin/settings/*` |
| Individual spools/bottles and remaining amount ("Later" in the brief) | Not started | — |

### Phase 6a: Print jobs

| Feature | Status | Main files |
|---|---|---|
| `print_jobs`, `print_job_items`, admin-only RLS | Done | `0008` |
| Start print from the queue with a printer-specific form | Done | `start-print-panel.tsx`, `components/job-fields.tsx`, `lib/jobs.ts` |
| Complete (per item, All succeeded / All failed), cancel, edit details, edit result, revert, delete | Done | `jobs-view.tsx`, `app/actions/jobs.ts`, `0008`, `0009` |
| Costs and charges (resin ÷ divisor, FDM × material rate, overrides) | Done (calculated in the DB; repeated in the browser for the live preview) | `pj_refresh_money`, `calculateMoney()` |
| Printing status on the catalogue ("N requested · M printing") | Done | `request_line_printing()`, `lib/data.ts` `addPrinting()` |
| Printed totals and NEW badge auto-off at 4 | Done | `model_print_totals()`, `lib/catalogue.ts` `showNewBadge()` |
| Request guard (can't go below printing, delete a printing line, or change its size/colour) | Done | `request_lines_printing_guard` (0008, 0010) |
| **Extra, not in the phase list:** Repeat job, and search on the Jobs page | Done (needs `0023` run) | `0023_repeat_print_job.sql`, `jobs-view.tsx` |

### Phase 6b: Colours, categories page, notepad count

| Feature | Status | Main files |
|---|---|---|
| `colour_material_id` on request lines and job items; colour check trigger | Done | `0010` |
| Colour dropdown with stripes, out-of-stock handling, "+" for another colour | Done | `request-fields.tsx`, `components/colour-label.tsx` |
| Colour carried onto plates and back when lines are recreated | Done | `start_print_job`, `pj_put_back` (0010) |
| Filament pre-selected when every coloured item on the plate shares one colour | Done | `start-print-panel.tsx` |
| Choosing a colour for an *unrequested* catalogue model on a plate | **Partial**: the database accepts `colour_material_id` on model items (0010), and Repeat job uses it, but the Start print panel has no colour picker and `PlateItem` (`app/actions/jobs.ts`) has no colour field | `start-print-panel.tsx`, `app/actions/jobs.ts` |
| `/admin/categories`: drag-and-drop order, rename, colour, colour options, add, delete when empty, counts | Done | `app/(app)/admin/categories/*`, `0011`, `0013`, `0014` |
| Unticked notepad count on the queue | Done | `queue/page.tsx`, `loadUntickedNoteCount()` |

### Phase 7: Money and stats

| Feature | Status | Main files |
|---|---|---|
| `monthly_money`, `opening_balance`, `money_start_month`, `money_by_month()` | Done | `0012` |
| Reports → Money tab: running total, autosaving Payments / Costs, coloured difference | Done | `app/(app)/admin/reports/money-view.tsx`, `app/actions/money.ts` |
| Opening balance and start month edited in Settings → Money | Done | `app/(app)/admin/settings/money-settings.tsx` |
| Print stats | Done, moved to Reports → Printing (`print_stats_by_printer()` is still in the DB but nothing calls it) | `printing-view.tsx`, `0022` |

### Phase 8: Future-proofing and polish

| Feature | Status | Main files |
|---|---|---|
| No silent row limits (`fetchAll`, DB counts, "Showing latest 200 of N") | Done | `lib/fetch-all.ts`, `lib/data.ts` |
| Compact rows, alternating and gold NEW rows, "Not ready" | Done | `lib/row-highlights.ts`, `lib/theme.ts` |
| Category and printer colours | Done | `0014` |
| One-click job results | Done | `jobs-view.tsx` `ResultForm` |
| Bulk default scale | Done | `0015`, `categories-list.tsx` |
| Installable home-screen app | Done | `public/manifest.webmanifest`, icons |
| Custom domain | **Not started / can't tell** (done in Vercel and a registrar, not in code) | — |
| Extras since: customisable colours, Setup menu, auto-hiding header, sticky headings, own tooltips | Done | `components/*`, `0021` |

### Phase 9: Invoices (in the brief, outside the 1–8 asked about, but built)

| Feature | Status | Main files |
|---|---|---|
| `customers`, `invoices`, `invoice_lines`, counter, `invoice_totals` | Done | `0019`, `0020` |
| Builder, drafts, finalise with INV numbers, reopen, duplicate | Done | `app/(app)/invoices/*`, `app/actions/invoices.ts` |
| A4 PDF with DRAFT watermark | Done | `lib/invoice-pdf*.tsx`, `lib/invoice-layout.ts`, `/invoices/[id]/pdf` |
| Email over SMTP, test email | Done in code; PROGRESS says **not yet tried against a real mail server** | `lib/email.ts`, `app/actions/email.ts` |
| Mark as sent by hand / undo | Done | `0020`, `components/mark-sent-panel.tsx` |
| Reordering lines on a draft | Not built (noted as a loose end) | — |

---

## 3. Database

### Migration files

| # | File | Summary |
|---|---|---|
| 0001 | `0001_init.sql` | `profiles` + `handle_new_user` trigger, `is_admin()`, `set_updated_at()`, `categories`, `models` (generated `code_key`), `catalogue_models` view, RLS, anon access removed |
| 0002 | `0002_requests.sql` | `request_lines` (unique model + scale), open RLS for logged-in users |
| 0003 | `0003_notepad.sql` | `notepad_lines` + guard trigger (only the admin ticks; the author can't change) |
| 0004 | `0004_model_delete.sql` | Request lines cascade when their model is deleted |
| 0005 | `0005_images.sql` | `model-images` storage bucket (public, 5 MB, webp/jpeg/png) + admin-only storage policies |
| 0006 | `0006_materials_printers.sql` | `printers` (2 seeded), `materials` (+ default-charge trigger), `settings` (`resin_charge_divisor` = 15), all admin-only |
| 0007 | `0007_seed_materials.sql` | Seeds 9 PLA filaments and 3 resins |
| 0008 | `0008_print_jobs.sql` | `print_jobs`, `print_job_items`, printing views, request printing guard, helpers and 6 job RPCs |
| 0009 | `0009_delete_print_job.sql` | `delete_print_job()` (reverts a completed job first) |
| 0010 | `0010_colours.sql` | `colour_material_id` on lines and items, unique model + scale + colour, `colour_options` view, colour check trigger, colour carried by `start_print_job` / `pj_put_back`, BASES gets colours |
| 0011 | `0011_colour_hex_category_order.sql` | `materials.colour_hex` (back-filled from names), `colour_options` with hex, category positions 1..n, `reorder_categories()` |
| 0012 | `0012_money.sql` | `monthly_money`, `opening_balance` / `money_start_month` settings, `uk_month()`, `money_by_month()`, `print_stats_by_printer()` |
| 0013 | `0013_category_counts.sql` | `category_model_counts` view |
| 0014 | `0014_category_printer_colours.sql` | `colour_hex` on `categories` and `printers` |
| 0015 | `0015_bulk_default_scale.sql` | `category_scale_changes()` helper + `set_category_default_scale()` |
| 0016 | `0016_security_advisor.sql` | The five definer views become `security definer` functions (views dropped); `rls_auto_enable()` locked down; policies wrapped in `(select …)`; categories write policy split |
| 0017 | `0017_request_lines_policies.sql` | Request line writes need an admin/requester profile; admin RPCs re-revoked from public/anon |
| 0018 | `0018_urgency_prices.sql` | URGENT → ASAP and removed; `models.price`; `catalogue_models()` recreated with price; `set_models_price()`, `set_category_price()` |
| 0019 | `0019_invoices.sql` | `is_app_user()`, `customers`, `invoices`, `invoice_counter`, `invoice_lines`, guards, `invoice_totals` view, invoice RPCs, company settings, settings policies split |
| 0020 | `0020_mark_invoice_sent.sql` | `invoices.sent_method`, `mark_invoice_sent()` records `email`, `mark_invoice_sent_manually()`, `unmark_invoice_sent()` |
| 0021 | `0021_theme_colours.sql` | 11 `colour_` settings, settings readable for `colour_` keys, `model_printing()` |
| 0022 | `0022_reports_notepad_undo.sql` | `report_jobs()`, `print_report*()` functions, notepad guard lets restores through, `restore_notepad_line()`, `colour_head_reports` |
| 0023 | `0023_repeat_print_job.sql` | `repeat_print_job()`: a new printing job copying an old one, linking items to open requests where possible |

**Next migration number: `0024`.**

Also in `supabase/snippets/` (not migrations): `make-admin.sql` and `reset-test-data.sql` (truncates test data and resets invoice numbering).

### Tables (as the migrations leave them)

All tables have RLS enabled. `anon` and `public` have all privileges revoked. `service_role` has all privileges.

**profiles**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK, FK `auth.users(id)` on delete cascade |
| display_name | text | nullable |
| role | text | not null, default `'requester'`, check in (`admin`, `requester`) |
| created_at | timestamptz | not null, default now() |

**categories**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| name | text | not null, unique |
| sort_order | int | not null, default 0 (set to 1..n by 0011; new ones are placed last by the app) |
| has_colour_options | boolean | not null, default false (BASES set true by 0010) |
| colour_hex | text | not null, default `'#9ca3af'`, check `^#[0-9a-f]{6}$` |

**models**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| code | text | not null, unique |
| name | text | not null |
| category_id | uuid | not null, FK categories (no cascade); index |
| default_scale | text | nullable |
| other_scales | text[] | not null, default `'{}'` |
| availability | text | not null, default `'available'`, check in (`available`, `coming_soon`, `hidden`) |
| image_path | text | nullable |
| show_new_badge | boolean | not null, default false |
| admin_notes | text | nullable |
| price | numeric(10,2) | nullable, check null or ≥ 0 |
| created_at / updated_at | timestamptz | not null, default now(); `models_set_updated_at` trigger |
| code_key | text | generated `lower(replace(code,' ',''))` stored; unique index |

**request_lines**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK |
| model_id | uuid | not null, FK models **on delete cascade** |
| scale | text | nullable (null = model default) |
| colour_material_id | uuid | nullable, FK materials (no on-delete action); index |
| quantity | int | not null, > 0 |
| urgency | text | nullable, check in (`ASAP`, `PRIORITY`) |
| note | text | not null, default `''` |
| created_at / updated_at | timestamptz | not null, default now() |
| | | unique nulls not distinct (model_id, scale, colour_material_id) |

Triggers: `request_lines_set_updated_at`, `request_lines_printing_guard` (before update/delete), `request_lines_colour_check` (before insert/update).

**notepad_lines**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK |
| text | text | not null, default `''` |
| created_by | uuid | not null, default auth.uid(), FK profiles on delete cascade |
| created_at | timestamptz | not null, default now() |
| done | boolean | not null, default false |
| done_at | timestamptz | nullable (kept in step by the trigger) |
| position | double precision | not null, default 0; index (position, created_at) |

Trigger: `notepad_lines_guard` (before insert/update).

**printers**: id uuid PK; name text not null unique; type text not null check (`resin`, `fdm`); active boolean not null default true; created_at; colour_hex text not null default `'#9ca3af'` (hex check). Seeded: Saturn 4 Ultra (resin), Centauri Carbon (fdm).

**materials**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK |
| type | text | not null, check (`resin`, `fdm`) |
| name | text | not null, unique |
| colour | text | not null, default `''` |
| colour_hex | text | not null, default `'#9ca3af'`, hex check |
| unit | text | not null, check (`ml`, `g`); constraint: resin↔ml, fdm↔g |
| pack_size | numeric(10,2) | not null, > 0 |
| pack_cost | numeric(10,2) | not null, ≥ 0 |
| cost_per_unit | numeric(12,6) | generated `pack_cost / pack_size` |
| charge_per_unit | numeric(12,6) | not null, default 0, ≥ 0; set to 2 × cost by trigger unless overridden |
| charge_overridden | boolean | not null, default false |
| in_stock / offer_as_colour / active | boolean | defaults true / false / true |
| created_at / updated_at | timestamptz | `materials_set_updated_at` trigger |

Triggers: `materials_set_updated_at`, `materials_default_charge`.

**settings**: key text PK; value text not null; updated_at (trigger). Seeded keys: `resin_charge_divisor` (15), `opening_balance` (0), `money_start_month` (first completed job's month, or the current month), `company_name`, `company_address_1..3`, `company_phone`, `company_email`, `colour_row_printing`, `colour_row_new`, `colour_row_requested`, `colour_row_alt`, `colour_head_catalogue`, `colour_head_queue`, `colour_head_models`, `colour_head_builder`, `colour_head_reports`, `colour_invoice`, `colour_urgency_asap`, `colour_urgency_priority`. (`colour_nav_highlight` is not seeded: the app writes it the first time it is saved.)

**print_jobs**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK |
| printer_id | uuid | not null, FK printers |
| title | text | not null, default `''` |
| status | text | not null, default `'printing'`, check (`printing`, `completed`, `cancelled`); index |
| started_at | timestamptz | not null, default now() |
| completed_at / cancelled_at | timestamptz | nullable |
| notes | text | not null, default `''` |
| est_material_ml | numeric(10,2) | > 0 |
| est_weight_g | numeric(10,2) | > 0 |
| print_hours | int | ≥ 0 |
| print_minutes | int | 0–59 |
| est_cost | numeric(10,2) | ≥ 0 |
| layer_height_mm | numeric(6,3) | > 0 |
| material_id | uuid | FK materials |
| my_cost | numeric(10,2) | not null, default 0, ≥ 0 |
| my_cost_overridden | boolean | not null, default false |
| charge | numeric(10,2) | not null, default 0, ≥ 0 |
| charge_overridden | boolean | not null, default false |
| created_by | uuid | default auth.uid(), FK **auth.users** on delete set null |
| created_at / updated_at | timestamptz | `print_jobs_set_updated_at` trigger |

There are **no `source` or `chargeable` columns** (see section 7).

**print_job_items**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK |
| job_id | uuid | not null, FK print_jobs on delete cascade; index |
| model_id | uuid | nullable, FK models (no cascade, so it blocks deleting a model); index |
| free_text_name | text | nullable |
| request_line_id | uuid | nullable, FK request_lines on delete set null; index |
| from_request | boolean | not null, default false |
| scale | text | nullable |
| colour_material_id | uuid | nullable, FK materials; index |
| request_urgency | text | check in (`ASAP`, `PRIORITY`) |
| request_note | text | not null, default `''` |
| quantity_planned | int | not null, > 0 |
| quantity_succeeded | int | nullable, 0 ≤ x ≤ planned |
| quantity_applied_to_request | int | not null, default 0, ≥ 0 |
| created_at | timestamptz | default now() |
| | | check: `model_id` set or a non-blank `free_text_name`; check: `from_request` ⇒ `model_id` set |

**monthly_money**: month date PK (check: first day of a month); payments numeric(12,2) not null default 0; costs numeric(12,2) not null default 0; note text not null default `''`; updated_at (trigger).

**customers**: id uuid PK; name text not null default `''` (≤ 200); email text not null default `''` (≤ 320); is_default boolean not null default false (partial unique index: at most one default); created_at.

**invoices**
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid | PK |
| number | text | unique, null until finalised |
| status | text | not null, default `'draft'`, check (`draft`, `finalised`) |
| invoice_date | date | not null, default today (Europe/London) |
| customer_id | uuid | FK customers on delete set null |
| created_by | uuid | default auth.uid(), FK profiles on delete set null |
| finalised_at, sent_at | timestamptz | nullable |
| sent_to | text | nullable |
| sent_method | text | check (`email`, `manual`); check `(sent_at is null) = (sent_method is null)` |
| created_at / updated_at | timestamptz | index (created_at desc, id); `invoices_set_updated_at` trigger |

Trigger `invoices_guard` (before update/delete): finalised invoices can't be deleted, nor can drafts that already have a number; a finalised invoice's date and customer can't change.

**invoice_counter**: id boolean PK default true, check (id) (a single row); last_number int not null default 0. No policies, so only definer functions and `service_role` touch it.

**invoice_lines**: id uuid PK; invoice_id uuid not null FK invoices on delete cascade; position int not null default 0; model_id uuid FK models on delete set null; code text (≤ 50); description text not null (1–500); quantity int not null (1–100000); unit_price numeric(10,2) (0–100000, null = no price yet); line_total numeric(12,2) generated `quantity * unit_price`; created_at. Index (invoice_id, position, id). Trigger `invoice_lines_guard`: no changes once the invoice is finalised (except the FK clearing `model_id` when a model is deleted); lines can't move between invoices.

### Views

- **`invoice_totals`** (security_invoker = true): per invoice: `line_count`, `items`, `total`, `unpriced_lines`. It is the **only view left**. `catalogue_models`, `request_line_printing`, `model_print_totals`, `category_model_counts` and `colour_options` were views until 0016, which turned them into functions and dropped the views.

### Functions / RPCs

"SD" = `security definer`, "INV" = `security invoker`. "App" = callable by `authenticated`; "internal" = execute revoked from `public`, `anon` and `authenticated`.

**Auth and helpers**
| Function | Kind | Who | What it does |
|---|---|---|---|
| `is_admin()` → bool | SD | App | true if the caller's profile role is admin |
| `is_app_user()` → bool | SD | App | true if the caller has an admin or requester profile |
| `uk_month(p_at timestamptz)` → date | immutable | App | first day of the Europe/London month |
| `rls_auto_enable()` | (Supabase's) | internal | execute revoked by 0016 |

**Requester-safe reads (SD, App)**
| Function | Returns |
|---|---|
| `catalogue_models()` | every model's columns except `admin_notes` (includes `price`) |
| `request_line_printing()` | (request_line_id, printing) for printing jobs |
| `model_print_totals()` | (model_id, printed_total) from completed jobs |
| `model_printing()` | (model_id, printing) on printing plates, requested or not |
| `category_model_counts()` | (category_id, total_models, visible_models) |
| `colour_options()` | (id, name, colour, colour_hex, available, in_stock): FDM materials offered as a colour and active, plus any colour a request line uses |

**Categories and models**
| Function | Kind | What it does |
|---|---|---|
| `reorder_categories(p_ids uuid[])` | INV (no admin check; RLS only lets the admin update categories) | sort_order = position in the array |
| `set_category_default_scale(p_category_id, p_scale, p_only_unset, p_add_scales text[] = '{}', p_dry_run = false)` → int | SD, admin check | sets the default scale (only where unset, or all) and adds extra scales; the dry run returns the count |
| `category_scale_changes(...)` | SD, internal | helper for the above |
| `set_models_price(p_model_ids uuid[], p_price numeric, p_only_unset bool, p_dry_run = false)` → int | SD, admin check | bulk price, rounded to pence; doesn't count models already at that price |
| `set_category_price(p_category_id, p_price, p_only_unset, p_dry_run = false)` → int | SD, admin check | the same for every model in a category |

**Print jobs** (SD, App, each starts with `pj_require_admin()`, each one transaction)
| Function | What it does |
|---|---|
| `start_print_job(p_printer_id uuid, p_details jsonb, p_items jsonb)` → uuid | Printer must be active; at least one item. Items: `{request_line_id, quantity}` (≤ line quantity − printing; copies model, scale, colour, urgency, note; `from_request = true`), `{model_id, scale, colour_material_id, quantity}` (unrequested), or `{free_text_name, quantity}`. Validates details for the printer type (`pj_set_details`), then works out the money (`pj_refresh_money`) |
| `complete_print_job(p_job_id, p_results jsonb)` | Job must be printing. Sets it completed first, then for each item: succeeded (missing = all), takes min(succeeded, line qty − other printing) off its line (deleting at 0), and stores `quantity_applied_to_request` |
| `update_completed_result(p_job_id, p_results)` | Completed jobs only. Fewer succeeded: puts the difference back (`pj_put_back`). More: takes extra off the line if it still wants some (only for `from_request` items) |
| `revert_print_job(p_job_id)` | Completed only. Puts back every applied amount, clears succeeded, status → printing |
| `cancel_print_job(p_job_id)` | Printing only → cancelled; charge becomes 0 unless overridden |
| `update_print_job_details(p_job_id, p_printer_id, p_details)` | Any status. Same validation; recalculates money that isn't overridden |
| `delete_print_job(p_job_id)` | Completed: puts back what it applied first. Then deletes the job (items cascade) |
| `repeat_print_job(p_job_id)` → uuid | New printing job copying printer, details, overrides and items. Model items link to the open line for the same model + scale + colour, up to what it still wants; the rest go on unrequested; free text is copied. Calls `start_print_job` |

Internal helpers: `pj_require_admin()`, `pj_num(jsonb, text)`, `pj_set_details(uuid, uuid, jsonb)` (resin needs ml, weight, print time and est. cost, with the layer defaulting to 0.05; FDM needs weight and a filament of the right type; limits title to 200 and notes to 2000 characters), `pj_refresh_money(uuid)` (resin: cost = est_cost, charge = weight ÷ divisor; FDM: weight × cost/charge per g; cancelled or nothing succeeded → charge 0; overridden values are kept), `pj_put_back(uuid, int)` (original line, else a matching line, else recreate with urgency and note, setting the `print_catalogue.restoring` flag so the colour check lets an out-of-stock colour through), `pj_take_off(uuid, int)`, `pj_succeeded(print_job_items, jsonb)`, `printing_for_line(uuid)`.

**Money and reports** (INV, App; RLS means only the admin gets rows)
| Function | What it does |
|---|---|
| `money_by_month()` | one row per month from `money_start_month` to now (UK), newest first: plates, items, charge, job_costs, payments, costs, difference = payments − (charge + costs) |
| `print_stats_by_printer()` | all-time per printer (**unused by the app**) |
| `report_jobs(p_from date, p_to date, p_printer uuid)` | completed jobs in the UK-date range: weight, cost, charge, models succeeded |
| `print_report(p_from, p_to, p_printer, p_group 'month'|'year')` | per period, newest first; with both dates and by month, empty months included |
| `print_report_totals(p_from, p_to, p_printer)` | one totals row |
| `print_report_by_printer(p_from, p_to, p_printer)` | plates, models, charge per printer |
| `print_report_top_models(p_from, p_to, p_printer, p_limit int)` | most printed models |

**Notepad**
| Function | What it does |
|---|---|
| `restore_notepad_line(p_id, p_text, p_position, p_created_by, p_created_at, p_done, p_done_at)` | SD, App. The admin, or the line's author, puts a deleted line back with the same id, author and tick; does nothing if it already exists |

**Invoices** (SD, App, each starts with `inv_require_user()`)
| Function | What it does |
|---|---|
| `create_invoice(p_lines jsonb)` → uuid | new draft for the default customer from `[{model_id, quantity}]`, copying code, name and price; retired models are skipped silently |
| `add_invoice_model_line(p_invoice_id, p_model_id, p_quantity int)` → uuid | appends a model line (any availability) |
| `finalise_invoice(p_invoice_id)` → text | needs ≥ 1 line and every line priced; takes the next INV-NNNN from the locked counter (or keeps the old number) |
| `reopen_invoice(p_invoice_id)` | finalised and not sent → draft |
| `duplicate_invoice(p_invoice_id)` → uuid | new draft with the same customer and lines |
| `mark_invoice_sent(p_invoice_id, p_to text)` | finalised → sent_at now, `sent_method = 'email'` |
| `mark_invoice_sent_manually(p_invoice_id, p_date date, p_to text)` | finalised, not yet sent, date not in the future → midday UK on that date, `manual` |
| `unmark_invoice_sent(p_invoice_id)` | manual marks only |
| `set_default_customer(p_customer_id)` | switches the single default (null clears it) |

**Trigger functions** (internal): `handle_new_user`, `set_updated_at`, `notepad_lines_guard`, `materials_default_charge`, `request_lines_printing_guard` (SD), `request_lines_colour_check` (SD), `invoices_guard`, `invoice_lines_guard`.

### Triggers

| Table | Trigger | When |
|---|---|---|
| auth.users | `on_auth_user_created` → `handle_new_user` | after insert |
| models, request_lines, materials, settings, print_jobs, monthly_money, invoices | `*_set_updated_at` | before update |
| notepad_lines | `notepad_lines_guard` | before insert/update |
| materials | `materials_default_charge` | before insert/update |
| request_lines | `request_lines_printing_guard` | before update/delete |
| request_lines | `request_lines_colour_check` | before insert/update |
| invoices | `invoices_guard` | before update/delete |
| invoice_lines | `invoice_lines_guard` | before insert/update/delete |

### RLS policies (all `to authenticated`)

| Table | Policies |
|---|---|
| profiles | select: own row or admin · update: admin · delete: admin (no insert policy; the trigger inserts) |
| categories | select: true · insert / update / delete: admin |
| models | all: admin |
| request_lines | select: true · insert / update / delete: caller has an admin or requester profile |
| notepad_lines | select: true · insert: `created_by = auth.uid()` · update / delete: own line or admin |
| printers, materials, print_jobs, print_job_items, monthly_money | all: admin |
| settings | select: key `company_%` or `colour_%`, or admin · insert / update / delete: admin |
| customers, invoices, invoice_lines | all: `is_app_user()` (plus column-level grants: the app may only write `invoice_date` and `customer_id` on invoices, and position, description, quantity and unit_price on lines; insert also allows `invoice_id`) |
| invoice_counter | RLS on, no policies, no grants to authenticated |
| storage.objects (`model-images`) | select / insert / update / delete: admin (public read needs no policy) |

### Storage buckets

- `model-images`: public, 5 MB file limit, `image/webp`, `image/jpeg`, `image/png`. Only the admin can write. Paths are random (model id + timestamp).

---

## 4. Pages and routes

Every page except `/login` needs a session (proxy). `/admin/*` is checked twice: the proxy redirects non-admins to `/catalogue`, and each admin page calls `requireAdmin()`.

| Route | Who | What it does |
|---|---|---|
| `/` | — | Redirects to `/catalogue` |
| `/login` | logged out (logged-in users are sent to `/catalogue`) | Email + password sign-in |
| `/catalogue` | both | Category sidebar with counts, search (code, name, category, note), list/grid toggle, hover preview and pop-out, NEW / Not ready, "Show all current requests", autosaving quantity / urgency / note / size / colour controls, "N requested · M printing", row highlights |
| `/notepad` | both | Ruled shared notepad; the admin ticks lines; delete + Undo; links |
| `/invoices` | both | Invoice list with status badges and filters (All / Drafts / Not sent / Sent), Open, Delete draft, Mark as sent…; Customers section |
| `/invoices/new` | both | Invoice builder from the catalogue (sidebar, search, tick + quantity, "Show ticked only", sticky total bar, Generate invoice) |
| `/invoices/[id]` | both | Draft: editable sheet (lines, add model / free-text line, date), Finalise, Download PDF, Delete. Finalised: Send…, Mark as sent…, Download PDF, Reopen, Duplicate. Runs in `lhr1` |
| `/admin/queue` | admin | Request lines sorted by urgency then code, editable, unticked-notes link, Start a print panel |
| `/admin/jobs` | admin | Printing now (Complete, Edit details, Repeat, Cancel, Delete) and History (latest 200 with "Showing latest 200 of N"; Edit details, Edit result, Revert, Repeat icon, Delete); search |
| `/admin/reports` | admin | `?tab=printing` (default): All Time / Monthly / Yearly / Custom range, printer filter, cards, chart, table, per-printer and top-10 stats. `?tab=money`: running total, monthly Payments/Costs |
| `/admin/money` | admin | Permanent redirect to `/admin/reports?tab=money` (`next.config.ts`; the page itself no longer exists) |
| `/admin/models` | admin | Searchable model list, inline edit and editor panel, price boxes, bulk price, printed totals |
| `/admin/upload` | admin | Bulk image upload matched by `code_key` |
| `/admin/categories` | admin | Order (drag + ↑↓), rename, colour, colour options, add, delete, Set scale…, Set price… |
| `/admin/materials` | admin | Materials list and editor |
| `/admin/printers` | admin | Printers list and editor |
| `/admin/settings` | admin | Resin divisor, company details, Money, Email (test), Colours. Runs in `lhr1` |

Layouts: `app/layout.tsx` (root), `app/(app)/layout.tsx` (header, theme CSS variables, tooltips), `app/(app)/invoices/layout.tsx` (1000px centred).

### API route handlers

- `GET /invoices/[id]/pdf` (`app/(app)/invoices/[id]/pdf/route.ts`): returns 401 without a profile, 404 if the invoice isn't found, otherwise renders the PDF as an attachment (`Cache-Control: no-store`). Data is read as the user, so RLS applies.

### Server actions (`app/actions/`)

| File | Actions | Check |
|---|---|---|
| `auth.ts` | `signIn`, `signOut` | — |
| `categories.ts` | `saveCategory`, `deleteCategory`, `reorderCategories`, `setCategoryDefaultScale`, `setCategoryPrice` | `requireAdmin` |
| `email.ts` | `sendTestEmail` | `requireAdmin` |
| `images.ts` | `setModelImage`, `removeModelImage` | `requireAdmin` |
| `invoices.ts` | `createInvoice`, `duplicateInvoice`, `addModelLine`, `addFreeTextLine`, `updateLine`, `removeLine`, `setInvoiceDate`, `finaliseInvoice`, `reopenInvoice`, `markInvoiceSent`, `unmarkInvoiceSent`, `deleteDraft`, `sendInvoice`, `saveCustomer`, `deleteCustomer`, `setDefaultCustomer` | logged-in profile (`getCurrentProfile`) + RLS / `inv_require_user` |
| `jobs.ts` | `startPrintJob`, `completePrintJob`, `updateCompletedResult`, `revertPrintJob`, `cancelPrintJob`, `repeatPrintJob`, `deletePrintJob`, `updatePrintJobDetails` | `requireAdmin` + DB check |
| `materials.ts` | `savePrinter`, `deletePrinter`, `saveMaterial`, `setMaterialInStock`, `deleteMaterial`, `saveSetting` | `requireAdmin` |
| `models.ts` | `saveModel`, `deleteModel`, `setModelPrice`, `setModelsPrice` | `requireAdmin` |
| `money.ts` | `saveMonthlyMoney`, `saveMoneySettings` | `requireAdmin` |
| `notepad.ts` | `saveNotepadLine`, `setNotepadLineDone`, `deleteNotepadLine`, `restoreNotepadLine`, `getUntickedNoteCount` | RLS + triggers (count needs a profile) |
| `requests.ts` | `saveRequestLine`, `deleteRequestLine` | RLS + triggers |

---

## 5. Key components and shared code

### Shared code

- `lib/supabase/{client,server,proxy}.ts`: Supabase clients (the server one awaits `connection()` first, for Cache Components).
- `lib/auth.ts`: `getCurrentProfile()` (cached per request), `requireAdmin()`.
- `lib/fetch-all.ts`: paged reads. `lib/data.ts` has all the list loaders (categories, models, admin models, request lines + printing, print totals, job form options, printers, materials, theme, settings, notepad, printing jobs, job history capped at 200 + count, colour options, unticked note count, money months/settings).
- `lib/report-data.ts` / `lib/reports.ts`: report loaders and the start-month bounds. `lib/invoice-data.ts` / `lib/invoices.ts` / `lib/invoice-layout.ts` / `lib/invoice-pdf*.tsx`: invoices. `lib/email.ts`: the only module that sends mail.
- `lib/money.ts` (`formatMoney`, `parseMoney`), `lib/catalogue.ts` (sorting, NEW badge, labels), `lib/requests.ts` (urgency, queue sort, scale labels), `lib/theme.ts` + `components/theme-style.tsx` (colour settings → CSS variables), `lib/row-highlights.ts`, `lib/colours.ts`, `lib/links.ts`, `lib/notepad-count.ts`, `lib/use-line-autosave.ts`, `lib/upload-image.ts`.
- Components: `site-header`, `admin-menu` (nav, Setup ▾, Notepad (N)), `auto-hide-header`, `sticky-headings`, `tooltips`, `image-preview`, `category-nav`, `colour-label`, `colour-picker`, `money-input`, `request-fields`, `job-fields`, `bulk-price-panel`, `invoice-sheet`, `invoice-status-badge`, `mark-sent-panel`.

### The print job form

- **`components/job-fields.tsx`**: shared by Start print (queue) and Edit details (jobs). You choose the printer first: only active printers show, plus the job's current one even if retired. Then only that type's fields appear: resin shows ml, weight, time, est. cost and layer height (default 0.05) plus an optional resin; FDM shows weight, filament and optional time. Changing to a printer of the other type clears the material. My cost and Charge are calculated live with `calculateMoney()` (`lib/jobs.ts`), which mirrors `pj_refresh_money`. Typing in either one marks it overridden; "reset" clears the override. `noCharge` shows £0 for cancelled jobs and jobs where nothing succeeded.
- **`lib/jobs.ts`**: the `Job` / `JobItem` types, `JOB_COLUMNS`, `JobForm` (all boxes held as text), `jobFormFrom()`, `detailsFrom()` (turns £ text into plain numbers for the DB), `calculateMoney()`, display helpers.

### How each action works

- **Starting** (`start-print-panel.tsx` → `startPrintJob` → `start_print_job`): tick queue lines (each defaults to what's left = quantity − printing) and/or add catalogue models by search (with a size choice, but **no colour**) or free-text items. The client checks quantities, then the RPC checks everything again and creates the job and its items in one transaction. Afterwards the panel keeps the printer and clears the rest. The panel is always shown on `/admin/queue`, even when there are no requests, so a plate can be made of only unrequested or free-text items.
- **Completing** (`ResultForm` in `jobs-view.tsx` → `complete_print_job`): a succeeded box per item (defaulting to planned), or "All succeeded" / "All failed", which fill every item and submit straight away.
- **Cancelling**: in-page confirm → `cancel_print_job`. Nothing is counted; the requests still want the items.
- **Editing details**: `DetailsForm` → `update_print_job_details` (any status; money recalculated unless overridden). Items on a printing job can't be edited.
- **Editing a result**: `ResultForm` on a completed job → `update_completed_result` (only the difference is applied).
- **Reverting**: confirm → `revert_print_job` (completed only; everything applied is put back, recreating lines with their size, colour, urgency and note).
- **Deleting**: confirm (wording depends on status) → `delete_print_job`.
- **Repeating**: confirm → `repeat_print_job` (new printing job dated now; see section 3).
- Every job action goes through `callRpc()` in `app/actions/jobs.ts`: `requireAdmin()`, the RPC, then `refresh()` so the queue and jobs pages reload. DB messages raised on purpose (`P0001`) are shown as they are.

---

## 6. Differences from the brief

**Built differently or renamed**
- Requester-safe reads are `security definer` **functions** (since 0016), not views. The brief already says this; PROGRESS's Phase 1/6a/6b/8 notes still mention "views" in their history.
- The catalogue's category "tabs" (Phase 1) are a left sidebar (a dropdown below 1024px).
- Money is the "Money" tab of `/admin/reports`, not a `/admin/money` page (the old URL redirects). Print stats moved to the Printing tab and now follow the chosen period and printer.
- `print_jobs.created_by` references `auth.users`, not `profiles` (the brief doesn't say which). `invoices.created_by` references `profiles`.
- `my_cost_overridden` exists alongside `charge_overridden` (recorded in PROGRESS as a deliberate addition).
- History is fetched by `started_at` (newest 200) but displayed by finish date (`finishedAt`). The brief only says "newest first".
- `reorder_categories()` is `security invoker` with no `is_admin()` check of its own; it relies on the categories RLS update policy. That works, but it doesn't follow the brief's "admin-only functions raise an error first thing" pattern (that rule is written about `security definer` functions, so this isn't strictly a breach).
- `colour_nav_highlight` isn't seeded by any migration (the app uses the default until it's first saved). The brief says this.

**Added beyond the brief**
- **Repeat job** (`repeat_print_job`, `0023`) and a **search box** on the Jobs page. Neither is in the brief (not in its Jobs page description, nor in its RPC list in section 5), and **PROGRESS.md has no entry for them and no `0023` row in its migrations table**. The last two commits didn't update either doc.
- `is_app_user()` helper, `invoice_counter` table, and the `print_catalogue.restoring` / `restoring_note` transaction flags.
- "Sort again" button on the queue, "Show ticked only" in the builder, "NEW ended" on Models.

**Left out or not yet done**
- Custom domain (Phase 8): nothing in the code.
- Spools/bottles with remaining amounts (brief: "Later").
- A colour choice for unrequested catalogue models in the Start print panel (the DB supports it).
- Editing the items on a printing job, reverting a cancelled job, and reordering invoice lines (the brief intends the second; the other two are recorded loose ends).
- `print_stats_by_printer()` is still defined but unused (the brief says so).

---

## 7. Custom (ad hoc) jobs

**What already exists**
- **Jobs without any request line: yes.** `start_print_job` accepts three item kinds: request line, `{model_id, scale, colour_material_id}` (a catalogue model nobody requested), and `{free_text_name}`. `print_job_items.request_line_id` and `model_id` are both nullable; check constraints require a model or a non-blank free-text name, and `from_request` implies a model.
- **The UI supports it.** The Start print panel on `/admin/queue` is shown even when the queue is empty and has "+ Add a catalogue model (search)…" (with a size dropdown) and "+ Free-text item". The queue doesn't need to have anything ticked.
- Unrequested model items are labelled "not requested" in the panel and "(not requested)" on Jobs. Free-text items show their name.
- Unrequested and free-text items never touch request lines: `pj_take_off` returns 0 without a `request_line_id`, and `update_completed_result` only takes more off for `from_request` items.
- Successful prints of unrequested catalogue models count towards printed totals and the NEW badge (`model_print_totals` only filters by completed status). Free-text items count towards "models" / "items" totals in Reports and Money (`sum(quantity_succeeded)` over all items) but not towards any model's printed total or the top-10 list.
- Repeat job turns surplus items into unrequested items automatically.

**What is missing**
- **`print_jobs` has no `source` column and no `chargeable` column.** Neither exists in any migration, type or query. (`grep` for both words finds nothing relevant.)
- So there is no way to mark a whole job as custom / personal / non-request, except that its items have `from_request = false`. A job's origin can only be inferred from its items, and a mixed plate has no single answer.
- **Every completed job is charged by default.** `pj_refresh_money` charges every job by weight (resin) or by weight × material rate (FDM), whatever its items are. That charge feeds `money_by_month()` (`difference = payments − (charge + costs)`) and the reports. The only way to make an ad hoc job not chargeable today is to override the charge to £0 by hand in Edit details. Nothing marks it as deliberately non-chargeable, so it would show as "Charge £0.00 (set by hand)".
- The Start print panel can't give an unrequested model a colour (`PlateItem` has no colour field), although the RPC accepts one.
- Reports can't filter or split by requested vs ad hoc work.

---

## 8. Loose ends

### Type check and lint (run 2026-11-09)

- **`npx tsc --noEmit`: fails (exit 2) with 2 errors, both in generated code:**
  ```
  .next/types/validator.ts(126,39): error TS2307: Cannot find module '../../app/(app)/admin/money/page.js' or its corresponding type declarations.
  .next/types/validator.ts(134,69): error TS2344: Type '__InvalidParamMatchingKeys' does not satisfy the constraint 'never'.
  ```
  `.next/types/` dates from 1 Nov and still references the deleted `/admin/money` page. `tsconfig.json` includes `.next/types/**/*.ts`, so plain `tsc` picks these stale files up. I re-ran the same check against a temporary config (in the scratchpad, outside the repo) that excludes `.next`: **0 errors**. So the source code itself type-checks. A fresh `next dev` or `next build` should regenerate `.next/types` and clear this; I didn't run either, since this task is read-only.
- **`npm run lint` (eslint): passes, exit 0, no warnings printed.**

### TODO / FIXME

- None. No `TODO`, `FIXME`, `XXX` or `HACK` comments in `app/`, `lib/`, `components/`, `scripts/`, `proxy.ts` or `supabase/`.
- Seven targeted `eslint-disable-next-line` comments, each with a reason: 3 × `@next/next/no-img-element`, 3 × `react-hooks/exhaustive-deps`. No `@ts-ignore`, no `as any`. `console.log` appears only in the import script.

### Unused files and code

- Every file in `lib/`, `components/` and `app/actions/` is imported somewhere. No orphaned files found.
- `print_stats_by_printer()` (DB) is unused.
- `loadModels()`'s `includeHidden` option is never used. Its comment says the queue uses it "to still show requests for" retired models, but `/admin/queue` calls `loadModels(supabase)` without it, and its own comment says retired models' lines are left out on purpose. The comment in `lib/data.ts` is out of date.

### Possible bugs and gaps (not confirmed by running the app)

1. **Request lines for retired ("hidden") models are invisible everywhere.** The catalogue and the queue both drop them, but the lines stay in the database (and the colour, printing and unique-key rules still apply to them). If a model with open requests is retired, nobody can see or clear those requests until it's un-retired. This may be intended (PROGRESS: "hides retired models"), but nothing warns about it.
2. **Job history cap ordering.** `loadJobHistory` takes the newest 200 by `started_at`, while the page sorts by completion/cancellation time. Once there are more than 200 finished jobs, a job started long ago but finished recently could be missing from History. Unlikely at this scale.
3. **`/invoices/[id]/pdf` with a malformed id**: `loadInvoice` throws on the database's invalid-uuid error, which isn't caught, so the response is a 500 instead of the route's 404 message. The invoice page itself has a try/catch.
4. **`create_invoice` silently skips retired models**, while `add_invoice_model_line` allows them. A builder tick on a model that was retired meanwhile just disappears from the draft. It only errors if *every* model is skipped.
5. **"Save as a customer" duplicate check uses `ilike` with the raw address** (`app/actions/invoices.ts`), so `_` and `%` in an email act as wildcards. This can only wrongly skip saving a customer; it can't create a wrong one.
6. **Untested against the live database:** PROGRESS says Phase 6a/6b screens, invoices, colours, reports and the notepad count were never clicked through logged in, and email was never sent through a real provider. Whether migrations 0008–0023 have been run in Supabase is unknown (none are ticked).

### Missing error handling (minor)

- `sendInvoice`'s "Save as a customer" step ignores insert errors: the email still counts as a success, and the customer silently isn't saved.
- Several loaders throw on any Supabase error and rely on the page's try/catch to show a generic "couldn't be loaded" message. That's consistent, but it hides the cause from the user (it's only logged to the server).

### Docs out of date

- `docs/PROGRESS.md`: no entry for Repeat job / Jobs search, no `0023` row in the migrations table, "Last updated 2026-11-04".
- `docs/PROJECT_BRIEF.md`: no `repeat_print_job` in the RPC list and no Repeat or search in the `/admin/jobs` description.
- `README.md` says Dad can request models "(later)", which has been built.
