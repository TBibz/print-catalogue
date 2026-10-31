-- =============================================================================
-- 0004_model_delete.sql — let the admin delete a model completely
--
-- Run this whole file in the Supabase SQL Editor after 0003_notepad.sql.
-- Safe to run again.
--
-- Deleting a model now also deletes its open request lines, in the same
-- step. (Before this, the database refused to delete a model that still
-- had requests.)
--
-- Phase 6 note: print_job_items will reference models WITHOUT cascade, so
-- a model with print history can't be deleted (retire it instead). That
-- keeps the print log and money history intact.
--
-- No new tables or functions, so no permission changes are needed.
-- =============================================================================

alter table public.request_lines
  drop constraint if exists request_lines_model_id_fkey;

alter table public.request_lines
  add constraint request_lines_model_id_fkey
  foreign key (model_id) references public.models (id) on delete cascade;
