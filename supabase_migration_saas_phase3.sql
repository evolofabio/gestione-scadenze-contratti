-- ProrogaPro - SaaS Phase 3 Migration
-- Obiettivo: colonne mancanti in contracts, trigger audit, RPC registrazione tenant,
--            enforcement limiti piano e indice full-text.

BEGIN;

-- ============================================================
-- 00) Strutture e funzioni da phase1 (idempotenti)
-- ============================================================

-- Colonne aziende
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug       TEXT,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug_unique ON public.companies(slug);
CREATE INDEX        IF NOT EXISTS idx_companies_is_active   ON public.companies(is_active);

-- Colonne profili
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name     TEXT,
  ADD COLUMN IF NOT EXISTS invited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'viewer'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

-- Audit log
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  old_data   JSONB,
  new_data   JSONB,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id  ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON public.audit_logs(created_at DESC);

-- RLS tabelle core
ALTER TABLE public.companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Funzioni helper RLS
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.company_id FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'approved' AND p.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.role FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'approved' AND p.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_company_data()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('owner', 'admin', 'manager');
$$;

GRANT EXECUTE ON FUNCTION public.current_company_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_company_data()   TO authenticated;

-- Policy tabelle core (DROP + CREATE idempotente)
DROP POLICY IF EXISTS "Companies read own"                        ON public.companies;
DROP POLICY IF EXISTS "Companies update own by owner_admin"       ON public.companies;
DROP POLICY IF EXISTS "Contracts read own"                        ON public.contracts;
DROP POLICY IF EXISTS "Contracts write own by manager_plus"       ON public.contracts;
DROP POLICY IF EXISTS "Profiles read own"                         ON public.profiles;
DROP POLICY IF EXISTS "Profiles read own company"                 ON public.profiles;
DROP POLICY IF EXISTS "Profiles manage own company by admin_plus" ON public.profiles;
DROP POLICY IF EXISTS "Audit logs read own company by admin_plus" ON public.audit_logs;

CREATE POLICY "Companies read own" ON public.companies
  FOR SELECT USING (id = public.current_company_id());

CREATE POLICY "Companies update own by owner_admin" ON public.companies
  FOR UPDATE
  USING (id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'));

CREATE POLICY "Contracts read own" ON public.contracts
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Contracts write own by manager_plus" ON public.contracts
  FOR ALL
  USING (company_id = public.current_company_id() AND public.can_manage_company_data())
  WITH CHECK (company_id = public.current_company_id() AND public.can_manage_company_data());

CREATE POLICY "Profiles read own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Profiles read own company" ON public.profiles
  FOR SELECT
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin', 'manager'));

CREATE POLICY "Profiles manage own company by admin_plus" ON public.profiles
  FOR UPDATE
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'));

CREATE POLICY "Audit logs read own company by admin_plus" ON public.audit_logs
  FOR SELECT
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'));

-- ============================================================
-- 0a) Tabelle billing (da phase2 — idempotenti con IF NOT EXISTS)
-- ============================================================

