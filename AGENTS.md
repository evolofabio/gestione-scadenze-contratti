# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Static, build-free single-page app (vanilla HTML/CSS/JS), "Evolution System - Gestione Scadenze Contratti". The whole app is `contract_manager_dashboard.html` plus `scripts/*.js` and `styles/*`. No bundler/compile step. `npm` is only used for the Playwright-based console smoke test (see `package.json` `test` script and `.github/workflows/quality.yml`).

### Running the app (dev)
- Serve the repo root over a static HTTP server and open `contract_manager_dashboard.html`, e.g. `python3 -m http.server 8000` then `http://localhost:8000/contract_manager_dashboard.html`. Serving (not `file://`) is preferred so the service worker and script paths behave correctly.
- Core contract CRUD persists to browser `localStorage` and works fully offline — no backend needed to add/view/export contracts.

### Lint / test / build
- No linter and no build step exist.
- Test: `npm test` (runs `node scripts/capture_console.js --strict`, a headless-Chromium check that fails on any console/page/navigation error). Override the target with `CAPTURE_URL` or a positional URL arg; default is the local `file://` dashboard.

### Non-obvious caveats
- Playwright: `npx playwright install --with-deps chromium` FAILS on Ubuntu Noble (it tries to install the renamed `libasound2` package). Use `npx playwright install chromium` (binary only); the required system libs are already present in this image and `npm test` passes.
- Supabase auth is hardcoded in `scripts/supabaseClient.js` to a hosted project. In the cloud VM that host does NOT resolve (DNS), so the login/register screen and any cloud-sync/auth-gated flow are unavailable. This is an external/network limitation, not a code bug. To exercise the dashboard UI directly, the app can be used in its offline `localStorage` mode (the login screen can be dismissed client-side).
- CDN dependencies (Supabase JS, SheetJS, jsPDF, Chart.js, EmailJS, Google Fonts) load at runtime from jsDelivr/Google, which are reachable.
