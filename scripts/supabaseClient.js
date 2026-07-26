'use strict';

const cfg = window.ES_CONFIG || {};
const SUPABASE_URL = cfg.supabaseUrl || '';
const SUPABASE_ANON_KEY = cfg.supabaseAnonKey || '';

window.supabaseClientReady = new Promise((resolve, reject) => {
  function createClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      reject(new Error('Config Supabase mancante: imposta scripts/config.js'));
      return;
    }
    try {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(window.supabaseClient);
    } catch (err) {
      reject(err);
    }
  }

  if (!window.supabase) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = createClient;
    script.onerror = () => reject(new Error('Impossibile caricare Supabase JS dal CDN'));
    document.head.appendChild(script);
  } else {
    createClient();
  }
});
