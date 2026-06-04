-- ============================================================================
--  household-budget : 항목별(테이블·행 단위) 저장 구조  v1
--  목적: 기존 "전체를 user_data 한 행(JSON blob)에 통째 저장" → 데이터 종류별
--        테이블 + 한 건씩 행(row)으로 저장. 저장이 가볍고(거의 안 실패) 여러
--        기기에서 서로 덮어쓰지 않게 됨.
--
--  ⚠️ 이 SQL은 "새 테이블을 추가"만 합니다. 기존 user_data / user_data_versions
--     테이블은 건드리지 않습니다(원본 보존). 데이터 이사는 별도 단계에서 진행.
--
--  실행 위치: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================================

-- gen_random_uuid() 사용 (Supabase 기본 제공)
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 공통 규칙
--   row_id      : 내부용 고유키 (충돌 방지용 surrogate key)
--   id          : 앱이 만든 식별자 (예: 't1717...', 'cat_...') — 화면 로직이 사용
--   user_id     : 소유자 (auth.users) — 보안(RLS)의 기준
--   ledger_id   : 어느 가계부(budget) 소속인지
--   updated_at  : 마지막 수정 시각 (같은 항목 충돌 시 최신 우선 판단용)
--   deleted_at  : 삭제 표시 (실제로 안 지움 → 다른 기기에서 되살아남 방지)
--   unique(user_id, ledger_id, id) : 같은 가계부 안에서 앱 id 유일
-- 모든 테이블에 RLS(행 보안): 내 행만 읽고/쓰기 가능.
-- ----------------------------------------------------------------------------

-- 작은 헬퍼: updated_at 자동 갱신 트리거 함수
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;


-- ===== 0. 가계부 목록 ========================================================
create table if not exists ledgers (
  row_id     uuid primary key default gen_random_uuid(),
  id         text not null,                       -- 앱 가계부 id (예: 'budget_default')
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default '내 가계부',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id)
);

-- 가계부별 앱 설정(잡다한 상태값) — 종류가 많지 않고 통짜라 jsonb로 보관
create table if not exists ledger_settings (
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id                text not null,
  category_hidden_months   jsonb not null default '{}'::jsonb,
  category_exclude_months  jsonb not null default '{}'::jsonb,
  dashboard_widget_order   jsonb not null default '[]'::jsonb,
  budget_carried_months    jsonb not null default '[]'::jsonb,
  dashboard_memo           text  not null default '',
  dismissed_notification_ids jsonb not null default '[]'::jsonb,
  notification_log         jsonb not null default '[]'::jsonb,
  investment_exchange_rates jsonb not null default '{}'::jsonb,
  is_setup_complete        boolean not null default false,
  updated_at               timestamptz not null default now(),
  primary key (user_id, ledger_id)
);


