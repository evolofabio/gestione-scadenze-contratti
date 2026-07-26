-- ProrogaPro - Staging Validation Quickstart
-- Scenario: primo test impersonando owner.a@example.com
-- Prerequisiti:
-- 1) supabase_schema.sql applicato
-- 2) supabase_migration_saas_phase1.sql applicato
-- 3) supabase_migration_saas_phase2.sql applicato
-- 4) supabase_staging_seed_template.sql eseguito con successo
-- 5) nel SQL Editor di Supabase stai impersonando owner.a@example.com

-- =====================================================
-- STEP 1 - IDENTITA'
-- Atteso:
-- - auth_user_id valorizzato
-- - company_id valorizzato
-- - app_role = owner
-- - subscription_status valorizzato, tipicamente active
-- =====================================================
select auth.uid() as auth_user_id;
select public.current_company_id() as company_id;
select public.current_user_role() as app_role;
select public.current_company_subscription_status() as subscription_status;

-- =====================================================
-- STEP 2 - LETTURA DATI DEL PROPRIO TENANT
-- Atteso:
-- - vedi solo record della company A
-- - non vedi record della company B
-- =====================================================
select id, company_id, employee_name
from public.contracts
order by id desc
limit 20;

select id, company_id, role, status, email
from public.profiles
order by created_at desc
limit 20;

select id, company_id, action, entity, created_at
from public.audit_logs
order by created_at desc
limit 20;

select id, company_id, plan_id, status, billing_cycle
from public.subscriptions
order by created_at desc
limit 20;

select id, company_id, metric_key, quantity, period_start, period_end
from public.usage_metrics
order by created_at desc
limit 20;

select id, code, name, is_active
from public.plans
order by id asc;

-- =====================================================
-- STEP 3 - TEST SCRITTURA CONTRATTI
-- Atteso per owner:
-- - insert consentito
-- - update consentito
-- - delete consentito
-- - rollback finale, quindi nessun dato resta nel DB
-- =====================================================
begin;

insert into public.contracts (
  company_id,
  employee_name,
  contract_type,
  start_date,
  end_date,
  renewable,
  renew_months,
  renew_type,
  renew_notice,
  renew_count,
  notes
)
values (
  public.current_company_id(),
  'RLS Test User',
  'Validation Contract',
  current_date,
  current_date + interval '30 day',
  true,
  6,
  'Automatica',
  15,
  0,
  'Staging validation write test'
)
returning id, company_id, employee_name;

update public.contracts
set notes = 'Staging validation write test - updated'
where id = (
  select id
  from public.contracts
  where company_id = public.current_company_id()
    and employee_name = 'RLS Test User'
  order by id desc
  limit 1
)
returning id, company_id, notes;

delete from public.contracts
where id = (
  select id
  from public.contracts
  where company_id = public.current_company_id()
    and employee_name = 'RLS Test User'
  order by id desc
  limit 1
)
returning id, company_id;

rollback;

-- =====================================================
-- STEP 4 - TEST CROSS TENANT
-- Atteso:
-- - deve fallire per RLS
-- Nota:
-- - sostituisci 999999 con il company_id reale della company B se vuoi un test ancora piu' preciso
-- =====================================================
begin;

insert into public.contracts (
  company_id,
  employee_name,
  contract_type,
  start_date,
  end_date
)
values (
  999999,
  'Cross Tenant Probe',
  'Should Fail',
  current_date,
  current_date + interval '7 day'
);

rollback;

-- =====================================================
-- STEP 5 - TEST GESTIONE PROFILI
-- Atteso per owner:
-- - update consentito sui profili del proprio tenant
-- - rollback finale, quindi nessuna modifica persistente
-- =====================================================
begin;

update public.profiles
set full_name = coalesce(full_name, 'Validation User') || ' [checked]',
    updated_at = now()
where company_id = public.current_company_id()
  and id <> auth.uid()
returning id, company_id, role, full_name;

rollback;

-- =====================================================
-- STEP 6 - AUDIT LOGS
-- Atteso per owner:
-- - lettura consentita dei log del proprio tenant
-- =====================================================
select id, company_id, action, entity, entity_id, created_at
from public.audit_logs
where company_id = public.current_company_id()
order by created_at desc
limit 10;

-- =====================================================
-- STEP 7 - TEST SCRITTURA BILLING
-- Atteso per owner:
-- - update consentito su subscriptions
-- - update consentito su usage_metrics
-- - rollback finale, quindi nessuna modifica persistente
-- - billing_webhook_events non leggibile da utente applicativo standard
-- =====================================================
begin;

update public.subscriptions
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('validation_checked_at', now()::text)
where company_id = public.current_company_id()
returning id, company_id, status;

update public.usage_metrics
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('validation_checked_at', now()::text)
where company_id = public.current_company_id()
returning id, company_id, metric_key;

rollback;

select id, provider, event_id, processed, created_at
from public.billing_webhook_events
order by created_at desc
limit 10;
