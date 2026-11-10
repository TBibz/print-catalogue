-- =============================================================================
-- 0026_resin_divisor_all_jobs.sql — the resin charge divisor applies to
-- every resin job, not just jobs edited after it changes
--
-- Run this whole file in the Supabase SQL Editor after
-- 0025_job_material_rates.sql. Safe to run again (a second run changes
-- nothing and reports 0 jobs changed). It is one transaction (begin …
-- commit): if anything fails, nothing is changed. The last statement is a
-- short report you can read in the Results tab.
--
-- What's in here:
--   * pj_resin_charge_changes(divisor): helper (not callable by the app)
--     listing the resin jobs whose charge would change at that divisor, with
--     the old and new charge. Which jobs count:
--       - resin printer, status printing or completed
--       - chargeable (not "Not charged") and charge not set by hand
--       - not a completed job where nothing succeeded (those charge £0)
--     Cancelled jobs, hand-typed charges, not-charged jobs and FDM jobs are
--     never touched. my_cost is never touched.
--   * set_resin_charge_divisor(divisor, apply): admin only, one transaction.
--       apply = false: dry run, changes nothing, returns
--                      jobs_changed, total_before, total_after
--       apply = true:  saves the setting and recalculates those jobs'
--                      charge = est_weight_g ÷ divisor (to the penny), and
--                      returns the same figures
--     The Settings page calls it with false to show "This will change the
--     charge on N resin jobs (total £X → £Y)", then true on confirm.
--   * One-off: recalculates existing resin jobs at the CURRENT setting
--     (settings.resin_charge_divisor, 15 if missing). Only print_jobs.charge
--     changes, on the jobs listed above; updated_at is left as it was
--     (the trigger is switched off for that one update, then back on).
-- =============================================================================

begin;


-- -----------------------------------------------------------------------------
-- Helper: the resin jobs whose charge differs from est_weight_g ÷ divisor.
-- Same rule as pj_refresh_money (0025) for resin charges.
-- -----------------------------------------------------------------------------
create or replace function public.pj_resin_charge_changes(p_divisor numeric)
returns table (job_id uuid, old_charge numeric, new_charge numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.charge, round(j.est_weight_g / p_divisor, 2)
  from public.print_jobs j
  join public.printers p on p.id = j.printer_id
  where p.type = 'resin'
    and j.status in ('printing', 'completed')
    and j.chargeable
    and not j.charge_overridden
    and j.est_weight_g is not null
    -- A completed job where nothing succeeded charges £0; leave it.
    and not (j.status = 'completed'
             and not exists (select 1 from public.print_job_items i
                             where i.job_id = j.id and i.quantity_succeeded > 0))
    and j.charge <> round(j.est_weight_g / p_divisor, 2);
$$;


-- -----------------------------------------------------------------------------
-- The function the Settings page calls.
-- -----------------------------------------------------------------------------
create or replace function public.set_resin_charge_divisor(p_divisor numeric, p_apply boolean)
returns table (jobs_changed int, total_before numeric, total_after numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pj_require_admin();

  if p_divisor is null or p_divisor <= 0 or p_divisor > 10000 then
    raise exception 'Enter a number above 0, e.g. 15.';
  end if;

  -- The figures, worked out before anything changes.
  select count(*)::int, coalesce(sum(c.old_charge), 0), coalesce(sum(c.new_charge), 0)
    into jobs_changed, total_before, total_after
  from public.pj_resin_charge_changes(p_divisor) c;

  if p_apply then
    insert into public.settings (key, value)
    values ('resin_charge_divisor', trim_scale(p_divisor)::text)
    on conflict (key) do update set value = excluded.value;

    update public.print_jobs j set charge = c.new_charge
    from public.pj_resin_charge_changes(p_divisor) c
    where j.id = c.job_id;
  end if;

  return next;
end;
$$;


-- -----------------------------------------------------------------------------
-- One-off: bring existing resin jobs in line with the current setting.
-- The report figures are kept in a temporary table for the last statement.
-- -----------------------------------------------------------------------------
drop table if exists pg_temp.resin_divisor_0026;
create temp table resin_divisor_0026 as
select
  d.divisor,
  count(c.job_id)::int                as jobs_changed,
  coalesce(sum(c.old_charge), 0)      as total_charge_before,
  coalesce(sum(c.new_charge), 0)      as total_charge_after
from (
  select coalesce((select nullif(value, '')::numeric from public.settings
                   where key = 'resin_charge_divisor'), 15) as divisor
) d
left join lateral public.pj_resin_charge_changes(d.divisor) c on true
group by d.divisor;

do $$
begin
  if (select divisor from pg_temp.resin_divisor_0026) <= 0 then
    raise exception 'The resin charge divisor in Settings must be above 0.';
  end if;
end;
$$;

alter table public.print_jobs disable trigger print_jobs_set_updated_at;

update public.print_jobs j set charge = c.new_charge
from public.pj_resin_charge_changes((select divisor from pg_temp.resin_divisor_0026)) c
where j.id = c.job_id;

alter table public.print_jobs enable trigger print_jobs_set_updated_at;


-- -----------------------------------------------------------------------------
-- Permissions. The helper isn't callable by the app; the Settings function
-- is callable by logged-in users and checks for the admin itself.
-- -----------------------------------------------------------------------------
revoke all on function public.pj_resin_charge_changes(numeric) from public, anon, authenticated;
revoke all on function public.set_resin_charge_divisor(numeric, boolean) from public, anon;
grant execute on function public.set_resin_charge_divisor(numeric, boolean) to authenticated, service_role;


commit;


-- -----------------------------------------------------------------------------
-- Report (read only): the divisor used, how many resin jobs had their
-- charge changed, and the total of those charges before and after.
-- -----------------------------------------------------------------------------
select * from pg_temp.resin_divisor_0026;
