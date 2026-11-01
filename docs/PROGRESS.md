# Progress

Where the build stands against the phases in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
Update this file and commit it at the end of every task.

_Last updated: 2026-11-01 (Phase 9: invoices)_

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
| 8 | Future-proofing and polish | Done (needs `0013`–`0015` run, then testing); custom domain still to do |
| 9 | Invoices | Done (needs `0019` run, the SMTP env vars, then testing) |

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
- "On its way" label renamed to "Model Not Ready" (later shortened to "Not ready")

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

### Sticky headings and auto-hiding nav: Done
- Site header (`components/auto-hide-header.tsx`): sticky, slides away while scrolling down, back on any small scroll up, always shown near the top; it slides with transform so the page never jumps. It sets `--nav-offset` (header height when showing, 0 when hidden)
- Column headings on the catalogue list and the queue (`components/sticky-headings.ts`): dark purple (#3b2a5c), bold white, sticky at `top: var(--nav-offset)` so they sit right under the header and move with it. They are in the normal page flow, so they never cover the first row
- Catalogue sidebar: sticky under the header with its own scroll when it's taller than the screen (the sidebar column now stretches to the list's height, which it needs for sticky to work)
- Grid view gets the sidebar and the hiding header (no headings)
- Checked with 58 sample models and 32 categories in the browser pane at 1280px (scroll down, small scroll up, headings line up), using a temporary preview page that wasn't committed. Queue headings use the same code but weren't separately checked

### Note box always the widest: Done
- Closed colour box: the chosen colour is drawn over the native select (stripe + name); an out-of-stock colour shows as its name in grey italics with the tooltip "Out of stock" (the open list still says "(out of stock)"); very long names truncate with "…" and the full name in the tooltip
- The Colour column width (`--colour-col`) is worked out from the actual colour names: the longest of them or "Any colour", at about 0.5rem per character, plus room for the stripe, arrow and "+" (capped at 16rem). With today's materials that's 10.4rem (was 13.25rem); the freed space goes to Note
- Checked with the seeded colour names at 1280px: on "All" Note is 218px vs Colour 166px; inside BASES and in grid view too (temporary preview page, not committed)

