# Setup Stripe

1. Crea prodotti/prezzi in Stripe Dashboard (Starter, Growth, Scale).
2. Deploy Edge Functions:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
   supabase secrets set STRIPE_PRICE_STARTER=price_...
   supabase secrets set STRIPE_PRICE_GROWTH=price_...
   supabase secrets set STRIPE_PRICE_SCALE=price_...
   supabase secrets set APP_URL=https://your-domain/contract_manager_dashboard.html
   supabase functions deploy stripe-checkout
   supabase functions deploy stripe-portal
   ```
3. Configura webhook Stripe verso Supabase (tabella `billing_webhook_events`).
4. In `scripts/config.js` imposta `stripeEnabled: true`.
