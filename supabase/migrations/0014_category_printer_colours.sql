-- =============================================================================
-- 0014_category_printer_colours.sql — a colour for each category and printer
--
-- Run this whole file in the Supabase SQL Editor after 0013_category_counts.sql.
-- Safe to run again.
--
-- categories.colour_hex: highlights the category in the catalogue sidebar.
-- printers.colour_hex:   shown next to the printer in Start print and Jobs.
-- Both start as a neutral grey; pick colours on the Categories and Printers
-- pages.
-- =============================================================================

alter table public.categories
  add column if not exists colour_hex text not null default '#9ca3af';
alter table public.categories
  drop constraint if exists categories_colour_hex_format;
alter table public.categories
  add constraint categories_colour_hex_format check (colour_hex ~ '^#[0-9a-f]{6}$');

alter table public.printers
  add column if not exists colour_hex text not null default '#9ca3af';
alter table public.printers
  drop constraint if exists printers_colour_hex_format;
alter table public.printers
  add constraint printers_colour_hex_format check (colour_hex ~ '^#[0-9a-f]{6}$');
