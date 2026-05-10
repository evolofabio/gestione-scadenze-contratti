'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  Evolution System — Service Worker v1
//  Gestisce: push events, periodic background sync, notification click
// ═══════════════════════════════════════════════════════════════════════════

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Push (da server FCM o da main thread via postMessage) ────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : '' }; }

  const title   = data.title || '⚠️ Evolution System';
  const options = {
    body            : data.body || '',
    icon            : '/evolution-system.png',
    badge           : '/evolution-system.png',
    tag             : data.tag || 'es-alert',
    renotify        : true,
    requireInteraction: true,
    data            : { url: data.url || '/contract_manager_dashboard.html' },
    actions         : [
      { action: 'open',    title: 'Apri app' },
      { action: 'dismiss', title: 'Ignora'   }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Periodic Background Sync (Chrome 80+) ────────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-contracts') {
    e.waitUntil(checkAndNotify());
  }
});

// ── Message da main thread → trigger immediato ───────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_NOW') {
    checkAndNotify();
  }
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = (e.notification.data && e.notification.data.url) || '/contract_manager_dashboard.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('contract_manager') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Logica di controllo scadenze ──────────────────────────────────────────────
async function checkAndNotify() {
  const contracts = await idbGet('contracts');
  if (!contracts || !contracts.length) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const urgent = contracts.filter(c => {
    if (!c.endDate) return false;
    const diff = Math.round((new Date(c.endDate) - today) / 86400000);
    return diff >= 0 && diff <= 7;
  });

  if (!urgent.length) return;

  // Evita notifiche duplicate nello stesso giorno
  const todayStr = today.toISOString().split('T')[0];
  const lastDate = await idbGet('push-last-date');
  if (lastDate === todayStr) return;
  await idbSet('push-last-date', todayStr);

  const title = urgent.length === 1
    ? '⚠️ Contratto in scadenza'
    : `⚠️ ${urgent.length} contratti in scadenza`;

  const body = urgent
    .map(c => {
      const days = Math.round((new Date(c.endDate) - today) / 86400000);
      const label = days === 0 ? 'OGGI' : `${days} giorn${days === 1 ? 'o' : 'i'}`;
      return `• ${c.name}${c.employeeName ? ' — ' + c.employeeName : ''}: ${label}`;
    })
    .join('\n');

  await self.registration.showNotification(title, {
    body,
    icon             : '/evolution-system.png',
    badge            : '/evolution-system.png',
    tag              : 'es-urgent',
    renotify         : true,
    requireInteraction: true,
    data             : { url: '/contract_manager_dashboard.html' },
    actions          : [
      { action: 'open',    title: 'Apri dashboard' },
      { action: 'dismiss', title: 'Ignora'          }
    ]
  });
}

// ── IndexedDB helpers (Service Worker context) ────────────────────────────────
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('evolution-system-sw', 1);
    req.onupgradeneeded = e => { e.target.result.createObjectStore('kv'); };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = e => res(e.target.result ?? null);
      req.onerror   = e => rej(e.target.error);
    });
  } catch (_) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = res;
      tx.onerror    = e => rej(e.target.error);
    });
  } catch (_) {}
}
