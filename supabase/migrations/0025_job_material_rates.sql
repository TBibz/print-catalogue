-- =============================================================================
-- 0025_job_material_rates.sql — resin cost from weight × price per g, and
-- each job keeps the material prices it was started with
--
-- Run this whole file in the Supabase SQL Editor after 0024_chargeable_jobs.sql.
-- Safe to run again. It is one transaction (begin … commit): if anything
-- fails, nothing is changed. The last statement (after commit) is a short
-- report you can read in the Results tab.
--
-- NO EXISTING JOB'S MONEY CHANGES. Nothing is dropped, renamed or deleted,
-- and no job's my_cost or charge is recalculated by this file:
--   * The two new columns start empty.
--   * FDM jobs get their material's CURRENT cost and charge per g copied in.
--     Prices haven't changed since those jobs were started, so working them
--     out again later gives exactly the figures they have now. Only rows
--     that are still empty are filled, so running this again never
--     overwrites a saved price. The updated_at trigger is switched off for
--     this one update (and straight back on), so updated_at doesn't move.
--   * Resin jobs keep empty columns. That marks them as "old resin jobs",
--     which keep using est_cost (the slicer's cost) for ever, edited or not.
--
-- What's in here:
--   * print_jobs.material_cost_per_unit, print_jobs.material_charge_per_unit:
--     the material's cost_per_unit / charge_per_unit when the job was
--     started (or when its material was last changed).
--   * materials: resin may now be measured in g as well as ml (filament
--     stays g only). Resin is bought by weight.
--   * pj_set_details: saves the rates on a new job (start_print_job and
--     repeat_print_job both go through it) and on an edit only when the
--     material changes; new resin jobs need a resin measured in g and no
--     longer take est_cost.
--   * pj_refresh_money: works money out from the job's saved rates, never
--     the material's current price.
--       resin, new:  my_cost = weight × saved cost per g
--       resin, old (saved cost per g empty): my_cost = est_cost, as before
--       fdm:         my_cost = weight × saved cost per g,
--                    charge  = weight × saved charge per g
--     The resin charge is unchanged: weight ÷ resin_charge_divisor.
--   * repeat_print_job: a clear message if the old resin job has no resin
--     measured in g (the copy is a new job, so it follows the new rule and
--     uses today's prices).
--
-- Not changed, and why:
--   * start_print_job (0010) and update_print_job_details (0008) call
--     pj_set_details then pj_refresh_money, so they pick all of this up as
--     they are. complete / update result / revert / cancel only call
--     pj_refresh_money, so they now use the saved rates too.
--   * money_by_month (0012) and the report functions (0022) add up the
--     stored my_cost and charge, which this file doesn't touch.
--
-- Deploy order: run this first, then deploy the app straight after. Until
-- the new app is live, starting a RESIN job from the old app only works with
-- a resin measured in g chosen (filament jobs work as normal).
-- =============================================================================

begin;


-- -----------------------------------------------------------------------------
-- 1. The new columns (same precision as materials.cost_per_unit).
-- -----------------------------------------------------------------------------
alter table public.print_jobs
  add column if not exists material_cost_per_unit   numeric(12, 6) check (material_cost_per_unit >= 0),
  add column if not exists material_charge_per_unit numeric(12, 6) check (material_charge_per_unit >= 0);

comment on column public.print_jobs.material_cost_per_unit is
  'The material''s cost_per_unit when the job was started (or its material last changed). Empty on resin jobs from before 0025, which use est_cost.';
comment on column public.print_jobs.material_charge_per_unit is
  'The material''s charge_per_unit when the job was started (or its material last changed).';


-- -----------------------------------------------------------------------------
-- 2. Fill them in for existing FDM jobs from their material's current
--    prices (unchanged since they were started). Only empty rows, so a
--    second run changes nothing. updated_at is left as it was.
-- -----------------------------------------------------------------------------
alter table public.print_jobs disable trigger print_jobs_set_updated_at;

update public.print_jobs j set
  material_cost_per_unit   = m.cost_per_unit,
  material_charge_per_unit = m.charge_per_unit
from public.printers p, public.materials m
where p.id = j.printer_id
  and p.type = 'fdm'
  and m.id = j.material_id
  and j.material_cost_per_unit is null;

alter table public.print_jobs enable trigger print_jobs_set_updated_at;


-- -----------------------------------------------------------------------------
-- 3. Resin may be measured in g (or ml, for materials not yet changed).
-- -----------------------------------------------------------------------------
alter table public.materials drop constraint if exists materials_unit_matches_type;
alter table public.materials add constraint materials_unit_matches_type
  check ((type = 'resin' and unit in ('ml', 'g')) or (type = 'fdm' and unit = 'g'));


-- -----------------------------------------------------------------------------
-- 4. pj_set_details (from 0024_chargeable_jobs.sql). Unchanged apart from
--    the lines marked "0025".
--
-- Checks the job details for the printer's type and writes them to the job.
-- Details (all optional in the JSON, which ones are required depends on the
-- printer type): title, notes, est_material_ml, est_weight_g, print_hours,
-- print_minutes, est_cost, layer_height_mm, material_id,
-- my_cost + my_cost_overridden, charge + charge_overridden, chargeable.
--
-- 0025, which resin rule applies:
--   * An OLD resin job (saved cost per g empty and an est_cost, i.e. resin
--     jobs from before 0025) keeps the old rule for good: est_cost required,
--     resin optional, my_cost = est_cost. Changing its resin doesn't change
--     that, so editing an old job never changes how its cost is worked out.
--   * Every other resin job (all new ones, including repeats; a new job has
--     no est_cost yet when this runs) needs a resin measured in g, and
--     est_cost is not used (saved as empty).
-- 0025, the saved rates: copied from the material when the job is new (no
-- rates saved yet) or its material changes; otherwise kept as they are.
-- -----------------------------------------------------------------------------
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
  v_old       public.print_jobs%rowtype;  -- 0025: the job as it is now
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
  v_chargeable boolean;  -- 0024: null = not given, keep the current setting
  v_old_resin  boolean;  -- 0025: an old resin job, costed from est_cost
  v_new_rates  boolean;  -- 0025: copy the material's prices onto the job
begin
  select * into v_printer from public.printers where id = p_printer_id;
  if not found then
    raise exception 'Please choose a printer.';
  end if;

  -- 0025: an old resin job = no saved cost per g, but an est_cost. (A new
  -- job has neither yet; every FDM job has a saved cost per g.)
  select * into v_old from public.print_jobs where id = p_job_id;
  v_old_resin := v_printer.type = 'resin'
                 and v_old.material_cost_per_unit is null
                 and v_old.est_cost is not null;

  -- 0024: "chargeable", if the app sent it (true or false).
  if p_details ? 'chargeable' and jsonb_typeof(p_details -> 'chargeable') <> 'null' then
    if jsonb_typeof(p_details -> 'chargeable') <> 'boolean' then
      raise exception 'Chargeable must be true or false.';
    end if;
    v_chargeable := (p_details ->> 'chargeable')::boolean;
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
    -- Resin: material ml, weight and print time are required.
    if v_ml is null or v_ml <= 0 then
      raise exception 'Enter the estimated resin in ml.';
    end if;
    if v_weight is null then
      raise exception 'Enter the estimated weight in g.';
    end if;
    if v_hours is null or (v_hours = 0 and v_minutes = 0) then
      raise exception 'Enter the print time.';
    end if;
    if v_old_resin then
      -- 0025: old resin job: the slicer's cost, as before; resin optional.
      if v_est_cost is null or v_est_cost < 0 then
        raise exception 'Enter the estimated cost in £ from the slicer.';
      end if;
    else
      -- 0025: cost = weight × the resin's price per g, so the resin is
      -- required and must be measured in g. est_cost isn't used.
      if v_material_id is null or v_material.unit <> 'g' then
        raise exception 'Choose a resin measured in grams (g) – check the unit on the Materials page.';
      end if;
      v_est_cost := null;
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

  -- 0025: new prices only for a new job (none saved yet) or a new material.
  -- Old resin jobs keep theirs empty, so they stay on est_cost.
  v_new_rates := not v_old_resin
                 and (v_old.material_cost_per_unit is null
                      or v_material_id is distinct from v_old.material_id);

  if v_my_cost_over and (v_my_cost is null or v_my_cost < 0) then
    raise exception 'Enter my cost in £.';
  end if;
  -- 0024: a charge typed by hand only matters on a chargeable job
  -- (pj_refresh_money sets the charge to 0 otherwise).
  if v_charge_over and coalesce(v_chargeable, true) and (v_charge is null or v_charge < 0) then
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
    charge             = case when v_charge_over then round(coalesce(v_charge, 0), 2) else charge end,  -- 0024: coalesce, for a blank hand-typed charge on a job that isn't chargeable
    chargeable         = coalesce(v_chargeable, chargeable),  -- 0024
    material_cost_per_unit   = case when v_new_rates then v_material.cost_per_unit   else material_cost_per_unit   end,  -- 0025
    material_charge_per_unit = case when v_new_rates then v_material.charge_per_unit else material_charge_per_unit end   -- 0025
  where id = p_job_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. pj_refresh_money (from 0024_chargeable_jobs.sql). Unchanged apart from
--    the lines marked "0025".
--
-- Works out my_cost and charge from the estimates (brief section 5) and
-- saves whichever of them hasn't been set by hand.
--   resin: my_cost = weight × saved cost per g   (0025)
--          (old resin jobs, no saved cost per g: my_cost = est_cost)
--          charge  = weight ÷ resin_charge_divisor
--   fdm:   my_cost = weight × saved cost per g,   charge = weight × saved charge per g  (0025)
-- 0025: always the prices saved on the job, never the material's current
-- price.
-- Cancelled jobs, and completed jobs where nothing succeeded, charge 0.
-- A partly successful job is charged in full.
-- 0024: a job that isn't chargeable charges 0, and its charge can't be set
-- by hand (charge_overridden = false). my_cost is worked out as normal.
-- -----------------------------------------------------------------------------
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
  v_any_ok   boolean;
begin
  select * into v_job from public.print_jobs where id = p_job_id;
  select type into v_type from public.printers where id = v_job.printer_id;

  if v_type = 'resin' then
    select coalesce(nullif(value, '')::numeric, 15) into v_divisor
    from public.settings where key = 'resin_charge_divisor';
    v_divisor := coalesce(v_divisor, 15);
    if v_job.material_cost_per_unit is null then
      v_cost := coalesce(v_job.est_cost, 0);  -- old resin job
    else
      v_cost := coalesce(v_job.est_weight_g, 0) * v_job.material_cost_per_unit;  -- 0025
    end if;
    v_charge := coalesce(v_job.est_weight_g, 0) / v_divisor;
  else
    -- 0025: the prices saved on the job.
    v_cost := coalesce(v_job.est_weight_g, 0) * coalesce(v_job.material_cost_per_unit, 0);
    v_charge := coalesce(v_job.est_weight_g, 0) * coalesce(v_job.material_charge_per_unit, 0);
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

  -- 0024: not charged to Dad.
  if not v_job.chargeable then
    update public.print_jobs set
      my_cost           = case when my_cost_overridden then my_cost else round(v_cost, 2) end,
      charge            = 0,
      charge_overridden = false
    where id = p_job_id;
    return;
  end if;

  update public.print_jobs set
    my_cost = case when my_cost_overridden then my_cost else round(v_cost, 2) end,
    charge  = case when charge_overridden then charge else round(v_charge, 2) end
  where id = p_job_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. repeat_print_job (from 0024_chargeable_jobs.sql). Unchanged apart from
--    the lines marked "0025".
--
-- Starts a NEW printing job (dated now) that copies an earlier job: same
-- printer, title, notes, estimates, material, any costs set by hand, whether
-- it's charged, and the same items and planned quantities. The old job is
-- not changed. Catalogue items are linked to the open request line for the
-- same model + scale + colour, up to what that line still wants; the rest
-- go on as "not requested". Free-text items are copied as they are.
-- 0025: the copy is a new job, so it saves TODAY's material prices
-- (start_print_job → pj_set_details) and a resin copy is costed from
-- weight × price per g, which needs a resin measured in g.
-- -----------------------------------------------------------------------------
create or replace function public.repeat_print_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job        public.print_jobs%rowtype;
  v_printer    public.printers%rowtype;
  v_old        public.print_job_items%rowtype;
  v_line       public.request_lines%rowtype;
  v_items      jsonb := '[]'::jsonb;
  v_details    jsonb;
  v_taken      int;   -- already given to this line earlier in this repeat
  v_unclaimed  int;
  v_linked     int;
  v_rest       int;
begin
  perform public.pj_require_admin();

  select * into v_job from public.print_jobs where id = p_job_id;
  if not found then
    raise exception 'That job no longer exists. Refresh the page and try again.';
  end if;

  select * into v_printer from public.printers where id = v_job.printer_id;
  if v_printer.active is distinct from true then
    raise exception 'The % is not in use any more, so this job can''t be repeated.', coalesce(v_printer.name, 'printer');
  end if;

  -- 0025: a resin copy needs a resin measured in g (old resin jobs may have
  -- none, or one still in ml).
  if v_printer.type = 'resin'
     and not exists (select 1 from public.materials where id = v_job.material_id and unit = 'g') then
    raise exception 'This job has no resin measured in grams (g), so it can''t be repeated as it is. Choose one under Edit details first (check the unit on the Materials page), or start a new job.';
  end if;

  -- The old job's details, in the same shape the job form sends.
  -- (0025: est_cost is ignored for the new resin job.)
  v_details := jsonb_build_object(
    'title',              v_job.title,
    'notes',              v_job.notes,
    'est_material_ml',    v_job.est_material_ml,
    'est_weight_g',       v_job.est_weight_g,
    'print_hours',        v_job.print_hours,
    'print_minutes',      v_job.print_minutes,
    'est_cost',           v_job.est_cost,
    'layer_height_mm',    v_job.layer_height_mm,
    'material_id',        coalesce(v_job.material_id::text, ''),
    'my_cost',            v_job.my_cost,
    'my_cost_overridden', v_job.my_cost_overridden,
    'charge',             v_job.charge,
    'charge_overridden',  v_job.charge_overridden,
    'chargeable',         v_job.chargeable  -- 0024
  );

  for v_old in
    select * from public.print_job_items where job_id = p_job_id order by id
  loop
    if v_old.model_id is null then
      -- Free text: copy as it is.
      v_items := v_items || jsonb_build_object(
        'free_text_name', v_old.free_text_name,
        'quantity',       v_old.quantity_planned
      );
      continue;
    end if;

    -- Is there an open request for the same model, scale and colour?
    -- ("is not distinct from" treats two blanks as the same.)
    v_linked := 0;
    select * into v_line from public.request_lines
    where model_id = v_old.model_id
      and scale is not distinct from v_old.scale
      and colour_material_id is not distinct from v_old.colour_material_id;

    if found then
      select coalesce(sum((e ->> 'quantity')::int), 0) into v_taken
      from jsonb_array_elements(v_items) e
      where e ->> 'request_line_id' = v_line.id::text;

      v_unclaimed := v_line.quantity - public.printing_for_line(v_line.id) - v_taken;
      v_linked := greatest(least(v_old.quantity_planned, v_unclaimed), 0);

      if v_linked > 0 then
        v_items := v_items || jsonb_build_object(
          'request_line_id', v_line.id,
          'quantity',        v_linked
        );
      end if;
    end if;

    -- Whatever isn't covered by a request goes on as "not requested".
    v_rest := v_old.quantity_planned - v_linked;
    if v_rest > 0 then
      v_items := v_items || jsonb_build_object(
        'model_id',           v_old.model_id,
        'scale',              v_old.scale,
        'colour_material_id', coalesce(v_old.colour_material_id::text, ''),
        'quantity',           v_rest
      );
    end if;
  end loop;

  -- Creates the job (started_at = now), checks everything, works out money.
  return public.start_print_job(v_job.printer_id, v_details, v_items);
end;
$$;


-- -----------------------------------------------------------------------------
-- Permissions. "create or replace" keeps each function's existing grants;
-- these repeat them as a safety net. Helpers stay uncallable by the app.
-- -----------------------------------------------------------------------------
revoke all on function
  public.pj_set_details(uuid, uuid, jsonb),
  public.pj_refresh_money(uuid)
  from public, anon, authenticated;

revoke all on function public.repeat_print_job(uuid) from public, anon;
grant execute on function public.repeat_print_job(uuid) to authenticated, service_role;


commit;


-- -----------------------------------------------------------------------------
-- Report (read only). Expect "fdm_jobs_that_would_change" = 0: it counts
-- FDM jobs whose stored figures differ from what their saved prices give,
-- i.e. jobs that would change if worked out again. (Hand-typed amounts,
-- cancelled, failed and not-charged jobs are allowed for.)
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.print_jobs j join public.printers p on p.id = j.printer_id
    where p.type = 'fdm') as fdm_jobs,
  (select count(*) from public.print_jobs j join public.printers p on p.id = j.printer_id
    where p.type = 'fdm' and j.material_cost_per_unit is not null) as fdm_jobs_with_saved_prices,
  (select count(*) from public.print_jobs j join public.printers p on p.id = j.printer_id
    where p.type = 'resin' and j.material_cost_per_unit is null) as old_resin_jobs_on_est_cost,
  (select count(*) from public.print_jobs j join public.printers p on p.id = j.printer_id
    where p.type = 'fdm'
      and (
        (not j.my_cost_overridden
          and j.my_cost <> round(coalesce(j.est_weight_g, 0) * coalesce(j.material_cost_per_unit, 0), 2))
        or (j.chargeable and not j.charge_overridden
          and j.status <> 'cancelled'
          and not (j.status = 'completed'
                   and not exists (select 1 from public.print_job_items i
                                   where i.job_id = j.id and i.quantity_succeeded > 0))
          and j.charge <> round(coalesce(j.est_weight_g, 0) * coalesce(j.material_charge_per_unit, 0), 2))
      )) as fdm_jobs_that_would_change;
