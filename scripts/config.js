// Configurazione pubblica ProrogaPro (anon key Supabase — sicura solo con RLS attivo)
window.ES_CONFIG = window.ES_CONFIG || {
  supabaseUrl: 'https://mdorhwwnvepviavtnksf.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kb3Jod3dudmVwdmlhdnRua3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDE1MzYsImV4cCI6MjA5NTgxNzUzNn0.TpQdBJ0S8bIsqcsP8S6BKOv5bPrbVba9AgZ06oezj8g',
  appName: 'ProrogaPro',
  appTagline: 'Scadenze e proroghe contrattuali',
  appUrl: 'https://evolofabio.github.io/gestione-scadenze-contratti/contract_manager_dashboard.html',
  contactEmail: 'info@evolodigitalstudio.it',
  stripeEnabled: false,
  trialDays: 14,
  plans: [
    { code: 'starter', name: 'Starter', monthly: 29, yearly: 290, users: 3, companies: 1, contracts: 300, exports: 50,
      features: ['Dashboard cockpit', 'Alert email', 'Export Excel/PDF/CSV', 'Scadenziario UNILAV'] },
    { code: 'growth', name: 'Growth', monthly: 79, yearly: 790, users: 15, companies: 3, contracts: 3000, exports: 500,
      features: ['Tutto Starter', 'Analytics avanzate', 'Multi-azienda', 'Automazioni alert'] },
    { code: 'scale', name: 'Scale', monthly: 149, yearly: 1490, users: 100, companies: 20, contracts: 50000, exports: 5000,
      features: ['Tutto Growth', 'Supporto prioritario', 'API', 'SSO (su richiesta)'] },
  ],
};
