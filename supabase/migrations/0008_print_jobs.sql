-- =============================================================================
-- 0008_print_jobs.sql — Phase 6a: print jobs
--
-- Run this whole file in the Supabase SQL Editor after 0007_seed_materials.sql.
-- Safe to run again.
--
-- What's in here:
--   * print_jobs (one job = one plate) and print_job_items, admin only
--   * request_line_printing: just "request line id + how many are printing",
--     so the requester can see printing amounts without seeing any job
--   * model_print_totals: successful prints per model (for the NEW badge)
--   * a guard on request_lines: nobody can lower a quantity below what is
--     printing, delete a line that is printing, or change its size
--   * the functions the app calls (RPC). Each runs as one transaction, so
--     either every change happens or none does:
--       start_print_job, complete_print_job, update_completed_result,
--       revert_print_job, cancel_print_job, update_print_job_details
--
-- Phase 6b (BASES colours) will add colour_material_id to request_lines and
-- print_job_items. The places that match an item to a request line are
-- marked "Phase 6b" below, so the colour can be added to the match there.
--
-- This project has "automatically expose new tables" turned OFF, so every
-- table, view and function gets explicit grants at the bottom of this file.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- print_jobs: one plate on one printer
-- -----------------------------------------------------------------------------
create table if not exists public.print_jobs (
  id                  uuid primary key default gen_random_uuid(),
  printer_id          uuid not null references public.printers (id),
  title               text not null default '',
  status              text not null default 'printing'
                      check (status in ('printing', 'completed', 'cancelled')),
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  notes               text not null default '',

  -- Slicer estimates. Which ones are required depends on the printer type
  -- (checked in set_print_job_details below):
  --   resin: est_material_ml, est_weight_g, print time, est_cost
  --   fdm:   est_weight_g, material_id
  est_material_ml     numeric(10, 2) check (est_material_ml > 0),
  est_weight_g        numeric(10, 2) check (est_weight_g > 0),
  print_hours         int check (print_hours >= 0),
  print_minutes       int check (print_minutes between 0 and 59),
  est_cost            numeric(10, 2) check (est_cost >= 0),
  layer_height_mm     numeric(6, 3) check (layer_height_mm > 0),
  material_id         uuid references public.materials (id),

  -- Money. Worked out from the estimates unless set by hand.
  my_cost             numeric(10, 2) not null default 0 check (my_cost >= 0),
  my_cost_overridden  boolean not null default false,
  charge              numeric(10, 2) not null default 0 check (charge >= 0),
  charge_overridden   boolean not null default false,

  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists print_jobs_status_idx on public.print_jobs (status);

alter table public.print_jobs enable row level security;

drop trigger if exists print_jobs_set_updated_at on public.print_jobs;
create trigger print_jobs_set_updated_at
  before update on public.print_jobs
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- print_job_items: what is on the plate
--   * from a request line (request_line_id set, model + size copied from it)
--   * a catalogue model nobody requested (model_id set, no request line)
--   * a free-text item that isn't in the catalogue (free_text_name only)
-- -----------------------------------------------------------------------------
create table if not exists public.print_job_items (
  id                          uuid primary key default gen_random_uuid(),
  job_id                      uuid not null references public.print_jobs (id) on delete cascade,
  -- No cascade: a model with print history can't be deleted (retire it).
  model_id                    uuid references public.models (id),
  free_text_name              text,
  -- Set to null if the request line is deleted (e.g. it reached 0 when this
  -- job was completed). The copies below let it be recreated on a revert.
  request_line_id             uuid references public.request_lines (id) on delete set null,
  -- true if the item came from a request line, even after that line is gone.
  from_request                boolean not null default false,
  scale                       text,
  -- Copies of the request line's urgency and note, so a line that was
  -- deleted can be recreated the same way.
  request_urgency             text check (request_urgency in ('ASAP', 'URGENT', 'PRIORITY')),
  request_note                text not null default '',

  quantity_planned            int not null check (quantity_planned > 0),
  -- null until the job is completed.
  quantity_succeeded          int check (quantity_succeeded >= 0 and quantity_succeeded <= quantity_planned),
  -- How much was actually taken off the request line, so edits and reverts
  -- put back exactly the right amount.
  quantity_applied_to_request int not null default 0 check (quantity_applied_to_request >= 0),

  created_at                  timestamptz not null default now(),

  constraint print_job_items_what check (
    model_id is not null or length(btrim(coalesce(free_text_name, ''))) > 0
  ),
  constraint print_job_items_request_needs_model check (
    not from_request or model_id is not null
  )
);

create index if not exists print_job_items_job_id_idx on public.print_job_items (job_id);
create index if not exists print_job_items_model_id_idx on public.print_job_items (model_id);
create index if not exists print_job_items_request_line_id_idx on public.print_job_items (request_line_id);

alter table public.print_job_items enable row level security;


-- -----------------------------------------------------------------------------
-- RLS: admin only, for both tables
-- -----------------------------------------------------------------------------
drop policy if exists "print_jobs: admin all" on public.print_jobs;
create policy "print_jobs: admin all"
  on public.print_jobs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "print_job_items: admin all" on public.print_job_items;
create policy "print_job_items: admin all"
  on public.print_job_items for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- request_line_printing: how many of each request line are printing.
-- Runs with its owner's rights (like catalogue_models), so the requester can
-- read it, but it only ever shows a line id and a number.
-- -----------------------------------------------------------------------------
create or replace view public.request_line_printing
with (security_invoker = false)
as
select
  i.request_line_id,
  sum(i.quantity_planned)::int as printing
from public.print_job_items i
join public.print_jobs j on j.id = i.job_id
where j.status = 'printing'
  and i.request_line_id is not null
group by i.request_line_id;


-- -----------------------------------------------------------------------------
-- model_print_totals: successful prints per model (completed jobs only).
-- The NEW badge hides once this reaches 4. No costs or job details.
-- -----------------------------------------------------------------------------
create or replace view public.model_print_totals
with (security_invoker = false)
as
select
  i.model_id,
  sum(i.quantity_succeeded)::int as printed_total
from public.print_job_items i
join public.print_jobs j on j.id = i.job_id
where j.status = 'completed'
  and i.model_id is not null
group by i.model_id;


-- -----------------------------------------------------------------------------
-- printing_for_line(): the number printing for one request line.
-- -----------------------------------------------------------------------------
create or replace function public.printing_for_line(p_line_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.quantity_planned), 0)::int
  from public.print_job_items i
  join public.print_jobs j on j.id = i.job_id
  where j.status = 'printing'
    and i.request_line_id = p_line_id;
