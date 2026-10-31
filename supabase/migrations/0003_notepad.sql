-- =============================================================================
-- 0003_notepad.sql — Phase 3: the shared notepad
--
-- Run this whole file in the Supabase SQL Editor after 0002_requests.sql.
-- Safe to run again if something goes wrong part way.
--
-- This project has "automatically expose new tables" turned OFF, so the
-- table gets no access until the grants at the bottom of this file.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- notepad_lines: one row per bullet on the notepad.
-- -----------------------------------------------------------------------------
create table if not exists public.notepad_lines (
  id          uuid primary key default gen_random_uuid(),
  text        text not null default '',
  -- Who wrote it. Filled in automatically with the logged-in user.
  created_by  uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Ticked off by the admin.
  done        boolean not null default false,
  done_at     timestamptz,
  -- Order on the page. A decimal, so a new line can go between two others
  -- (e.g. 2.5 between 2 and 3) without renumbering everything.
  position    double precision not null default 0
);

create index if not exists notepad_lines_position_idx
  on public.notepad_lines (position, created_at);

alter table public.notepad_lines enable row level security;


-- -----------------------------------------------------------------------------
-- Guard rules RLS can't express on its own:
--   - only the admin can tick/untick a line
--   - nobody can change who wrote a line
--   - done_at is kept in step with done
-- -----------------------------------------------------------------------------
create or replace function public.notepad_lines_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- New lines always belong to whoever adds them, and start unticked
    -- unless the admin adds them.
    new.created_by := auth.uid();
    if new.done and not public.is_admin() then
      raise exception 'Only the admin can tick notepad lines';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'The author of a notepad line cannot be changed';
    end if;
    if new.done is distinct from old.done and not public.is_admin() then
      raise exception 'Only the admin can tick notepad lines';
    end if;
  end if;

  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists notepad_lines_guard on public.notepad_lines;
create trigger notepad_lines_guard
  before insert or update on public.notepad_lines
  for each row execute function public.notepad_lines_guard();


-- -----------------------------------------------------------------------------
-- RLS policies
-- Everyone logged in can read every line and add their own.
-- You can edit or delete your own lines; the admin can edit or delete any.
-- -----------------------------------------------------------------------------
drop policy if exists "notepad_lines: read" on public.notepad_lines;
create policy "notepad_lines: read"
  on public.notepad_lines for select
  to authenticated
  using (true);

drop policy if exists "notepad_lines: insert own" on public.notepad_lines;
create policy "notepad_lines: insert own"
  on public.notepad_lines for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "notepad_lines: update own or admin" on public.notepad_lines;
create policy "notepad_lines: update own or admin"
  on public.notepad_lines for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "notepad_lines: delete own or admin" on public.notepad_lines;
create policy "notepad_lines: delete own or admin"
  on public.notepad_lines for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());


-- -----------------------------------------------------------------------------
-- Permissions: nothing for logged-out visitors.
-- -----------------------------------------------------------------------------
revoke all on table public.notepad_lines from public, anon;
grant select, insert, update, delete on table public.notepad_lines to authenticated;
grant all on table public.notepad_lines to service_role;

-- The guard function only ever runs from its trigger.
revoke all on function public.notepad_lines_guard() from public, anon, authenticated;
