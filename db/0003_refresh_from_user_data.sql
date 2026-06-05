-- ============================================================================
--  household-budget : 항목별 테이블을 "현재 데이터"로 새로 채우기 (전체 계정)  v1
--
--  배경: 0002로 복사한 뒤 데이터가 바뀌어서(유실→복구 등) 테이블이 옛 상태임.
--        검증 전에 현재 진짜 데이터(user_data blob)로 테이블을 깨끗이 다시 채운다.
--
--  하는 일:
--    1) 항목별 테이블을 모두 비운다 (TRUNCATE) — "복사본"만 비움
--    2) user_data의 모든 행(=모든 계정)을 다시 복사
--
--  ✅ 안전: user_data(진짜 데이터)는 읽기만 한다. 비우는 건 아직 안 쓰는 복사본 테이블뿐.
--  실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================================

-- 1) 복사본 테이블 비우기 (서로 참조하는 FK 없음 → 순서 무관)
truncate table
  ledgers, ledger_settings, accounts, categories, transactions, budgets,
  cards, installments, savings, saving_payments, goals, goal_payments,
  card_billings, mapping_rules, investment_account_types, investment_accounts,
  investments, investment_trades, investment_dividends, investment_cash_deposits,
  portfolio_plans, watchlist;

-- 2) user_data(모든 계정) → 항목별 테이블 재복사  (0002와 동일 로직)
do $$
declare
  u           record;
  bl          jsonb;
  ledger_key  text;
  ledger_val  jsonb;
  it          jsonb;
