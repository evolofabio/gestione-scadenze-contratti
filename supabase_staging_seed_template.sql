-- Evolution System - Staging Seed Template
-- Uso:
-- 1) creare prima gli utenti in Supabase Auth con queste email placeholder
-- 2) sostituire le email se necessario
-- 3) eseguire questo script in staging dopo le migrazioni phase1/phase2

begin;

-- =====================================================
-- BLOCCO A - TENANT DI TEST
-- =====================================================
insert into public.companies (name, admin_email, slug, is_active)
values
  ('Validation Company A', 'owner.a@example.com', 'validation-company-a', true),
  ('Validation Company B', 'owner.b@example.com', 'validation-company-b', true)
on conflict (slug) do update
set
  name = excluded.name,
  admin_email = excluded.admin_email,
  is_active = excluded.is_active,
  updated_at = now();

-- =====================================================
-- BLOCCO B - PROFILI TEST
-- Prerequisito: gli utenti devono esistere in auth.users
-- =====================================================
with company_map as (
  select id, slug
  from public.companies
  where slug in ('validation-company-a', 'validation-company-b')
),
auth_map as (
  select id, email
  from auth.users
  where email in (
    'owner.a@example.com',
    'admin.a@example.com',
    'manager.a@example.com',
    'viewer.a@example.com',
    'owner.b@example.com',
    'admin.b@example.com',
    'manager.b@example.com',
    'viewer.b@example.com'
  )
),
seed_rows as (
  select
    a.id as user_id,
    a.email,
    case
      when a.email like '%.a@example.com' then (select id from company_map where slug = 'validation-company-a')
      else (select id from company_map where slug = 'validation-company-b')
    end as company_id,
    case
      when a.email like 'owner.%' then 'owner'
      when a.email like 'admin.%' then 'admin'
      when a.email like 'manager.%' then 'manager'
      else 'viewer'
    end as role,
    'approved'::text as status,
    true as is_active,
    replace(split_part(a.email, '@', 1), '.', ' ') as full_name
  from auth_map a
)
insert into public.profiles (
  id,
  company_id,
  role,
  email,
  status,
  is_active,
  full_name,
  created_at,
  updated_at
)
select
  user_id,
  company_id,
  role,
  email,
  status,
  is_active,
  initcap(full_name),
  now(),
  now()
from seed_rows
on conflict (id) do update
set
  company_id = excluded.company_id,
  role = excluded.role,
  email = excluded.email,
  status = excluded.status,
  is_active = excluded.is_active,
  full_name = excluded.full_name,
  updated_at = now();

-- =====================================================
-- BLOCCO C - SUBSCRIPTIONS DI TEST
-- =====================================================
insert into public.subscriptions (
  company_id,
  plan_id,
  provider,
  provider_customer_id,
  provider_subscription_id,
  status,
  billing_cycle,
  trial_start_at,
  trial_end_at,
  current_period_start,
  current_period_end,
  metadata
)
select
  c.id,
  p.id,
  'stripe',
  'cus_' || c.slug,
  'sub_' || c.slug,
  'active',
  'monthly',
  now() - interval '7 day',
  now() + interval '7 day',
  now() - interval '7 day',
  now() + interval '23 day',
  jsonb_build_object('seed', 'staging-template')
from public.companies c
join public.plans p on p.code = 'growth'
where c.slug in ('validation-company-a', 'validation-company-b')
on conflict (provider_subscription_id) do update
set
  plan_id = excluded.plan_id,
  status = excluded.status,
  billing_cycle = excluded.billing_cycle,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end,
  metadata = excluded.metadata,
  updated_at = now();

-- =====================================================
-- BLOCCO D - USAGE METRICS DI TEST
-- =====================================================
insert into public.usage_metrics (
  company_id,
  metric_key,
  period_start,
  period_end,
  quantity,
  metadata
)
select c.id, 'exports_count', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 12, '{"seed":"staging-template"}'::jsonb
from public.companies c
where c.slug in ('validation-company-a', 'validation-company-b')
on conflict (company_id, metric_key, period_start, period_end) do update
set
  quantity = excluded.quantity,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.usage_metrics (
  company_id,
  metric_key,
  period_start,
  period_end,
  quantity,
  metadata
)
select c.id, 'active_users', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 4, '{"seed":"staging-template"}'::jsonb
from public.companies c
where c.slug in ('validation-company-a', 'validation-company-b')
on conflict (company_id, metric_key, period_start, period_end) do update
set
  quantity = excluded.quantity,
  metadata = excluded.metadata,
  updated_at = now();

-- =====================================================
-- BLOCCO E - CONTRACTS DI TEST
-- =====================================================
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
select
  c.id,
  case when c.slug = 'validation-company-a' then 'Mario Rossi' else 'Giulia Bianchi' end,
  'Staging Validation Contract',
  current_date - 10,
  current_date + 50,
  true,
  6,
  'Automatica',
  15,
  1,
  'Seed di validazione staging'
from public.companies c
where c.slug in ('validation-company-a', 'validation-company-b')
  and not exists (
    select 1
    from public.contracts x
    where x.company_id = c.id
      and x.contract_type = 'Staging Validation Contract'
  );

commit;