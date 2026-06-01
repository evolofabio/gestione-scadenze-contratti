# Staging Validation Execution Guide

## Obiettivo

Eseguire la validazione staging end-to-end senza passaggi impliciti.

## Ordine operativo

1. Applicare schema base: `supabase_schema.sql`
2. Applicare hardening: `supabase_migration_saas_phase1.sql`
3. Applicare billing schema: `supabase_migration_saas_phase2.sql`
4. Creare in Supabase Auth gli 8 utenti test:
   1. `owner.a@example.com`
   2. `admin.a@example.com`
   3. `manager.a@example.com`
   4. `viewer.a@example.com`
   5. `owner.b@example.com`
   6. `admin.b@example.com`
   7. `manager.b@example.com`
   8. `viewer.b@example.com`
5. Eseguire `supabase_staging_seed_template.sql`
6. Eseguire `supabase_staging_validation_queries.sql` impersonando ciascun utente test
7. Compilare `docs/staging-validation-report-template.md`

## Come impersonare un utente in Supabase

1. Aprire SQL Editor sull'ambiente staging.
2. Usare la funzionalita di impersonation / run as authenticated user, se disponibile.
3. Ripetere il test per ciascun ruolo.

## Expected outcome sintetico per ruolo

## owner

1. legge solo proprio tenant
2. modifica contracts
3. modifica profiles del proprio tenant
4. legge audit logs
5. aggiorna subscriptions e usage metrics

## admin

1. stesso comportamento operativo di owner, senza protezioni extra di business

## manager

1. legge proprio tenant
2. modifica contracts
3. non modifica profiles
4. non legge audit logs
5. non aggiorna subscriptions/usage metrics

## viewer

1. sola lettura del proprio tenant
2. nessuna write su contracts
3. nessuna write su profiles
4. nessuna lettura audit logs
5. nessuna write billing

## Se un test fallisce

1. annotare query esatta
2. salvare screenshot o output
3. segnare FAIL nel report
4. aprire remediation sul file di migrazione pertinente

## Sign-off finale

1. report compilato
2. owner tecnico firma PASS
3. solo dopo si apre il gate verso produzione
