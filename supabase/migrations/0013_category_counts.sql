-- =============================================================================
-- 0013_category_counts.sql — model counts per category, worked out in the
-- database
--
-- Run this whole file in the Supabase SQL Editor after 0012_money.sql.
-- Safe to run again.
--
-- category_model_counts: for each category, how many models it has in all
-- (including retired ones) and how many show in the catalogue (not
-- retired). Counting in the database means the numbers are right however
-- many models there are (Supabase only returns up to 1,000 rows per
-- request, so counting rows in the browser could silently come up short).
-- Readable by everyone logged in: it holds only ids and numbers.
-- =============================================================================

create or replace view public.category_model_counts
with (security_invoker = false)
as
select
  c.id as category_id,
  count(m.id)::int as total_models,
  count(m.id) filter (where m.availability <> 'hidden')::int as visible_models
from public.categories c
left join public.models m on m.category_id = c.id
group by c.id;

revoke all on table public.category_model_counts from public, anon, authenticated;
grant select on table public.category_model_counts to authenticated, service_role;
