-- ProrogaPro - SaaS Phase 1 Migration
-- Obiettivo: hardening multi-tenant, ruoli avanzati, audit trail

BEGIN;

-- 1) Estensione modello aziende (tenant)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug_unique ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON public.companies(is_active);

-- 2) Estensione profili per SaaS
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'viewer'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

UPDATE public.profiles
SET role = CASE
  WHEN role = 'admin' THEN 'admin'
  ELSE 'viewer'
END
WHERE role NOT IN ('owner', 'admin', 'manager', 'viewer');

UPDATE public.profiles
SET status = 'approved'
WHERE status IS NULL;

-- 3) Audit log eventi critici
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 4) Helpers per RLS
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.company_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'approved'
    AND p.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'approved'
    AND p.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_company_data()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('owner', 'admin', 'manager');
$$;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_company_data() TO authenticated;

-- 5) Trigger di aggiornamento timestamp aziende
CREATE OR REPLACE FUNCTION public.touch_companies_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_companies_updated_at ON public.companies;
CREATE TRIGGER trg_touch_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.touch_companies_updated_at();

-- 6) Trigger audit generico su contratti
CREATE OR REPLACE FUNCTION public.audit_contracts_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity, entity_id, new_data)
    VALUES (NEW.company_id, auth.uid(), 'insert', 'contracts', NEW.id::TEXT, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity, entity_id, old_data, new_data)
    VALUES (NEW.company_id, auth.uid(), 'update', 'contracts', NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity, entity_id, old_data)
    VALUES (OLD.company_id, auth.uid(), 'delete', 'contracts', OLD.id::TEXT, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_contracts_changes ON public.contracts;
CREATE TRIGGER trg_audit_contracts_changes
AFTER INSERT OR UPDATE OR DELETE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contracts_changes();

-- 7) RLS hardening
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select own company" ON public.companies;
DROP POLICY IF EXISTS "Select contracts for own company" ON public.contracts;
DROP POLICY IF EXISTS "Insert contracts for own company" ON public.contracts;
DROP POLICY IF EXISTS "Update contracts for own company" ON public.contracts;
DROP POLICY IF EXISTS "Delete contracts for own company" ON public.contracts;
DROP POLICY IF EXISTS "Select own profile" ON public.profiles;
DROP POLICY IF EXISTS "Insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin select all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Companies read own" ON public.companies;
DROP POLICY IF EXISTS "Companies update own by owner_admin" ON public.companies;
DROP POLICY IF EXISTS "Contracts read own" ON public.contracts;
DROP POLICY IF EXISTS "Contracts write own by manager_plus" ON public.contracts;
DROP POLICY IF EXISTS "Profiles read own company" ON public.profiles;
DROP POLICY IF EXISTS "Profiles read own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles manage own company by admin_plus" ON public.profiles;
DROP POLICY IF EXISTS "Audit logs read own company by admin_plus" ON public.audit_logs;

CREATE POLICY "Companies read own" ON public.companies
  FOR SELECT
  USING (id = public.current_company_id());

CREATE POLICY "Companies update own by owner_admin" ON public.companies
  FOR UPDATE
  USING (
    id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

CREATE POLICY "Contracts read own" ON public.contracts
  FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY "Contracts write own by manager_plus" ON public.contracts
  FOR ALL
  USING (
    company_id = public.current_company_id()
    AND public.can_manage_company_data()
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.can_manage_company_data()
  );

CREATE POLICY "Profiles read own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Profiles read own company" ON public.profiles
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "Profiles manage own company by admin_plus" ON public.profiles
  FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

CREATE POLICY "Audit logs read own company by admin_plus" ON public.audit_logs
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

COMMIT;