$$;


-- -----------------------------------------------------------------------------
-- Guard on request_lines (for everyone, admin included):
--   * the quantity can't be lowered below what is printing
--   * a line that is printing can't be deleted (set to 0)
--   * the model or size of a line that is printing can't be changed
-- The print job functions below only ever lower a line by what a job has
-- just finished, so they never trip this.
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

  if new.quantity < old.quantity and new.quantity < v_printing then
    raise exception '% of these are being printed, so the quantity can''t go below %.', v_printing, v_printing;
  end if;

  return new;
end;
$$;

drop trigger if exists request_lines_printing_guard on public.request_lines;
create trigger request_lines_printing_guard
  before update or delete on public.request_lines
  for each row execute function public.request_lines_printing_guard();


-- =============================================================================
-- Helpers used by the RPC functions below. Not callable by the app directly.
-- =============================================================================

-- Raises an error unless the logged-in user is the admin.
create or replace function public.pj_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the admin can manage print jobs.' using errcode = '42501';
  end if;
end;
$$;


-- Reads a number from the job details (JSON). Blank or missing = null.
create or replace function public.pj_num(p_details jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_details ->> p_key, '')), '');
begin
  if v_text is null then
    return null;
  end if;
  return v_text::numeric;
exception when others then
  raise exception 'Please enter a number for %.', replace(p_key, '_', ' ');
end;
$$;


