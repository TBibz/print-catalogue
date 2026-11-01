-- =============================================================================
-- 0020_mark_invoice_sent.sql — mark an invoice as sent without emailing it
--
-- Run this whole file in the Supabase SQL Editor after 0019_invoices.sql.
-- Safe to run again.
--
-- For invoices already sent outside the site (by hand, from another email
-- account, possibly some time ago):
--   * invoices.sent_method: 'email' (sent from the site) or 'manual'
--     (marked as sent by hand). Empty while not sent. Invoices already
--     sent become 'email'.
--   * mark_invoice_sent_manually(invoice, date, to): records it as sent on
--     that date (today or earlier, never a future date). "To" is optional
--     ("By hand", an address…).
--   * unmark_invoice_sent(invoice): undoes a manual mark, back to "Not sent"
--     (so it can be reopened again). Emailed invoices can't be unmarked.
--   * mark_invoice_sent (used after emailing) now also records 'email'.
-- Both roles may use them, like the rest of invoices.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- sent_method
-- -----------------------------------------------------------------------------
alter table public.invoices
  add column if not exists sent_method text;

alter table public.invoices
  drop constraint if exists invoices_sent_method_check;
alter table public.invoices
  add constraint invoices_sent_method_check check (sent_method in ('email', 'manual'));

-- Everything sent so far went by email from the site.
update public.invoices set sent_method = 'email'
where sent_at is not null and sent_method is null;

-- A sent invoice always says how; an unsent one never does.
alter table public.invoices
  drop constraint if exists invoices_sent_method_matches;
alter table public.invoices
  add constraint invoices_sent_method_matches check ((sent_at is null) = (sent_method is null));

-- The app can read the new column (select is granted on the whole table),
-- but can't write it: only the functions below set it.


-- -----------------------------------------------------------------------------
-- mark_invoice_sent(invoice, to): after emailing it from the site. Sending
-- again is allowed (the latest time and address are kept). Emailing an
-- invoice that was marked by hand makes it an emailed one.
-- -----------------------------------------------------------------------------
create or replace function public.mark_invoice_sent(p_invoice_id uuid, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.inv_require_user();
  update public.invoices
  set sent_at = now(), sent_to = left(btrim(coalesce(p_to, '')), 320), sent_method = 'email'
  where id = p_invoice_id and status = 'finalised';
  if not found then
    raise exception 'Only a finalised invoice can be sent.';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- mark_invoice_sent_manually(invoice, date, to): sent outside the site.
-- Stored as midday UK time on that date, so it always shows as that date.
-- -----------------------------------------------------------------------------
create or replace function public.mark_invoice_sent_manually(p_invoice_id uuid, p_date date, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
begin
  perform public.inv_require_user();
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'That invoice no longer exists.';
  end if;
  if v_inv.status <> 'finalised' then
    raise exception 'Finalise the invoice before marking it as sent.';
  end if;
  if v_inv.sent_at is not null then
    raise exception 'This invoice is already marked as sent.';
  end if;
  if p_date is null then
    raise exception 'Choose the date it was sent.';
  end if;
  if p_date > (now() at time zone 'Europe/London')::date then
    raise exception 'The date sent can''t be in the future.';
  end if;

  update public.invoices
  set sent_at = (p_date + time '12:00') at time zone 'Europe/London',
      sent_to = left(btrim(coalesce(p_to, '')), 320),
      sent_method = 'manual'
  where id = p_invoice_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- unmark_invoice_sent(invoice): undo a manual mark (back to "Not sent").
-- -----------------------------------------------------------------------------
create or replace function public.unmark_invoice_sent(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
begin
  perform public.inv_require_user();
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'That invoice no longer exists.';
  end if;
  if v_inv.sent_method = 'email' then
    raise exception 'This invoice was emailed from the site, so it can''t be unmarked.';
  end if;
  if v_inv.sent_method is distinct from 'manual' then
    raise exception 'This invoice isn''t marked as sent.';
  end if;

  update public.invoices
  set sent_at = null, sent_to = null, sent_method = null
  where id = p_invoice_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- Permissions: logged-in users (each function checks for an app user).
-- -----------------------------------------------------------------------------
revoke all on function
  public.mark_invoice_sent_manually(uuid, date, text),
  public.unmark_invoice_sent(uuid)
  from public, anon;
grant execute on function
  public.mark_invoice_sent_manually(uuid, date, text),
  public.unmark_invoice_sent(uuid)
  to authenticated, service_role;
