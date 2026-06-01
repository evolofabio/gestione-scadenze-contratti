# Monitoring And Alerting Baseline (Sprint 3)

## Obiettivo

Definire un baseline operativo per osservabilita, alerting e gestione affidabilita prima del go-live commerciale.

## Stack consigliato

1. Error tracking frontend: Sentry (JS SDK)
2. Uptime checks: UptimeRobot o Better Stack
3. Log applicativi DB/API: Supabase logs + retention export periodico
4. Dashboards KPI: Grafana Cloud o Datadog (fase successiva)

## KPI tecnici minimi

1. Uptime applicazione: >= 99.5%
2. Error rate frontend: < 1% sessioni
3. Tempo medio risposta pagina dashboard: < 2.5s
4. Incidenti critici non rilevati: 0

## Alert minimi (P1/P2)

## P1

1. Sito non raggiungibile per > 3 minuti
2. Loop errori login o autenticazione
3. Errori runtime JS ripetuti su flusso login/dashboard

## P2

1. Degrado prestazioni oltre soglia (p95 > 4s)
2. Fallimenti export consecutivi oltre soglia
3. Picco errori query lato Supabase

## Routing alert

1. Owner tecnico: ricezione immediata P1
2. Supporto prodotto: ricezione P2 e triage
3. Escalation: se P1 aperto > 30 minuti, escalation a owner business

## Log retention consigliata

1. Error events: 90 giorni
2. Audit log business critical: 180 giorni
3. Backup metadata e report incidenti: 12 mesi

## Acceptance criteria Sprint 3

1. Tutti gli alert P1 testati con simulazione
2. Dashboard salute pubblica interna disponibile
3. Processo incident response collegato al runbook operativo
