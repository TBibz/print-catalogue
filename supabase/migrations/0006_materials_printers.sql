-- =============================================================================
-- 0006_materials_printers.sql — Phase 5: printers, materials, settings
--
-- Run this whole file in the Supabase SQL Editor after 0005_images.sql.
-- Safe to run again.
--
-- All three tables are admin-only: the requester can't see costs,
-- materials or printers. (Phase 6 will expose just the colour names that
-- BASES can be requested in, through a separate view.)
--
-- This project has "automatically expose new tables" turned OFF, so each
-- table gets explicit grants at the bottom of this file.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- printers
-- -----------------------------------------------------------------------------
create table if not exists public.printers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  type        text not null check (type in ('resin', 'fdm')),
  -- false = retired: kept for history, not offered for new print jobs.
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.printers enable row level security;

-- Your two printers.
insert into public.printers (name, type) values
  ('Saturn 4 Ultra', 'resin'),
  ('Centauri Carbon', 'fdm')
on conflict (name) do nothing;


-- -----------------------------------------------------------------------------
-- materials: the material stock index (resins and filaments)
-- -----------------------------------------------------------------------------
create table if not exists public.materials (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('resin', 'fdm')),
  name               text not null unique,     -- e.g. "PLA Black", "ABS 2.0 Grey"
  colour             text not null default '',
  -- Resin is measured in ml, filament in g.
  unit               text not null check (unit in ('ml', 'g')),
  pack_size          numeric(10, 2) not null check (pack_size > 0),  -- e.g. 1000
  pack_cost          numeric(10, 2) not null check (pack_cost >= 0), -- £
  -- £ per ml or g, worked out from the pack.
  cost_per_unit      numeric(12, 6) generated always as (pack_cost / pack_size) stored,
  -- £ per ml or g charged for FDM prints. Defaults to 2 × cost (see trigger).
  charge_per_unit    numeric(12, 6) not null default 0 check (charge_per_unit >= 0),
  -- true once the charge has been set by hand: then pack cost changes
  -- leave it alone.
  charge_overridden  boolean not null default false,
  in_stock           boolean not null default true,
  -- Shown as a colour choice for categories with colour options (BASES).
  offer_as_colour    boolean not null default false,
  -- false = retired: kept for history, hidden from new print jobs.
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint materials_unit_matches_type
    check ((type = 'resin' and unit = 'ml') or (type = 'fdm' and unit = 'g'))
);

alter table public.materials enable row level security;

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

-- Keeps the charge at 2 × cost unless it has been set by hand.
create or replace function public.materials_default_charge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.charge_overridden then
    new.charge_per_unit := round(2 * new.pack_cost / new.pack_size, 6);
  end if;
  return new;
end;
$$;

drop trigger if exists materials_default_charge on public.materials;
create trigger materials_default_charge
  before insert or update on public.materials
  for each row execute function public.materials_default_charge();


-- -----------------------------------------------------------------------------
-- settings: simple key/value pairs
-- -----------------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- Resin job charge = estimated weight (g) ÷ this number.
insert into public.settings (key, value) values ('resin_charge_divisor', '15')
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- RLS: admin only, for everything
-- -----------------------------------------------------------------------------
drop policy if exists "printers: admin all" on public.printers;
create policy "printers: admin all"
  on public.printers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "materials: admin all" on public.materials;
create policy "materials: admin all"
  on public.materials for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "settings: admin all" on public.settings;
create policy "settings: admin all"
  on public.settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- Permissions: nothing for logged-out visitors.
-- -----------------------------------------------------------------------------
revoke all on table public.printers, public.materials, public.settings from public, anon;
grant select, insert, update, delete
  on table public.printers, public.materials, public.settings
  to authenticated;
grant all on table public.printers, public.materials, public.settings to service_role;

-- The trigger function only ever runs from its trigger.
revoke all on function public.materials_default_charge() from public, anon, authenticated;
