# Evolution System - Gestione Scadenze Contratti

Dashboard web per la gestione e il monitoraggio delle scadenze contrattuali aziendali. Applicazione single-page senza dipendenze server — basta aprire il file HTML in un browser.

**Demo Live:** configurabile in fase di deploy aziendale

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

## Funzionalità

### Gestione Scadenze Contratti
- **Multi-contratto per azienda** — ogni azienda può avere più contratti, ciascuno con il proprio dipendente
- **Nome dipendente** associato a ogni contratto
- **Vista globale** con panoramica di tutti i contratti e metriche riepilogative
- **Vista per azienda** con dettaglio contratti e header dedicato
- **Ricerca** per nome azienda, dipendente, tipo contratto o note
- **Ordinamento** per urgenza, data scadenza o nome azienda
- **Dark mode** con toggle tema chiaro/scuro

### Notifiche e Alert
- **Banner di alert** per contratti scaduti e in scadenza
- **Badge colorati** con stato urgenza (rosso, ambra, verde)
- **Barra di progresso** visiva per ogni contratto
- **Contatore nel titolo della pagina** per contratti urgenti

### Email
- **Invio email reale** via `mailto:` (client email) o **EmailJS** (invio diretto)
- **Email modificabile** — anteprima e modifica prima dell'invio
- **Invio automatico programmato** — notifiche a intervalli configurabili (60, 30, 15, 7, 3, 1 giorno prima della scadenza)
- **Log email** con cronologia invii
- **Prevenzione invii duplicati** — max 1 email per soglia/contratto/giorno

### Esportazione Dati
- **Excel (.xlsx)** — colonne ordinate e dimensionate con SheetJS
- **PDF (.pdf)** — layout A4 orizzontale con tabella formattata, colori per stato, riepilogo, note e numeri di pagina (jsPDF + AutoTable)
- **CSV (.csv)** — compatibile con tutti i fogli di calcolo

### Proroghe e Verifica Causale
- Tracciamento **numero di proroghe** effettuate
- Tipo di proroga (con causale, senza causale, automatica)
- Durata e preavviso configurabili
- **Verifica automatica normativa** con validazione in tempo reale:
  - Durata ≤ 12 mesi → causale non obbligatoria
  - Durata > 12 mesi → causale **obbligatoria**
  - Durata massima: **24 mesi**
  - Massimo **4 proroghe** (oltre → tempo indeterminato)
- Output con stato **OK** / **ATTENZIONE** / **ERRORE**, motivazione e azione consigliata
- Feedback live nel form di modifica e badge di stato sulle card

### Altro
- **Persistenza dati** — tutto salvato in localStorage (contratti, impostazioni, log, tracker invii)
- **Responsive design** — compatibile con desktop, tablet e mobile (breakpoints a 900px, 640px, 400px)
- **Accessibilità** — attributi ARIA, navigazione tramite tastiera (Escape per chiudere modali)
- **Stampa** — layout ottimizzato per la stampa
- **Protezione XSS** — escaping HTML di tutti i dati utente

## Come usare

1. **Apri** `contract_manager_dashboard.html` in un browser qualsiasi
2. Clicca **"+ Azienda"** per aggiungere un nuovo contratto
3. Nella vista azienda, clicca **"+ Nuovo contratto"** per aggiungere ulteriori contratti alla stessa azienda
4. Usa il menu **Esporta ▾** per scaricare i dati in Excel, PDF o CSV
5. Configura le **Impostazioni** per l'invio email automatico

### Configurazione EmailJS (opzionale)

Per l'invio email diretto senza client email:

1. Registrati gratis su [emailjs.com](https://www.emailjs.com/)
2. Crea un servizio email (Gmail, Outlook, ecc.)
3. Crea un template con le variabili: `{{to_email}}`, `{{subject}}`, `{{message}}`, `{{contract_name}}`
4. Inserisci **Service ID**, **Template ID** e **Public Key** nelle Impostazioni della dashboard

## Tecnologie

| Componente | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla |
| Email | [EmailJS](https://www.emailjs.com/) (CDN) |
| Excel export | [SheetJS](https://sheetjs.com/) (CDN) |
| PDF export | [jsPDF](https://github.com/parallax/jsPDF) + [AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) (CDN) |
| Persistenza | localStorage |

## Struttura

```
├── contract_manager_dashboard.html   # Applicazione completa (single-file)
├── README.md                         # Documentazione
└── LICENSE                           # Licenza MIT
```

## Screenshot

Apri il file nel browser per vedere la dashboard in azione. L'app include:
- **Metriche riepilogative** (totali, scaduti, urgenti, in scadenza)
- **Card contratto** con progress bar, badge urgenza e campi dettagliati
- **Modale email** con anteprima e modifica
- **Pannello impostazioni** con configurazione email e invio automatico

## Pagina di presentazione

Per condividere il progetto con una panoramica completa (overview, architettura e flusso operativo), apri:

- `project_presentation.html`

## SaaS readiness (fase definitiva)

Per accelerare il passaggio a piattaforma SaaS pronta alla vendita sono stati aggiunti:

- `docs/saas-go-live-plan.md` (roadmap 90 giorni + backlog Must/Should/Could + definition of done)
- `supabase_migration_saas_phase1.sql` (Sprint 1: ruoli avanzati, audit log, RLS hardening)
- `supabase_migration_saas_phase2.sql` (Sprint 2: piani, subscription, usage metrics, webhook idempotency)
- `docs/rls-staging-checklist.md` (test plan RLS/ruoli per validazione pre-produzione)
- `docs/monitoring-alerting-baseline.md` (Sprint 3: baseline monitoring e alerting)
- `docs/incident-response-runbook.md` (Sprint 3: runbook operativo incidenti)
- `docs/backup-restore-drill.md` (Sprint 3: procedura periodica backup/restore)
- `docs/release-readiness-checklist.md` (gate go/no-go prima del rilascio)

Ordine consigliato:

1. Eseguire `supabase_migration_saas_phase1.sql` su ambiente staging.
2. Eseguire `supabase_migration_saas_phase2.sql` su staging.
3. Validare i ruoli (`owner`, `admin`, `manager`, `viewer`) con test reali di accesso.
4. Eseguire la checklist `docs/rls-staging-checklist.md`.
5. Verificare i trigger audit su `contracts`.
6. Configurare monitoring+alerting seguendo `docs/monitoring-alerting-baseline.md`.
7. Validare runbook e drill operativo con `docs/incident-response-runbook.md` e `docs/backup-restore-drill.md`.
8. Completare `docs/release-readiness-checklist.md`.
9. Promuovere in produzione solo dopo test di regressione CRUD e policy RLS.

## Licenza

[MIT](LICENSE)

## Deploy

L'app è pubblicata automaticamente su **GitHub Pages**. Ogni push su `main` aggiorna il sito live.

Per il deploy manuale: basta aprire `index.html` (o `contract_manager_dashboard.html`) in un browser.
