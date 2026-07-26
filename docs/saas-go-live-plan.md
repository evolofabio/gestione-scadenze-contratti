# ProrogaPro SaaS Go-Live Plan

## Obiettivo

Portare il progetto da applicazione operativa a piattaforma SaaS pronta alla vendita B2B.

## Target di uscita

Una release e considerata "definitiva" quando:

1. onboarding cliente self-service completo,
2. isolamento tenant verificato e testato,
3. pagamento e rinnovi attivi,
4. monitoraggio/incident response operativi,
5. supporto clienti e documentazione legale pubblicata.

## Roadmap 90 Giorni

## Sprint 1 - Fondamenta SaaS (Settimane 1-3)

Deliverable:

1. Ruoli applicativi estesi: `owner`, `admin`, `manager`, `viewer`.
2. Policy RLS per bloccare scritture ai ruoli non autorizzati.
3. Audit log su eventi critici (`INSERT/UPDATE/DELETE`) contratti/aziende.
4. Flag stato tenant (`is_active`) e metadata operativi azienda.
5. Checklist hardening sicurezza baseline.

## Sprint 2 - Monetizzazione (Settimane 4-6)

Deliverable:

1. Integrazione Stripe (checkout + portal + webhook).
2. Entita `plans`, `subscriptions`, `usage_metrics`.
3. Enforcement limiti piano lato DB e lato UI.
4. Trial automatico e stato account (`trialing`, `active`, `past_due`, `canceled`).

## Sprint 3 - Affidabilita Operativa (Settimane 7-9)

Deliverable:

1. Ambiente `staging` separato da `production`.
2. Error tracking + alerting + dashboard di salute.
3. Backup/restore testato con prova ripristino.
4. Test E2E su flussi critici (auth, CRUD contratti, export, billing status).

## Sprint 4 - Commercializzazione (Settimane 10-12)

Deliverable:

1. Termini di servizio, privacy policy, DPA/GDPR.
2. Funnel: landing -> demo -> trial -> paid.
3. Sistema supporto (ticket, SLA, runbook).
4. KPI business minimi: MRR, churn, conversione trial->paid.

## Backlog Prioritizzato

## Must (prima della vendita)

1. RLS per tenant con write permission per ruolo.
2. Billing Stripe + webhook affidabili.
3. Audit log e retention minima.
4. Legal pack pubblicato (ToS, Privacy, DPA).
5. Monitoring e on-call minimo.

## Should (subito dopo prime vendite)

1. SSO (Google/Microsoft).
2. Metriche prodotto per feature adoption.
3. Template onboarding per settore cliente.
4. Ruoli custom per organizzazioni grandi.

## Could (evoluzione)

1. White-label branding per tenant.
2. API pubbliche e integrazioni HR/payroll.
3. Workflow approvals avanzati.

## KPI di Go-Live

1. Uptime >= 99.5%.
2. Tempo medio onboarding cliente <= 30 minuti.
3. Conversione trial -> paid >= 15% (target iniziale).
4. Tempo prima risposta supporto <= 4 ore lavorative.

## Definition of Done (fase definitiva)

1. Nuovo cliente puo registrarsi, pagare e usare il prodotto senza intervento manuale.
2. Ogni tenant vede solo i propri dati (verifica con test automatici e manuali).
3. Incidenti e anomalie generano alert con owner assegnato.
4. Contrattualistica e compliance disponibili pubblicamente.
5. Esiste un processo ripetibile per vendita, onboarding e supporto.