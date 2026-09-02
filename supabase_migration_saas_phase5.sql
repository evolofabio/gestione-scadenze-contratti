-- ProrogaPro — SaaS Phase 5: team invites, usage metrics, billing_summary export
BEGIN;

-- Team invites
CREATE TABLE IF NOT EXISTS public.team_invites (
  id          BIGSERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer',
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  CONSTRAINT team_invites_role_check CHECK (role IN ('admin', 'manager', 'viewer')),
  CONSTRAINT team_invites_status_check CHECK (status IN ('pending', 'accepted', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_pending_email
  ON public.team_invites (company_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team invites read own company" ON public.team_invites;
DROP POLICY IF EXISTS "Team invites manage by admin" ON public.team_invites;

CREATE POLICY "Team invites read own company" ON public.team_invites
  FOR SELECT USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "Team invites manage by admin" ON public.team_invites
  FOR ALL
  USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

-- Invite collaborator by email
CREATE OR REPLACE FUNCTION public.invite_team_member(p_email TEXT, p_role TEXT DEFAULT 'viewer')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id INTEGER;
  v_role       TEXT;
  v_email      TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Permesso negato';
  END IF;

  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda non trovata';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Email non valida';
  END IF;

  v_role := lower(trim(COALESCE(p_role, 'viewer')));
  IF v_role NOT IN ('admin', 'manager', 'viewer') THEN
    RAISE EXCEPTION 'Ruolo non valido';
  END IF;

  IF (SELECT COUNT(*) FROM public.profiles pr
      WHERE pr.company_id = v_company_id AND pr.is_active = TRUE)
     >= COALESCE((SELECT max_users FROM public.plans p
                  JOIN public.subscriptions s ON s.plan_id = p.id
                  WHERE s.company_id = v_company_id
                    AND s.status IN ('trialing', 'active', 'past_due')
                  ORDER BY s.updated_at DESC LIMIT 1), 999) THEN
    RAISE EXCEPTION 'Limite utenti del piano raggiunto';
  END IF;

  UPDATE public.team_invites
  SET status = 'revoked'
  WHERE company_id = v_company_id AND lower(email) = v_email AND status = 'pending';

  INSERT INTO public.team_invites(company_id, email, role, invited_by, status)
  VALUES (v_company_id, v_email, v_role, auth.uid(), 'pending');

  RETURN jsonb_build_object('email', v_email, 'role', v_role, 'company_id', v_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_team_member(TEXT, TEXT) TO authenticated;

-- Accept pending invite on login/register
CREATE OR REPLACE FUNCTION public.accept_team_invite()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_email      TEXT;
  v_inv        RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('accepted', false);
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  v_email := lower(trim(COALESCE(v_email, '')));
  IF v_email = '' THEN
    RETURN jsonb_build_object('accepted', false);
  END IF;

  SELECT * INTO v_inv
  FROM public.team_invites ti
  WHERE lower(ti.email) = v_email
    AND ti.status = 'pending'
    AND ti.expires_at > now()
  ORDER BY ti.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false);
  END IF;

  INSERT INTO public.profiles(id, company_id, email, role, status, is_active, invited_at, last_login_at, created_at, updated_at)
  VALUES (
    v_user_id, v_inv.company_id, v_email, v_inv.role, 'approved', TRUE, now(), now(), now(), now()
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = v_inv.company_id,
        email      = v_email,
        role       = v_inv.role,
        status     = 'approved',
        is_active  = TRUE,
        updated_at = now();

  UPDATE public.team_invites SET status = 'accepted' WHERE id = v_inv.id;

  RETURN jsonb_build_object('accepted', true, 'company_id', v_inv.company_id, 'role', v_inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_team_invite() TO authenticated;

-- Approve pending profile into admin company
CREATE OR REPLACE FUNCTION public.approve_team_member(p_user_id UUID, p_role TEXT DEFAULT 'viewer')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id INTEGER;
  v_role       TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Permesso negato';
  END IF;

  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda non trovata';
  END IF;

  v_role := lower(trim(COALESCE(p_role, 'viewer')));
  IF v_role NOT IN ('admin', 'manager', 'viewer') THEN
    RAISE EXCEPTION 'Ruolo non valido';
  END IF;

  UPDATE public.profiles
  SET company_id = v_company_id,
      role       = v_role,
      status     = 'approved',
      is_active  = TRUE,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utente non trovato';
  END IF;

  RETURN jsonb_build_object('user_id', p_user_id, 'company_id', v_company_id, 'role', v_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_team_member(UUID, TEXT) TO authenticated;

-- Usage metric increment (exports)
CREATE OR REPLACE FUNCTION public.increment_usage_metric(
  p_metric_key TEXT,
  p_quantity   BIGINT DEFAULT 1
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id INTEGER;
  v_start      DATE;
  v_end        DATE;
  v_new_qty    BIGINT;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda non trovata';
  END IF;

  v_start := date_trunc('month', now())::DATE;
  v_end   := (date_trunc('month', now()) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  INSERT INTO public.usage_metrics(company_id, metric_key, period_start, period_end, quantity)
  VALUES (v_company_id, p_metric_key, v_start, v_end, GREATEST(p_quantity, 0))
  ON CONFLICT (company_id, metric_key, period_start, period_end)
  DO UPDATE SET quantity = public.usage_metrics.quantity + EXCLUDED.quantity,
                updated_at = now()
  RETURNING quantity INTO v_new_qty;

  RETURN v_new_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_usage_metric(TEXT, BIGINT) TO authenticated;

-- Billing summary with exports
CREATE OR REPLACE VIEW public.billing_summary AS
SELECT
  s.company_id,
  p.code        AS plan_code,
  p.name        AS plan_name,
  p.max_contracts,
  p.max_users,
  p.max_exports_per_month,
  s.status      AS subscription_status,
  s.billing_cycle,
  s.trial_end_at,
  GREATEST(0, EXTRACT(DAY FROM (s.trial_end_at - now()))::INTEGER) AS trial_days_left,
  s.current_period_end,
  s.cancel_at_period_end,
  (SELECT COUNT(*) FROM public.contracts c WHERE c.company_id = s.company_id) AS contracts_used,
  (SELECT COUNT(*) FROM public.profiles pr WHERE pr.company_id = s.company_id AND pr.is_active = TRUE) AS users_used,
  COALESCE((
    SELECT um.quantity FROM public.usage_metrics um
    WHERE um.company_id = s.company_id
      AND um.metric_key = 'exports'
      AND um.period_start = date_trunc('month', now())::DATE
    LIMIT 1
  ), 0) AS exports_used
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status IN ('trialing', 'active', 'past_due', 'incomplete');

COMMIT;
