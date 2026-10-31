-- =============================================================================
-- 0010_colours.sql — Phase 6b: colour choices (e.g. for BASES)
--
-- Run this whole file in the Supabase SQL Editor after 0009_delete_print_job.sql.
-- Safe to run again.
--
-- What's in here:
--   * colour_material_id on request_lines and print_job_items
--     (null = "Any colour"; otherwise a filament from Materials)
--   * one request line per model + size + colour (nulls count as equal)
--   * colour_options: the filament colours the catalogue may show, readable
--     by the requester (names and stock only, no prices)
--   * a check that a new colour choice is a filament that is offered as a
--     colour, in stock, and for a model whose category has colour options
--   * the printing guard also blocks changing the colour while printing
--   * start_print_job and pj_put_back (used by edit result, revert and
--     delete) now carry the colour from request line to job item and back
--   * BASES is marked as having colour options
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
alter table public.request_lines
  add column if not exists colour_material_id uuid references public.materials (id);

alter table public.print_job_items
  add column if not exists colour_material_id uuid references public.materials (id);

create index if not exists request_lines_colour_material_id_idx
  on public.request_lines (colour_material_id);
create index if not exists print_job_items_colour_material_id_idx
  on public.print_job_items (colour_material_id);


-- -----------------------------------------------------------------------------
-- One line per model + size + colour. "nulls not distinct": two lines with
-- the default size, or with "Any colour", count as the same.
-- -----------------------------------------------------------------------------
alter table public.request_lines
  drop constraint if exists request_lines_model_scale_key;
alter table public.request_lines
  drop constraint if exists request_lines_model_scale_colour_key;
alter table public.request_lines
  add constraint request_lines_model_scale_colour_key
  unique nulls not distinct (model_id, scale, colour_material_id);


-- -----------------------------------------------------------------------------
-- colour_options: filament colours for the catalogue's colour dropdown.
-- Shows materials offered as a colour, plus any colour an existing request
-- still uses (so a colour that's gone out of stock or been withdrawn isn't
-- lost). Runs with its owner's rights, like catalogue_models, and shows no
-- prices.
-- -----------------------------------------------------------------------------
create or replace view public.colour_options
with (security_invoker = false)
as
select
  m.id,
  m.name,
  m.colour,
  -- Can be chosen for new requests.
  (m.offer_as_colour and m.in_stock and m.active) as available,
  m.in_stock
from public.materials m
where m.type = 'fdm'
  and (
    m.offer_as_colour
    or m.id in (select colour_material_id from public.request_lines where colour_material_id is not null)
  );


