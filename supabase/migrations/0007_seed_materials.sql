-- =============================================================================
-- 0007_seed_materials.sql — load the materials from the old "3d Prints" sheet
--
-- Run after 0006_materials_printers.sql. Safe to run again: materials that
-- already exist (by name) are left exactly as they are.
--
-- Where these numbers came from (read on 31 Oct 2026):
--   * "Centauri Prints" tab, columns I–M: 9 PLA filaments. "Cost" is the
--     price of a 1 kg spool, "Cost per g" = Cost ÷ 1000, and the charge
--     ("Tomi Tax (2)") is 2 × cost, which is the default here too.
--   * "Resins" tab: a log of 50 bottles bought (1000 ml each). Each resin
--     type + colour becomes one material, priced at its most recent bottle:
--       8k Grey       £25.00 (bottle 1, the only one)
--       ABS 2.0 Grey  £19.30 (bottles 21–27)
--       ABS Grey      £14.82 (bottles 41–49 and the last row)
--
-- Everything starts "in stock" and not offered as a colour. Change those on
-- the Materials page.
-- =============================================================================

insert into public.materials (type, name, colour, unit, pack_size, pack_cost) values
  -- Filament (Centauri Carbon), 1 kg spools
  ('fdm', 'PLA Black',    'Black',    'g', 1000, 12.49),
  ('fdm', 'PLA White',    'White',    'g', 1000, 12.49),
  ('fdm', 'PLA Orange',   'Orange',   'g', 1000, 14.99),
  ('fdm', 'PLA Purple',   'Purple',   'g', 1000, 17.99),
  ('fdm', 'PLA Yellow',   'Yellow',   'g', 1000, 10.39),
  ('fdm', 'PLA Green',    'Green',    'g', 1000, 10.39),
  ('fdm', 'PLA Red',      'Red',      'g', 1000, 10.39),
  ('fdm', 'PLA Marble',   'Marble',   'g', 1000, 14.83),
  ('fdm', 'PLA Sky Blue', 'Sky Blue', 'g', 1000, 11.12),
  -- Resin (Saturn 4 Ultra), 1000 ml bottles
  ('resin', '8k Grey',      'Grey', 'ml', 1000, 25.00),
  ('resin', 'ABS 2.0 Grey', 'Grey', 'ml', 1000, 19.30),
  ('resin', 'ABS Grey',     'Grey', 'ml', 1000, 14.82)
on conflict (name) do nothing;
