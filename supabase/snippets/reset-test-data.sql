-- =============================================================================
-- reset-test-data.sql — ONE-OFF: clear all test data before real use
--
--   ██  WARNING: THIS PERMANENTLY DELETES DATA. THERE IS NO UNDO.  ██
--
-- Run it ONCE, in the Supabase SQL Editor, just before you start using the
-- app for real. Never run it after that: it would wipe real invoices,
-- print history and requests. (It's a snippet, not a migration, so it is
-- never run automatically.) If in doubt, make a backup first
-- (Supabase → Database → Backups).
--
-- DELETES everything in:
--   invoices, invoice_lines   (all invoices, drafts and finalised)
--   customers
--   print_jobs, print_job_items
--   request_lines             (every current request)
--   notepad_lines
--   monthly_money             (payments and costs typed per month)
-- and resets invoice numbering, so the next finalised invoice is INV-0001.
--
-- KEEPS, untouched: models (prices, sizes, images, NEW flags), categories,
-- materials, printers, settings (opening balance, start month, company
-- details), user accounts and profiles, and the image files in Storage.
--
-- Why TRUNCATE: the safety rules that stop a finalised invoice, or a request
-- that is printing, from being deleted work row by row, so they would block
-- an ordinary DELETE. TRUNCATE empties the tables in one step without them.
-- No CASCADE: if any other table pointed at these, Postgres would refuse
-- and nothing would be deleted, rather than spreading to other tables.
--
-- It all happens in one transaction: either everything is cleared or, if
-- anything goes wrong, nothing is.
-- =============================================================================

begin;

truncate table
  public.invoice_lines,
  public.invoices,
  public.customers,
  public.print_job_items,
  public.print_jobs,
  public.request_lines,
  public.notepad_lines,
  public.monthly_money;

-- Next finalised invoice gets number 1 (INV-0001).
update public.invoice_counter set last_number = 0;

commit;


-- -----------------------------------------------------------------------------
-- Check: the cleared tables should all say 0, the kept ones their usual
-- numbers, and the invoice counter 0.
-- -----------------------------------------------------------------------------
select 'cleared' as kind, 'invoices' as "table", count(*) as rows from public.invoices
union all select 'cleared', 'invoice_lines', count(*) from public.invoice_lines
union all select 'cleared', 'customers', count(*) from public.customers
union all select 'cleared', 'print_jobs', count(*) from public.print_jobs
union all select 'cleared', 'print_job_items', count(*) from public.print_job_items
union all select 'cleared', 'request_lines', count(*) from public.request_lines
union all select 'cleared', 'notepad_lines', count(*) from public.notepad_lines
union all select 'cleared', 'monthly_money', count(*) from public.monthly_money
union all select 'counter', 'invoice_counter (last number used)', (select last_number from public.invoice_counter)
union all select 'kept', 'models', count(*) from public.models
union all select 'kept', 'models with a price', count(*) from public.models where price is not null
union all select 'kept', 'models with an image', count(*) from public.models where image_path is not null
union all select 'kept', 'categories', count(*) from public.categories
union all select 'kept', 'materials', count(*) from public.materials
union all select 'kept', 'printers', count(*) from public.printers
union all select 'kept', 'settings', count(*) from public.settings
union all select 'kept', 'profiles (user accounts)', count(*) from public.profiles;
