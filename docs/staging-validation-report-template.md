# Staging Validation Report Template

## Dati Sessione

1. Data esecuzione:
2. Ambiente:
3. Esecutore:
4. Versione schema applicata:
5. Commit applicazione in test:

## Setup Verificato

1. `supabase_schema.sql` applicato: PASS / FAIL
2. `supabase_migration_saas_phase1.sql` applicato: PASS / FAIL
3. `supabase_migration_saas_phase2.sql` applicato: PASS / FAIL
4. Tenant di test presenti (`company_a`, `company_b`): PASS / FAIL
5. Utenti test per ruolo creati: PASS / FAIL

## Test Per Ruolo

## owner

1. Read isolation tenant: PASS / FAIL
2. CRUD contracts proprio tenant: PASS / FAIL
3. Cross-tenant write blocked: PASS / FAIL
4. Update profiles proprio tenant: PASS / FAIL
5. Read audit logs: PASS / FAIL
6. Write subscriptions/usage_metrics: PASS / FAIL

## admin

1. Read isolation tenant: PASS / FAIL
2. CRUD contracts proprio tenant: PASS / FAIL
3. Cross-tenant write blocked: PASS / FAIL
4. Update profiles proprio tenant: PASS / FAIL
5. Read audit logs: PASS / FAIL
6. Write subscriptions/usage_metrics: PASS / FAIL

## manager

1. Read isolation tenant: PASS / FAIL
2. CRUD contracts proprio tenant: PASS / FAIL
3. Cross-tenant write blocked: PASS / FAIL
4. Update profiles denied: PASS / FAIL
5. Read audit logs denied: PASS / FAIL
6. Write subscriptions/usage_metrics denied: PASS / FAIL

## viewer

1. Read isolation tenant: PASS / FAIL
2. Write contracts denied: PASS / FAIL
3. Cross-tenant read denied: PASS / FAIL
4. Update profiles denied: PASS / FAIL
5. Read audit logs denied: PASS / FAIL
6. Write subscriptions/usage_metrics denied: PASS / FAIL

## Billing And Catalog

1. `plans` mostra solo record attivi: PASS / FAIL
2. `billing_webhook_events` non leggibile da utenti autenticati standard: PASS / FAIL

## Evidenze

1. Query eseguite: `supabase_staging_validation_queries.sql`
2. Screenshot/log allegati:
3. Errori osservati:

## Esito Finale

1. Stato complessivo: PASS / FAIL
2. Blocker aperti:
3. Owner remediation:
4. Data retest:
5. Firma owner tecnico:
