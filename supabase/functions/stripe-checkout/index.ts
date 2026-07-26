# Stripe Checkout — Supabase Edge Function
# Deploy: supabase functions deploy stripe-checkout --no-verify-jwt
# Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_SCALE

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY non configurata');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non autenticato');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) throw new Error('Sessione non valida');

    const body = await req.json();
    const planCode = body.plan_code || 'starter';
    const priceMap: Record<string, string | undefined> = {
      starter: Deno.env.get('STRIPE_PRICE_STARTER'),
      growth: Deno.env.get('STRIPE_PRICE_GROWTH'),
      scale: Deno.env.get('STRIPE_PRICE_SCALE'),
    };
    const priceId = priceMap[planCode];
    if (!priceId) throw new Error('Piano non configurato: ' + planCode);

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, email')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.company_id) throw new Error('Profilo senza azienda');

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: profile.email || user.email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: body.success_url || Deno.env.get('APP_URL') || 'https://example.com',
      cancel_url: body.cancel_url || Deno.env.get('APP_URL') || 'https://example.com',
      metadata: { company_id: String(profile.company_id), plan_code: planCode },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
