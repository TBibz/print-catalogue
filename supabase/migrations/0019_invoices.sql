-- =============================================================================
-- 0019_invoices.sql — Phase 9: invoices
--
-- Run this whole file in the Supabase SQL Editor after
-- 0018_urgency_prices.sql. Safe to run again.
--
-- Both roles (admin and requester) can use everything here. Invoices are
-- shared by both accounts, like request lines. Logged-out visitors get
-- nothing.
--
--   customers       who invoices go to (one can be the default)
--   invoices        one per invoice: draft until finalised, then numbered
--   invoice_lines   the lines, with code, description and price COPIED in
--                   when added, so catalogue changes never alter an invoice
--   invoice_totals  view: items, lines and grand total per invoice
--
-- How the rules are enforced:
--   * The app may only set invoice_date and customer_id on an invoice
--     (column grants). Number, status and the "sent" fields are changed
--     only by the functions at the bottom.
--   * Triggers stop any change to a finalised invoice or its lines, and stop
--     deleting an invoice that has a number.
--   * Numbers come from a one-row counter that is locked while it's
--     updated, so two invoices can never get the same number. Drafts never
--     take a number, so deleting drafts leaves no gaps.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Who may use invoices: anyone logged in with an admin or requester profile.
-- -----------------------------------------------------------------------------
create or replace function public.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'requester')
  );
$$;

revoke all on function public.is_app_user() from public, anon;
grant execute on function public.is_app_user() to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '' check (length(name) <= 200),
  email       text not null default '' check (length(email) <= 320),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- At most one default customer.
create unique index if not exists customers_one_default
  on public.customers (is_default) where is_default;

alter table public.customers enable row level security;


-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  -- "INV-0001", given when the invoice is first finalised (kept if reopened).
  number        text unique,
  status        text not null default 'draft' check (status in ('draft', 'finalised')),
  invoice_date  date not null default ((now() at time zone 'Europe/London')::date),
  customer_id   uuid references public.customers (id) on delete set null,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  finalised_at  timestamptz,
  sent_at       timestamptz,
  sent_to       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists invoices_created_at_idx on public.invoices (created_at desc, id);

alter table public.invoices enable row level security;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- The one-row counter for invoice numbers.
create table if not exists public.invoice_counter (
  id           boolean primary key default true check (id),
  last_number  int not null default 0
);
insert into public.invoice_counter (id, last_number) values (true, 0)
on conflict (id) do nothing;

alter table public.invoice_counter enable row level security;
-- No policies: nobody reads or writes it except the functions below.


-- -----------------------------------------------------------------------------
-- invoice_lines
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  position     int not null default 0,
  -- The catalogue model it came from (null for free-text lines). If the
  -- model is deleted later, the line keeps its copied code and description.
  model_id     uuid references public.models (id) on delete set null,
  code         text check (length(code) <= 50),
  description  text not null check (length(description) between 1 and 500),
  quantity     int not null check (quantity > 0 and quantity <= 100000),
  -- £ per item. Null = no price yet (a model with no saved price).
  unit_price   numeric(10, 2) check (unit_price >= 0 and unit_price <= 100000),
  line_total   numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at   timestamptz not null default now()
);

create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position, id);

alter table public.invoice_lines enable row level security;


-- -----------------------------------------------------------------------------
-- Guards
-- -----------------------------------------------------------------------------

-- Invoices: a finalised invoice's date and customer can't change, and an
-- invoice with a number can't be deleted. (Status, number and the sent
-- fields can only be changed by the functions below anyway.)
create or replace function public.invoices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'finalised' then
      raise exception 'Finalised invoices can''t be deleted.';
    end if;
    if old.number is not null then
      raise exception 'This invoice already has the number %, so it can''t be deleted (that would leave a gap). Finalise it again instead.', old.number;
    end if;
    return old;
  end if;

  -- (customer_id becoming null is allowed: that's what happens when a
  -- customer is deleted.)
  if old.status = 'finalised' and new.status = 'finalised'
     and (new.invoice_date is distinct from old.invoice_date
          or (new.customer_id is not null and new.customer_id is distinct from old.customer_id)) then
    raise exception 'This invoice is finalised, so it can''t be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard
  before update or delete on public.invoices
  for each row execute function public.invoices_guard();

