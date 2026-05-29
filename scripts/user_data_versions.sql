-- ─────────────────────────────────────────────────────────────────────────────
-- 자동 백업 / 버전 복구 기능 — 사본(버전) 보관 테이블
-- PRD: PRD_자동백업_버전복구.md
--
-- 사용법: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- (기존 user_data 테이블은 그대로 두고, 사본 전용 테이블을 별도로 추가합니다.)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 사본(버전) 테이블
--    한 줄 = 한 시점의 전체 데이터 사본
create table if not exists public.user_data_versions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  data        jsonb       not null,                 -- 그 시점의 MultiData 전체
  tx_count    integer,                              -- 목록에 빠르게 표시할 거래 건수 요약
  created_at  timestamptz not null default now()    -- 만든 시각
);

-- 2) 최신순 조회 + 사용자별 조회 성능을 위한 인덱스
create index if not exists user_data_versions_user_created_idx
  on public.user_data_versions (user_id, created_at desc);

-- 3) 접근 권한(RLS) — 본인 사본만 읽고 쓸 수 있도록
alter table public.user_data_versions enable row level security;

drop policy if exists "own versions - select" on public.user_data_versions;
drop policy if exists "own versions - insert" on public.user_data_versions;
drop policy if exists "own versions - update" on public.user_data_versions;
drop policy if exists "own versions - delete" on public.user_data_versions;

create policy "own versions - select" on public.user_data_versions
  for select using (auth.uid() = user_id);

create policy "own versions - insert" on public.user_data_versions
  for insert with check (auth.uid() = user_id);

create policy "own versions - update" on public.user_data_versions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own versions - delete" on public.user_data_versions
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) (권장) 7일 초과분 자동 정리 스케줄러
--    앱에서도 사본 추가 직후 7일 초과분을 삭제하지만, 안전하게 매일 1회 서버에서도 정리합니다.
--    pg_cron 확장이 활성화되어 있어야 합니다. (Supabase: Database → Extensions → pg_cron)
--    아래는 선택 사항이며, 활성화하려면 주석을 해제하고 실행하세요.
-- ─────────────────────────────────────────────────────────────────────────────

-- create extension if not exists pg_cron;
--
-- select cron.schedule(
--   'cleanup_user_data_versions',
--   '0 3 * * *',  -- 매일 새벽 3시
--   $$ delete from public.user_data_versions where created_at < now() - interval '7 days'; $$
-- );
