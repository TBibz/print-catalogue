-- =============================================================================
-- 0020_repeat_print_job.sql — repeat a job
--
-- Run this whole file in the Supabase SQL Editor after 0019_invoices.sql.
-- Safe to run again.
--
-- repeat_print_job(job) starts a NEW printing job (dated now) that copies an
-- earlier job: same printer, title, notes, estimates, material, any costs set
-- by hand, and the same items and planned quantities. The old job is not
-- changed.
--
-- How the items are linked to requests:
--   * A catalogue item is linked to the request line that is currently open
--     for the same model + scale + colour, for as many as that line still
--     wants (line quantity − already printing).
--   * Anything more than that (or when there's no open request) goes on as
--     "not requested", exactly like adding a model by hand on the queue.
--   * Free-text items are copied as they are.
-- The real work is done by start_print_job (0010_colours.sql), so every
-- check it makes still applies.
-- =============================================================================

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
    'charge_overridden',  v_job.charge_overridden
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


-- Admin-only: logged-in users may call it (it checks for the admin itself).
revoke all on function public.repeat_print_job(uuid) from public, anon;
grant execute on function public.repeat_print_job(uuid) to authenticated, service_role;