-- -----------------------------------------------------------------------------
-- Check a colour when it is first chosen (or changed). A line keeps its
-- colour even if that colour later goes out of stock.
-- -----------------------------------------------------------------------------
create or replace function public.request_lines_colour_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.colour_material_id is null then
    return new;
  end if;
  -- pj_put_back (below) is recreating a line that existed before: it keeps
  -- its colour even if that colour is now out of stock. Only pj_put_back
  -- sets this flag (the app can't call set_config).
  if coalesce(current_setting('print_catalogue.restoring', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.colour_material_id is not distinct from old.colour_material_id
     and new.model_id = old.model_id then
    return new;
  end if;

  select c.has_colour_options into v_ok
  from public.models mo
  join public.categories c on c.id = mo.category_id
  where mo.id = new.model_id;
  if not coalesce(v_ok, false) then
    raise exception 'This model can''t be requested in a colour.';
  end if;

  if not exists (
    select 1 from public.materials
    where id = new.colour_material_id
      and type = 'fdm' and offer_as_colour and in_stock and active
  ) then
    raise exception 'That colour isn''t available any more. Please choose another.';
  end if;
  return new;
end;
$$;

drop trigger if exists request_lines_colour_check on public.request_lines;
create trigger request_lines_colour_check
  before insert or update on public.request_lines
  for each row execute function public.request_lines_colour_check();


-- -----------------------------------------------------------------------------
-- Printing guard (from 0008), now also covering the colour.
-- -----------------------------------------------------------------------------
create or replace function public.request_lines_printing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_printing int := public.printing_for_line(old.id);
begin
  if v_printing = 0 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception '% of these are being printed, so the request can''t be removed.', v_printing;
  end if;

  if new.model_id <> old.model_id or new.scale is distinct from old.scale then
    raise exception 'Some of these are being printed, so the size can''t be changed.';
  end if;

  if new.colour_material_id is distinct from old.colour_material_id then
    raise exception 'Some of these are being printed, so the colour can''t be changed.';
  end if;

  if new.quantity < old.quantity and new.quantity < v_printing then
    raise exception '% of these are being printed, so the quantity can''t go below %.', v_printing, v_printing;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- pj_put_back (from 0008), now matching and recreating with the colour.
-- Puts `p_amount` back on the request line an item came from. If that line
-- has gone, adds to another line for the same model, size and colour, or
-- recreates the line with the urgency and note it had.
-- -----------------------------------------------------------------------------
create or replace function public.pj_put_back(p_item_id uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    public.print_job_items%rowtype;
  v_line_id uuid;
begin
  if p_amount <= 0 then
    return;
  end if;
  select * into v_item from public.print_job_items where id = p_item_id;

  -- The original line, if it still exists.
  if v_item.request_line_id is not null then
    update public.request_lines set quantity = quantity + p_amount
    where id = v_item.request_line_id
    returning id into v_line_id;
  end if;

  -- Another line for the same model, size and colour.
  if v_line_id is null then
    update public.request_lines set quantity = quantity + p_amount
    where model_id = v_item.model_id
      and scale is not distinct from v_item.scale
      and colour_material_id is not distinct from v_item.colour_material_id
    returning id into v_line_id;
  end if;

  -- Recreate it. The flag tells the colour check to let it keep its
  -- colour, even if that colour is now out of stock.
  if v_line_id is null then
    perform set_config('print_catalogue.restoring', 'on', true);
    insert into public.request_lines (model_id, scale, colour_material_id, quantity, urgency, note)
    values (v_item.model_id, v_item.scale, v_item.colour_material_id, p_amount,
            v_item.request_urgency, v_item.request_note)
    returning id into v_line_id;
    perform set_config('print_catalogue.restoring', 'off', true);
  end if;

  update public.print_job_items set request_line_id = v_line_id where id = p_item_id;
end;
$$;



-- -----------------------------------------------------------------------------
-- start_print_job (from 0008), now copying the colour.
--
-- items: a JSON list, each one of
--   { "request_line_id": "...", "quantity": 2 }
--   { "model_id": "...", "scale": "70mm" or null, "colour_material_id": "..." or null, "quantity": 1 }
--   { "free_text_name": "Spare part", "quantity": 1 }
-- A request line can't have more on plates than it still wants: the quantity
-- must be at most (line quantity − already printing).
-- -----------------------------------------------------------------------------
create or replace function public.start_print_job(
  p_printer_id uuid,
  p_details jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id    uuid;
  v_item      jsonb;
  v_qty       numeric;
  v_line      public.request_lines%rowtype;
  v_model_id  uuid;
  v_colour_id uuid;
  v_code      text;
  v_free      text;
  v_unclaimed int;
begin
  perform public.pj_require_admin();

  if (select active from public.printers where id = p_printer_id) is distinct from true then
    raise exception 'Please choose a printer that is in use.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the plate.';
  end if;

  insert into public.print_jobs (printer_id) values (p_printer_id)
  returning id into v_job_id;
  perform public.pj_set_details(v_job_id, p_printer_id, coalesce(p_details, '{}'::jsonb));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := public.pj_num(v_item, 'quantity');
    if v_qty is null or v_qty < 1 or v_qty <> trunc(v_qty) or v_qty > 9999 then
      raise exception 'Each item needs a whole-number quantity of at least 1.';
    end if;

    if nullif(v_item ->> 'request_line_id', '') is not null then
      -- From a request line: model, size and colour come from the line.
      select * into v_line from public.request_lines
      where id = (v_item ->> 'request_line_id')::uuid
      for update;
      if not found then
        raise exception 'A request on this plate no longer exists. Refresh the page and try again.';
      end if;
      select code into v_code from public.models where id = v_line.model_id;

      -- This job's own earlier items already count as printing here.
      v_unclaimed := v_line.quantity - public.printing_for_line(v_line.id);
      if v_qty > v_unclaimed then
        raise exception '% only has % left to print (asked for %).', v_code, greatest(v_unclaimed, 0), v_qty;
      end if;

      insert into public.print_job_items (
        job_id, model_id, request_line_id, from_request, scale, colour_material_id,
        request_urgency, request_note, quantity_planned
      ) values (
        v_job_id, v_line.model_id, v_line.id, true, v_line.scale, v_line.colour_material_id,
        v_line.urgency, v_line.note, v_qty::int
      );

    elsif nullif(v_item ->> 'model_id', '') is not null then
      -- A catalogue model nobody requested.
      v_model_id := (v_item ->> 'model_id')::uuid;
      if not exists (select 1 from public.models where id = v_model_id) then
        raise exception 'A model on this plate no longer exists.';
      end if;
      v_colour_id := nullif(v_item ->> 'colour_material_id', '')::uuid;
      if v_colour_id is not null
         and not exists (select 1 from public.materials where id = v_colour_id and type = 'fdm') then
        raise exception 'That colour no longer exists.';
      end if;
      insert into public.print_job_items (job_id, model_id, scale, colour_material_id, quantity_planned)
      values (
        v_job_id, v_model_id,
        nullif(btrim(coalesce(v_item ->> 'scale', '')), ''),
        v_colour_id,
        v_qty::int
      );

    else
      -- Something that isn't in the catalogue.
      v_free := btrim(coalesce(v_item ->> 'free_text_name', ''));
      if v_free = '' then
        raise exception 'Each free-text item needs a name.';
      end if;
      if length(v_free) > 200 then
        raise exception 'Item names can be at most 200 characters.';
      end if;
      insert into public.print_job_items (job_id, free_text_name, quantity_planned)
      values (v_job_id, v_free, v_qty::int);
    end if;
  end loop;

  perform public.pj_refresh_money(v_job_id);
  return v_job_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- BASES can be requested in colours straight away.
-- -----------------------------------------------------------------------------
update public.categories set has_colour_options = true
where upper(btrim(name)) = 'BASES';


-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on table public.colour_options from public, anon, authenticated;
grant select on table public.colour_options to authenticated, service_role;

revoke all on function public.request_lines_colour_check() from public, anon, authenticated;
