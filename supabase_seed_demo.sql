-- Seed demo neutro per ProrogaPro
-- Eseguire DOPO supabase_schema.sql

BEGIN;

-- 1) Azienda demo
INSERT INTO companies (name, admin_email)
VALUES ('Azienda Demo Evolution', 'admin.demo@example.com')
ON CONFLICT DO NOTHING;

-- 2) Contratti demo collegati all'azienda demo
WITH demo_company AS (
  SELECT id FROM companies WHERE name = 'Azienda Demo Evolution' LIMIT 1
)
INSERT INTO contracts (
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
SELECT
  dc.id,
  v.employee_name,
  v.contract_type,
  v.start_date,
  v.end_date,
  v.renewable,
  v.renew_months,
  v.renew_type,
  v.renew_notice,
  v.renew_count,
  v.notes
FROM demo_company dc
CROSS JOIN (
  VALUES
    (
      'Utente Test 1',
      'Tempo determinato',
      CURRENT_DATE - INTERVAL '30 days',
      CURRENT_DATE + INTERVAL '20 days',
      TRUE,
      6,
      'Senza causale',
      30,
      1,
      'Contratto demo per verifica alert'
    ),
    (
      'Utente Test 2',
      'Apprendistato',
      CURRENT_DATE - INTERVAL '90 days',
      CURRENT_DATE + INTERVAL '60 days',
      TRUE,
      12,
      'Con causale',
      45,
      0,
      'Contratto demo per test dashboard'
    )
) AS v(
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
WHERE NOT EXISTS (
  SELECT 1
  FROM contracts c
  WHERE c.company_id = dc.id
    AND c.employee_name = v.employee_name
    AND c.contract_type = v.contract_type
);

COMMIT;

-- 3) Promozione utenti demo a profili applicativi
-- PREREQUISITO: registrare prima questi utenti in Supabase Auth:
-- - admin.demo@example.com
-- - user.demo@example.com

WITH demo_company AS (
  SELECT id FROM companies WHERE name = 'Azienda Demo Evolution' LIMIT 1
),
admin_user AS (
  SELECT id, email FROM auth.users WHERE email = 'admin.demo@example.com' LIMIT 1
),
normal_user AS (
  SELECT id, email FROM auth.users WHERE email = 'user.demo@example.com' LIMIT 1
)
INSERT INTO profiles (
  id,
  company_id,
  role,
  email,
  status,
  created_at,
  updated_at
)
SELECT
  u.id,
  dc.id,
  u.role,
  u.email,
  u.status,
  now(),
  now()
FROM demo_company dc
CROSS JOIN (
  SELECT id, email, 'admin'::text AS role, 'approved'::text AS status FROM admin_user
  UNION ALL
  SELECT id, email, 'user'::text AS role, 'approved'::text AS status FROM normal_user
) u
ON CONFLICT (id)
DO UPDATE SET
  company_id = EXCLUDED.company_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  status = EXCLUDED.status,
  updated_at = now();

-- 4) Verifica rapida
SELECT
  c.name AS company,
  p.email,
  p.role,
  p.status
FROM profiles p
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.email IN ('admin.demo@example.com', 'user.demo@example.com')
ORDER BY p.role DESC, p.email;
