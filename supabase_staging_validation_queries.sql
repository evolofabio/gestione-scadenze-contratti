-- Evolution System - Staging Validation Queries
-- Eseguire in Supabase SQL Editor impersonando, a turno, i diversi utenti test.
-- Prerequisiti:
-- 1) supabase_schema.sql applicato
-- 2) supabase_migration_saas_phase1.sql applicato
-- 3) supabase_migration_saas_phase2.sql applicato
-- 4) due tenant di test: company_a, company_b
-- 5) utenti test: owner/admin/manager/viewer su entrambe le aziende

-- =====================================================
-- BLOCCO A - SANITY CHECK IDENTITA'
-- Expected: 1 riga, company_id valorizzato, role coerente con utente impersonato
-- =====================================================
select auth.uid() as auth_user_id;
select public.current_company_id() as company_id;
select public.current_user_role() as app_role;
select public.current_company_subscription_status() as subscription_status;

-- =====================================================
-- BLOCCO B - READ ISOLATION
-- Expected: solo dati del tenant dell'utente impersonato
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
-- BLOCCO C - WRITE TEST CONTRACTS
-- Eseguire solo se ruolo = owner/admin/manager
-- Expected:
-- owner/admin/manager => insert/update/delete consentiti nel proprio tenant
-- viewer => errore RLS su insert/update/delete
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
-- BLOCCO D - CROSS TENANT WRITE TEST
-- Sostituire 999999 con un company_id appartenente all'altro tenant.
-- Expected: errore RLS per tutti i ruoli applicativi.
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
-- BLOCCO E - PROFILE MANAGEMENT
-- Expected:
-- owner/admin => update consentito nel proprio tenant
-- manager/viewer => update negato
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
-- BLOCCO F - AUDIT CHECK
-- Eseguire dopo un insert/update/delete riuscito nel blocco C senza rollback, se si vuole verifica persistente.
-- In alternativa usare un database separato di test.
-- Expected:
-- owner/admin leggono audit_logs del proprio tenant
-- manager/viewer non vedono audit_logs
-- =====================================================
select id, company_id, action, entity, entity_id, created_at
from public.audit_logs
where company_id = public.current_company_id()
order by created_at desc
limit 10;

-- =====================================================
-- BLOCCO G - BILLING TABLES WRITE TEST
-- Expected:
-- owner/admin => update consentito su subscriptions e usage_metrics del proprio tenant
-- manager/viewer => update negato
-- authenticated standard => nessuna lettura su billing_webhook_events
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