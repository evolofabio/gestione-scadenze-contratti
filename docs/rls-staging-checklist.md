# RLS Staging Checklist

## Obiettivo

Validare l'isolamento tenant e i permessi ruolo per il passaggio a produzione.

## Prerequisiti

1. Ambiente Supabase staging separato dalla produzione.
2. Migrazioni applicate in ordine:
   1. `supabase_schema.sql`
   2. `supabase_migration_saas_phase1.sql`
   3. `supabase_migration_saas_phase2.sql`
3. Almeno 2 aziende (`company_a`, `company_b`).
4. Utenti test per ruolo: `owner`, `admin`, `manager`, `viewer` su entrambe le aziende.

## Matrice test (must pass)

## 1) Isolamento tenant

1. `viewer` di `company_a` legge solo record con `company_id = company_a`.
2. `viewer` di `company_a` non legge nessun record di `company_b`.
3. Tentativo update/delete cross-tenant deve fallire.

## 2) Permessi ruolo su contracts

1. `owner` puo creare/aggiornare/eliminare contratti della propria azienda.
2. `admin` puo creare/aggiornare/eliminare contratti della propria azienda.
3. `manager` puo creare/aggiornare/eliminare contratti della propria azienda.
4. `viewer` puo solo leggere contratti, senza write.

## 3) Permessi ruolo su profiles

1. Ogni utente legge sempre il proprio profilo (`id = auth.uid()`).
2. `manager` puo leggere profili della propria azienda ma non modificarli.
3. `admin` e `owner` possono aggiornare profili della propria azienda.
4. Nessun ruolo puo leggere/modificare profili di altra azienda.

## 4) Audit log

1. Ogni `INSERT` su `contracts` genera una riga in `audit_logs`.
2. Ogni `UPDATE` su `contracts` genera `old_data` e `new_data`.
3. Ogni `DELETE` su `contracts` genera evento con `old_data`.
4. Solo `owner/admin` leggono `audit_logs` della propria azienda.

## 5) Billing tables

1. `plans`: lettura consentita solo su piani attivi.
2. `subscriptions`: lettura limitata alla propria azienda.
3. `subscriptions`: write consentita solo a `owner/admin` della propria azienda.
4. `usage_metrics`: stessa regola di `subscriptions`.
5. `billing_webhook_events`: non leggibile da utenti autenticati standard.

## Query di controllo consigliate

Eseguire con utente autenticato nel SQL Editor impersonando i diversi ruoli.

```sql
select auth.uid();
select public.current_company_id();
select public.current_user_role();
select public.current_company_subscription_status();
```

```sql
select id, company_id, employee_name from public.contracts order by id desc limit 20;
select id, company_id, role, status, email from public.profiles order by created_at desc limit 20;
select id, company_id, action, entity, created_at from public.audit_logs order by created_at desc limit 20;
```

## Exit Criteria

1. 100% test must pass completati.
2. Nessun accesso cross-tenant rilevato.
3. Nessuna write non autorizzata per ruolo.
4. Audit log coerente su tutti i casi CRUD contratti.
5. Report test salvato e firmato da owner tecnico.