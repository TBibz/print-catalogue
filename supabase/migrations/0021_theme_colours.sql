-- =============================================================================
-- 0021_theme_colours.sql — customisable highlight, header and urgency colours
--
-- Run this whole file in the Supabase SQL Editor after
-- 0020_mark_invoice_sent.sql. Safe to run again.
--
-- 1. The colours live in settings, as "#rrggbb", under colour_ keys. Each
--    starts as the colour the app used before (the two new row highlights
--    get new light colours). Only the admin can change them (Settings →
--    Colours); everyone logged in can read them, so both see the result.
-- 2. model_printing(): how many of each model are on plates that are
--    printing right now (any item, requested or not), for the "Currently
--    printing" row highlight. Like model_print_totals(): ids and numbers
--    only, readable by both roles.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Colours (inserted only if missing, so a chosen colour is never reset)
-- -----------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('colour_row_printing',     '#dbeafe'),  -- new: light blue
  ('colour_row_new',          '#fef7d7'),  -- light gold (as before)
  ('colour_row_requested',    '#e3f5e8'),  -- new: light green
  ('colour_row_alt',          '#f3f1f8'),  -- soft lavender (as before)
  ('colour_head_catalogue',   '#3b2a5c'),  -- dark purple (as before)
  ('colour_head_queue',       '#3b2a5c'),
  ('colour_head_models',      '#3b2a5c'),
  ('colour_head_builder',     '#3b2a5c'),
  ('colour_invoice',          '#3b2a5c'),  -- invoice header row + Grand Total
  ('colour_urgency_asap',     '#9f0712'),  -- dark red (as before)
  ('colour_urgency_priority', '#dcfce7')   -- light green (as before)
on conflict (key) do nothing;

-- Reading: everyone logged in may read the company_ and colour_ keys;
-- everything else in settings stays admin only. (Writing is admin only, as
-- before.)
drop policy if exists "settings: read" on public.settings;
create policy "settings: read"
  on public.settings for select
  to authenticated
  using (key like 'company\_%' or key like 'colour\_%' or (select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 2. model_printing()
-- -----------------------------------------------------------------------------
create or replace function public.model_printing()
returns table (model_id uuid, printing int)
language sql
stable
security definer
set search_path = ''
as $$
  select i.model_id, sum(i.quantity_planned)::int
  from public.print_job_items i
  join public.print_jobs j on j.id = i.job_id
  where j.status = 'printing'
    and i.model_id is not null
  group by i.model_id;
$$;

revoke all on function public.model_printing() from public, anon;
grant execute on function public.model_printing() to authenticated, service_role;
