-- =============================================================================
-- 0024_chargeable_jobs.sql — jobs that aren't charged to Dad
--
-- Run this whole file in the Supabase SQL Editor after 0023_repeat_print_job.sql.
-- Safe to run again. It is one transaction (begin … commit): if anything
-- fails, nothing is changed.
--
-- ONLY ADDS THINGS. No table, column or row is dropped, renamed or deleted,
-- and no existing job's money is recalculated:
--   * Adding the column with a default doesn't touch any existing row's
--     charge or my_cost (and doesn't fire the updated_at trigger).
--   * Every existing job gets chargeable = true, and for chargeable jobs the
--     money rules below are exactly the same as before. A job's money is
--     only ever worked out again when someone acts on that job (start,
--     complete, edit, revert, cancel), just as now.
--
-- Works with the app that is live now (deploy order doesn't matter):
--   * No function changes its name, parameters or return type.
--   * "chargeable" is read from the details JSON the app already sends. The
--     live app doesn't send it, so:
--       - a new job is chargeable (the column default), as it is today
--       - editing a job leaves its chargeable setting as it was (the live
--         app can't accidentally turn a "not charged" job back on)
--
-- What's in here:
--   * print_jobs.chargeable boolean not null default true
--   * pj_set_details: reads the optional "chargeable" from the details
--   * pj_refresh_money: a job that isn't chargeable has charge 0 and
--     charge_overridden false; my_cost is worked out as normal
--   * repeat_print_job: the new job copies chargeable from the old one
--
-- Not changed, and why:
--   * start_print_job (0010) and update_print_job_details (0008) both pass
--     their details to pj_set_details and then call pj_refresh_money, so
--     they carry "chargeable" through as they are.
--   * money_by_month (0012) and the report functions (0022) add up
--     print_jobs.charge, my_cost and quantity_succeeded. A job that isn't
--     chargeable has charge = 0, so it adds £0 charge but still counts its
--     plates, items, weight and cost. No change needed.
-- =============================================================================

begin;


-- -----------------------------------------------------------------------------
-- The column. Existing jobs (and new jobs from the live app) are chargeable.
-- -----------------------------------------------------------------------------
alter table public.print_jobs
  add column if not exists chargeable boolean not null default true;


-- -----------------------------------------------------------------------------
-- pj_set_details (from 0008_print_jobs.sql), now also reading "chargeable".
-- Unchanged apart from the lines marked "0024".
--
-- Checks the job details for the printer's type and writes them to the job.
-- Details (all optional in the JSON, which ones are required depends on the
-- printer type): title, notes, est_material_ml, est_weight_g, print_hours,
-- print_minutes, est_cost, layer_height_mm, material_id,
-- my_cost + my_cost_overridden, charge + charge_overridden,
-- chargeable (0024: true/false; left out = keep the job's current setting,
-- which is true for a new job).
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
begin
  select * into v_printer from public.printers where id = p_printer_id;
  if not found then
    raise exception 'Please choose a printer.';
  end if;

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
    chargeable         = coalesce(v_chargeable, chargeable)  -- 0024
  where id = p_job_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- pj_refresh_money (from 0008_print_jobs.sql), now with "chargeable".
-- Unchanged apart from the lines marked "0024". For chargeable jobs (every
-- existing job) the result is exactly what it was before.
--
-- Works out my_cost and charge from the estimates (brief section 5) and
-- saves whichever of them hasn't been set by hand.
--   resin: my_cost = est_cost,               charge = weight ÷ resin_charge_divisor
--   fdm:   my_cost = weight × cost per g,    charge = weight × charge per g
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
-- repeat_print_job (from 0023_repeat_print_job.sql), now copying
-- "chargeable" from the original job. Unchanged apart from the line marked
-- "0024".
--
-- Starts a NEW printing job (dated now) that copies an earlier job: same
-- printer, title, notes, estimates, material, any costs set by hand, whether
-- it's charged, and the same items and planned quantities. The old job is
-- not changed. Catalogue items are linked to the open request line for the
-- same model + scale + colour, up to what that line still wants; the rest
-- go on as "not requested". Free-text items are copied as they are.
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

  -- The old job's details, in the same shape the job form sends.
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
