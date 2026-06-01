# Incident Response Runbook (Sprint 3)

## Severita

1. P1: servizio indisponibile o blocco login clienti
2. P2: funzionalita degradate ma servizio disponibile
3. P3: bug non bloccante o issue cosmetica

## Triage iniziale (entro 10 minuti)

1. Confermare impatto (quali clienti, quali flussi)
2. Verificare monitor uptime e error tracking
3. Aprire ticket incidente con timestamp e owner
4. Classificare severita e canale comunicazione

## Workflow P1

1. Dichiarazione incidente e owner tecnico assegnato
2. Freeze deploy non urgenti
3. Mitigazione rapida (rollback, feature flag, fallback)
4. Aggiornamenti stato ogni 15 minuti
5. Chiusura solo dopo verifica funzionale completa

## Workflow P2

1. Owner tecnico + owner prodotto
2. Mitigazione entro 4 ore lavorative
3. Aggiornamenti stato ogni 60 minuti

## Comunicazione cliente

1. Messaggio iniziale con impatto e workaround
2. Aggiornamento periodico fino a risoluzione
3. Chiusura con riassunto causa e azioni preventive

## Postmortem (entro 48 ore)

1. Root cause analysis
2. Timeline completa evento
3. Cosa ha funzionato / cosa no
4. Action items con owner e data target
5. Aggiornamento checklist e test regressione

## Template incidente

1. ID incidente:
2. Data ora start:
3. Severita:
4. Impatto clienti:
5. Root cause:
6. Mitigazione:
7. Data ora chiusura:
8. Azioni preventive:
