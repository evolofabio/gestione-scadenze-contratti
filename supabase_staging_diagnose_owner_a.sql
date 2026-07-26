-- ProrogaPro - Staging Diagnose owner.a@example.com
-- Esegui questo file nel SQL Editor di Supabase staging.
-- Se stai impersonando owner.a@example.com, i primi blocchi devono risultare valorizzati.

-- =====================================================
-- CHECK 1 - IMPERSONAZIONE ATTIVA?
-- Atteso:
-- - auth_user_id NON null
-- =====================================================
select auth.uid() as auth_user_id;
select auth.jwt() as auth_jwt;

-- =====================================================
-- CHECK 2 - ESISTE L'UTENTE IN AUTH?
-- Atteso:
-- - 1 riga per owner.a@example.com
-- =====================================================
select id, email, created_at
from auth.users
where email = 'owner.a@example.com';

-- =====================================================
-- CHECK 3 - ESISTE IL PROFILO APPLICATIVO?
-- Atteso:
-- - 1 riga
-- - role = owner
-- - status = approved
-- - is_active = true
-- - company_id NON null
-- =====================================================
select id, email, company_id, role, status, is_active, full_name, created_at, updated_at
from public.profiles
where email = 'owner.a@example.com';

-- =====================================================
-- CHECK 4 - IL PROFILO COMBACIA CON L'UTENTE IMPERSONATO?
-- Atteso:
-- - 1 riga se auth.uid() corrisponde al profilo seedato
-- =====================================================
select id, email, company_id, role, status, is_active
from public.profiles
where id = auth.uid();

-- =====================================================
-- CHECK 5 - HELPER RLS
-- Atteso:
-- - company_id NON null
-- - app_role = owner
-- =====================================================
select public.current_company_id() as company_id;
select public.current_user_role() as app_role;
select public.current_company_subscription_status() as subscription_status;

-- =====================================================
-- CHECK 6 - DATI TENANT DI TEST
-- Atteso:
-- - esiste validation-company-a
-- =====================================================
select id, name, slug, admin_email, is_active
from public.companies
where slug in ('validation-company-a', 'validation-company-b')
order by id;

-- =====================================================
-- CHECK 7 - SUBSCRIPTION TENANT A
-- Atteso:
-- - almeno 1 riga per validation-company-a
-- =====================================================
select s.id, s.company_id, s.provider_subscription_id, s.status, s.billing_cycle
from public.subscriptions s
join public.companies c on c.id = s.company_id
where c.slug = 'validation-company-a';
