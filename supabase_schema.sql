-- Schema multi-tenant per ProrogaPro Gestione Scadenza Contratti
-- Da eseguire su Supabase (PostgreSQL)

-- Tabella aziende
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    admin_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabella contratti
CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_name TEXT,
    contract_type TEXT,
    start_date DATE,
    end_date DATE,
    renewable BOOLEAN DEFAULT FALSE,
    renew_months INTEGER,
    renew_type TEXT,
    renew_notice INTEGER,
    renew_count INTEGER DEFAULT 0,
    notes TEXT
);

-- Tabella utenti (auth gestita da Supabase, qui solo relazione)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    role TEXT DEFAULT 'user',
    email TEXT,
    status TEXT DEFAULT 'pending',
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    settings JSONB,
    sync JSONB,
    license_accepted_at TIMESTAMP WITH TIME ZONE,
    license_version TEXT,
    updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin')),
    CONSTRAINT profiles_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Indici per performance e multi-tenant
CREATE INDEX IF NOT EXISTS idx_contracts_company_id ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON profiles(email);

-- Policy di sicurezza da configurare su Supabase Dashboard per isolare i dati tra aziende.
-- Ricorda di abilitare Row Level Security (RLS) e scrivere policy che permettano l'accesso solo ai dati con company_id associato all'utente loggato.

-- Abilitazione Row Level Security (RLS) e policy multi-tenant

-- Abilita RLS sulle tabelle
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select own company" ON companies;
DROP POLICY IF EXISTS "Select contracts for own company" ON contracts;
DROP POLICY IF EXISTS "Insert contracts for own company" ON contracts;
DROP POLICY IF EXISTS "Update contracts for own company" ON contracts;
DROP POLICY IF EXISTS "Delete contracts for own company" ON contracts;
DROP POLICY IF EXISTS "Select own profile" ON profiles;
DROP POLICY IF EXISTS "Insert own profile" ON profiles;
DROP POLICY IF EXISTS "Update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin select all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin update all profiles" ON profiles;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
            AND p.role = 'admin'
            AND COALESCE(p.status, 'pending') = 'approved'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Policy: ogni utente può vedere solo la propria azienda
CREATE POLICY "Select own company" ON companies
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = companies.id
    ));

-- Policy: ogni utente può vedere/gestire solo i contratti della propria azienda
CREATE POLICY "Select contracts for own company" ON contracts
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = contracts.company_id
    ));
CREATE POLICY "Insert contracts for own company" ON contracts
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = contracts.company_id
    ));
CREATE POLICY "Update contracts for own company" ON contracts
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = contracts.company_id
    ));
CREATE POLICY "Delete contracts for own company" ON contracts
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = contracts.company_id
    ));

-- Policy: ogni utente può vedere e modificare solo il proprio profilo
CREATE POLICY "Select own profile" ON profiles
    FOR SELECT USING (id = auth.uid());
CREATE POLICY "Insert own profile" ON profiles
    FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Update own profile" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- Policy admin: utenti con ruolo admin approvato possono leggere/aggiornare tutti i profili
CREATE POLICY "Admin select all profiles" ON profiles
    FOR SELECT USING (public.is_admin());
CREATE POLICY "Admin update all profiles" ON profiles
    FOR UPDATE USING (public.is_admin());

-- NB: Ricorda di abilitare le policy dalla dashboard Supabase dopo averle create.
