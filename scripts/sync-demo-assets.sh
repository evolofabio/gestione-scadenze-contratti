#!/bin/bash
# Sincronizza asset e landing verso il repo demo (eseguire manualmente)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="${DEMO_ROOT:-$(dirname "$ROOT")/Gestione-scadenze-contratti-DEMO}"
if [[ ! -d "$DEMO" ]]; then
  echo "Repo demo non trovato: $DEMO"
  exit 1
fi
rsync -a --delete "$ROOT/assets/" "$DEMO/assets/"
cp "$ROOT/scripts/landing.js" "$DEMO/scripts/"
cp "$ROOT/styles/landing.css" "$DEMO/styles/"
echo "Sync demo completato: $DEMO"
