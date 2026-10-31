-- =============================================================================
-- 0016_security_advisor.sql — fixes for Supabase's Security Advisor
--
-- Run this whole file in the Supabase SQL Editor after
-- 0015_bulk_default_scale.sql. Safe to run again. Nobody's access changes:
-- the admin and the requester see exactly what they saw before.
--
-- 1. "Security Definer View" (5 views). Each of these views let the
--    requester see a safe slice of a table that RLS hides from him:
--      catalogue_models      models without admin_notes   (models is admin only)
--      request_line_printing how many are printing        (print jobs are admin only)
--      model_print_totals    successful prints per model  (print jobs are admin only)
--      category_model_counts models per category          (models is admin only)
--      colour_options        colour names and stock       (materials is admin only)
--    None of them can simply run as the caller (security_invoker), because
--    the requester can't read the tables underneath. So each becomes a
--    function with the same name and the same columns, which runs with its
--    owner's rights but can only return those columns. Only logged-in
--    users may call them. The app calls them with .rpc() instead of .from().
--    The views are then dropped.
--
-- 2. "Public Can Execute SECURITY DEFINER Function": rls_auto_enable() is
--    created by Supabase (it switches RLS on for new tables). Nobody needs
--    to call it directly, so nobody may.
--
-- 3. "Auth RLS Initialization Plan": policies that call auth.uid() or
--    is_admin() now wrap them in (select …), so Postgres works the answer
--    out once per query instead of once per row. Same rules, faster.
--
-- 4. "Multiple Permissive Policies" on categories: "admin write" covered
--    reading too, overlapping "read". It's split into insert, update and
--    delete, so reading is decided by "read" alone (everyone logged in).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Views → functions
-- -----------------------------------------------------------------------------

-- Models, without admin_notes. Everyone logged in.
create or replace function public.catalogue_models()
returns table (
  id             uuid,
  code           text,
  code_key       text,
  name           text,
  category_id    uuid,
  default_scale  text,
  other_scales   text[],
  availability   text,
  image_path     text,
  show_new_badge boolean,
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.code, m.code_key, m.name, m.category_id, m.default_scale,
    m.other_scales, m.availability, m.image_path, m.show_new_badge,
    m.created_at, m.updated_at
  from public.models m;
$$;

-- How many of each request line are printing: a line id and a number only.
create or replace function public.request_line_printing()
returns table (request_line_id uuid, printing int)
language sql
stable
security definer
set search_path = ''
as $$
  select i.request_line_id, sum(i.quantity_planned)::int
  from public.print_job_items i
  join public.print_jobs j on j.id = i.job_id
  where j.status = 'printing'
    and i.request_line_id is not null
  group by i.request_line_id;
$$;

-- Successful prints per model (completed jobs only), for the NEW badge.
create or replace function public.model_print_totals()
returns table (model_id uuid, printed_total int)
language sql
stable
security definer
set search_path = ''
as $$
  select i.model_id, sum(i.quantity_succeeded)::int
  from public.print_job_items i
  join public.print_jobs j on j.id = i.job_id
  where j.status = 'completed'
    and i.model_id is not null
  group by i.model_id;
$$;

-- Models per category: all of them, and those not retired.
create or replace function public.category_model_counts()
returns table (category_id uuid, total_models int, visible_models int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    count(m.id)::int,
    count(m.id) filter (where m.availability <> 'hidden')::int
  from public.categories c
  left join public.models m on m.category_id = c.id
  group by c.id;
$$;

-- The catalogue's colour list: filaments offered as a colour (and not
-- retired), plus any colour an existing request still uses. Names, colour
-- and stock only, no prices.
create or replace function public.colour_options()
returns table (
  id         uuid,
  name       text,
  colour     text,
  colour_hex text,
  available  boolean,
  in_stock   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.name,
    m.colour,
    m.colour_hex,
    -- Can be chosen for new requests.
    (m.offer_as_colour and m.in_stock and m.active),
    m.in_stock
  from public.materials m
  where m.type = 'fdm'
    and (
      (m.offer_as_colour and m.active)
      or m.id in (select r.colour_material_id from public.request_lines r
                  where r.colour_material_id is not null)
    );
$$;

drop view if exists public.catalogue_models;
drop view if exists public.request_line_printing;
drop view if exists public.model_print_totals;
drop view if exists public.category_model_counts;
drop view if exists public.colour_options;

-- Logged-in users only (new functions can be called by everyone until
-- this is taken away).
revoke all on function
  public.catalogue_models(),
  public.request_line_printing(),
  public.model_print_totals(),
  public.category_model_counts(),
  public.colour_options()
  from public, anon;
grant execute on function
  public.catalogue_models(),
  public.request_line_printing(),
  public.model_print_totals(),
  public.category_model_counts(),
  public.colour_options()
  to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. rls_auto_enable(): nobody calls it directly. (It still runs by itself
-- when a table is created.) Skipped if this project doesn't have it.
-- -----------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Policies: auth.uid() and is_admin() worked out once per query
-- -----------------------------------------------------------------------------
alter policy "profiles: read own or admin" on public.profiles
  using (id = (select auth.uid()) or (select public.is_admin()));
alter policy "profiles: admin update" on public.profiles
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "profiles: admin delete" on public.profiles
  using ((select public.is_admin()));

alter policy "models: admin all" on public.models
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "notepad_lines: insert own" on public.notepad_lines
  with check (created_by = (select auth.uid()));
alter policy "notepad_lines: update own or admin" on public.notepad_lines
  using (created_by = (select auth.uid()) or (select public.is_admin()))
  with check (created_by = (select auth.uid()) or (select public.is_admin()));
alter policy "notepad_lines: delete own or admin" on public.notepad_lines
  using (created_by = (select auth.uid()) or (select public.is_admin()));

alter policy "printers: admin all" on public.printers
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "materials: admin all" on public.materials
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "settings: admin all" on public.settings
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "print_jobs: admin all" on public.print_jobs
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "print_job_items: admin all" on public.print_job_items
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "monthly_money: admin all" on public.monthly_money
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "model-images: admin read" on storage.objects
  using (bucket_id = 'model-images' and (select public.is_admin()));
alter policy "model-images: admin upload" on storage.objects
  with check (bucket_id = 'model-images' and (select public.is_admin()));
alter policy "model-images: admin update" on storage.objects
  using (bucket_id = 'model-images' and (select public.is_admin()))
  with check (bucket_id = 'model-images' and (select public.is_admin()));
alter policy "model-images: admin delete" on storage.objects
  using (bucket_id = 'model-images' and (select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 4. categories: one policy for reading (everyone logged in), and separate
-- admin-only policies for adding, changing and deleting.
-- -----------------------------------------------------------------------------
drop policy if exists "categories: admin write" on public.categories;

drop policy if exists "categories: admin insert" on public.categories;
create policy "categories: admin insert"
  on public.categories for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "categories: admin update" on public.categories;
create policy "categories: admin update"
  on public.categories for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "categories: admin delete" on public.categories;
create policy "categories: admin delete"
  on public.categories for delete
  to authenticated
  using ((select public.is_admin()));
