-- ============================================================================
--  household-budget : 항목별(per-entity) 복사본 테이블 정리(삭제)
--
--  배경: 마이그레이션 시도로 만든 22개 복사본 테이블을 제거하고, 원래처럼
--        user_data(단일 테이블) 구조로 되돌린다. 앱은 이미 user_data만 쓰도록
--        롤백된 상태라 이 테이블들은 사용되지 않는다(삭제해도 앱 영향 없음).
--
--  ✅ 안전: 진짜 데이터가 있는 user_data, 백업인 user_data_versions 는 건드리지 않음.
--           아래 목록은 전부 "복사본" 테이블이라 삭제해도 데이터 손실 없음.
--  실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================================

drop table if exists
  ledger_settings,
  accounts,
  categories,
  transactions,
  budgets,
  cards,
  installments,
  savings,
  saving_payments,
  goals,
  goal_payments,
  card_billings,
  mapping_rules,
  investment_account_types,
  investment_accounts,
  investments,
  investment_trades,
  investment_dividends,
  investment_cash_deposits,
  portfolio_plans,
  watchlist,
  ledgers
cascade;

-- 트리거용 헬퍼 함수도 정리 (이 테이블들에서만 쓰던 것)
drop function if exists set_updated_at() cascade;

-- 확인: 남아있어야 할 원본 테이블 (user_data, user_data_versions만 보이면 정상)
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
