-- =============================================================================
-- 0005_images.sql — Phase 4: model images
--
-- Run this whole file in the Supabase SQL Editor after 0004_model_delete.sql.
-- Safe to run again.
--
-- Creates a Storage bucket called "model-images".
--
-- The bucket is "public" so the browser can keep (cache) images between
-- visits, which makes the catalogue fast. Each image sits at a random path
-- (model id + a timestamp), so nobody can find one without being given the
-- exact link, and links only appear inside the logged-in app.
--
-- Only the admin can upload, replace or delete images.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'model-images',
  'model-images',
  true,
  5242880, -- 5 MB per file (images are shrunk before upload, so ~100 KB)
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- Storage policies (Storage keeps its files in the storage.objects table).
-- Viewing a public image needs no policy. These cover managing the files.
-- -----------------------------------------------------------------------------
drop policy if exists "model-images: admin read" on storage.objects;
create policy "model-images: admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'model-images' and public.is_admin());

drop policy if exists "model-images: admin upload" on storage.objects;
create policy "model-images: admin upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'model-images' and public.is_admin());

drop policy if exists "model-images: admin update" on storage.objects;
create policy "model-images: admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'model-images' and public.is_admin())
  with check (bucket_id = 'model-images' and public.is_admin());

drop policy if exists "model-images: admin delete" on storage.objects;
create policy "model-images: admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'model-images' and public.is_admin());
