-- ProrogaPro phase 4: legal/compliance metadata on contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS legal_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_contracts_legal_meta ON public.contracts USING gin (legal_meta);