-- Catalogo piani
CREATE TABLE IF NOT EXISTS public.plans (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  max_users INTEGER NOT NULL DEFAULT 1,
  max_companies INTEGER NOT NULL DEFAULT 1,
  max_contracts INTEGER,
  max_exports_per_month INTEGER,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plans_currency_check CHECK (char_length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_plans_is_active ON public.plans(is_active);

-- Abbonamenti tenant
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'trialing',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')
  ),
  CONSTRAINT subscriptions_billing_cycle_check CHECK (
    billing_cycle IN ('monthly', 'yearly')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id_unique
  ON public.subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_company_active_unique
  ON public.subscriptions(company_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'incomplete');

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status     ON public.subscriptions(status);

-- Metering utilizzo
CREATE TABLE IF NOT EXISTS public.usage_metrics (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usage_metrics_period_check CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_metrics_unique_period
  ON public.usage_metrics(company_id, metric_key, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_company_period
  ON public.usage_metrics(company_id, period_start, period_end);

-- Webhook events (idempotenza)
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_event_unique
  ON public.billing_webhook_events(provider, event_id);

-- RLS sulle tabelle billing
ALTER TABLE public.plans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metrics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plans read active"                                ON public.plans;
DROP POLICY IF EXISTS "Plans manage by owner_admin"                      ON public.plans;
DROP POLICY IF EXISTS "Subscriptions read own company"                   ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriptions manage own company by owner_admin"  ON public.subscriptions;
DROP POLICY IF EXISTS "Usage read own company"                           ON public.usage_metrics;
DROP POLICY IF EXISTS "Usage write own company by owner_admin"           ON public.usage_metrics;

CREATE POLICY "Plans read active" ON public.plans
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Plans manage by owner_admin" ON public.plans
  FOR ALL
  USING (public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.current_user_role() IN ('owner', 'admin'));

CREATE POLICY "Subscriptions read own company" ON public.subscriptions
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Subscriptions manage own company by owner_admin" ON public.subscriptions
  FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'));

CREATE POLICY "Usage read own company" ON public.usage_metrics
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Usage write own company by owner_admin" ON public.usage_metrics
  FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.current_user_role() IN ('owner', 'admin'));

-- Seed piani (ON CONFLICT idempotente)
INSERT INTO public.plans (
  code, name, description,
  price_monthly_cents, price_yearly_cents, currency,
  max_users, max_companies, max_contracts, max_exports_per_month,
  features, is_active
)
VALUES
  ('starter', 'Starter', 'Per micro-team con gestione scadenze base',
   2900, 29000, 'EUR', 3, 1, 300, 50,
   '{"analytics":false,"api":false,"priority_support":false}'::jsonb, TRUE),
  ('growth', 'Growth', 'Per team in crescita con analytics e automazioni',
   7900, 79000, 'EUR', 15, 3, 3000, 500,
   '{"analytics":true,"api":true,"priority_support":false}'::jsonb, TRUE),
  ('scale', 'Scale', 'Per organizzazioni multi-azienda con supporto prioritario',
   14900, 149000, 'EUR', 100, 20, 50000, 5000,
   '{"analytics":true,"api":true,"priority_support":true,"sso":true}'::jsonb, TRUE)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      price_monthly_cents = EXCLUDED.price_monthly_cents,
      price_yearly_cents = EXCLUDED.price_yearly_cents,
      currency = EXCLUDED.currency,
      max_users = EXCLUDED.max_users,
      max_companies = EXCLUDED.max_companies,
      max_contracts = EXCLUDED.max_contracts,
      max_exports_per_month = EXCLUDED.max_exports_per_month,
      features = EXCLUDED.features,
      is_active = EXCLUDED.is_active,
      updated_at = now();

-- Funzioni helper billing (CREATE OR REPLACE idempotente)
CREATE OR REPLACE FUNCTION public.current_company_subscription_status()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.status FROM public.subscriptions s
  WHERE s.company_id = public.current_company_id()
  ORDER BY s.updated_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_company_plan_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.plan_id FROM public.subscriptions s
  WHERE s.company_id = public.current_company_id()
  ORDER BY s.updated_at DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_company_subscription_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_plan_id() TO authenticated;

-- ============================================================
-- 0b) Funzione helper updated_at (da phase2 — idempotente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_plans_updated_at ON public.plans;
CREATE TRIGGER trg_touch_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_touch_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_touch_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_touch_usage_metrics_updated_at ON public.usage_metrics;
CREATE TRIGGER trg_touch_usage_metrics_updated_at
BEFORE UPDATE ON public.usage_metrics
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

-- ============================================================
-- 1) Colonne mancanti in public.contracts
-- ============================================================
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_company_name TEXT,
  ADD COLUMN IF NOT EXISTS admin_email         TEXT,
  ADD COLUMN IF NOT EXISTS company_email       TEXT,
  ADD COLUMN IF NOT EXISTS cantieri            JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status              TEXT     NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS indeterminate       BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cessato             BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS in_progress         BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS work_notes          JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_status_check;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('active', 'gestita', 'terminato'));

CREATE INDEX IF NOT EXISTS idx_contracts_status         ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date       ON public.contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_client_company ON public.contracts(client_company_name);

-- updated_at automatico
DROP TRIGGER IF EXISTS trg_touch_contracts_updated_at ON public.contracts;
CREATE TRIGGER trg_touch_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

-- ============================================================
-- 2) Audit log — trigger su contracts
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_contracts_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(company_id, actor_id, action, entity, entity_id, new_data)
    VALUES (NEW.company_id, auth.uid(), 'INSERT', 'contracts', NEW.id::TEXT, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(company_id, actor_id, action, entity, entity_id, old_data, new_data)
    VALUES (NEW.company_id, auth.uid(), 'UPDATE', 'contracts', NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(company_id, actor_id, action, entity, entity_id, old_data)
    VALUES (OLD.company_id, auth.uid(), 'DELETE', 'contracts', OLD.id::TEXT, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_contracts ON public.contracts;
CREATE TRIGGER trg_audit_contracts
AFTER INSERT OR UPDATE OR DELETE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contracts_change();

-- ============================================================
-- 3) Enforcement limiti piano
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_contract_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id    BIGINT;
  v_max        INTEGER;
  v_current    INTEGER;
BEGIN
  v_plan_id := public.current_company_plan_id();
  IF v_plan_id IS NOT NULL THEN
    SELECT max_contracts INTO v_max FROM public.plans WHERE id = v_plan_id;
    IF v_max IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current FROM public.contracts WHERE company_id = NEW.company_id;
      IF v_current >= v_max THEN
        RAISE EXCEPTION 'Limite contratti del piano raggiunto (max %). Aggiorna il piano per aggiungerne altri.', v_max
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_contract_limit ON public.contracts;
CREATE TRIGGER trg_check_contract_limit
BEFORE INSERT ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.check_contract_limit();

-- ============================================================
-- 4) RPC registrazione self-service (owner + company + trial)
-- ============================================================
-- Chiamata dal frontend al momento della registrazione:
--   SELECT public.register_new_tenant(full_name, company_name);
-- Crea: companies row, profiles row (owner/approved), subscriptions row (trialing)
CREATE OR REPLACE FUNCTION public.register_new_tenant(
  p_full_name    TEXT,
  p_company_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_company_id INTEGER;
  v_plan_id    BIGINT;
  v_slug       TEXT;
BEGIN
  -- Autenticazione obbligatoria
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Devi essere autenticato per registrare un tenant';
  END IF;

  -- Evita doppia registrazione
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Tenant già registrato per questo utente';
  END IF;

  -- Slug univoco
  v_slug := lower(regexp_replace(trim(p_company_name), '[^a-z0-9]+', '-', 'g'));
  IF v_slug = '' THEN v_slug := 'company'; END IF;

  -- Crea azienda
  INSERT INTO public.companies(name, slug, is_active, updated_at)
  VALUES (trim(p_company_name), v_slug || '-' || left(replace(gen_random_uuid()::TEXT,'-',''),6), TRUE, now())
  RETURNING id INTO v_company_id;

  -- Crea profilo owner
  INSERT INTO public.profiles(id, company_id, full_name, email, role, status, is_active, invited_at, last_login_at, created_at, updated_at)
  VALUES (
    v_user_id,
    v_company_id,
    trim(p_full_name),
    (SELECT email FROM auth.users WHERE id = v_user_id),
    'owner',
    'approved',
    TRUE,
    now(),
    now(),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id    = v_company_id,
        full_name     = trim(p_full_name),
        role          = 'owner',
        status        = 'approved',
        is_active     = TRUE,
        updated_at    = now();

  -- Piano starter di default
  SELECT id INTO v_plan_id FROM public.plans WHERE code = 'starter' AND is_active = TRUE LIMIT 1;

  -- Crea trial (14 giorni)
  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions(
      company_id, plan_id, provider, status, billing_cycle,
      trial_start_at, trial_end_at, created_at, updated_at
    )
    VALUES (
      v_company_id, v_plan_id, 'stripe', 'trialing', 'monthly',
      now(), now() + INTERVAL '14 days', now(), now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'user_id',    v_user_id,
    'plan',       'starter',
    'trial_end',  (now() + INTERVAL '14 days')::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_new_tenant(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 5) Funzione helper: days_left_in_trial
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_trial_days_left()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, EXTRACT(DAY FROM (s.trial_end_at - now()))::INTEGER)
  FROM public.subscriptions s
  WHERE s.company_id = public.current_company_id()
    AND s.status = 'trialing'
  ORDER BY s.updated_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_trial_days_left() TO authenticated;

-- ============================================================
-- 6) Vista billing_summary (usata dalla UI)
-- ============================================================
CREATE OR REPLACE VIEW public.billing_summary AS
SELECT
  s.company_id,
  p.code        AS plan_code,
  p.name        AS plan_name,
  p.max_contracts,
  p.max_users,
  s.status      AS subscription_status,
  s.billing_cycle,
  s.trial_end_at,
  GREATEST(0, EXTRACT(DAY FROM (s.trial_end_at - now()))::INTEGER) AS trial_days_left,
  s.current_period_end,
  s.cancel_at_period_end,
  (SELECT COUNT(*) FROM public.contracts c WHERE c.company_id = s.company_id) AS contracts_used,
  (SELECT COUNT(*) FROM public.profiles  pr WHERE pr.company_id = s.company_id AND pr.is_active = TRUE) AS users_used
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status IN ('trialing', 'active', 'past_due', 'incomplete');

-- RLS sulla vista (ereditata dalle tabelle sottostanti via security invoker — default)

COMMIT;
