-- =============================================================================
-- 0017_request_lines_policies.sql — Security Advisor warnings, part 2
--
-- Run this whole file in the Supabase SQL Editor after
-- 0016_security_advisor.sql. Safe to run again. Nobody's access changes.
--
-- 1. "RLS Policy Always True" on request_lines: adding, changing and
--    deleting request lines was allowed with `true` (any logged-in user).
--    Now it says what was meant: the user must have a profile with the role
--    admin or requester. Both Tomi and Dad do, so nothing changes for them.
--    (Reading stays `true`: the Advisor doesn't flag read policies.)
--
-- 2. Admin-only functions: checked, and every one already stops at the
--    start with an error unless is_admin() is true (the job functions via
--    pj_require_admin()). Execute was already taken away from public and
--    anon. It's taken away again here as a safety net, in case the live
--    database ever differs from these files.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. request_lines: admin or requester (anyone with a profile)
-- -----------------------------------------------------------------------------
alter policy "request_lines: insert" on public.request_lines
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'requester')
  ));

alter policy "request_lines: update" on public.request_lines
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'requester')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'requester')
  ));

alter policy "request_lines: delete" on public.request_lines
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'requester')
  ));


-- -----------------------------------------------------------------------------
-- 2. Admin-only functions: logged-in users may call them (each checks for
-- the admin itself); nobody else may.
-- -----------------------------------------------------------------------------
revoke all on function
  public.start_print_job(uuid, jsonb, jsonb),
  public.complete_print_job(uuid, jsonb),
  public.update_completed_result(uuid, jsonb),
  public.revert_print_job(uuid),
  public.cancel_print_job(uuid),
  public.update_print_job_details(uuid, uuid, jsonb),
  public.delete_print_job(uuid),
  public.set_category_default_scale(uuid, text, boolean, text[], boolean)
  from public, anon;
grant execute on function
  public.start_print_job(uuid, jsonb, jsonb),
  public.complete_print_job(uuid, jsonb),
  public.update_completed_result(uuid, jsonb),
  public.revert_print_job(uuid),
  public.cancel_print_job(uuid),
  public.update_print_job_details(uuid, uuid, jsonb),
  public.delete_print_job(uuid),
  public.set_category_default_scale(uuid, text, boolean, text[], boolean)
  to authenticated, service_role;
