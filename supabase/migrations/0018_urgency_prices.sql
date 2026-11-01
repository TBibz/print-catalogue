-- =============================================================================
-- 0018_urgency_prices.sql — two urgency levels, and model prices
--
-- Run this whole file in the Supabase SQL Editor after
-- 0017_request_lines_policies.sql. Safe to run again.
--
-- 1. Urgency: URGENT is gone. The only levels are ASAP, PRIORITY and blank.
--    Existing URGENT request lines (and the urgency copied onto print job
--    items, used when a line is recreated) become ASAP, and the checks are
--    tightened so URGENT can't be used again.
-- 2. Prices: models.price (£, two decimals; null = no price set), shown to
--    everyone logged in through catalogue_models(), plus two admin-only bulk
--    functions: set_models_price() and set_category_price().
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Urgency
-- -----------------------------------------------------------------------------

-- Remove the old checks (whatever they're called) that still allow URGENT.
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.request_lines'::regclass, 'public.print_job_items'::regclass)
      and pg_get_constraintdef(oid) like '%URGENT%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;

-- URGENT becomes ASAP. (Neither the printing guard nor the colour check
-- cares about urgency, so this works even while a line is printing.)
update public.request_lines set urgency = 'ASAP' where urgency = 'URGENT';
update public.print_job_items set request_urgency = 'ASAP' where request_urgency = 'URGENT';

-- The new checks.
alter table public.request_lines
  drop constraint if exists request_lines_urgency_check;
alter table public.request_lines
  add constraint request_lines_urgency_check
  check (urgency in ('ASAP', 'PRIORITY'));

alter table public.print_job_items
  drop constraint if exists print_job_items_request_urgency_check;
alter table public.print_job_items
  add constraint print_job_items_request_urgency_check
  check (request_urgency in ('ASAP', 'PRIORITY'));


-- -----------------------------------------------------------------------------
-- 2. Model prices
-- -----------------------------------------------------------------------------

alter table public.models
  add column if not exists price numeric(10, 2);

alter table public.models
  drop constraint if exists models_price_check;
alter table public.models
  add constraint models_price_check check (price is null or price >= 0);


-- catalogue_models() now includes price (for the invoice builder, Phase 9).
-- Its list of columns changes, so it has to be dropped and made again.
-- Same as 0016 otherwise: everything except admin_notes, logged-in users only.
drop function if exists public.catalogue_models();

create function public.catalogue_models()
returns table (
  id             uuid,
  code           text,
  code_key       text,
  name           text,
  category_id    uuid,
  default_scale  text,
  other_scales   text[],
  availability   text,
  image_path     text,
  show_new_badge boolean,
  price          numeric,
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.code, m.code_key, m.name, m.category_id, m.default_scale,
    m.other_scales, m.availability, m.image_path, m.show_new_badge,
    m.price, m.created_at, m.updated_at
  from public.models m;
$$;

revoke all on function public.catalogue_models() from public, anon;
grant execute on function public.catalogue_models() to authenticated, service_role;


-- set_models_price(models, price, only_unset, dry_run)
--   Sets the price on the given models in one step.
--   * only_unset = true:  only those with no price yet
--     only_unset = false: all of them (overwrites)
--   * dry_run = true: change nothing, just say how many would change
--   Returns how many models change (or would change). Models that already
--   have exactly this price don't count. Admin only.
create or replace function public.set_models_price(
  p_model_ids  uuid[],
  p_price      numeric,
  p_only_unset boolean,
  p_dry_run    boolean default false
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price numeric(10, 2);
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change prices.' using errcode = '42501';
  end if;
  if p_price is null then
    raise exception 'Enter a price, e.g. 12.50.';
  end if;
  if p_price < 0 or p_price > 100000 then
    raise exception 'Enter a price between £0 and £100,000.';
  end if;
  v_price := round(p_price, 2);

  if p_dry_run then
    select count(*)::int into v_count
    from public.models m
    where m.id = any (coalesce(p_model_ids, '{}'))
      and (not p_only_unset or m.price is null)
      and m.price is distinct from v_price;
  else
    with changed as (
      update public.models m
      set price = v_price
      where m.id = any (coalesce(p_model_ids, '{}'))
        and (not p_only_unset or m.price is null)
        and m.price is distinct from v_price
      returning m.id
    )
    select count(*)::int into v_count from changed;
  end if;

  return v_count;
end;
$$;


-- set_category_price(category, price, only_unset, dry_run)
--   The same for every model in a category (retired ones included).
create or replace function public.set_category_price(
  p_category_id uuid,
  p_price       numeric,
  p_only_unset  boolean,
  p_dry_run     boolean default false
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change prices.' using errcode = '42501';
  end if;
  return public.set_models_price(
    array(select m.id from public.models m where m.category_id = p_category_id),
    p_price,
    p_only_unset,
    p_dry_run
  );
end;
$$;

-- Logged-in users may call them; both refuse anyone but the admin.
revoke all on function public.set_models_price(uuid[], numeric, boolean, boolean) from public, anon;
revoke all on function public.set_category_price(uuid, numeric, boolean, boolean) from public, anon;
grant execute on function public.set_models_price(uuid[], numeric, boolean, boolean)
  to authenticated, service_role;
grant execute on function public.set_category_price(uuid, numeric, boolean, boolean)
  to authenticated, service_role;
