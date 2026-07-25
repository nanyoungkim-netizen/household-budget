-- ============================================================================
--  household-budget : 카테고리 "이 달부터 계속 숨김" 컬럼 추가
--
--  배경: 예산 화면의 기존 "이번 달 예산만 숨기기"는 그 달 하루치만 숨긴다.
--        적금 만기처럼 "이번 달부터는 계속 예산에 안 잡히면 좋겠다"는 요청에는
--        매달 다시 숨겨야 해서 불편했다. 과거 달의 예산·실적은 그대로 두고,
--        지정한 달부터 이후 모든 달에서만 카테고리를 숨기는 컬럼을 추가한다.
--
--  ✅ 안전: 기존 ledger_settings 테이블에 컬럼 1개만 추가(ALTER TABLE ADD COLUMN
--           IF NOT EXISTS). 기존 행·다른 컬럼은 전혀 건드리지 않음. 되돌리려면
--           `alter table ledger_settings drop column category_hidden_from_month;`
--  실행 위치: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================================

alter table ledger_settings
  add column if not exists category_hidden_from_month jsonb not null default '{}'::jsonb;
