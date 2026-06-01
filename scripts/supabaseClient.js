// Inizializzazione Supabase Client
// URL e chiave forniti dall'utente
const SUPABASE_URL = 'https://mdorhwwnvepviavtnksf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kb3Jod3dudmVwdmlhdnRua3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDE1MzYsImV4cCI6MjA5NTgxNzUzNn0.TpQdBJ0S8bIsqcsP8S6BKOv5bPrbVba9AgZ06oezj8g';

window.supabaseClientReady = new Promise((resolve, reject) => {
  function createClient() {
    try {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(window.supabaseClient);
    } catch (err) {
      reject(err);
    }
  }

  // Carica Supabase JS da CDN se non presente
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

// Ora puoi usare window.supabaseClient in tutti i tuoi script
