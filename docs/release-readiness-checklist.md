# Release Readiness Checklist (Sprint 3)

## Gate tecnico

1. Workflow quality GitHub Actions verde
2. Test console strict verdi
3. Migrazioni SQL applicate su staging senza errori
4. Checklist RLS completata con esito positivo

## Gate operativo

1. Alert P1/P2 configurati e testati
2. On-call owner assegnato per la finestra di rilascio
3. Runbook incidente aggiornato e condiviso
4. Drill backup/restore piu recente con esito pass

## Gate prodotto

1. Flusso login/registrazione verificato
2. CRUD contratti verificato per ruolo
3. Export verificato (Excel/PDF/CSV)
4. Link demo e presentazione verificati

## Gate business

1. ToS/Privacy/DPA pronti o in versione approvata
2. Canale supporto attivo (email/ticket)
3. Template comunicazione incidenti disponibile

## Decisione go-no-go

1. Go se tutti i gate sono verdi
2. No-go se esiste almeno un blocker P1 aperto
