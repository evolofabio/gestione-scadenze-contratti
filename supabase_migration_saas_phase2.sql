-- ProrogaPro - SaaS Phase 2 Migration
-- Obiettivo: monetizzazione (plans, subscriptions, usage metrics)

BEGIN;

-- 1) Catalogo piani
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

-- 2) Abbonamenti tenant
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
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 3) Metering utilizzo
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

-- 4) Webhook events (idempotenza)
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

-- 5) Trigger updated_at
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
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_touch_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_touch_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_touch_usage_metrics_updated_at ON public.usage_metrics;
CREATE TRIGGER trg_touch_usage_metrics_updated_at
BEFORE UPDATE ON public.usage_metrics
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

-- 6) Funzioni helper billing
CREATE OR REPLACE FUNCTION public.current_company_subscription_status()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.status
  FROM public.subscriptions s
  WHERE s.company_id = public.current_company_id()
  ORDER BY s.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_company_plan_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan_id
  FROM public.subscriptions s
  WHERE s.company_id = public.current_company_id()
  ORDER BY s.updated_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_company_subscription_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_plan_id() TO authenticated;

-- 7) RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plans read active" ON public.plans;
DROP POLICY IF EXISTS "Plans manage by owner_admin" ON public.plans;
DROP POLICY IF EXISTS "Subscriptions read own company" ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriptions manage own company by owner_admin" ON public.subscriptions;
DROP POLICY IF EXISTS "Usage read own company" ON public.usage_metrics;
DROP POLICY IF EXISTS "Usage write own company by owner_admin" ON public.usage_metrics;
DROP POLICY IF EXISTS "Webhook events manage service role only" ON public.billing_webhook_events;

CREATE POLICY "Plans read active" ON public.plans
  FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Plans manage by owner_admin" ON public.plans
  FOR ALL
  USING (public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.current_user_role() IN ('owner', 'admin'));

CREATE POLICY "Subscriptions read own company" ON public.subscriptions
  FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY "Subscriptions manage own company by owner_admin" ON public.subscriptions
  FOR ALL
  USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

CREATE POLICY "Usage read own company" ON public.usage_metrics
  FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY "Usage write own company by owner_admin" ON public.usage_metrics
  FOR ALL
  USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

-- Webhook events: nessuna policy per authenticated (accesso solo service role)

-- 8) Seed minimo piani
INSERT INTO public.plans (
  code,
  name,
  description,
  price_monthly_cents,
  price_yearly_cents,
  currency,
  max_users,
  max_companies,
  max_contracts,
  max_exports_per_month,
  features,
  is_active
)
VALUES
  (
    'starter',
    'Starter',
    'Per micro-team con gestione scadenze base',
    2900,
    29000,
    'EUR',
    3,
    1,
    300,
    50,
    '{"analytics":false,"api":false,"priority_support":false}'::jsonb,
    TRUE
  ),
  (
    'growth',
    'Growth',
    'Per team in crescita con analytics e automazioni',
    7900,
    79000,
    'EUR',
    15,
    3,
    3000,
    500,
    '{"analytics":true,"api":true,"priority_support":false}'::jsonb,
    TRUE
  ),
  (
    'scale',
    'Scale',
    'Per organizzazioni multi-azienda con supporto prioritario',
    14900,
    149000,
    'EUR',
    100,
    20,
    50000,
    5000,
    '{"analytics":true,"api":true,"priority_support":true,"sso":true}'::jsonb,
    TRUE
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
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

COMMIT;