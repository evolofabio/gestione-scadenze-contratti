-- Bootstrap: allinea schema remoto minimale a supabase_schema.sql
-- Eseguire PRIMA di phase1/2/3 se il DB è stato creato senza tutte le colonne.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settings JSONB,
  ADD COLUMN IF NOT EXISTS sync JSONB,
  ADD COLUMN IF NOT EXISTS license_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_version TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.profiles SET status = 'approved' WHERE status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

COMMIT;