-- Lines: nothing can be added to, changed on or removed from a finalised
-- invoice. (Deleting a whole draft deletes its lines; a finalised invoice
-- can't be deleted, so that never reaches here for one.)
create or replace function public.invoice_lines_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.invoices
  where id = coalesce(new.invoice_id, old.invoice_id);

  -- Deleting a model only clears model_id on its lines (they keep the
  -- copied code and description). Allow that, even on finalised invoices.
  if tg_op = 'UPDATE' and old.model_id is not null and new.model_id is null
     and (new.invoice_id, new.position, new.code, new.description, new.quantity, new.unit_price)
         is not distinct from
         (old.invoice_id, old.position, old.code, old.description, old.quantity, old.unit_price) then
    return new;
  end if;

  if v_status = 'finalised' then
    raise exception 'This invoice is finalised, so its lines can''t be changed. Reopen it first.';
  end if;
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'A line can''t be moved to another invoice.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_lines_guard on public.invoice_lines;
create trigger invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_guard();


-- -----------------------------------------------------------------------------
-- invoice_totals: per invoice, worked out in the database.
-- security_invoker: it only shows invoices the user can see anyway.
-- -----------------------------------------------------------------------------
create or replace view public.invoice_totals
with (security_invoker = true)
as
select
  i.id                                                    as invoice_id,
  count(l.id)::int                                        as line_count,
  coalesce(sum(l.quantity), 0)::int                       as items,
  coalesce(sum(l.line_total), 0)::numeric(12, 2)          as total,
  count(l.id) filter (where l.unit_price is null)::int    as unpriced_lines
from public.invoices i
left join public.invoice_lines l on l.invoice_id = i.id
group by i.id;


-- -----------------------------------------------------------------------------
-- RLS: one policy per table, for logged-in admin/requester users.
-- -----------------------------------------------------------------------------
drop policy if exists "customers: app users" on public.customers;
create policy "customers: app users"
  on public.customers for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

drop policy if exists "invoices: app users" on public.invoices;
create policy "invoices: app users"
  on public.invoices for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

drop policy if exists "invoice_lines: app users" on public.invoice_lines;
create policy "invoice_lines: app users"
  on public.invoice_lines for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));


-- -----------------------------------------------------------------------------
-- Company details for the invoice header, in settings. Both roles may read
-- the company_ keys; everything else in settings stays admin only.
-- -----------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('company_name',      'Alexanders Toy Soldiers'),
  ('company_address_1', '14 Constance Road'),
  ('company_address_2', 'Twickenham'),
  ('company_address_3', 'TW2 7HY'),
  ('company_phone',     '020-8894-5925'),
  ('company_email',     'nik@ats-uk.net')
on conflict (key) do nothing;

-- "admin all" (0006/0016) also covered reading. Split it so reading has
-- one policy that also lets everyone logged in see the company_ keys.
drop policy if exists "settings: admin all" on public.settings;
drop policy if exists "settings: read" on public.settings;
drop policy if exists "settings: admin insert" on public.settings;
drop policy if exists "settings: admin update" on public.settings;
drop policy if exists "settings: admin delete" on public.settings;

create policy "settings: read"
  on public.settings for select
  to authenticated
  using (key like 'company\_%' or (select public.is_admin()));

create policy "settings: admin insert"
  on public.settings for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "settings: admin update"
  on public.settings for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "settings: admin delete"
  on public.settings for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- Functions (one transaction each). security definer so they can set the
-- protected columns, so each checks is_app_user() first.
-- -----------------------------------------------------------------------------

