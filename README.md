# ProrogaPro

Piattaforma SaaS per monitorare **scadenze contrattuali**, **proroghe**, cantieri, alert e export — pensata per PMI italiane.

**Produzione (dopo deploy):** [Apri l'app](https://evolofabio.github.io/gestione-scadenze-contratti/contract_manager_dashboard.html)

**Stack:** HTML/CSS/JS vanilla · Supabase (auth, DB, RLS) · GitHub Pages · Stripe

## Brand

- **Nome:** ProrogaPro
- **Tagline:** Scadenze e proroghe contrattuali
- **Logo:** `assets/prorogapro-mark.png` · `assets/prorogapro-logo.png`

## Rilascio

Checklist operativa: [`docs/GO-LIVE.md`](docs/GO-LIVE.md)

## Avvio locale

```bash
python3 -m http.server 8770
# http://localhost:8770/contract_manager_dashboard.html
```

1. Configura `scripts/config.js` (da `scripts/config.example.js`)
2. Migrazioni Supabase: `bootstrap` → `phase1` → `phase2` → `phase3`

## Test

```bash
npm ci && npx playwright install chromium && npm test
```

## Deploy

Push su `main` → GitHub Pages.

## Licenza

[MIT](LICENSE)
