-- ─────────────────────────────────────────────────────────────────────────────
-- 이전 가계부 파일 보관함 — Supabase Storage 버킷 + 접근 권한(RLS)
--
-- 사용법: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- 경로 규칙: {user_id}/{타임스탬프}_{파일명}  → 본인 폴더의 파일만 접근 가능
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 비공개 버킷 생성
insert into storage.buckets (id, name, public)
values ('history-files', 'history-files', false)
on conflict (id) do nothing;

-- 2) 접근 권한(RLS) — 본인 폴더(user_id)의 파일만 읽기/올리기/삭제
drop policy if exists "history-files own select" on storage.objects;
drop policy if exists "history-files own insert" on storage.objects;
drop policy if exists "history-files own delete" on storage.objects;

create policy "history-files own select" on storage.objects
  for select using (
    bucket_id = 'history-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "history-files own insert" on storage.objects
  for insert with check (
    bucket_id = 'history-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "history-files own delete" on storage.objects
  for delete using (
    bucket_id = 'history-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