### Single-line catalogue rows: Done
- Controls 30px, rows about 4px padding, everything vertically centred (catalogue list, grid controls, queue)
- No category line: on "All" a small category tag (stripe + name) in its own column; none inside a category
- Long names truncate with "…" (full name on hover); names never shrink below 8rem
- "+ another size / colour" links replaced by a small "+" right of the size / colour dropdown (first line only), with a tooltip
- Alternate rows soft lavender grey (#f3f1f8); NEW gold still wins
- Sidebar 10rem; pages can grow to 96rem on wide screens. At 1280px on "All" (which has a Colour column because of BASES) the Note box is about 11rem; at 1512px about 15rem; inside a category without colours it's much wider
- Checked with sample data in the browser pane at 1280px and 1512px (list and grid), using a temporary preview page that wasn't committed

### 7. Money and stats: Done (not yet tested against the real database)
- `0012_money.sql`: `monthly_money` (admin only), settings `opening_balance` and `money_start_month` (defaults to the first completed job's month), `money_by_month()` (Europe/London months, every job, newest first) and `print_stats_by_printer()`. Checked in PGlite: a job finished at 23:30 UTC on 30 June counts in July, cancelled jobs don't count, Dad gets no rows, half-month dates are refused, safe to run twice
- `/admin/money` ("Money" in the header): running total, Starting balance (opening balance + first month), table newest first with autosaving Payments and Costs, "Materials from jobs" reference, coloured differences, all-time stats per printer and top 10 models
- Money formatting everywhere (`lib/money.ts`): "£1,234.56", "−£12.34"; £ boxes (`components/money-input.tsx`) with a fixed £ that accept "12", "12.5", "1,200". Used on Money, Jobs, the Start print panel (est. cost, my cost, charge) and Materials (pack price, charge)
- The page layout was checked with sample data in the browser pane (desktop and phone), using a temporary preview page that wasn't committed
### 8. Future-proofing and polish: Done (one commit per item)
1. **Row limit** (79e84c4): `lib/fetch-all.ts` reads page by page until an empty page, so it works whatever Supabase's Max rows is (the old helper stopped early below 1,000). Reads changed: categories, catalogue models, admin models (models + upload pages), request lines, printing amounts, print totals, colour options, printers, materials (job form + Materials page), settings page, notepad lines, printing jobs, job history (capped at 200 with "Showing latest 200 of N" and the total in the heading), `money_by_month()`, `print_stats_by_printer()`, and the import script's categories and models. Counts: `0013_category_counts.sql` (`category_model_counts`) feeds the catalogue sidebar and the Categories page. Left as they are (single rows, deliberate limits or counts already in the database): the logged-in profile, single-row saves, the newest category's position, top 10 models, the two money settings, the unticked notepad count. Rule added to CLAUDE.md
2. **Compact rows** (e90af39): 34px controls, 14px text, tighter padding; category on the name's line
3. **Alternating rows** (da45329): very light grey on every other row in the catalogue list and queue
4. **"Not ready"** (a442383): replaces "Model Not Ready", never wraps
5. **Gold NEW rows** (f001b23): light gold row / card for NEW models, over the alternating grey
6. **Category colours** (fa8ec38): `0014_category_printer_colours.sql`; colour picker on Categories; sidebar fills the selected category with its colour (dark or white text by contrast), stripes on the others, "All" black. Shared `ColourPicker` (also used by Materials)
7. **Printer colours** (171cf11): colour picker on Printers; stripe + tint in Start print; stripe next to printer names on Jobs
8. **All succeeded / All failed** (605ea0f): they now fill every item and submit straight away (before, "All succeeded" re-filled the amounts already there, so nothing seemed to happen, and neither saved anything)
9. **Bulk default scale** (c849c1d): `0015_bulk_default_scale.sql` (`set_category_default_scale()`, with a dry run for the count); "Set scale…" panel on Categories
10. **Home-screen app** (fdde534): `public/manifest.webmanifest`, icons generated with next/og, Apple web-app tags; proxy.ts skips `.webmanifest` so the manifest loads without logging in
- SQL for items 1, 6–7 and 9 was checked in PGlite. Items 2–5 were checked in the browser pane with sample data (temporary preview page, not committed). The manifest and icons were checked against a local production server (they load without logging in; pages still need login)

### Security Advisor fixes: Done (run `0016` in Supabase straight after this deploys)
- `0016_security_advisor.sql`: the five "Security Definer View" views (`catalogue_models`, `request_line_printing`, `model_print_totals`, `category_model_counts`, `colour_options`) all read tables Dad can't see under RLS, so none could switch to `security_invoker`. Each became a `security definer` function with the same name and columns (`set search_path = ''`, callable by logged-in users only), and the views were dropped. The app calls them with `.rpc()` in `lib/data.ts`
- `rls_auto_enable()` (made by Supabase) can no longer be called by `public`, `anon` or `authenticated`
- Every policy calling `auth.uid()` / `is_admin()` now wraps it in `(select …)` (profiles, models, notepad, printers, materials, settings, print jobs and items, monthly money, model-images storage)
- `categories`: "admin write" (which also covered reading) split into admin insert / update / delete, so "read" is the only SELECT policy
- Checked in PGlite: all five functions return exactly what the views did, for both admin and Dad; logged-out users can't call them; category, notepad and profile rules behave as before; safe to run twice

### Security Advisor warnings, part 2: Done (SQL only, no app code changes)
- Checked every `security definer` function: the seven job RPCs stop first thing via `pj_require_admin()`, `set_category_default_scale` checks `is_admin()` straight after `begin`; helpers and trigger functions can't be called by `public`, `anon` or `authenticated`; `is_admin()` and the five `0016` functions are meant for any logged-in user. With Supabase's "everyone can run new functions" default reproduced in PGlite, no function can be run by `public` or `anon`. Nothing was missing
- `0017_request_lines_policies.sql`: request_lines insert / update / delete (already `to authenticated`) now check for a profile with role admin or requester instead of `true`; reading stays `true` (not flagged). Re-revokes the admin RPCs from `public` / `anon` as a safety net
- Checked in PGlite: Tomi and Dad can still add, change and delete request lines; a login without a profile can't; Dad gets "Only the admin…" from every admin function; function rights identical before and after; safe to run twice

### Urgency levels and model prices: Done (needs `0018` run, then testing)
- `0018_urgency_prices.sql`:
  - URGENT removed. Existing URGENT request lines, and the urgency copied onto print job items (used when a line is recreated), become ASAP; the checks on both now allow only ASAP and PRIORITY
  - `models.price` (numeric(10, 2), £, null = no price set, can't be negative)
  - `catalogue_models()` dropped and recreated with `price` (its columns changed), still without `admin_notes`, still logged-in users only
  - `set_models_price(ids, price, only_unset, dry_run)` and `set_category_price(category, price, only_unset, dry_run)`: admin only (raise "Only the admin can change prices." for anyone else), rounded to pence, models already at that price don't count, the dry run returns the count
- Checked in PGlite (migrations 0001–0017, URGENT test data including a line on a printing job, then 0018 run twice): 24 checks pass. URGENT converted on lines and job items and refused afterwards; the requester can still change urgency on a printing line; catalogue_models() gives the requester `price` but not `admin_notes`; logged-out users can't call the functions; the requester is refused by both bulk functions; dry runs change nothing; only-unset vs overwrite counts are right; prices round to pence
- App: the urgency dropdown, pill colours and queue sort all come from `lib/requests.ts` (ASAP → PRIORITY → none)
- `/admin/models`: Price column with an autosaving £ box per model (`price-cell.tsx`; blank clears it). Tick boxes, "Select all N shown" (respects search and filters; changing them clears the ticks) and "Set price for N selected…"
- `/admin/categories`: "Set price…" next to "Set scale…"
- Both bulk actions use one panel (`components/bulk-price-panel.tsx`): £ amount, "Only models with no price set" or "All … (overwrites)", and a confirm button showing how many models will change (asked of the database with a dry run as you type)
- The catalogue doesn't read `price` yet (it lists its columns explicitly)
- Brief: URGENT removed everywhere, prices documented, Phase 9 (Invoices) outline added
- Not checked in a browser (Claude can't log in). Lint and the build pass

### Models page clean-up: Done
- **Bug: Price boxes blank after "Set price…" on Categories.** Cause: Next.js keeps the Models page alive in the background. Coming back, the list did get the fresh prices from the server, but each Price box only read its price once, when it first appeared, and its key didn't change, so it kept its old (blank) text. Opening Edit made a new box, which read the right price, which is why it showed there. Fixes:
  - `price-cell.tsx`: the box now follows the saved price it's given whenever that changes, except while you're typing in it or it's saving (so it never overwrites typing). The key-bump workaround for "Set price for N selected" is gone; that now goes through the same path
  - `models-list.tsx`: every time the page is shown again (Next.js re-runs effects then, and the browser's Back button can bring it back without asking the server), it calls `router.refresh()`, so prices and scales changed elsewhere always show
  - Checked: the Sizes column is drawn straight from the model data (no local copy), so a bulk scale change shows once fresh data arrives; the edit row reads its values when opened and closes when fresh data arrives
- Compact rows like the catalogue: 30px controls (price box, Edit button, and every box in the edit row), about 4px row padding, 14px text, vertically centred; one line per model (name cut short with "…", full name on hover; admin note only gets the space left over). Price box `w-[6.5rem]`, fits "£ 9,999.99", with a small ✓ / … / ! mark beside it instead of a line underneath (`MoneyInput` has a new `compact` option)
- Same dark purple sticky headings (`STICKY_HEADINGS`), soft lavender alternate rows (#f3f1f8) and light gold NEW rows as the catalogue
- Checked in the browser pane at 1280px with made-up data (temporary preview page, not committed): rows 39px (30px controls + 4px padding + 1px border), price box 30px × 104px, 14px text, headings and row colours as intended, edit row lined up with the columns

### 9. Invoices: Done (needs `0019` run, then testing)
- `0019_invoices.sql`: `customers` (one default, `set_default_customer()`), `invoices`, `invoice_lines` (code, description and price copied in; `line_total` generated), `invoice_counter` (one row), `invoice_totals` view (security invoker), `is_app_user()`. One RLS policy per table for logged-in admin/requester users; nothing for anon/public
  - Column grants: the app can only set an invoice's date and customer, and a line's position, description, quantity and price (code and model only via `add_invoice_model_line`). Number, status and sending only through the functions
  - Guards: no changes to a finalised invoice or its lines; an invoice with a number can't be deleted (so no gaps); deleting a model or customer still works (it only clears the link)
  - Functions: `create_invoice`, `add_invoice_model_line`, `finalise_invoice` (locks the counter row, so numbers never repeat; refuses with no lines or any unpriced line; keeps the number when finalised again after a reopen), `reopen_invoice` (not if sent), `duplicate_invoice`, `mark_invoice_sent`
  - Company details as `company_` settings (seeded); settings policies split so both roles can read those keys and only the admin reads the rest or writes
- Checked in PGlite (0001–0018, then 0019 twice): 51 checks pass, covering logged-out and no-profile users refused, requester builds/edits/finalises/reopens/duplicates/sends, copied lines unaffected by later catalogue changes, line price change leaves the model alone, protected columns refused, finalised lines/date/delete refused, INV-0001 → 0002 → 0003 with no skipping after deleting a draft, reopened numbered draft can't be deleted, sent invoices can't be reopened, one default customer, deleting a customer or model used on a finalised invoice, company settings readable by the requester but not writable
- `/invoices` ("Invoices" in the header for both roles): list newest first (number or Draft, date, items, total and status from `invoice_totals`, sent date), Open, Delete for drafts that never had a number (in-page confirm), Customers section (add, edit, delete, make default)
- `/invoices/new`: builder in the catalogue's style (sidebar with database counts, search, purple sticky headings, lavender rows; ticked rows light green); typing a quantity ticks, unticking clears; "Show ticked only"; sticky bottom bar "N items · £total" (+ how many have no price) and Generate invoice
- `/invoices/[id]`: the invoice sheet (`components/invoice-sheet.tsx`) built from the same measurements as the PDF (`lib/invoice-layout.ts`). Drafts: quantity, price (amber outline when missing) and free-text description boxes that autosave, × to remove, "+ Add model" (search) and "+ Add free-text line", date box, Finalise (waits for any save still in progress; disabled until every line has a price), Download PDF, Delete draft. Finalised: Send…, Download PDF, Reopen (not if sent), Duplicate as new draft
- PDF (`lib/invoice-pdf-document.tsx`, `lib/invoice-pdf.tsx`, route `/invoices/[id]/pdf`): `@react-pdf/renderer`, A4, table header repeated on every page, "Page X of Y", DRAFT watermark on drafts, no hyphenation. File name "INV-0001 Alexanders Toy Soldiers.pdf" ("Draft …" for drafts). Checked by rendering a 6-line draft and a 70-line invoice through the dev server: 1 and 3 pages, header repeated, totals right
- Email (`lib/email.ts`, the only module that sends mail): Nodemailer over any SMTP server (originally Gmail; switched to generic SMTP, see below); from name and reply-to come from the company settings; PDF attached. Send panel: To (from the invoice's or default customer), "Save as a customer", subject, message; records sent_at / sent_to; "Sent before on…". Without the env vars the button says "Email not set up yet". Not yet tested with a real mail server
- Settings page: company name, three address lines, phone and email
- Header: the Notepad and Invoices links are now inside `<Suspense>` (plain links as the fallback) because pages with an id in the address (`/invoices/[id]`) can't know the address at build time
- Catalogue's `CategoryButton` and `CategoryTag` moved to `components/category-nav.tsx` (shared with the builder); the catalogue looks the same
- Screens checked in the browser pane at 1280px with made-up data (temporary preview page, not committed): builder ticking/unticking and bar, draft sheet with boxes, finalised view with the Send panel, list. Not checked against the real database (Claude can't log in)

### Invoice email through any SMTP server: Done (needs the SMTP env vars, then testing)
- `lib/email.ts` now uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` instead of the Gmail ones. Port 465 = SSL/TLS from the start; other ports (587) must use STARTTLS or nothing is sent. From name = company name, reply-to = company email, no BCC. 15-second connection timeouts so a dead server doesn't hang the page
- Plain-English errors for a refused password, unreachable or unknown server, failed secure connection, refused from-address and refused recipient; the technical message goes to the server log. Checked against fake mail servers on this computer (every message above came out as expected); not yet tried with a real provider
- Settings → "Email" box (admin only): shows the server, port and from-address in use, or which settings are missing, and "Send test email" sends a plain message to a typed address (`app/actions/email.ts`)
- `.env.local.example` updated

### Invoice builder layout: Done
- Invoice pages (list, builder, draft / finalised invoice) are at most 1000px wide (`app/(app)/invoices/layout.tsx`), left-aligned under the header
- Builder: sidebar 11rem + table about 800px; snug columns (tick, category 7rem, code 5rem, name, price, qty), long names end in "…" with the full name on hover. The bottom bar is now sticky inside the table column instead of across the whole screen, so it has exactly the table's width and left edge
- Shared category sidebar (catalogue too): one line per category, slightly smaller text (13px), names that don't fit end in "…" with a tooltip; widened from 10rem to 11rem so "PERSONALITIES" fits even with a three-digit count. The catalogue table is 1rem narrower as a result
- Checked with sample data in the browser pane at 1440px and phone width (temporary preview page, not committed)

### Centred invoice pages and our own tooltips: Done
- Invoice pages are centred (`mx-auto` in `app/(app)/invoices/layout.tsx`): equal space either side, back link / title / description / table / bottom bar all share the block's left edge
- Stuck tooltip (e.g. "Base006 50mm x 45mm" in the top-left corner under the nav): it was the browser's own `title` tooltip, which some browsers draw in the wrong place. The app had no shared tooltip, so there's now one (`components/tooltips.tsx`, mounted once in the app layout): placed from the hovered element's position, shown after 350ms, hidden on mouse leave, scroll, click, typing or leaving the window, kept inside the window. Every `title=` in the app (33: builder, catalogue, queue, Start print, models, prices, categories, upload, notepad, invoices, request controls, category sidebar and tags) is now `data-tip=`
- Checked with sample data in the browser pane at 1440px: block centred with 220px each side, tooltip appears 6px below the hovered name and goes away when the mouse moves off (temporary preview page, not committed)
- Loose end: a tooltip on a disabled button (e.g. Delete on a category that has models, "Email not set up yet") may not show in Safari, which doesn't report the mouse over disabled buttons. Not checked in Safari

### Image preview on invoice pages: Done
- The catalogue's hover preview is now a shared component (`components/image-preview.tsx`, `useImagePreview()`), used by the catalogue list, the invoice builder (code and name) and model lines on draft invoices (code and description). Same 288px picture, no delay, right of the pointer (left if there isn't room)
- Changes for all three: it sits just below the hovered row (above it near the bottom of the window), so it never covers that row's tick box, quantity or other controls; code and name shown as a caption; hides on scroll and on any key press as well as on mouse leave. Models with an image show the preview instead of the text tooltip (catalogue name and builder code/name); without an image, just the tooltip
- `loadInvoiceModels()` now includes `image_path`; draft lines look up their model's image from that list (a line whose model has since been retired shows no preview)
- Checked with sample data in the browser pane at 1440px: preview below the hovered row and clear of it, flips above near the bottom, caption shown, no tooltip at the same time, hides on a key press and on scroll; rows without an image show only the tooltip (temporary preview page, not committed; pictures themselves not checked as the sample had no real images)

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
| `0013_category_counts.sql` | 8 | `category_model_counts` view | ☐ |
| `0014_category_printer_colours.sql` | 8 | `colour_hex` on categories and printers | ☐ |
| `0015_bulk_default_scale.sql` | 8 | `set_category_default_scale()` | ☐ |
| `0016_security_advisor.sql` | 8 | the five requester views become functions, `rls_auto_enable()` locked down, faster policies, categories policies split | ☐ |
| `0017_request_lines_policies.sql` | 8 | request_lines write policies check for an admin/requester profile instead of `true`; admin RPCs re-revoked from public/anon | ☐ |
| `0018_urgency_prices.sql` | 8+ | URGENT → ASAP and removed; `models.price`; `catalogue_models()` with price; `set_models_price()`, `set_category_price()` | ☐ |
| `0019_invoices.sql` | 9 | customers, invoices, invoice lines, numbering counter, `invoice_totals`, invoice functions, company settings readable by both roles | ☐ |

Also in `supabase/snippets/`: `make-admin.sql` (one-off, makes your account admin).

## Known bugs, loose ends and decisions

**Loose ends**
- Phase 6a pages haven't been clicked through in a browser yet: that needs `0008` run in Supabase first. Use the Phase 6a test script.
- The catalogue and queue call `catalogue_models()`, `request_line_printing()` and the other `0016` functions, so they show an error until `0016` has been run.
- History shows the latest 200 jobs only (enough for now; add paging later if needed).
- Items on a printing job can't be edited; cancel it and start a new plate instead.
- Cancelled jobs can't be reverted.
- None of the Phase 6a/6b screens or UI fixes have been checked in a browser yet (Claude can't log in). Lint and the build pass.
- Catalogue models added to a plate by search (not requested) can't be given a colour in the panel yet; the database supports it.
- Drag-and-drop on the Categories page needs a mouse; on a phone or tablet use the ↑ ↓ buttons.
- Custom domain (Phase 8) not done: it's set up in Vercel and your domain registrar, not in code.
- In the catalogue's colour dropdown, the open list is the browser's own, so it shows names without stripes; the chosen colour shows its stripe in the box.
- Colour names much longer than "Sky Blue (out of stock)" are cut off in the closed colour box (shown in full when it's open).
- The app needs `0018` run: the Models page reads `models.price`, so it shows an error until then.
- Invoices need `0019` run; sending needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM_EMAIL` (locally in `.env.local`, and in Vercel). The old `GMAIL_USER` / `GMAIL_APP_PASSWORD` are no longer used and can be deleted.
- Invoice emails go out from `SMTP_FROM_EMAIL` (most servers only allow the login's own address); the name shown is the company name and replies go to the company email. No BCC: every invoice is stored on the site.
- On a phone the invoice sheet is wider than the screen and scrolls sideways (it's an A4 page).
- Lines can't be reordered on a draft (they keep the order they were added in).

**Decisions made along the way**
- Invoices: a line with no price blocks Finalise (rather than invoicing £0 by mistake).
- Invoices: a draft that has a number (finalised, then reopened) can't be deleted, so invoice numbers never have gaps. Only never-finalised drafts can be deleted.
- Invoices, lines and customers are shared by both accounts (like request lines); "Delete" on the list only shows for deletable drafts.
- Two urgency levels only (ASAP, PRIORITY). URGENT lines were turned into ASAP rather than PRIORITY so nothing became less urgent.
- Bulk "Set price" ignores models already at that exact price when counting, so the confirm button only counts real changes.
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
- What Dad may see of admin-only tables comes from `security definer` functions that return only safe columns (not views), so Supabase's Security Advisor is happy. They are callable by any logged-in user, so the Advisor may still list them as a warning ("Authenticated can execute SECURITY DEFINER function"); that's intended.
- Colours are set per category (has_colour_options), not per model. The list of colours is every filament with "Offer as colour" ticked (out-of-stock ones greyed out).
- `materials.colour_hex` is the only source of a material's displayed colour.
- When a request line is recreated (edit result, revert, delete), it keeps its colour even if that colour is now out of stock: `pj_put_back` sets a transaction-only flag that the colour check respects.

**Bugs fixed (for reference)**
- Prerender error from `Date.now()` in the Supabase client (26a8a12)
- Queue / catalogue showing stale rows after navigating back (b017780)

No open bugs are recorded in the code or commit messages.
