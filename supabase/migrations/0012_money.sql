-- =============================================================================
-- 0012_money.sql — Phase 7: money and stats
--
-- Run this whole file in the Supabase SQL Editor after
-- 0011_colour_hex_category_order.sql. Safe to run again.
--
-- What's in here (all admin only):
--   * monthly_money: what Dad paid and what was spent, typed in per month
--   * settings: opening_balance (£, can be negative) and money_start_month
--     (the first month on the Money page)
--   * money_by_month(): one row per month from money_start_month to this
--     month, with completed plates, items, charge, job costs, payments,
--     costs and the difference. Months follow UK time (Europe/London), and
--     every job in the database counts (not just the 200 on the Jobs page).
--   * print_stats_by_printer(): all-time plates, items and charge per printer
-- =============================================================================


-- -----------------------------------------------------------------------------
-- monthly_money: one row per month (only once something has been typed in;
-- a month with no row counts as £0 payments and £0 costs).
-- -----------------------------------------------------------------------------
create table if not exists public.monthly_money (
  -- The first day of the month, e.g. 2026-10-01.
  month       date primary key check (month = date_trunc('month', month)::date),
  payments    numeric(12, 2) not null default 0,  -- £ received from Dad
  costs       numeric(12, 2) not null default 0,  -- £ spent (materials, parts…)
  note        text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.monthly_money enable row level security;

drop trigger if exists monthly_money_set_updated_at on public.monthly_money;
create trigger monthly_money_set_updated_at
  before update on public.monthly_money
  for each row execute function public.set_updated_at();

drop policy if exists "monthly_money: admin all" on public.monthly_money;
create policy "monthly_money: admin all"
  on public.monthly_money for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- Settings. The start month defaults to the month of the first completed
-- job (or this month if there are none yet).
-- -----------------------------------------------------------------------------
insert into public.settings (key, value) values ('opening_balance', '0')
on conflict (key) do nothing;

insert into public.settings (key, value)
select
  'money_start_month',
  to_char(
    date_trunc('month', coalesce(
      (select min(completed_at) from public.print_jobs where status = 'completed'),
      now()
    ) at time zone 'Europe/London'),
    'YYYY-MM-DD'
  )
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- The UK month (first day) a moment falls in.
-- -----------------------------------------------------------------------------
create or replace function public.uk_month(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Europe/London')::date;
$$;


-- -----------------------------------------------------------------------------
-- money_by_month(): newest month first.
--   plates     = completed print jobs (by completed_at)
--   items      = sum of quantity_succeeded on those jobs
--   charge     = sum of charge on those jobs
--   job_costs  = sum of my_cost on those jobs (for reference)
--   payments, costs from monthly_money (0 if no row)
--   difference = payments − (charge + costs)
-- Runs as the caller, so RLS means only the admin gets any rows.
-- -----------------------------------------------------------------------------
create or replace function public.money_by_month()
returns table (
  month      date,
  plates     int,
  items      int,
  charge     numeric,
  job_costs  numeric,
  payments   numeric,
  costs      numeric,
  difference numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      coalesce(
        (select nullif(value, '')::date from public.settings where key = 'money_start_month'),
        public.uk_month(now())
      ) as first_month,
      public.uk_month(now()) as last_month
  ),
  months as (
    select generate_series(b.first_month, b.last_month, interval '1 month')::date as month
    from bounds b
  ),
  jobs as (
    select
      public.uk_month(j.completed_at) as month,
      count(*)::int as plates,
      sum(j.charge) as charge,
      sum(j.my_cost) as job_costs
    from public.print_jobs j
    where j.status = 'completed'
    group by 1
  ),
  items as (
    select public.uk_month(j.completed_at) as month, sum(i.quantity_succeeded)::int as items
    from public.print_jobs j
    join public.print_job_items i on i.job_id = j.id
    where j.status = 'completed'
    group by 1
  )
  select
    m.month,
    coalesce(j.plates, 0),
    coalesce(i.items, 0),
    coalesce(j.charge, 0),
    coalesce(j.job_costs, 0),
    coalesce(mm.payments, 0),
    coalesce(mm.costs, 0),
    coalesce(mm.payments, 0) - (coalesce(j.charge, 0) + coalesce(mm.costs, 0))
  from months m
  left join jobs j on j.month = m.month
  left join items i on i.month = m.month
  left join public.monthly_money mm on mm.month = m.month
  order by m.month desc;
$$;


-- -----------------------------------------------------------------------------
-- print_stats_by_printer(): all-time completed plates, items and charge.
-- -----------------------------------------------------------------------------
create or replace function public.print_stats_by_printer()
returns table (printer_id uuid, printer_name text, plates int, items int, charge numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.name,
    count(distinct j.id)::int,
    coalesce(sum(i.quantity_succeeded), 0)::int,
    coalesce((select sum(j2.charge) from public.print_jobs j2
              where j2.printer_id = p.id and j2.status = 'completed'), 0)
  from public.printers p
  left join public.print_jobs j on j.printer_id = p.id and j.status = 'completed'
  left join public.print_job_items i on i.job_id = j.id
  group by p.id, p.name
  order by p.name;
$$;


-- -----------------------------------------------------------------------------
-- Permissions: nothing for logged-out visitors.
-- -----------------------------------------------------------------------------
revoke all on table public.monthly_money from public, anon;
grant select, insert, update, delete on table public.monthly_money to authenticated;
grant all on table public.monthly_money to service_role;

revoke all on function public.money_by_month() from public, anon;
grant execute on function public.money_by_month() to authenticated, service_role;

revoke all on function public.print_stats_by_printer() from public, anon;
grant execute on function public.print_stats_by_printer() to authenticated, service_role;

revoke all on function public.uk_month(timestamptz) from public, anon;
grant execute on function public.uk_month(timestamptz) to authenticated, service_role;
