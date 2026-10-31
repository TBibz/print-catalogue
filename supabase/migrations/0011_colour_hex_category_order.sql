-- =============================================================================
-- 0011_colour_hex_category_order.sql — true material colours, category order
--
-- Run this whole file in the Supabase SQL Editor after 0010_colours.sql.
-- Safe to run again.
--
-- 1. materials.colour_hex: the colour shown for a material, e.g. '#111111'.
--    Filled in once from the colour names (the mapping the app used before);
--    unknown names get a neutral grey. From now on it's set on the
--    Materials page with a colour picker.
-- 2. colour_options (the requester's colour list) now includes colour_hex,
--    and lists every filament offered as a colour, in stock or not (out of
--    stock ones can't be chosen for new requests: "available" is false).
-- 3. Category order: categories get positions 1, 2, 3… (A→Z the first
--    time), and reorder_categories() saves a new order in one step.
--    Why sort order 1 went to the bottom before: every category started at
--    0 and the order is "lowest first", so 1 came after all the 0s.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. colour_hex
-- -----------------------------------------------------------------------------
alter table public.materials
  add column if not exists colour_hex text not null default '#9ca3af';

alter table public.materials
  drop constraint if exists materials_colour_hex_format;
alter table public.materials
  add constraint materials_colour_hex_format check (colour_hex ~ '^#[0-9a-f]{6}$');

-- Backfill from the colour name, only where it's still the default grey (so
-- running this again never overwrites a colour picked on the Materials page).
update public.materials set colour_hex = case lower(btrim(colour))
    when 'black'    then '#111111'
    when 'white'    then '#ffffff'
    when 'grey'     then '#9ca3af'
    when 'gray'     then '#9ca3af'
    when 'silver'   then '#c0c0c0'
    when 'red'      then '#dc2626'
    when 'orange'   then '#f97316'
    when 'yellow'   then '#facc15'
    when 'green'    then '#16a34a'
    when 'blue'     then '#2563eb'
    when 'sky blue' then '#7dd3fc'
    when 'purple'   then '#9333ea'
    when 'pink'     then '#f472b6'
    when 'brown'    then '#92400e'
    when 'gold'     then '#d4a017'
    when 'marble'   then '#d6d3d1'
    else '#9ca3af'
  end
where colour_hex = '#9ca3af';


-- -----------------------------------------------------------------------------
-- 2. colour_options, now with colour_hex. Dropped and recreated because a
-- column is added in the middle. Lists filaments offered as a colour (and
-- not retired), plus any colour an existing request still uses.
-- -----------------------------------------------------------------------------
drop view if exists public.colour_options;
create view public.colour_options
with (security_invoker = false)
as
select
  m.id,
  m.name,
  m.colour,
  m.colour_hex,
  -- Can be chosen for new requests.
  (m.offer_as_colour and m.in_stock and m.active) as available,
  m.in_stock
from public.materials m
where m.type = 'fdm'
  and (
    (m.offer_as_colour and m.active)
    or m.id in (select colour_material_id from public.request_lines where colour_material_id is not null)
  );

revoke all on table public.colour_options from public, anon, authenticated;
grant select on table public.colour_options to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. Category order
-- -----------------------------------------------------------------------------

-- Give every category its own position, A→Z, unless they already have
-- distinct positions (i.e. they've been ordered on the Categories page).
update public.categories c set sort_order = ordered.position
from (
  select id, row_number() over (order by name) as position
  from public.categories
) ordered
where c.id = ordered.id
  and (select count(distinct sort_order) from public.categories)
      < (select count(*) from public.categories);

-- Saves a new order: the categories in p_ids get positions 1, 2, 3… in that
-- order. Runs as the caller, so RLS only lets the admin change anything.
create or replace function public.reorder_categories(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.categories c
  set sort_order = t.position
  from unnest(p_ids) with ordinality as t(id, position)
  where c.id = t.id;
$$;

revoke all on function public.reorder_categories(uuid[]) from public, anon;
grant execute on function public.reorder_categories(uuid[]) to authenticated, service_role;
