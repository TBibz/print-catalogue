-- =============================================================================
-- 0002_requests.sql — Phase 2: request lines
--
-- Run this whole file in the Supabase SQL Editor after 0001_init.sql.
-- Safe to run again if something goes wrong part way.
--
-- This project has "automatically expose new tables" turned OFF, so the
-- table gets no access until the grants at the bottom of this file.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- request_lines: one row per model + size that Dad currently wants.
-- When the quantity drops to 0 the row is deleted (the app does this).
--
-- colour_material_id (BASES colour choice) is added in Phase 6, once the
-- materials table exists. The unique rule below will be widened then.
-- -----------------------------------------------------------------------------
create table if not exists public.request_lines (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references public.models (id),
  -- null means "the model's default scale".
  scale       text,
  -- Outstanding amount still wanted.
  quantity    int not null check (quantity > 0),
  urgency     text check (urgency in ('ASAP', 'URGENT', 'PRIORITY')),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Only one line per model + scale. "nulls not distinct" means two lines
  -- with scale = null (default) also count as the same.
  constraint request_lines_model_scale_key
    unique nulls not distinct (model_id, scale)
);

alter table public.request_lines enable row level security;

drop trigger if exists request_lines_set_updated_at on public.request_lines;
create trigger request_lines_set_updated_at
  before update on public.request_lines
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- RLS policies
-- Both roles (admin and requester) can read, add, change and delete lines.
-- "to authenticated" means logged-in users only.
-- (Phase 6 adds the rule that the requester can't go below what's printing.)
-- -----------------------------------------------------------------------------
drop policy if exists "request_lines: read" on public.request_lines;
create policy "request_lines: read"
  on public.request_lines for select
  to authenticated
  using (true);

drop policy if exists "request_lines: insert" on public.request_lines;
create policy "request_lines: insert"
  on public.request_lines for insert
  to authenticated
  with check (true);

drop policy if exists "request_lines: update" on public.request_lines;
create policy "request_lines: update"
  on public.request_lines for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "request_lines: delete" on public.request_lines;
create policy "request_lines: delete"
  on public.request_lines for delete
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- Permissions: nothing for logged-out visitors; logged-in users may try
-- select/insert/update/delete (RLS above then applies).
-- -----------------------------------------------------------------------------
revoke all on table public.request_lines from public, anon;
grant select, insert, update, delete on table public.request_lines to authenticated;
grant all on table public.request_lines to service_role;
