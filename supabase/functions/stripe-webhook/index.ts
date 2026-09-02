# Stripe Webhook — Supabase Edge Function
# Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
# Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeKey || !webhookSecret) throw new Error('Stripe webhook non configurato');

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (!sig) throw new Error('Firma mancante');

    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: existing } = await supabase
      .from('billing_webhook_events')
      .select('id')
      .eq('provider', 'stripe')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('billing_webhook_events').insert({
      provider: 'stripe',
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      processed: false,
    });

    const obj = event.data.object as Record<string, unknown>;
    const metadata = (obj.metadata || {}) as Record<string, string>;
    const companyId = metadata.company_id ? Number(metadata.company_id) : null;
    const planCode = metadata.plan_code || 'starter';

    if (companyId) {
      const { data: plan } = await supabase.from('plans').select('id').eq('code', planCode).maybeSingle();

      if (event.type === 'checkout.session.completed') {
        const subId = obj.subscription as string | undefined;
        const customerId = obj.customer as string | undefined;
        if (plan?.id) {
          await supabase.from('subscriptions').update({
            plan_id: plan.id,
            status: 'active',
            provider: 'stripe',
            provider_customer_id: customerId || null,
            provider_subscription_id: subId || null,
            trial_end_at: null,
            updated_at: new Date().toISOString(),
          }).eq('company_id', companyId);
        }
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const statusMap: Record<string, string> = {
          active: 'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'unpaid',
          incomplete: 'incomplete',
        };
        const st = statusMap[String(obj.status)] || 'canceled';
        await supabase.from('subscriptions').update({
          status: st,
          provider_subscription_id: String(obj.id),
          cancel_at_period_end: !!obj.cancel_at_period_end,
          current_period_end: obj.current_period_end
            ? new Date(Number(obj.current_period_end) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }).eq('company_id', companyId);
      }
    }

    await supabase.from('billing_webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('provider', 'stripe')
      .eq('event_id', event.id);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