create or replace function public.inv_require_user()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_user() then
    raise exception 'Please log in to use invoices.' using errcode = '42501';
  end if;
end;
$$;


-- create_invoice(lines): a new draft from the builder.
--   lines: [{"model_id": "...", "quantity": 2}, …] in the order to show.
--   Each model's code, name and saved price are copied onto its line.
--   The default customer (if any) is filled in. Returns the new id.
create or replace function public.create_invoice(p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_n   int;
begin
  perform public.inv_require_user();
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one model.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where coalesce((e ->> 'quantity')::int, 0) < 1
  ) then
    raise exception 'Every quantity must be at least 1.';
  end if;

  insert into public.invoices (customer_id, created_by)
  values ((select id from public.customers where is_default limit 1), auth.uid())
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, position, model_id, code, description, quantity, unit_price)
  select v_id, e.ord::int, m.id, m.code, m.name, (e.value ->> 'quantity')::int, m.price
  from jsonb_array_elements(p_lines) with ordinality as e(value, ord)
  join public.models m on m.id = (e.value ->> 'model_id')::uuid
  where m.availability <> 'hidden';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'None of those models could be found.';
  end if;
  return v_id;
end;
$$;


-- add_invoice_model_line(invoice, model, quantity): adds a catalogue model
-- to a draft, copying its code, name and saved price. Returns the line id.
create or replace function public.add_invoice_model_line(
  p_invoice_id uuid,
  p_model_id   uuid,
  p_quantity   int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line uuid;
begin
  perform public.inv_require_user();
  if coalesce(p_quantity, 0) < 1 then
    raise exception 'The quantity must be at least 1.';
  end if;
  if not exists (select 1 from public.invoices where id = p_invoice_id) then
    raise exception 'That invoice no longer exists.';
  end if;

  insert into public.invoice_lines (invoice_id, position, model_id, code, description, quantity, unit_price)
  select
    p_invoice_id,
    coalesce((select max(position) + 1 from public.invoice_lines where invoice_id = p_invoice_id), 1),
    m.id, m.code, m.name, p_quantity, m.price
  from public.models m
  where m.id = p_model_id
  returning id into v_line;

  if v_line is null then
    raise exception 'That model no longer exists.';
  end if;
  return v_line;
end;
$$;


-- finalise_invoice(invoice): gives it the next number (or keeps the one it
-- had before being reopened) and locks it. Returns the number.
create or replace function public.finalise_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv     public.invoices;
  v_totals  record;
  v_next    int;
  v_number  text;
begin
  perform public.inv_require_user();

  -- Lock the invoice so it can't be finalised twice at once.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'That invoice no longer exists.';
  end if;
  if v_inv.status = 'finalised' then
    raise exception 'This invoice is already finalised.';
  end if;

  select count(*) as n, count(*) filter (where unit_price is null) as unpriced
  into v_totals
  from public.invoice_lines where invoice_id = p_invoice_id;
  if v_totals.n = 0 then
    raise exception 'Add at least one line before finalising.';
  end if;
  if v_totals.unpriced > 0 then
    raise exception '% % no price yet. Give every line a price before finalising.',
      v_totals.unpriced, case when v_totals.unpriced = 1 then 'line has' else 'lines have' end;
  end if;

  v_number := v_inv.number;
  if v_number is null then
    -- The counter row is locked by this update until the transaction ends,
    -- so numbers are handed out one at a time and never repeat.
    update public.invoice_counter set last_number = last_number + 1
    where id
    returning last_number into v_next;
    v_number := 'INV-' || lpad(v_next::text, 4, '0');
  end if;

  update public.invoices
  set status = 'finalised', number = v_number, finalised_at = now()
  where id = p_invoice_id;

  return v_number;
end;
$$;


-- reopen_invoice(invoice): back to draft, keeping its number. Only if it
-- hasn't been sent.
create or replace function public.reopen_invoice(p_invoice_id uuid)
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
    raise exception 'This invoice is already a draft.';
  end if;
  if v_inv.sent_at is not null then
    raise exception 'This invoice has been sent, so it can''t be reopened. Duplicate it as a new draft instead.';
  end if;

  update public.invoices set status = 'draft', finalised_at = null where id = p_invoice_id;
end;
$$;


-- duplicate_invoice(invoice): a new draft (no number, today's date) with
-- the same customer and copies of the same lines. Returns the new id.
create or replace function public.duplicate_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.inv_require_user();
  if not exists (select 1 from public.invoices where id = p_invoice_id) then
    raise exception 'That invoice no longer exists.';
  end if;

  insert into public.invoices (customer_id, created_by)
  select customer_id, auth.uid() from public.invoices where id = p_invoice_id
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, position, model_id, code, description, quantity, unit_price)
  select v_id, position, model_id, code, description, quantity, unit_price
  from public.invoice_lines
  where invoice_id = p_invoice_id;

  return v_id;
end;
$$;


-- mark_invoice_sent(invoice, to): records that it was emailed. Sending
-- again is allowed (the latest time and address are kept).
create or replace function public.mark_invoice_sent(p_invoice_id uuid, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.inv_require_user();
  update public.invoices
  set sent_at = now(), sent_to = left(btrim(coalesce(p_to, '')), 320)
  where id = p_invoice_id and status = 'finalised';
  if not found then
    raise exception 'Only a finalised invoice can be sent.';
  end if;
end;
$$;


-- set_default_customer(customer or null): makes this one the default (or
-- clears the default), in one step.
create or replace function public.set_default_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.inv_require_user();
  update public.customers set is_default = false where is_default and id is distinct from p_customer_id;
  if p_customer_id is not null then
    update public.customers set is_default = true where id = p_customer_id;
    if not found then
      raise exception 'That customer no longer exists.';
    end if;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on table
  public.customers, public.invoices, public.invoice_lines, public.invoice_counter, public.invoice_totals
  from public, anon, authenticated;

grant select, insert, update, delete on table public.customers to authenticated;

-- Invoices: read and delete (drafts, see the guard); create and change
-- only the date and customer. Everything else goes through the functions.
grant select, delete on table public.invoices to authenticated;
grant insert (invoice_date, customer_id) on table public.invoices to authenticated;
grant update (invoice_date, customer_id) on table public.invoices to authenticated;

-- Lines: free-text lines are added directly (catalogue lines through
-- add_invoice_model_line). The copied code and model can't be changed.
grant select, delete on table public.invoice_lines to authenticated;
grant insert (invoice_id, position, description, quantity, unit_price)
  on table public.invoice_lines to authenticated;
grant update (position, description, quantity, unit_price)
  on table public.invoice_lines to authenticated;

grant select on table public.invoice_totals to authenticated;

grant all on table
  public.customers, public.invoices, public.invoice_lines, public.invoice_counter, public.invoice_totals
  to service_role;

revoke all on function
  public.inv_require_user(),
  public.create_invoice(jsonb),
  public.add_invoice_model_line(uuid, uuid, int),
  public.finalise_invoice(uuid),
  public.reopen_invoice(uuid),
  public.duplicate_invoice(uuid),
  public.mark_invoice_sent(uuid, text),
  public.set_default_customer(uuid)
  from public, anon;
grant execute on function
  public.create_invoice(jsonb),
  public.add_invoice_model_line(uuid, uuid, int),
  public.finalise_invoice(uuid),
  public.reopen_invoice(uuid),
  public.duplicate_invoice(uuid),
  public.mark_invoice_sent(uuid, text),
  public.set_default_customer(uuid)
  to authenticated, service_role;
-- The helper is only for the functions above.
revoke all on function public.inv_require_user() from authenticated;

-- Trigger functions only ever run from their triggers.
revoke all on function public.invoices_guard() from public, anon, authenticated;
revoke all on function public.invoice_lines_guard() from public, anon, authenticated;