-- ===== 1. 계좌 ===============================================================
create table if not exists accounts (
  row_id              uuid primary key default gen_random_uuid(),
  id                  text not null,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id           text not null,
  name                text not null,
  bank                text,
  balance             numeric not null default 0,
  color               text,
  asset_type          text default 'cash',         -- cash | savings | investment
  investment_sub_type text,
  memo                text,
  account_number      text,
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 2. 카테고리 ===========================================================
create table if not exists categories (
  row_id            uuid primary key default gen_random_uuid(),
  id                text not null,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id         text not null,
  name              text not null,
  type              text not null,                 -- income | expense | transfer | refund
  icon              text,
  color             text,
  parent_id         text,                          -- null = 대분류
  saving_id         text,
  role              text,                          -- card_payment | savings | investment
  exclude_from_real boolean,
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 3. 거래내역 (수입/지출/이체/환급 모두) =================================
--  ※ '환급'은 거래의 한 유형(type='refund')이라 이 테이블에 함께 들어감.
create table if not exists transactions (
  row_id              uuid primary key default gen_random_uuid(),
  id                  text not null,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id           text not null,
  date                text not null,               -- YYYY-MM-DD
  description         text,
  amount              numeric not null default 0,
  type                text not null,               -- income | expense | transfer | refund
  account_id          text,
  to_account_id       text,                        -- 이체 시 받는 계좌
  category_id         text,
  payment_method      text,                        -- account | card
  card_id             text,
  note                text,
  is_installment      boolean,
  installment_months  integer,
  installment_current integer,
  saving_links        jsonb,                       -- [{savingId, amount}] (적금 연동)
  billing_month       text,                        -- 카드대금 청구월 YYYY-MM
  consumption_type    text,                        -- normal | savings_transfer | card_payment | investment
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 4. 예산 ===============================================================
create table if not exists budgets (
  row_id      uuid primary key default gen_random_uuid(),
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id   text not null,
  category_id text not null,
  month       text not null,                       -- YYYY-MM
  amount      numeric not null default 0,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 5. 카드 ===============================================================
create table if not exists cards (
  row_id            uuid primary key default gen_random_uuid(),
  id                text not null,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id         text not null,
  name              text not null,
  bank              text,
  billing_date      integer,
  color             text,
  annual_fee_amount numeric,
  annual_fee_date   text,
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 6. 할부 ===============================================================
create table if not exists installments (
  row_id         uuid primary key default gen_random_uuid(),
  id             text not null,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id      text not null,
  card_id        text,
  description    text,
  total_amount   numeric not null default 0,
  monthly_amount numeric not null default 0,
  total_months   integer,
  paid_months    integer,
  start_date     text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 7. 적금·예금 ==========================================================
create table if not exists savings (
  row_id          uuid primary key default gen_random_uuid(),
  id              text not null,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id       text not null,
  name            text not null,
  bank            text,
  status          text,                            -- active | matured
  type            text,                            -- saving | deposit | subscription
  monthly_amount  numeric,
  interest_rate   numeric,
  start_date      text,
  maturity_date   text,
  current_amount  numeric,
  expected_amount numeric,
  interest_type   text,
  manual_interest boolean,
  tax_type        text,
  account_number  text,
  payment_cycle   text,
  payment_day     integer,
  payment_weekday integer,
  payment_amount  numeric,
  target_amount   numeric,
  skip_weekends   boolean,
  actual_interest numeric,
  memo            text,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 8. 적금 납입이력 ======================================================
create table if not exists saving_payments (
  row_id     uuid primary key default gen_random_uuid(),
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id  text not null,
  saving_id  text not null,
  date       text,
  amount     numeric not null default 0,
  note       text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 9. 재무목표 ===========================================================
create table if not exists goals (
  row_id         uuid primary key default gen_random_uuid(),
  id             text not null,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id      text not null,
  name           text not null,
  target_amount  numeric,
  current_amount numeric,
  deadline       text,
  color          text,
  goal_category  text,
  target_date    text,
  start_date     text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 10. 목표 납입이력 =====================================================
create table if not exists goal_payments (
  row_id     uuid primary key default gen_random_uuid(),
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id  text not null,
  goal_id    text not null,
  date       text,
  amount     numeric not null default 0,
  note       text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 11. 카드 청구·납부 ====================================================
create table if not exists card_billings (
  row_id        uuid primary key default gen_random_uuid(),
  id            text not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id     text not null,
  card_id       text,
  billing_month text,                              -- 사용월 YYYY-MM
  payment_month text,                              -- 납부월 YYYY-MM
  total_amount  numeric not null default 0,
  paid_amount   numeric not null default 0,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 12. 가맹점-카테고리 매핑 규칙 =========================================
create table if not exists mapping_rules (
  row_id      uuid primary key default gen_random_uuid(),
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id   text not null,
  keyword     text,
  category_id text,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 13. 투자 계좌 유형 ====================================================
create table if not exists investment_account_types (
  row_id     uuid primary key default gen_random_uuid(),
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id  text not null,
  name       text not null,
  is_default boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 14. 투자 계좌 =========================================================
create table if not exists investment_accounts (
  row_id         uuid primary key default gen_random_uuid(),
  id             text not null,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id      text not null,
  name           text not null,
  bank           text,
  type_id        text,
  type           text,                             -- 레거시 호환
  color          text,
  cash_deposits  numeric,
  account_number text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 15. 보유 종목 =========================================================
create table if not exists investments (
  row_id                   uuid primary key default gen_random_uuid(),
  id                       text not null,
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id                text not null,
  account_id               text,
  asset_type               text,                   -- domestic_stock | foreign_stock | etf_fund | crypto
  name                     text not null,
  ticker                   text,
  exchange                 text,
  currency                 text,
  current_price            numeric,
  current_price_updated_at text,
  prev_close_diff          numeric,
  prev_close_diff_rate     numeric,
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 16. 투자 거래 =========================================================
create table if not exists investment_trades (
  row_id            uuid primary key default gen_random_uuid(),
  id                text not null,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id         text not null,
  investment_id     text,
  type              text,                          -- buy | sell
  date              text,
  quantity          numeric,
  price             numeric,
  currency          text,
  exchange_rate     numeric,
  fee               numeric,
  note              text,
  cash_account_id   text,
  linked_tx_id      text,
  linked_deposit_id text,
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 17. 배당금 ============================================================
create table if not exists investment_dividends (
  row_id          uuid primary key default gen_random_uuid(),
  id              text not null,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id       text not null,
  account_id      text,
  investment_id   text,
  date            text,
  gross_amount    numeric,
  tax             numeric,
  net_amount      numeric,
  note            text,
  cash_account_id text,
  linked_tx_id    text,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 18. 예수금 입금내역 ===================================================
create table if not exists investment_cash_deposits (
  row_id     uuid primary key default gen_random_uuid(),
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id  text not null,
  account_id text,
  date       text,
  amount     numeric not null default 0,
  note       text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, ledger_id, id)
);

-- ===== 19. 포트폴리오 플랜 (계좌별 1개, 내부는 nested → jsonb) ===============
create table if not exists portfolio_plans (
  row_id     uuid primary key default gen_random_uuid(),
  account_id text not null,                        -- 앱에선 이게 식별자 역할
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id  text not null,
  items      jsonb not null default '[]'::jsonb,
  groups     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, ledger_id, account_id)
);

-- ===== 20. 관심종목 ==========================================================
create table if not exists watchlist (
  row_id                   uuid primary key default gen_random_uuid(),
  id                       text not null,
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_id                text not null,
  name                     text not null,
  ticker                   text,
  exchange                 text,
  asset_type               text,
  currency                 text,
  current_price            numeric,
  prev_close_diff          numeric,
  prev_close_diff_rate     numeric,
  current_price_updated_at text,
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  unique (user_id, ledger_id, id)
);


-- ============================================================================
--  인덱스 — 가계부별 조회를 빠르게
-- ============================================================================
create index if not exists idx_accounts_uld        on accounts(user_id, ledger_id);
create index if not exists idx_categories_uld       on categories(user_id, ledger_id);
create index if not exists idx_transactions_uld     on transactions(user_id, ledger_id);
create index if not exists idx_transactions_date    on transactions(user_id, ledger_id, date);
create index if not exists idx_budgets_uld          on budgets(user_id, ledger_id);
create index if not exists idx_cards_uld            on cards(user_id, ledger_id);
create index if not exists idx_installments_uld     on installments(user_id, ledger_id);
create index if not exists idx_savings_uld          on savings(user_id, ledger_id);
create index if not exists idx_saving_payments_uld  on saving_payments(user_id, ledger_id);
create index if not exists idx_goals_uld            on goals(user_id, ledger_id);
create index if not exists idx_goal_payments_uld    on goal_payments(user_id, ledger_id);
create index if not exists idx_card_billings_uld    on card_billings(user_id, ledger_id);
create index if not exists idx_mapping_rules_uld    on mapping_rules(user_id, ledger_id);
create index if not exists idx_inv_acct_types_uld   on investment_account_types(user_id, ledger_id);
create index if not exists idx_inv_accounts_uld     on investment_accounts(user_id, ledger_id);
create index if not exists idx_investments_uld      on investments(user_id, ledger_id);
create index if not exists idx_inv_trades_uld       on investment_trades(user_id, ledger_id);
create index if not exists idx_inv_dividends_uld    on investment_dividends(user_id, ledger_id);
create index if not exists idx_inv_cash_uld         on investment_cash_deposits(user_id, ledger_id);
create index if not exists idx_portfolio_uld        on portfolio_plans(user_id, ledger_id);
create index if not exists idx_watchlist_uld        on watchlist(user_id, ledger_id);


-- ============================================================================
--  RLS (행 보안) — 모든 테이블: 내 행만 읽기/쓰기 가능
--  + updated_at 자동 갱신 트리거
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'ledgers','ledger_settings','accounts','categories','transactions','budgets',
    'cards','installments','savings','saving_payments','goals','goal_payments',
    'card_billings','mapping_rules','investment_account_types','investment_accounts',
    'investments','investment_trades','investment_dividends','investment_cash_deposits',
    'portfolio_plans','watchlist'
  ]
  loop
    -- RLS 켜기
    execute format('alter table %I enable row level security;', t);

    -- 기존 정책 있으면 지우고 다시 생성 (재실행 안전)
    execute format('drop policy if exists %I on %I;', t||'_owner', t);
    execute format($p$
      create policy %I on %I
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $p$, t||'_owner', t);

    -- updated_at 자동 갱신 트리거
    execute format('drop trigger if exists %I on %I;', 'trg_'||t||'_updated', t);
    execute format($tr$
      create trigger %I before update on %I
      for each row execute function set_updated_at();
    $tr$, 'trg_'||t||'_updated', t);
  end loop;
end $$;

-- 끝. 이 스크립트는 새 테이블만 추가하며 기존 데이터엔 영향이 없습니다.
