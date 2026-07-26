'use strict';
// ═══════════════════════════════════════
// Stripe billing (checkout + customer portal via Supabase Edge Functions)
// ═══════════════════════════════════════

function billingFunctionsUrl(path) {
  const base = (window.ES_CONFIG && window.ES_CONFIG.supabaseUrl) || '';
  return base.replace(/\/$/, '') + '/functions/v1/' + path;
}

async function billingAuthHeaders() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.access_token) throw new Error('Sessione non valida');
  return {
    'Authorization': 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
  };
}

window.openStripeCheckout = async function (planCode) {
  if (!window.ES_CONFIG?.stripeEnabled) {
    showToast('Pagamenti non ancora attivi — contatta ' + ((window.ES_CONFIG && window.ES_CONFIG.contactEmail) || 'support@prorogapro.it'));
    return;
  }
  if (!isAdmin()) {
    showToast('Solo owner/admin possono gestire l\'abbonamento');
    return;
  }
  try {
    const headers = await billingAuthHeaders();
    const res = await fetch(billingFunctionsUrl('stripe-checkout'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        plan_code: planCode || 'starter',
        success_url: window.location.origin + window.location.pathname + '?billing=success',
        cancel_url: window.location.origin + window.location.pathname + '?billing=cancel',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || 'Checkout non disponibile');
    if (json.url) window.location.href = json.url;
    else showToast('Risposta checkout non valida');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e));
  }
};

window.openBillingPortal = async function () {
  if (!window.ES_CONFIG?.stripeEnabled) {
    showToast('Portale abbonamento non configurato — contatta il supporto');
    return;
  }
  if (!isAdmin()) {
    showToast('Solo owner/admin possono gestire l\'abbonamento');
    return;
  }
  try {
    const headers = await billingAuthHeaders();
    const res = await fetch(billingFunctionsUrl('stripe-portal'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        return_url: window.location.origin + window.location.pathname,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || 'Portale non disponibile');
    if (json.url) window.location.href = json.url;
  } catch (e) {
    showToast('Portale: ' + (e.message || e));
  }
};

(function handleBillingReturnQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('billing') === 'success') {
    setTimeout(() => {
      if (typeof refreshBillingSummary === 'function') refreshBillingSummary();
      showToast('Abbonamento aggiornato');
    }, 500);
    window.history.replaceState({}, '', window.location.pathname);
  }
})();
