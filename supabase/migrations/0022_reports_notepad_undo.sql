-- =============================================================================
-- 0022_reports_notepad_undo.sql — printing reports and notepad undo
--
-- Run this whole file in the Supabase SQL Editor after
-- 0021_theme_colours.sql. Safe to run again.
--
-- 1. Printing reports (Reports → Printing, admin only). Everything is
--    worked out here, never by counting rows in the browser. All use
--    completed print jobs only (cancelled ones are left out entirely),
--    dated by when they were completed in UK time. Plates where nothing
--    succeeded still count towards weight and cost (the material was
--    used); their charge is whatever was recorded.
--      report_jobs(from, to, printer)          the jobs in the period (helper)
--      print_report(from, to, printer, group)  one row per month or year
--      print_report_totals(from, to, printer)  the whole period
--      print_report_by_printer(from, to, printer)
--      print_report_top_models(from, to, printer, limit)
--    from / to are UK dates (either can be empty = no limit); printer
--    empty = all printers. They run as the caller, so RLS lets only the
--    admin see any jobs.
-- 2. Notepad undo: restore_notepad_line() puts back a line that was just
--    deleted, exactly as it was (same id, author, position, tick). The
--    admin can restore any line; anyone else only their own.
-- 3. A colour for the Reports table header and chart (Settings → Colours).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Printing reports
-- -----------------------------------------------------------------------------

