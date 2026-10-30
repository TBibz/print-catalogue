-- =============================================================================
-- 0001_init.sql — Phase 1: profiles, roles, categories, models
--
-- Run this whole file in the Supabase SQL Editor (paste it all, click Run).
-- It is written so it can safely be run again if something goes wrong part way.
--
-- Access rule: nothing here can be read or called without logging in.
-- Supabase normally gives the "anon" role (logged-out visitors) access to
-- new tables and functions, and relies on RLS to stop them. This file goes
-- further and removes anon's access entirely (see the "Permissions" section
-- at the end). RLS then decides what each logged-in user can see.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- profiles: one row per login, saying whether they are 'admin' or 'requester'
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'requester'
               check (role in ('admin', 'requester')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- -----------------------------------------------------------------------------
-- is_admin(): true when the logged-in user has role 'admin'.
-- "security definer" lets it read profiles without being blocked by the
-- profiles RLS policies (which themselves call is_admin()).
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;



-- -----------------------------------------------------------------------------
-- Create a profile automatically whenever a new auth user is added
-- (e.g. via Supabase → Authentication → Add user).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    'requester'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: give a profile to any users that already existed before this ran.
insert into public.profiles (id, display_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', u.email),
  'requester'
from auth.users u
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Shared helper: keep updated_at current on any table that has it.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  -- The catalogue sorts categories by name. sort_order is here for later,
  -- in case a custom order is ever wanted.
  sort_order         int not null default 0,
  -- true for BASES: requests can choose a colour (Phase 6).
  has_colour_options boolean not null default false
);

alter table public.categories enable row level security;


-- -----------------------------------------------------------------------------
-- models
-- -----------------------------------------------------------------------------
create table if not exists public.models (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  category_id    uuid not null references public.categories (id),
  default_scale  text,
  other_scales   text[] not null default '{}',
  availability   text not null default 'available'
                 check (availability in ('available', 'coming_soon', 'hidden')),
  image_path     text,
  show_new_badge boolean not null default false,
  admin_notes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Lower-case code with spaces removed, e.g. "WW2 001" -> "ww2001".
  -- Used later to match image file names to models.
  code_key       text generated always as (lower(replace(code, ' ', ''))) stored
);

-- Two codes that only differ by case/spaces would clash when matching images.
create unique index if not exists models_code_key_key on public.models (code_key);
create index if not exists models_category_id_idx on public.models (category_id);

alter table public.models enable row level security;

drop trigger if exists models_set_updated_at on public.models;
create trigger models_set_updated_at
  before update on public.models
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- catalogue_models: what everyone logged in may read about models.
-- Same as models but WITHOUT admin_notes.
--
-- The models table itself is admin-only (see policies below). This view runs
-- with its owner's rights, so it can read models for the requester too, but
-- only exposes the safe columns. Only logged-in users may select from it.
-- -----------------------------------------------------------------------------
create or replace view public.catalogue_models
with (security_invoker = false)
as
select
  m.id,
  m.code,
  m.code_key,
  m.name,
  m.category_id,
  m.default_scale,
  m.other_scales,
  m.availability,
  m.image_path,
  m.show_new_badge,
  m.created_at,
  m.updated_at
from public.models m;



-- -----------------------------------------------------------------------------
-- RLS policies
-- (drop + create so this file can be re-run)
-- -----------------------------------------------------------------------------

-- profiles: you can read your own profile; admin can read and edit all.
-- Nobody inserts directly: the trigger above does it.
drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: admin update" on public.profiles;
create policy "profiles: admin update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles: admin delete" on public.profiles;
create policy "profiles: admin delete"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- categories: everyone logged in can read; only admin can change.
drop policy if exists "categories: read" on public.categories;
create policy "categories: read"
  on public.categories for select
  to authenticated
  using (true);

drop policy if exists "categories: admin write" on public.categories;
create policy "categories: admin write"
  on public.categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- models: admin only (includes admin_notes).
-- The requester reads models through the catalogue_models view instead.
drop policy if exists "models: admin all" on public.models;
create policy "models: admin all"
  on public.models for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- Permissions (who may even try to use each object)
--   public        = every database role, including anon
--   anon          = logged-out visitors using the public "anon" key
--   authenticated = logged-in users (RLS then limits which rows they see)
--   service_role  = the secret key used by the import script (bypasses RLS)
-- -----------------------------------------------------------------------------

-- Tables: no access for logged-out visitors.
revoke all on table public.profiles, public.categories, public.models
  from public, anon;
grant select, insert, update, delete
  on table public.profiles, public.categories, public.models
  to authenticated;
grant all on table public.profiles, public.categories, public.models
  to service_role;

-- View: read-only, logged-in users only.
revoke all on table public.catalogue_models from public, anon, authenticated;
grant select on table public.catalogue_models to authenticated, service_role;

-- is_admin(): callable by logged-in users only (RLS policies need it).
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Trigger functions: only ever run by their triggers, never called directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
