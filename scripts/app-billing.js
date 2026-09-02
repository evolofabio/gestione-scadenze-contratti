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

function getPlansConfig() {
  return (window.ES_CONFIG && window.ES_CONFIG.plans) || [];
}

window.openStripeCheckout = async function (planCode) {
  if (!window.ES_CONFIG?.stripeEnabled) {
    const email = (window.ES_CONFIG && window.ES_CONFIG.contactEmail) || 'info@evolodigitalstudio.it';
    showToast('Pagamenti online in attivazione — contatta ' + email + ' per Starter/Growth/Scale');
    return;
  }
  if (!isAdmin()) {
    showToast('Solo owner/admin possono gestire l\'abbonamento');
    return;
  }
  try {
    const headers = await billingAuthHeaders();
    const basePath = typeof getAppBasePath === 'function' ? getAppBasePath() : '';
    const dashPath = (basePath ? basePath + '/' : '/') + 'contract_manager_dashboard.html';
    const res = await fetch(billingFunctionsUrl('stripe-checkout'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        plan_code: planCode || 'starter',
        success_url: window.location.origin + dashPath + '?billing=success',
        cancel_url: window.location.origin + dashPath + '?billing=cancel',
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
    const basePath = typeof getAppBasePath === 'function' ? getAppBasePath() : '';
    const dashPath = (basePath ? basePath + '/' : '/') + 'contract_manager_dashboard.html';
    const res = await fetch(billingFunctionsUrl('stripe-portal'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        return_url: window.location.origin + dashPath,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || 'Portale non disponibile');
    if (json.url) window.location.href = json.url;
  } catch (e) {
    showToast('Portale: ' + (e.message || e));
  }
};

window.openPricingModal = function () {
  const plans = getPlansConfig();
  const contact = (window.ES_CONFIG && window.ES_CONFIG.contactEmail) || 'info@evolodigitalstudio.it';
  const cards = plans.map(p => `
    <article class="pricing-card${p.code === 'growth' ? ' pricing-card--featured' : ''}">
      ${p.code === 'growth' ? '<span class="pricing-badge">Consigliato</span>' : ''}
      <h4>${esc(p.name)}</h4>
      <div class="pricing-price"><strong>€${p.monthly}</strong><span>/mese</span></div>
      <div class="pricing-yearly">€${p.yearly}/anno · IVA esclusa</div>
      <ul class="pricing-features">
        <li>${p.users} utenti · ${p.companies} aziend${p.companies === 1 ? 'a' : 'e'}</li>
        <li>${p.contracts.toLocaleString('it-IT')} contratti</li>
        <li>${p.exports} export/mese</li>
        ${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}
      </ul>
      <button class="m-btn${p.code === 'growth' ? ' primary' : ''}" style="width:100%;margin-top:12px" onclick="hideModal();openStripeCheckout('${escAttr(p.code)}')">Scegli ${esc(p.name)}</button>
    </article>`).join('');

  showModal(`<div class="modal pricing-modal">
    <div class="modal-header"><h3>Scegli il piano</h3><button class="modal-close" onclick="hideModal()">×</button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Trial 14 giorni incluso. Pagamenti Stripe — attiva <code>stripeEnabled</code> dopo il deploy delle Edge Functions.</p>
      <div class="pricing-grid">${cards}</div>
      <p style="font-size:12px;color:var(--text3);margin-top:14px;text-align:center">Domande? <a href="mailto:${escAttr(contact)}">${esc(contact)}</a></p>
    </div>
  </div>`);
};

window.renderTrialExpiredScreen = function () {
  const loginEl = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'none';
  if (!loginEl) return;
  const contact = (window.ES_CONFIG && window.ES_CONFIG.contactEmail) || 'info@evolodigitalstudio.it';
  loginEl.innerHTML = `
    <div class="login-card trial-expired-card">
      ${renderLoginLogo('Trial scaduto')}
      <div class="login-subtitle">Il periodo di prova gratuito è terminato</div>
      <p style="font-size:14px;color:var(--text2);line-height:1.6;text-align:center;margin:12px 0 20px">
        Per continuare a gestire contratti, scadenze e adempimenti scegli un piano Starter, Growth o Scale.
        I tuoi dati restano salvati in cloud.
      </p>
      <div class="modal-actions" style="flex-direction:column;gap:10px">
        ${isAdmin() ? `
          <button class="m-btn primary" onclick="openPricingModal()">Scegli un piano</button>
          <button class="m-btn" onclick="openBillingPortal()">Portale fatturazione</button>
        ` : `
          <p style="font-size:13px;color:var(--text3)">Contatta l'amministratore del tuo account per rinnovare l'abbonamento.</p>
        `}
        <a href="mailto:${escAttr(contact)}" class="m-btn" style="text-align:center">Contatta supporto</a>
        <button class="m-btn" onclick="doLogout()">Esci</button>
      </div>
    </div>`;
  loginEl.style.display = 'flex';
};

window.checkTrialAndBillingGate = function () {
  if (typeof isTrialExpired === 'function' && isTrialExpired()) {
    renderTrialExpiredScreen();
    return false;
  }
  return true;
};

(function handleBillingReturnQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('billing') === 'success') {
    setTimeout(() => {
      if (typeof refreshBillingSummary === 'function') refreshBillingSummary();
      showToast('Abbonamento aggiornato');
    }, 500);
    const base = typeof getAppBasePath === 'function' ? getAppBasePath() : '';
    const clean = (base ? base + '/' : '/') + 'contract_manager_dashboard.html';
    window.history.replaceState({}, '', clean);
  }
})();
