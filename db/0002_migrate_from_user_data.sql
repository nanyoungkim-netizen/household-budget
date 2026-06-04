-- ============================================================================
--  household-budget : 기존 데이터 이사 (user_data JSON → 항목별 테이블)  v1
--
--  하는 일: user_data 테이블의 통짜 JSON(data)을 읽어서, 0001에서 만든
--           항목별 테이블에 한 건씩 복사한다.
--
--  ✅ 안전:
--    - user_data 원본은 읽기만 한다 (지우거나 바꾸지 않음).
--    - 모든 insert 는 "on conflict do nothing" → 여러 번 실행해도 중복 안 생김.
--    - 사용자별 user_id 를 명시적으로 채워 넣는다 (SQL Editor에서 auth.uid()는
--      null 이므로 반드시 원본의 user_id 사용).
--
--  실행 위치: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
--  실행 후: 맨 아래 결과(건수 표)가 뜬다 → 화면에서 본 데이터와 비슷한지 확인.
-- ============================================================================

do $$
declare
  u           record;   -- user_data 의 각 행 (user_id, data)
  bl          jsonb;    -- budgetList 원소
  ledger_key  text;     -- budgets 의 키 = 가계부 id
  ledger_val  jsonb;    -- 해당 가계부의 AppData
  it          jsonb;    -- 배열 원소 (거래 1건 등)