-- The completed jobs in the period, with what each printed.
create or replace function public.report_jobs(p_from date, p_to date, p_printer uuid)
returns table (
  job_id        uuid,
  printer_id    uuid,
  done_on       date,     -- UK date it was completed
  est_weight_g  numeric,
  my_cost       numeric,
  charge        numeric,
  models        int       -- successful prints on the plate
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    j.id,
    j.printer_id,
    (j.completed_at at time zone 'Europe/London')::date,
    coalesce(j.est_weight_g, 0),
    j.my_cost,
    j.charge,
    coalesce((select sum(i.quantity_succeeded) from public.print_job_items i where i.job_id = j.id), 0)::int
  from public.print_jobs j
  where j.status = 'completed'
    and (p_from is null or (j.completed_at at time zone 'Europe/London')::date >= p_from)
    and (p_to is null or (j.completed_at at time zone 'Europe/London')::date <= p_to)
    and (p_printer is null or j.printer_id = p_printer);
$$;

-- One row per month (p_group = 'month') or year ('year'), newest first.
-- By month with both dates given, every month in between is listed, even
-- with nothing printed (so the chart has no gaps); by year, only years
-- with something printed.
create or replace function public.print_report(p_from date, p_to date, p_printer uuid, p_group text)
returns table (
  period        date,     -- first day of the month or year
  plates        int,
  models        int,
  est_weight_g  numeric,
  cost          numeric,
  charge        numeric,
  margin        numeric   -- charge − cost
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_unit text := case when p_group = 'year' then 'year' else 'month' end;
begin
  if p_group is distinct from 'month' and p_group is distinct from 'year' then
    raise exception 'Group by month or year.';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'The start date is after the end date.';
  end if;

  return query
  with per as (
    select
      date_trunc(v_unit, r.done_on)::date as p,
      count(*)::int as plates,
      sum(r.models)::int as models,
      sum(r.est_weight_g) as w,
      sum(r.my_cost) as c,
      sum(r.charge) as ch
    from public.report_jobs(p_from, p_to, p_printer) r
    group by 1
  ),
  periods as (
    select s::date as p
    from generate_series(
      date_trunc(v_unit, p_from), date_trunc(v_unit, p_to),
      case when v_unit = 'year' then interval '1 year' else interval '1 month' end
    ) s
    where v_unit = 'month' and p_from is not null and p_to is not null
    union
    select per.p from per
  )
  select
    periods.p,
    coalesce(per.plates, 0),
    coalesce(per.models, 0),
    coalesce(per.w, 0),
    coalesce(per.c, 0),
    coalesce(per.ch, 0),
    coalesce(per.ch, 0) - coalesce(per.c, 0)
  from periods
  left join per on per.p = periods.p
  order by periods.p desc;
end;
$$;

-- The whole period in one row (the summary cards and the totals row).
create or replace function public.print_report_totals(p_from date, p_to date, p_printer uuid)
returns table (plates int, models int, est_weight_g numeric, cost numeric, charge numeric, margin numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::int,
    coalesce(sum(r.models), 0)::int,
    coalesce(sum(r.est_weight_g), 0),
    coalesce(sum(r.my_cost), 0),
    coalesce(sum(r.charge), 0),
    coalesce(sum(r.charge), 0) - coalesce(sum(r.my_cost), 0)
  from public.report_jobs(p_from, p_to, p_printer) r;
$$;

-- Per printer for the period: every printer (or just the chosen one), even
-- with nothing printed.
create or replace function public.print_report_by_printer(p_from date, p_to date, p_printer uuid)
returns table (printer_id uuid, printer_name text, plates int, models int, charge numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.name,
    count(r.job_id)::int,
    coalesce(sum(r.models), 0)::int,
    coalesce(sum(r.charge), 0)
  from public.printers p
  left join public.report_jobs(p_from, p_to, p_printer) r on r.printer_id = p.id
  where p_printer is null or p.id = p_printer
  group by p.id, p.name
  order by p.name, p.id;
$$;

-- The most printed catalogue models in the period (successful prints).
create or replace function public.print_report_top_models(p_from date, p_to date, p_printer uuid, p_limit int)
returns table (model_id uuid, code text, name text, printed int)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.code, m.name, sum(i.quantity_succeeded)::int
  from public.report_jobs(p_from, p_to, p_printer) r
  join public.print_job_items i on i.job_id = r.job_id
  join public.models m on m.id = i.model_id
  group by m.id, m.code, m.name
  having sum(i.quantity_succeeded) > 0
  order by 4 desc, m.code, m.id
  limit greatest(coalesce(p_limit, 10), 0);
$$;


-- -----------------------------------------------------------------------------
-- 2. Notepad undo
-- -----------------------------------------------------------------------------

-- The guard (0003) normally makes every new line belong to whoever adds it
-- and starts it unticked. While a line is being restored (a flag set by
-- restore_notepad_line for that moment only), it's put back as it was.
create or replace function public.notepad_lines_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and current_setting('print_catalogue.restoring_note', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- New lines always belong to whoever adds them, and start unticked
    -- unless the admin adds them.
    new.created_by := auth.uid();
    if new.done and not public.is_admin() then
      raise exception 'Only the admin can tick notepad lines';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'The author of a notepad line cannot be changed';
    end if;
    if new.done is distinct from old.done and not public.is_admin() then
      raise exception 'Only the admin can tick notepad lines';
    end if;
  end if;

  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.restore_notepad_line(
  p_id          uuid,
  p_text        text,
  p_position    double precision,
  p_created_by  uuid,
  p_created_at  timestamptz,
  p_done        boolean,
  p_done_at     timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  if not (public.is_admin() or p_created_by = auth.uid()) then
    raise exception 'You can only restore your own lines.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_text, ''))) = 0 or length(p_text) > 500 then
    raise exception 'That line can''t be restored.';
  end if;
  if exists (select 1 from public.notepad_lines where id = p_id) then
    return; -- already back (e.g. Undo pressed twice)
  end if;

  perform set_config('print_catalogue.restoring_note', 'on', true);
  insert into public.notepad_lines (id, text, created_by, created_at, done, done_at, position)
  values (p_id, p_text, p_created_by, coalesce(p_created_at, now()), coalesce(p_done, false),
          case when p_done then p_done_at end, p_position);
  perform set_config('print_catalogue.restoring_note', 'off', true);
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Reports colour (readable by both roles through the colour_ keys)
-- -----------------------------------------------------------------------------
insert into public.settings (key, value) values ('colour_head_reports', '#3b2a5c')
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on function
  public.report_jobs(date, date, uuid),
  public.print_report(date, date, uuid, text),
  public.print_report_totals(date, date, uuid),
  public.print_report_by_printer(date, date, uuid),
  public.print_report_top_models(date, date, uuid, int),
  public.restore_notepad_line(uuid, text, double precision, uuid, timestamptz, boolean, timestamptz)
  from public, anon;
grant execute on function
  public.report_jobs(date, date, uuid),
  public.print_report(date, date, uuid, text),
  public.print_report_totals(date, date, uuid),
  public.print_report_by_printer(date, date, uuid),
  public.print_report_top_models(date, date, uuid, int),
  public.restore_notepad_line(uuid, text, double precision, uuid, timestamptz, boolean, timestamptz)
  to authenticated, service_role;
revoke all on function public.notepad_lines_guard() from public, anon, authenticated;
