-- =============================================================================
-- 0015_bulk_default_scale.sql — set the default scale for a whole category
--
-- Run this whole file in the Supabase SQL Editor after
-- 0014_category_printer_colours.sql. Safe to run again.
--
-- set_category_default_scale(category, scale, only_unset, add_scales, dry_run)
--   * only_unset = true:  only models with no default scale yet
--     only_unset = false: every model in the category (overwrites)
--   * add_scales: extra sizes to add to those models' other sizes (optional)
--   * dry_run = true: change nothing, just say how many models would change
-- Returns how many models change (or would change). Admin only, and it all
-- happens in one step.
-- =============================================================================

-- The models that would change, with their new other sizes: each targeted
-- model's current other sizes (minus the new default) followed by any extra
-- sizes it doesn't have yet. Only models where something actually changes
-- are returned. Used by set_category_default_scale only.
create or replace function public.category_scale_changes(
  p_category_id uuid,
  p_scale       text,
  p_only_unset  boolean,
  p_add         text[]
)
returns table (id uuid, new_other text[])
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.new_other
  from (
    select
      m.id,
      m.default_scale,
      m.other_scales,
      array(
        select s from unnest(m.other_scales) with ordinality as u(s, o)
        where s <> p_scale order by o
      ) || array(
        select s from unnest(p_add) with ordinality as a(s, o)
        where not (s = any (m.other_scales)) order by o
      ) as new_other
    from public.models m
    where m.category_id = p_category_id
      and (not p_only_unset or nullif(btrim(coalesce(m.default_scale, '')), '') is null)
  ) t
  where t.default_scale is distinct from p_scale
     or t.new_other is distinct from t.other_scales;
$$;


create or replace function public.set_category_default_scale(
  p_category_id uuid,
  p_scale       text,
  p_only_unset  boolean,
  p_add_scales  text[] default '{}',
  p_dry_run     boolean default false
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scale text := nullif(btrim(coalesce(p_scale, '')), '');
  v_add   text[];
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change models.' using errcode = '42501';
  end if;
  if v_scale is null then
    raise exception 'Enter a scale, e.g. 70mm.';
  end if;
  if length(v_scale) > 20 then
    raise exception 'Sizes can be at most 20 characters.';
  end if;

  -- The extra sizes: trimmed, no blanks, no repeats, not the default, in
  -- the order typed.
  select coalesce(array_agg(s order by first_seen), '{}') into v_add
  from (
    select btrim(x) as s, min(o) as first_seen
    from unnest(coalesce(p_add_scales, '{}')) with ordinality as t(x, o)
    where btrim(x) <> '' and btrim(x) <> v_scale
    group by btrim(x)
  ) extras;
  if exists (select 1 from unnest(v_add) s where length(s) > 20) then
    raise exception 'Sizes can be at most 20 characters.';
  end if;

  if p_dry_run then
    select count(*)::int into v_count
    from public.category_scale_changes(p_category_id, v_scale, p_only_unset, v_add);
  else
    with changed as (
      update public.models m
      set default_scale = v_scale,
          other_scales = c.new_other
      from public.category_scale_changes(p_category_id, v_scale, p_only_unset, v_add) c
      where m.id = c.id
      returning m.id
    )
    select count(*)::int into v_count from changed;
  end if;

  return v_count;
end;
$$;

revoke all on function public.set_category_default_scale(uuid, text, boolean, text[], boolean) from public, anon;
grant execute on function public.set_category_default_scale(uuid, text, boolean, text[], boolean)
  to authenticated, service_role;

revoke all on function public.category_scale_changes(uuid, text, boolean, text[]) from public, anon, authenticated;