begin
  for u in select user_id, data from user_data where data is not null loop

    if u.data ? 'budgetList' then
      for bl in select value from jsonb_array_elements(u.data->'budgetList') loop
        insert into ledgers (id, user_id, name, created_at)
        values (bl->>'id', u.user_id, coalesce(nullif(bl->>'name',''), '내 가계부'),
                coalesce((bl->>'createdAt')::timestamptz, now()))
        on conflict (user_id, id) do nothing;
      end loop;
    end if;

    if u.data ? 'budgets' then
    for ledger_key, ledger_val in select key, value from jsonb_each(u.data->'budgets') loop

      insert into ledgers (id, user_id, name)
      values (ledger_key, u.user_id, '내 가계부')
      on conflict (user_id, id) do nothing;

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

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'accounts','[]'::jsonb)) loop
        insert into accounts (id,user_id,ledger_id,name,bank,balance,color,asset_type,investment_sub_type,memo,account_number)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',
                coalesce((it->>'balance')::numeric,0),it->>'color',
                coalesce(nullif(it->>'assetType',''),'cash'),it->>'investmentSubType',it->>'memo',it->>'accountNumber')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'categories','[]'::jsonb)) loop
        insert into categories (id,user_id,ledger_id,name,type,icon,color,parent_id,saving_id,role,exclude_from_real)
        values (it->>'id',u.user_id,ledger_key,it->>'name',coalesce(nullif(it->>'type',''),'expense'),
                it->>'icon',it->>'color',it->>'parentId',it->>'savingId',it->>'role',
                (it->>'excludeFromReal')::boolean)
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

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

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'budgets','[]'::jsonb)) loop
        insert into budgets (id,user_id,ledger_id,category_id,month,amount)
        values (it->>'id',u.user_id,ledger_key,it->>'categoryId',it->>'month',coalesce((it->>'amount')::numeric,0))
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'cards','[]'::jsonb)) loop
        insert into cards (id,user_id,ledger_id,name,bank,billing_date,color,annual_fee_amount,annual_fee_date)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',(it->>'billingDate')::int,it->>'color',
                (it->>'annualFeeAmount')::numeric,it->>'annualFeeDate')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'installments','[]'::jsonb)) loop
        insert into installments (id,user_id,ledger_id,card_id,description,total_amount,monthly_amount,total_months,paid_months,start_date)
        values (it->>'id',u.user_id,ledger_key,it->>'cardId',it->>'description',
                coalesce((it->>'totalAmount')::numeric,0),coalesce((it->>'monthlyAmount')::numeric,0),
                (it->>'totalMonths')::int,(it->>'paidMonths')::int,it->>'startDate')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

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

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'savingPayments','[]'::jsonb)) loop
        insert into saving_payments (id,user_id,ledger_id,saving_id,date,amount,note)
        values (it->>'id',u.user_id,ledger_key,it->>'savingId',it->>'date',coalesce((it->>'amount')::numeric,0),it->>'note')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'goals','[]'::jsonb)) loop
        insert into goals (id,user_id,ledger_id,name,target_amount,current_amount,deadline,color,goal_category,target_date,start_date)
        values (it->>'id',u.user_id,ledger_key,it->>'name',(it->>'targetAmount')::numeric,(it->>'currentAmount')::numeric,
                it->>'deadline',it->>'color',it->>'goalCategory',it->>'targetDate',it->>'startDate')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'goalPayments','[]'::jsonb)) loop
        insert into goal_payments (id,user_id,ledger_id,goal_id,date,amount,note)
        values (it->>'id',u.user_id,ledger_key,it->>'goalId',it->>'date',coalesce((it->>'amount')::numeric,0),it->>'note')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'cardBillings','[]'::jsonb)) loop
        insert into card_billings (id,user_id,ledger_id,card_id,billing_month,payment_month,total_amount,paid_amount)
        values (it->>'id',u.user_id,ledger_key,it->>'cardId',it->>'billingMonth',it->>'paymentMonth',
                coalesce((it->>'totalAmount')::numeric,0),coalesce((it->>'paidAmount')::numeric,0))
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'mappingRules','[]'::jsonb)) loop
        insert into mapping_rules (id,user_id,ledger_id,keyword,category_id)
        values (it->>'id',u.user_id,ledger_key,it->>'keyword',it->>'categoryId')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentAccountTypes','[]'::jsonb)) loop
        insert into investment_account_types (id,user_id,ledger_id,name,is_default)
        values (it->>'id',u.user_id,ledger_key,it->>'name',coalesce((it->>'isDefault')::boolean,false))
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentAccounts','[]'::jsonb)) loop
        insert into investment_accounts (id,user_id,ledger_id,name,bank,type_id,type,color,cash_deposits,account_number)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'bank',it->>'typeId',it->>'type',it->>'color',
                (it->>'cashDeposits')::numeric,it->>'accountNumber')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investments','[]'::jsonb)) loop
        insert into investments (id,user_id,ledger_id,account_id,asset_type,name,ticker,exchange,currency,
                current_price,current_price_updated_at,prev_close_diff,prev_close_diff_rate)
        values (it->>'id',u.user_id,ledger_key,it->>'accountId',it->>'assetType',it->>'name',it->>'ticker',
                it->>'exchange',it->>'currency',(it->>'currentPrice')::numeric,it->>'currentPriceUpdatedAt',
                (it->>'prevCloseDiff')::numeric,(it->>'prevCloseDiffRate')::numeric)
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentTrades','[]'::jsonb)) loop
        insert into investment_trades (id,user_id,ledger_id,investment_id,type,date,quantity,price,currency,
                exchange_rate,fee,note,cash_account_id,linked_tx_id,linked_deposit_id)
        values (it->>'id',u.user_id,ledger_key,it->>'investmentId',it->>'type',it->>'date',
                (it->>'quantity')::numeric,(it->>'price')::numeric,it->>'currency',(it->>'exchangeRate')::numeric,
                (it->>'fee')::numeric,it->>'note',it->>'cashAccountId',it->>'linkedTxId',it->>'linkedDepositId')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentDividends','[]'::jsonb)) loop
        insert into investment_dividends (id,user_id,ledger_id,account_id,investment_id,date,gross_amount,tax,
                net_amount,note,cash_account_id,linked_tx_id)
        values (it->>'id',u.user_id,ledger_key,it->>'accountId',it->>'investmentId',it->>'date',
                (it->>'grossAmount')::numeric,(it->>'tax')::numeric,(it->>'netAmount')::numeric,it->>'note',
                it->>'cashAccountId',it->>'linkedTxId')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'investmentCashDeposits','[]'::jsonb)) loop
        insert into investment_cash_deposits (id,user_id,ledger_id,account_id,date,amount,note)
        values (it->>'id',u.user_id,ledger_key,it->>'accountId',it->>'date',coalesce((it->>'amount')::numeric,0),it->>'note')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'portfolioPlans','[]'::jsonb)) loop
        insert into portfolio_plans (account_id,user_id,ledger_id,items,groups)
        values (it->>'accountId',u.user_id,ledger_key,
                coalesce(it->'items','[]'::jsonb),coalesce(it->'groups','[]'::jsonb))
        on conflict (user_id,ledger_id,account_id) do nothing;
      end loop;

      for it in select value from jsonb_array_elements(coalesce(ledger_val->'watchlist','[]'::jsonb)) loop
        insert into watchlist (id,user_id,ledger_id,name,ticker,exchange,asset_type,currency,
                current_price,prev_close_diff,prev_close_diff_rate,current_price_updated_at)
        values (it->>'id',u.user_id,ledger_key,it->>'name',it->>'ticker',it->>'exchange',it->>'assetType',
                it->>'currency',(it->>'currentPrice')::numeric,(it->>'prevCloseDiff')::numeric,
                (it->>'prevCloseDiffRate')::numeric,it->>'currentPriceUpdatedAt')
        on conflict (user_id,ledger_id,id) do nothing;
      end loop;

    end loop;
    end if;
  end loop;
end $$;

-- 확인: 갱신 후 테이블 거래수 (blob 총합과 같아야 함 = 약 1014)
select count(*) as 테이블_거래수 from transactions where deleted_at is null;
