-- =============================================================================
-- 0009_delete_print_job.sql — permanently delete a print job
--
-- Run this whole file in the Supabase SQL Editor after 0008_print_jobs.sql.
-- Safe to run again.
--
-- delete_print_job(job), admin only, one transaction:
--   * completed job: first undo what it did, exactly like a revert (put back
--     everything it took off the request lines, recreating lines that had
--     reached 0), then delete it. Its successes stop counting towards the
--     printed totals because its items are gone.
--   * printing job: just delete it, so its items stop counting as printing.
--   * cancelled job: just delete it (it never counted for anything).
-- The job's items are deleted with it (on delete cascade).
-- =============================================================================

create or replace function public.delete_print_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_item   public.print_job_items%rowtype;
begin
  perform public.pj_require_admin();

  select status into v_status from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'This job was already deleted. Refresh the page.';
  end if;

  if v_status = 'completed' then
    for v_item in select * from public.print_job_items where job_id = p_job_id loop
      perform public.pj_put_back(v_item.id, v_item.quantity_applied_to_request);
    end loop;
  end if;

  delete from public.print_jobs where id = p_job_id;
end;
$$;

revoke all on function public.delete_print_job(uuid) from public, anon;
grant execute on function public.delete_print_job(uuid) to authenticated, service_role;
