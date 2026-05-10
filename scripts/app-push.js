'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  Evolution System — Push Notifications Module
//  Gestisce: registrazione SW, permessi, mirror IDB, card impostazioni
// ═══════════════════════════════════════════════════════════════════════════

const PUSH_IDB_NAME    = 'evolution-system-sw';
const PUSH_IDB_VERSION = 1;

// ── IndexedDB helpers (main thread) ──────────────────────────────────────────
function pushOpenIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PUSH_IDB_NAME, PUSH_IDB_VERSION);
    req.onupgradeneeded = e => { e.target.result.createObjectStore('kv'); };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function pushIDBSet(key, value) {
  try {
    const db = await pushOpenIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = res;
      tx.onerror    = e => rej(e.target.error);
    });
  } catch (_) {}
}

// ── Mirror contratti in IndexedDB (letto dal SW quando il browser è chiuso) ──
async function mirrorContractsToIDB(companies) {
  try {
    await pushIDBSet('contracts', companies || []);
  } catch (_) {}
}

// ── Stato globale del Service Worker ─────────────────────────────────────────
let _swReg = null;

// ── Registrazione Service Worker + Periodic Background Sync ──────────────────
async function initPushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // Usa percorso relativo per compatibilità con GitHub Pages in sottocartella
    const swUrl = new URL('sw.js', document.baseURI).href;
    _swReg = await navigator.serviceWorker.register(swUrl);

    // Periodic Background Sync — Chrome 80+ (funziona anche con tab chiusa)
    if ('periodicSync' in _swReg) {
      try {
        const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (perm.state === 'granted') {
          await _swReg.periodicSync.register('check-contracts', {
            minInterval: 8 * 60 * 60 * 1000  // ogni 8 ore
          });
        }
      } catch (_) { /* browser non supporta */ }
    }

    // Specchia subito i contratti correnti
    await mirrorContractsToIDB(state.companies);

    // Aggiorna la card nelle impostazioni se visibile
    _updatePushCard();
  } catch (e) {
    console.warn('[Push] SW registration failed:', e);
  }
}

// ── Permessi ──────────────────────────────────────────────────────────────────
window.requestPushPermission = async function () {
  if (!('Notification' in window)) {
    showToast('Le notifiche non sono supportate da questo browser');
    return;
  }

  const result = await Notification.requestPermission();

  if (result === 'granted') {
    // Assicurati che il SW sia registrato
    if (!_swReg) await initPushNotifications();
    // Notifica di conferma
    if (_swReg) {
      await _swReg.showNotification('✅ Evolution System', {
        body  : 'Notifiche push attivate. Riceverai avvisi anche con questa tab chiusa.',
        icon  : '/evolution-system.png',
        badge : '/evolution-system.png',
        tag   : 'es-welcome'
      });
    }
    showToast('Notifiche attivate!');
  } else if (result === 'denied') {
    showToast('Notifiche bloccate — abilita dal lucchetto nella barra degli indirizzi');
  }

  _updatePushCard();
  renderPage();
};

window.testPushNotification = async function () {
  if (Notification.permission !== 'granted') {
    showToast('Abilita prima le notifiche push');
    return;
  }
  if (!_swReg) {
    showToast('Service Worker non pronto — ricarica la pagina');
    return;
  }

  // Costruisce il corpo basandosi sui contratti urgenti reali
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const urgent = state.companies.filter(c => {
    if (!c.endDate) return false;
    const diff = Math.round((new Date(c.endDate) - today) / 86400000);
    return diff >= 0 && diff <= 7;
  });

  const title = urgent.length
    ? `⚠️ ${urgent.length} contratt${urgent.length === 1 ? 'o' : 'i'} in scadenza`
    : '✅ Test notifica — Evolution System';

  const body = urgent.length
    ? urgent.map(c => {
        const d = Math.round((new Date(c.endDate) - today) / 86400000);
        return `• ${c.name}: ${d === 0 ? 'OGGI' : d + ' giorni'}`;
      }).join('\n')
    : 'Nessun contratto urgente al momento — le notifiche funzionano correttamente!';

  // Resetta il flag "già notificato oggi" per permettere il test
  await pushIDBSet('push-last-date', '');

  await _swReg.showNotification(title, {
    body,
    icon             : '/evolution-system.png',
    badge            : '/evolution-system.png',
    tag              : 'es-test',
    requireInteraction: false,
    data             : { url: '/contract_manager_dashboard.html' },
    actions          : [{ action: 'open', title: 'Apri app' }]
  });
};

// ── Stato corrente delle notifiche ────────────────────────────────────────────
function getPushState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// ── Render HTML della card push (usato da renderSettingsPage) ─────────────────
function renderPushCardContent() {
  const s = getPushState();
  if (s === 'unsupported') {
    return `<p style="font-size:13px;color:var(--text2)">Le notifiche push non sono supportate da questo browser.<br>Usa Chrome, Edge o Firefox aggiornati.</p>`;
  }
  if (s === 'granted') {
    return `
      <div class="toggle-row" style="margin-bottom:12px">
        <span class="status-pill ok"><span class="status-dot ok"></span>Notifiche push attive</span>
      </div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">
        Ricevi avvisi sul desktop anche con questa tab chiusa o il browser in background.<br>
        Il controllo avviene automaticamente ogni 8 ore.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="tb-btn primary" onclick="testPushNotification()">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right:5px"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          Invia notifica di test
        </button>
        <button class="tb-btn" onclick="checkPushNow()">Controlla adesso</button>
      </div>`;
  }
  if (s === 'denied') {
    return `
      <div class="toggle-row" style="margin-bottom:12px">
        <span class="status-pill warn"><span class="status-dot warn"></span>Notifiche bloccate dal browser</span>
      </div>
      <p style="font-size:13px;color:var(--text2)">
        Per riattivarle: clicca sull'icona del <strong>lucchetto</strong> nella barra degli indirizzi →
        Notifiche → <strong>Consenti</strong> → ricarica la pagina.
      </p>`;
  }
  // default — permesso non ancora richiesto
  return `
    <p style="font-size:13px;color:var(--text2);margin-bottom:14px">
      Ricevi avvisi di scadenza direttamente sul desktop, come le notifiche di Slack o Teams —
      <strong>anche con questa tab chiusa</strong>.
    </p>
    <button class="tb-btn primary" onclick="requestPushPermission()">
      <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right:5px"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      Attiva notifiche push
    </button>
    <p class="field-hint" style="margin-top:8px">
      Il browser chiede il permesso una sola volta. Puoi revocare in qualsiasi momento.
    </p>`;
}

// Trigger manuale del controllo (postMessage al SW)
window.checkPushNow = async function () {
  if (!_swReg || !_swReg.active) {
    showToast('Service Worker non attivo — ricarica la pagina');
    return;
  }
  // Resetta il flag "già notificato oggi" così il controllo mostra risultato
  await pushIDBSet('push-last-date', '');
  _swReg.active.postMessage({ type: 'CHECK_NOW' });
  showToast('Controllo scadenze avviato…');
};

// ── Aggiorna la card nelle impostazioni se è visibile ────────────────────────
function _updatePushCard() {
  const card = document.getElementById('push-notif-card');
  if (card) card.innerHTML = renderPushCardContent();
}

// Esporta simboli usati da altri moduli
window.mirrorContractsToIDB = mirrorContractsToIDB;
window.initPushNotifications = initPushNotifications;
window.renderPushCardContent  = renderPushCardContent;
window.getPushState           = getPushState;