begin
  for u in select user_id, data from user_data where data is not null loop

    -- ── 가계부 목록 (budgetList) ────────────────────────────────────────
    if u.data ? 'budgetList' then
      for bl in select value from jsonb_array_elements(u.data->'budgetList') loop
        insert into ledgers (id, user_id, name, created_at)
        values (
          bl->>'id', u.user_id,
          coalesce(nullif(bl->>'name',''), '내 가계부'),
          coalesce((bl->>'createdAt')::timestamptz, now())
        )
        on conflict (user_id, id) do nothing;
      end loop;
    end if;

    -- ── 각 가계부(budgets[ledgerId]) 안의 데이터 ─────────────────────────
    if u.data ? 'budgets' then
    for ledger_key, ledger_val in select key, value from jsonb_each(u.data->'budgets') loop

      -- budgetList 에 없던 가계부도 행 보장
      insert into ledgers (id, user_id, name)
      values (ledger_key, u.user_id, '내 가계부')
      on conflict (user_id, id) do nothing;

      -- 가계부별 설정값
      insert into ledger_settings (
        user_id, ledger_id, category_hidden_months, category_exclude_months,
        dashboard_widget_order, budget_carried_months, dashboard_memo,
        dismissed_notification_ids, notification_log, investment_exchange_rates, is_setup_complete
      ) values (
        u.user_id, ledger_key,
        coalesce(ledger_val->'categoryHiddenMonths', '{}'::jsonb),
        coalesce(ledger_val->'categoryExcludeMonths', '{}'::jsonb),
        coalesce(ledger_val->'dashboardWidgetOrder', '[]'::jsonb),
        coalesce(ledger_val->'budgetCarriedMonths', '[]'::jsonb),
        coalesce(ledger_val->>'dashboardMemo', ''),
        coalesce(ledger_val->'dismissedNotificationIds', '[]'::jsonb),
        coalesce(ledger_val->'notificationLog', '[]'::jsonb),
        coalesce(ledger_val->'investmentExchangeRates', '{}'::jsonb),
        coalesce((ledger_val->>'isSetupComplete')::boolean, false)
      )
      on conflict (user_id, ledger_id) do nothing;

      -- 계좌
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'accounts','[]'::jsonb)) loop
        insert into accounts (id,user_id,ledger_id,name,bank,balance,color,asset_type,investment_sub_type,memo,account_number)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',
                coalesce((it->>'balance')::numeric,0),it->>'color',
                coalesce(nullif(it->>'assetType',''),'cash'),it->>'investmentSubType',it->>'memo',it->>'accountNumber')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 카테고리
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'categories','[]'::jsonb)) loop
        insert into categories (id,user_id,ledger_id,name,type,icon,color,parent_id,saving_id,role,exclude_from_real)
        values (it->>'id',u.user_id,ledger_key,it->>'name',coalesce(nullif(it->>'type',''),'expense'),
                it->>'icon',it->>'color',it->>'parentId',it->>'savingId',it->>'role',
                (it->>'excludeFromReal')::boolean)
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 거래내역 (수입/지출/이체/환급)
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'transactions','[]'::jsonb)) loop
        insert into transactions (id,user_id,ledger_id,date,description,amount,type,account_id,to_account_id,
                category_id,payment_method,card_id,note,is_installment,installment_months,installment_current,
                saving_links,billing_month,consumption_type)
        values (it->>'id',u.user_id,ledger_key,it->>'date',it->>'description',
                coalesce((it->>'amount')::numeric,0),it->>'type',it->>'accountId',it->>'toAccountId',
                it->>'categoryId',it->>'paymentMethod',it->>'cardId',it->>'note',
                (it->>'isInstallment')::boolean,(it->>'installmentMonths')::int,(it->>'installmentCurrent')::int,
                it->'savingLinks',it->>'billingMonth',it->>'consumptionType')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 예산
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'budgets','[]'::jsonb)) loop
        insert into budgets (id,user_id,ledger_id,category_id,month,amount)
        values (it->>'id',u.user_id,ledger_key,it->>'categoryId',it->>'month',coalesce((it->>'amount')::numeric,0))
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 카드
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'cards','[]'::jsonb)) loop
        insert into cards (id,user_id,ledger_id,name,bank,billing_date,color,annual_fee_amount,annual_fee_date)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',(it->>'billingDate')::int,it->>'color',
                (it->>'annualFeeAmount')::numeric,it->>'annualFeeDate')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 할부
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'installments','[]'::jsonb)) loop
        insert into installments (id,user_id,ledger_id,card_id,description,total_amount,monthly_amount,total_months,paid_months,start_date)
        values (it->>'id',u.user_id,ledger_key,it->>'cardId',it->>'description',
                coalesce((it->>'totalAmount')::numeric,0),coalesce((it->>'monthlyAmount')::numeric,0),
                (it->>'totalMonths')::int,(it->>'paidMonths')::int,it->>'startDate')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 적금·예금
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'savings','[]'::jsonb)) loop
        insert into savings (id,user_id,ledger_id,name,bank,status,type,monthly_amount,interest_rate,start_date,
                maturity_date,current_amount,expected_amount,interest_type,manual_interest,tax_type,account_number,
                payment_cycle,payment_day,payment_weekday,payment_amount,target_amount,skip_weekends,actual_interest,memo)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',it->>'status',it->>'type',
                (it->>'monthlyAmount')::numeric,(it->>'interestRate')::numeric,it->>'startDate',
                it->>'maturityDate',(it->>'currentAmount')::numeric,(it->>'expectedAmount')::numeric,
                it->>'interestType',(it->>'manualInterest')::boolean,it->>'taxType',it->>'accountNumber',
                it->>'paymentCycle',(it->>'paymentDay')::int,(it->>'paymentWeekday')::int,
                (it->>'paymentAmount')::numeric,(it->>'targetAmount')::numeric,(it->>'skipWeekends')::boolean,
                (it->>'actualInterest')::numeric,it->>'memo')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 적금 납입이력
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'savingPayments','[]'::jsonb)) loop
        insert into saving_payments (id,user_id,ledger_id,saving_id,date,amount,note)
        values (it->>'id',u.user_id,ledger_key,it->>'savingId',it->>'date',coalesce((it->>'amount')::numeric,0),it->>'note')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 재무목표
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'goals','[]'::jsonb)) loop
        insert into goals (id,user_id,ledger_id,name,target_amount,current_amount,deadline,color,goal_category,target_date,start_date)
        values (it->>'id',u.user_id,ledger_key,it->>'name',(it->>'targetAmount')::numeric,(it->>'currentAmount')::numeric,
                it->>'deadline',it->>'color',it->>'goalCategory',it->>'targetDate',it->>'startDate')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 목표 납입이력
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'goalPayments','[]'::jsonb)) loop
        insert into goal_payments (id,user_id,ledger_id,goal_id,date,amount,note)
        values (it->>'id',u.user_id,ledger_key,it->>'goalId',it->>'date',coalesce((it->>'amount')::numeric,0),it->>'note')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 카드 청구·납부
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'cardBillings','[]'::jsonb)) loop
        insert into card_billings (id,user_id,ledger_id,card_id,billing_month,payment_month,total_amount,paid_amount)
        values (it->>'id',u.user_id,ledger_key,it->>'cardId',it->>'billingMonth',it->>'paymentMonth',
                coalesce((it->>'totalAmount')::numeric,0),coalesce((it->>'paidAmount')::numeric,0))
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 매핑 규칙
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'mappingRules','[]'::jsonb)) loop
        insert into mapping_rules (id,user_id,ledger_id,keyword,category_id)
        values (it->>'id',u.user_id,ledger_key,it->>'keyword',it->>'categoryId')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 투자 계좌 유형
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentAccountTypes','[]'::jsonb)) loop
        insert into investment_account_types (id,user_id,ledger_id,name,is_default)
        values (it->>'id',u.user_id,ledger_key,it->>'name',coalesce((it->>'isDefault')::boolean,false))
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 투자 계좌
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentAccounts','[]'::jsonb)) loop
        insert into investment_accounts (id,user_id,ledger_id,name,bank,type_id,type,color,cash_deposits,account_number)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',it->>'typeId',it->>'type',it->>'color',
                (it->>'cashDeposits')::numeric,it->>'accountNumber')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 보유 종목
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investments','[]'::jsonb)) loop
        insert into investments (id,user_id,ledger_id,account_id,asset_type,name,ticker,exchange,currency,
                current_price,current_price_updated_at,prev_close_diff,prev_close_diff_rate)
        values (it->>'id',u.user_id,ledger_key,it->>'accountId',it->>'assetType',it->>'name',it->>'ticker',
                it->>'exchange',it->>'currency',(it->>'currentPrice')::numeric,it->>'currentPriceUpdatedAt',
                (it->>'prevCloseDiff')::numeric,(it->>'prevCloseDiffRate')::numeric)
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 투자 거래
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentTrades','[]'::jsonb)) loop
        insert into investment_trades (id,user_id,ledger_id,investment_id,type,date,quantity,price,currency,
                exchange_rate,fee,note,cash_account_id,linked_tx_id,linked_deposit_id)
        values (it->>'id',u.user_id,ledger_key,it->>'investmentId',it->>'type',it->>'date',
                (it->>'quantity')::numeric,(it->>'price')::numeric,it->>'currency',(it->>'exchangeRate')::numeric,
                (it->>'fee')::numeric,it->>'note',it->>'cashAccountId',it->>'linkedTxId',it->>'linkedDepositId')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 배당금
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentDividends','[]'::jsonb)) loop
        insert into investment_dividends (id,user_id,ledger_id,account_id,investment_id,date,gross_amount,tax,
                net_amount,note,cash_account_id,linked_tx_id)
        values (it->>'id',u.user_id,ledger_key,it->>'accountId',it->>'investmentId',it->>'date',
                (it->>'grossAmount')::numeric,(it->>'tax')::numeric,(it->>'netAmount')::numeric,it->>'note',
                it->>'cashAccountId',it->>'linkedTxId')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 예수금 입금내역
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentCashDeposits','[]'::jsonb)) loop
        insert into investment_cash_deposits (id,user_id,ledger_id,account_id,date,amount,note)
        values (it->>'id',u.user_id,ledger_key,it->>'accountId',it->>'date',coalesce((it->>'amount')::numeric,0),it->>'note')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      -- 포트폴리오 플랜 (계좌별 1개)
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'portfolioPlans','[]'::jsonb)) loop
        insert into portfolio_plans (account_id,user_id,ledger_id,items,groups)
        values (it->>'accountId',u.user_id,ledger_key,
                coalesce(it->'items','[]'::jsonb),coalesce(it->'groups','[]'::jsonb))
        on conflict (user_id,ledger_id,account_id) do nothing;
      end loop;

      -- 관심종목
      for it in select value from jsonb_array_elements(coalesce(ledger_val->'watchlist','[]'::jsonb)) loop
        insert into watchlist (id,user_id,ledger_id,name,ticker,exchange,asset_type,currency,
                current_price,prev_close_diff,prev_close_diff_rate,current_price_updated_at)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'ticker',it->>'exchange',it->>'assetType',
                it->>'currency',(it->>'currentPrice')::numeric,(it->>'prevCloseDiff')::numeric,
                (it->>'prevCloseDiffRate')::numeric,it->>'currentPriceUpdatedAt')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

    end loop;  -- 가계부 루프
    end if;
  end loop;    -- user_data 루프
end $$;

-- ── 확인용: 옮겨진 건수 요약 (이 결과가 화면에서 본 양과 비슷한지 확인) ──────
select '가계부'      as 항목, count(*) as 건수 from ledgers
union all select '계좌',       count(*) from accounts
union all select '카테고리',   count(*) from categories
union all select '거래내역',   count(*) from transactions
union all select '예산',       count(*) from budgets
union all select '카드',       count(*) from cards
union all select '할부',       count(*) from installments
union all select '적금예금',   count(*) from savings
union all select '적금납입',   count(*) from saving_payments
union all select '재무목표',   count(*) from goals
union all select '목표납입',   count(*) from goal_payments
union all select '카드청구',   count(*) from card_billings
union all select '매핑규칙',   count(*) from mapping_rules
union all select '투자계좌유형', count(*) from investment_account_types
union all select '투자계좌',   count(*) from investment_accounts
union all select '보유종목',   count(*) from investments
union all select '투자거래',   count(*) from investment_trades
union all select '배당금',     count(*) from investment_dividends
union all select '예수금',     count(*) from investment_cash_deposits
union all select '포트폴리오', count(*) from portfolio_plans
union all select '관심종목',   count(*) from watchlist
order by 항목;
