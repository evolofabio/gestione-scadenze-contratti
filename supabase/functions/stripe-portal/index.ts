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
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('company_id', (
        await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      ).data?.company_id)
      .maybeSingle();

    const customerId = sub?.provider_customer_id;
    if (!customerId) throw new Error('Nessun cliente Stripe associato — completa prima il checkout');

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: body.return_url || Deno.env.get('APP_URL') || 'https://example.com',
    });

    return new Response(JSON.stringify({ url: portal.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
