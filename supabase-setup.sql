-- 畢業光影：Supabase 一次性設定
-- 在 Supabase 專案 → SQL Editor 貼上整段後按 Run。

-- 1) 留言／照片資料表
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '匿名同學' check (char_length(name) between 1 and 30),
  message text not null default '' check (char_length(message) <= 300),
  photo text,                       -- photos bucket 內的檔名，可為空（純留言）
  created_at timestamptz not null default now(),
  check (photo is not null or char_length(message) > 0)
);

alter table public.posts enable row level security;

-- 任何訪客可讀取、可新增；不可修改或刪除（刪除請由管理者在 Table Editor 操作）
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select to anon, authenticated using (true);
drop policy if exists "posts insert" on public.posts;
create policy "posts insert" on public.posts for insert to anon, authenticated with check (true);

-- 2) 開啟即時同步
alter publication supabase_realtime add table public.posts;

-- 3) 照片儲存空間（公開讀取，限制 8 MB 與圖片格式）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos upload" on storage.objects;
create policy "photos upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'photos');
drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'photos');