-- Checks the job details for the printer's type and writes them to the job.
-- Details (all optional in the JSON, which ones are required depends on the
-- printer type): title, notes, est_material_ml, est_weight_g, print_hours,
-- print_minutes, est_cost, layer_height_mm, material_id,
-- my_cost + my_cost_overridden, charge + charge_overridden.
create or replace function public.pj_set_details(
  p_job_id uuid,
  p_printer_id uuid,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_printer   public.printers%rowtype;
  v_material  public.materials%rowtype;
  v_ml        numeric := public.pj_num(p_details, 'est_material_ml');
  v_weight    numeric := public.pj_num(p_details, 'est_weight_g');
  v_hours     numeric := public.pj_num(p_details, 'print_hours');
  v_minutes   numeric := public.pj_num(p_details, 'print_minutes');
  v_est_cost  numeric := public.pj_num(p_details, 'est_cost');
  v_layer     numeric := public.pj_num(p_details, 'layer_height_mm');
  v_my_cost   numeric := public.pj_num(p_details, 'my_cost');
  v_charge    numeric := public.pj_num(p_details, 'charge');
  v_material_id uuid := nullif(btrim(coalesce(p_details ->> 'material_id', '')), '')::uuid;
  v_my_cost_over boolean := coalesce((p_details ->> 'my_cost_overridden')::boolean, false);
  v_charge_over  boolean := coalesce((p_details ->> 'charge_overridden')::boolean, false);
  v_title     text := btrim(coalesce(p_details ->> 'title', ''));
  v_notes     text := btrim(coalesce(p_details ->> 'notes', ''));
begin
  select * into v_printer from public.printers where id = p_printer_id;
  if not found then
    raise exception 'Please choose a printer.';
  end if;

  if length(v_title) > 200 then
    raise exception 'The title can be at most 200 characters.';
  end if;
  if length(v_notes) > 2000 then
    raise exception 'Notes can be at most 2000 characters.';
  end if;

  -- Print time: whole hours, and minutes from 0 to 59.
  if v_hours is not null and (v_hours < 0 or v_hours <> trunc(v_hours) or v_hours > 1000) then
    raise exception 'Print hours must be a whole number.';
  end if;
  if v_minutes is not null and (v_minutes < 0 or v_minutes > 59 or v_minutes <> trunc(v_minutes)) then
    raise exception 'Print minutes must be a whole number from 0 to 59.';
  end if;
  if v_hours is not null or v_minutes is not null then
    v_hours := coalesce(v_hours, 0);
    v_minutes := coalesce(v_minutes, 0);
  end if;

  if v_weight is not null and v_weight <= 0 then
    raise exception 'The estimated weight must be more than 0 g.';
  end if;

  if v_material_id is not null then
    select * into v_material from public.materials where id = v_material_id;
    if not found then
      raise exception 'That material no longer exists.';
    end if;
    if v_material.type <> v_printer.type then
      raise exception '% is not a material for the %.', v_material.name, v_printer.name;
    end if;
  end if;

  if v_printer.type = 'resin' then
    -- Resin: material ml, weight, print time and the slicer's cost are required.
    if v_ml is null or v_ml <= 0 then
      raise exception 'Enter the estimated resin in ml.';
    end if;
    if v_weight is null then
      raise exception 'Enter the estimated weight in g.';
    end if;
    if v_hours is null or (v_hours = 0 and v_minutes = 0) then
      raise exception 'Enter the print time.';
    end if;
    if v_est_cost is null or v_est_cost < 0 then
      raise exception 'Enter the estimated cost in £ from the slicer.';
    end if;
    if v_layer is null then
      v_layer := 0.05;
    elsif v_layer <= 0 or v_layer > 5 then
      raise exception 'The layer height must be more than 0 mm.';
    end if;
  else
    -- FDM: weight and filament are required; print time is optional.
    if v_weight is null then
      raise exception 'Enter the estimated weight in g.';
    end if;
    if v_material_id is null then
      raise exception 'Choose the filament.';
    end if;
    -- Resin-only fields don't apply.
    v_ml := null;
    v_est_cost := null;
    v_layer := null;
  end if;

  if v_my_cost_over and (v_my_cost is null or v_my_cost < 0) then
    raise exception 'Enter my cost in £.';
  end if;
  if v_charge_over and (v_charge is null or v_charge < 0) then
    raise exception 'Enter the charge in £.';
  end if;

  update public.print_jobs set
    printer_id         = p_printer_id,
    title              = v_title,
    notes              = v_notes,
    est_material_ml    = v_ml,
    est_weight_g       = v_weight,
    print_hours        = v_hours::int,
    print_minutes      = v_minutes::int,
    est_cost           = round(v_est_cost, 2),
    layer_height_mm    = v_layer,
    material_id        = v_material_id,
    my_cost_overridden = v_my_cost_over,
    my_cost            = case when v_my_cost_over then round(v_my_cost, 2) else my_cost end,
    charge_overridden  = v_charge_over,
    charge             = case when v_charge_over then round(v_charge, 2) else charge end
  where id = p_job_id;
end;
$$;


-- Works out my_cost and charge from the estimates (brief section 5) and
-- saves whichever of them hasn't been set by hand.
--   resin: my_cost = est_cost,               charge = weight ÷ resin_charge_divisor
--   fdm:   my_cost = weight × cost per g,    charge = weight × charge per g
-- Cancelled jobs, and completed jobs where nothing succeeded, charge 0.
-- A partly successful job is charged in full.
create or replace function public.pj_refresh_money(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job      public.print_jobs%rowtype;
  v_type     text;
  v_divisor  numeric;
  v_cost     numeric := 0;
  v_charge   numeric := 0;
  v_cpu      numeric;
  v_chpu     numeric;
  v_any_ok   boolean;
begin
  select * into v_job from public.print_jobs where id = p_job_id;
  select type into v_type from public.printers where id = v_job.printer_id;

  if v_type = 'resin' then
    select coalesce(nullif(value, '')::numeric, 15) into v_divisor
    from public.settings where key = 'resin_charge_divisor';
    v_divisor := coalesce(v_divisor, 15);
    v_cost := coalesce(v_job.est_cost, 0);
    v_charge := coalesce(v_job.est_weight_g, 0) / v_divisor;
  else
    select cost_per_unit, charge_per_unit into v_cpu, v_chpu
    from public.materials where id = v_job.material_id;
    v_cost := coalesce(v_job.est_weight_g, 0) * coalesce(v_cpu, 0);
    v_charge := coalesce(v_job.est_weight_g, 0) * coalesce(v_chpu, 0);
  end if;

  if v_job.status = 'cancelled' then
    v_charge := 0;
  elsif v_job.status = 'completed' then
    select coalesce(bool_or(quantity_succeeded > 0), false) into v_any_ok
    from public.print_job_items where job_id = p_job_id;
    if not v_any_ok then
      v_charge := 0;
    end if;
  end if;

  update public.print_jobs set
    my_cost = case when my_cost_overridden then my_cost else round(v_cost, 2) end,
    charge  = case when charge_overridden then charge else round(v_charge, 2) end
  where id = p_job_id;
end;
$$;


-- Puts `p_amount` back on the request line an item came from. If that line
-- has gone, adds to another line for the same model and size, or recreates
-- the line with the urgency and note it had.
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

  -- Another line for the same model and size. (Phase 6b: match colour too.)
  if v_line_id is null then
    update public.request_lines set quantity = quantity + p_amount
    where model_id = v_item.model_id
      and scale is not distinct from v_item.scale
    returning id into v_line_id;
  end if;

  -- Recreate it.
  if v_line_id is null then
    insert into public.request_lines (model_id, scale, quantity, urgency, note)
    values (v_item.model_id, v_item.scale, p_amount, v_item.request_urgency, v_item.request_note)
    returning id into v_line_id;
  end if;

  update public.print_job_items set request_line_id = v_line_id where id = p_item_id;
end;
$$;


-- Takes up to `p_wanted` off the item's request line and returns how many it
-- actually took. Never takes the line below what other jobs are printing.
-- A line that reaches 0 is deleted.
create or replace function public.pj_take_off(p_item_id uuid, p_wanted int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item   public.print_job_items%rowtype;
  v_line   public.request_lines%rowtype;
  v_take   int;
begin
  select * into v_item from public.print_job_items where id = p_item_id;
  if p_wanted <= 0 or v_item.request_line_id is null then
    return 0;
  end if;

  select * into v_line from public.request_lines
  where id = v_item.request_line_id
  for update;
  if not found then
    return 0;
  end if;

  v_take := least(p_wanted, v_line.quantity - public.printing_for_line(v_line.id));
  if v_take <= 0 then
    return 0;
  end if;

  -- Keep a copy of the line's urgency and note first, in case it's deleted.
  update public.print_job_items set
    request_urgency = v_line.urgency,
    request_note    = v_line.note
  where id = p_item_id;

  if v_line.quantity - v_take = 0 then
    delete from public.request_lines where id = v_line.id;
  else
    update public.request_lines set quantity = quantity - v_take where id = v_line.id;
  end if;
  return v_take;
end;
$$;


-- Reads { item_id: succeeded } pairs for a job and checks each value.
-- Items missing from the list count as all succeeded.
create or replace function public.pj_succeeded(p_item public.print_job_items, p_results jsonb)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value numeric;
begin
  v_value := public.pj_num(p_results, p_item.id::text);
  if v_value is null then
    return p_item.quantity_planned;
  end if;
  if v_value < 0 or v_value > p_item.quantity_planned or v_value <> trunc(v_value) then
    raise exception 'Succeeded must be a whole number from 0 to % for each item.', p_item.quantity_planned;
  end if;
  return v_value::int;
end;
$$;


-- =============================================================================
-- The functions the app calls (RPC). All admin only, each one transaction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- start_print_job(printer, details, items) → the new job's id
--
-- items: a JSON list, each one of
--   { "request_line_id": "...", "quantity": 2 }
--   { "model_id": "...", "scale": "70mm" or null, "quantity": 1 }
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
  v_job_id   uuid;
  v_item     jsonb;
  v_qty      numeric;
  v_line     public.request_lines%rowtype;
  v_model_id uuid;
  v_code     text;
  v_free     text;
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
      -- From a request line: model and size come from the line.
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
        job_id, model_id, request_line_id, from_request, scale,
        request_urgency, request_note, quantity_planned
      ) values (
        v_job_id, v_line.model_id, v_line.id, true, v_line.scale,
        v_line.urgency, v_line.note, v_qty::int
      );

    elsif nullif(v_item ->> 'model_id', '') is not null then
      -- A catalogue model nobody requested.
      v_model_id := (v_item ->> 'model_id')::uuid;
      if not exists (select 1 from public.models where id = v_model_id) then
        raise exception 'A model on this plate no longer exists.';
      end if;
      insert into public.print_job_items (job_id, model_id, scale, quantity_planned)
      values (
        v_job_id, v_model_id,
        nullif(btrim(coalesce(v_item ->> 'scale', '')), ''),
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
-- complete_print_job(job, results)
-- results: { "<item id>": succeeded, ... } (missing items = all succeeded)
--
-- For each item: take min(succeeded, line quantity) off its request line,
-- remember that amount in quantity_applied_to_request, delete the line if it
-- reaches 0. Failed units simply stop printing, so they're still wanted.
-- -----------------------------------------------------------------------------
create or replace function public.complete_print_job(p_job_id uuid, p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    public.print_job_items%rowtype;
  v_ok      int;
  v_applied int;
begin
  perform public.pj_require_admin();

  perform 1 from public.print_jobs where id = p_job_id and status = 'printing' for update;
  if not found then
    raise exception 'This job isn''t printing any more. Refresh the page.';
  end if;

  -- Completed first, so this job's items no longer count as printing.
  update public.print_jobs set status = 'completed', completed_at = now()
  where id = p_job_id;

  for v_item in select * from public.print_job_items where job_id = p_job_id loop
    v_ok := public.pj_succeeded(v_item, coalesce(p_results, '{}'::jsonb));
    -- Separate steps: pj_take_off also writes to this item's row.
    v_applied := public.pj_take_off(v_item.id, v_ok);
    update public.print_job_items set
      quantity_succeeded = v_ok,
      quantity_applied_to_request = v_applied
    where id = v_item.id;
  end loop;

  perform public.pj_refresh_money(p_job_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- update_completed_result(job, results): change the succeeded amounts of a
-- completed job. Only the difference is applied:
--   * fewer succeeded than were taken off the request → put the extra back
--     (recreating the line if it was deleted)
--   * more succeeded → take more off the line, if it still wants some
-- -----------------------------------------------------------------------------
create or replace function public.update_completed_result(p_job_id uuid, p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    public.print_job_items%rowtype;
  v_new     int;
  v_applied int;
  v_extra   int;
begin
  perform public.pj_require_admin();

  perform 1 from public.print_jobs where id = p_job_id and status = 'completed' for update;
  if not found then
    raise exception 'Only completed jobs can have their result changed. Refresh the page.';
  end if;

  for v_item in select * from public.print_job_items where job_id = p_job_id loop
    v_new := public.pj_succeeded(v_item, coalesce(p_results, '{}'::jsonb));
    v_applied := v_item.quantity_applied_to_request;

    if v_new < v_applied then
      perform public.pj_put_back(v_item.id, v_applied - v_new);
      v_applied := v_new;
    elsif v_new > v_item.quantity_succeeded and v_item.from_request then
      -- Only the successes beyond what has already been counted.
      v_extra := v_new - greatest(v_item.quantity_succeeded, v_applied);
      if v_extra > 0 then
        v_applied := v_applied + public.pj_take_off(v_item.id, v_extra);
      end if;
    end if;

    update public.print_job_items set
      quantity_succeeded = v_new,
      quantity_applied_to_request = v_applied
    where id = v_item.id;
  end loop;

  perform public.pj_refresh_money(p_job_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- revert_print_job(job): undo a completed job. Everything it took off the
-- request lines is put back, and the job goes back to printing.
-- -----------------------------------------------------------------------------
create or replace function public.revert_print_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.print_job_items%rowtype;
begin
  perform public.pj_require_admin();

  perform 1 from public.print_jobs where id = p_job_id and status = 'completed' for update;
  if not found then
    raise exception 'Only completed jobs can be reverted. Refresh the page.';
  end if;

  for v_item in select * from public.print_job_items where job_id = p_job_id loop
    perform public.pj_put_back(v_item.id, v_item.quantity_applied_to_request);
    update public.print_job_items set
      quantity_succeeded = null,
      quantity_applied_to_request = 0
    where id = v_item.id;
  end loop;

  update public.print_jobs set status = 'printing', completed_at = null
  where id = p_job_id;

  perform public.pj_refresh_money(p_job_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- cancel_print_job(job): stop a printing job. Nothing is counted; its items
-- simply stop printing, so the requests still want them.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_print_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pj_require_admin();

  update public.print_jobs set status = 'cancelled', cancelled_at = now()
  where id = p_job_id and status = 'printing';
  if not found then
    raise exception 'This job isn''t printing any more. Refresh the page.';
  end if;

  perform public.pj_refresh_money(p_job_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- update_print_job_details(job, printer, details): edit a job's printer,
-- title, notes, estimates and money, whatever its status. Same checks as
-- when starting it. Money not set by hand is worked out again.
-- -----------------------------------------------------------------------------
create or replace function public.update_print_job_details(
  p_job_id uuid,
  p_printer_id uuid,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pj_require_admin();

  perform 1 from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'This job no longer exists. Refresh the page.';
  end if;

  perform public.pj_set_details(p_job_id, p_printer_id, coalesce(p_details, '{}'::jsonb));
  perform public.pj_refresh_money(p_job_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------

-- Tables: nothing for logged-out visitors; logged-in users may try, and RLS
-- only lets the admin through.
revoke all on table public.print_jobs, public.print_job_items from public, anon;
grant select, insert, update, delete
  on table public.print_jobs, public.print_job_items
  to authenticated;
grant all on table public.print_jobs, public.print_job_items to service_role;

-- Views: read-only, logged-in users only.
revoke all on table public.request_line_printing, public.model_print_totals
  from public, anon, authenticated;
grant select on table public.request_line_printing, public.model_print_totals
  to authenticated, service_role;

-- RPC functions: logged-in users may call them; each checks for the admin.
revoke all on function
  public.start_print_job(uuid, jsonb, jsonb),
  public.complete_print_job(uuid, jsonb),
  public.update_completed_result(uuid, jsonb),
  public.revert_print_job(uuid),
  public.cancel_print_job(uuid),
  public.update_print_job_details(uuid, uuid, jsonb)
  from public, anon;
grant execute on function
  public.start_print_job(uuid, jsonb, jsonb),
  public.complete_print_job(uuid, jsonb),
  public.update_completed_result(uuid, jsonb),
  public.revert_print_job(uuid),
  public.cancel_print_job(uuid),
  public.update_print_job_details(uuid, uuid, jsonb)
  to authenticated, service_role;

-- Helpers and trigger functions: only used inside the functions above.
revoke all on function
  public.printing_for_line(uuid),
  public.request_lines_printing_guard(),
  public.pj_require_admin(),
  public.pj_num(jsonb, text),
  public.pj_set_details(uuid, uuid, jsonb),
  public.pj_refresh_money(uuid),
  public.pj_put_back(uuid, int),
  public.pj_take_off(uuid, int),
  public.pj_succeeded(public.print_job_items, jsonb)
  from public, anon, authenticated;
