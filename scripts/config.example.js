window.ES_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  appName: 'ProrogaPro',
  appTagline: 'Scadenze e proroghe contrattuali',
  appUrl: 'https://your-domain/contract_manager_dashboard.html',
  contactEmail: 'info@evolodigitalstudio.it',
  stripeEnabled: false,
  trialDays: 14,
  plans: [
    { code: 'starter', name: 'Starter', monthly: 29, yearly: 290, users: 3, companies: 1, contracts: 300, exports: 50,
      features: ['Dashboard cockpit', 'Alert email', 'Export Excel/PDF/CSV'] },
    { code: 'growth', name: 'Growth', monthly: 79, yearly: 790, users: 15, companies: 3, contracts: 3000, exports: 500,
      features: ['Analytics', 'Multi-azienda', 'Automazioni'] },
    { code: 'scale', name: 'Scale', monthly: 149, yearly: 1490, users: 100, companies: 20, contracts: 50000, exports: 5000,
      features: ['Supporto prioritario', 'API', 'SSO'] },
  ],
};
