-- 畢業光影：管理模式權限設定（只需執行一次）
-- 在 Supabase 專案 → SQL Editor → New query 貼上整段後按 Run。
-- 若管理者 Email 不是 tsai.jiaren@gmail.com，請先改掉下方 insert 那一行。

-- 1) 管理者名單（不開放任何人從網頁讀取）
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
insert into public.admins (email) values ('tsai.jiaren@gmail.com') on conflict do nothing;

-- 2) 判斷目前登入者是否為管理者
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 3) 只有管理者可以修改、刪除留言
drop policy if exists "posts admin update" on public.posts;
create policy "posts admin update" on public.posts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "posts admin delete" on public.posts;
create policy "posts admin delete" on public.posts for delete to authenticated
  using (public.is_admin());

-- 4) 只有管理者可以刪除照片檔
drop policy if exists "photos admin delete" on storage.objects;
create policy "photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

select 'admin setup ok' as result, (select count(*) from public.admins) as admins;
