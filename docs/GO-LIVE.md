# Go-Live — ProrogaPro SaaS

Checklist operativa per il **rilascio produzione** (versione vendibile).

## Stato attuale codice

| Componente | Stato |
|------------|-------|
| Auth Supabase + registrazione tenant | ✅ Implementato |
| Sync contratti multi-tenant | ✅ Implementato |
| RBAC (owner/admin/manager/viewer) | ✅ Implementato |
| Privacy + Termini pubblicati | ✅ `pages/` |
| Stripe (checkout/portal) | ⚠️ Stub — `stripeEnabled: false` |
| Billing attivo | ❌ Dopo configurazione Stripe |
| RLS validata e firmata | ❌ Eseguire checklist staging |
| Demo pubblica separata | ✅ Repo `Gestione-scadenze-contratti-DEMO` |

---

## Passo 1 — Deploy frontend (30 min)

1. Commit e push su `main` del repo `gestione-scadenze-contratti`
2. Verifica GitHub Actions: **Quality Check** + **Deploy to GitHub Pages** verdi
3. URL produzione:
   ```
   https://evolofabio.github.io/gestione-scadenze-contratti/contract_manager_dashboard.html
   ```

---

## Passo 2 — Supabase Auth (15 min)

Dashboard Supabase → **Authentication → URL Configuration**:

| Campo | Valore |
|-------|--------|
| Site URL | `https://evolofabio.github.io/gestione-scadenze-contratti/contract_manager_dashboard.html` |
| Redirect URLs | `https://evolofabio.github.io/gestione-scadenze-contratti/**` |

---

## Passo 3 — Database produzione (1 h)

Applica su progetto Supabase **produzione** (`mdorhwwnvepviavtnksf`) nell'ordine:

1. `supabase_schema.sql` (se schema base assente)
2. `supabase_migration_bootstrap_remote.sql`
3. `supabase_migration_saas_phase1.sql`
4. `supabase_migration_saas_phase2.sql`
5. `supabase_migration_saas_phase3.sql`

Verifica: funzione `register_new_tenant` presente, piani `starter`/`growth`/`scale` seedati.

---

## Passo 4 — Validazione RLS (2–4 h)

Esegui e documenta:

- `docs/rls-staging-checklist.md`
- `supabase_staging_seed_template.sql`
- `docs/staging-validation-execution-guide.md`

**Gate:** 100% test must-pass, zero accessi cross-tenant.

> Consigliato: ambiente staging separato (`azognvqtuuuvwfgeynud`) prima di toccare prod.

---

## Passo 5 — Test manuali post-deploy (30 min)

- [ ] Registrazione nuovo tenant (trial 14 gg)
- [ ] Login / logout
- [ ] CRUD contratto come manager
- [ ] Viewer non può modificare
- [ ] Export Excel / PDF / CSV
- [ ] Link Privacy e Termini dalla login e dal footer
- [ ] Secondo tenant non vede dati del primo

---

## Passo 6 — Stripe (quando pronto per pagamenti)

Segui `docs/STRIPE_SETUP.md`:

1. Deploy Edge Functions `stripe-checkout` e `stripe-portal`
2. Configura secrets Supabase (`STRIPE_SECRET_KEY`, price IDs)
3. Webhook → aggiorna `subscriptions`
4. Imposta `stripeEnabled: true` in `scripts/config.js`

---

## Passo 7 — Business (parallelo)

- [ ] Review legale ToS/Privacy/DPA (`docs/commercial-ops/client-ready/legal-pack-publish-checklist.md`)
- [ ] Email supporto attiva
- [ ] Demo linkata dal sito vetrina
- [ ] Primi 2–5 clienti pilot

---

## Definition of Done — Rilascio

1. App online su URL pubblico HTTPS
2. Registrazione + login + sync contratti funzionanti
3. RLS checklist firmata
4. Test CI verdi
5. Legal pages pubblicate
6. (Opzionale fase 2) Stripe live + primi paganti

---

## Comandi utili

```bash
# Locale
python3 -m http.server 8770
open http://localhost:8770/contract_manager_dashboard.html

# Test
npm ci && npx playwright install chromium && npm test

# Supabase CLI (se linkato)
supabase db push
```

---

## Rollback

- Frontend: revert commit su `main` → GitHub Pages ripristina versione precedente
- Database: restore da backup Supabase (Pro) — vedi `docs/backup-restore-drill.md`
