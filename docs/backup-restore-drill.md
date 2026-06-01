# Backup Restore Drill (Sprint 3)

## Obiettivo

Validare che i backup siano ripristinabili e che il servizio possa tornare operativo entro RTO definito.

## Target

1. RPO massimo: 24 ore
2. RTO massimo: 4 ore

## Frequenza

1. Backup automatico: giornaliero
2. Drill restore completo: mensile
3. Drill restore rapido parziale: settimanale

## Procedura drill mensile

1. Selezionare snapshot backup del giorno precedente
2. Ripristinare su ambiente staging isolato
3. Eseguire smoke test:
   1. login
   2. lettura contratti
   3. inserimento contratto
   4. export
4. Verificare integrita audit logs e subscriptions
5. Registrare tempi reali RPO/RTO

## Criteri pass/fail

1. Pass: tutte le smoke test verdi e RTO/RPO entro target
2. Fail: almeno una smoke test fallita o tempi fuori soglia

## Report drill

1. Data drill
2. Owner esecuzione
3. Backup usato
4. Durata ripristino
5. Esito smoke test
6. Deviazioni da target
7. Azioni correttive
