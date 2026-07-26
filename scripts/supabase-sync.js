'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  ProrogaPro — Supabase Sync Module
// ════════════════════════════════════════════════════════════════════════════

let _syncTenantCompanyId = null;
let _syncInProgress      = false;
let _syncScheduled       = false;
let _syncLastState       = null;

const SYNC_DEBOUNCE_MS = 800;

function _rowToEntry(row) {
  return {
    id:             row.id,
    supabaseId:     row.id,
    name:           row.client_company_name || '',
    employeeName:   row.employee_name  || '',
    contractType:   row.contract_type  || '',
    startDate:      row.start_date     || '',
    endDate:        row.end_date       || '',
    renewable:      !!row.renewable,
    renewMonths:    row.renew_months   || 12,
    renewType:      row.renew_type     || 'Senza causale',
    renewNotice:    row.renew_notice   || 30,
    renewCount:     row.renew_count    || 0,
    notes:          row.notes          || '',
    adminEmail:     row.admin_email    || '',
    companyEmail:   row.company_email  || '',
    cantieri:       Array.isArray(row.cantieri)   ? row.cantieri   : [],
    workNotes:      Array.isArray(row.work_notes) ? row.work_notes : [],
    status:         row.status         || 'active',
    indeterminate:  !!row.indeterminate,
    cessato:        !!row.cessato,
    inProgress:     !!row.in_progress,
  };
}

function _entryToRow(entry, companyId) {
  const row = {
    company_id:          companyId,
    client_company_name: (entry.name          || '').trim(),
    employee_name:       (entry.employeeName  || '').trim(),
    contract_type:       (entry.contractType  || '').trim(),
    start_date:          entry.startDate  || null,
    end_date:            entry.endDate    || null,
    renewable:           !!entry.renewable,
    renew_months:        entry.renewMonths   ? Number(entry.renewMonths)  : null,
    renew_type:          entry.renewType     || null,
    renew_notice:        entry.renewNotice   ? Number(entry.renewNotice)  : null,
    renew_count:         Number(entry.renewCount) || 0,
    notes:               (entry.notes         || '').trim(),
    admin_email:         (entry.adminEmail    || '').trim(),
    company_email:       (entry.companyEmail  || '').trim(),
    cantieri:            Array.isArray(entry.cantieri)   ? entry.cantieri   : [],
    work_notes:          Array.isArray(entry.workNotes)  ? entry.workNotes  : [],
    status:              ['active','gestita','terminato'].includes(entry.status)
                           ? entry.status : 'active',
    indeterminate:       !!entry.indeterminate,
    cessato:             !!entry.cessato,
    in_progress:         !!entry.inProgress,
    updated_at:          new Date().toISOString(),
  };
  if (entry.supabaseId) row.id = entry.supabaseId;
  return row;
}

function _loadLocalCacheForUser() {
  try {
    const uid = authUser?.id || authUser?.uid;
    if (uid) {
      const scoped = localStorage.getItem(`cm2_data_${uid}`);
      if (scoped) return JSON.parse(scoped);
    }
    const legacy = localStorage.getItem('cm2_data');
    if (legacy) return JSON.parse(legacy);
  } catch (_) {}
  return null;
}

window.resetSupabaseSync = function () {
  _syncTenantCompanyId = null;
  _syncLastState = null;
  _syncInProgress = false;
  _syncScheduled = false;
  window._billingSummary = null;
};

window.isSupabaseSyncActive = function () {
  return !!_syncTenantCompanyId;
};

window.initSupabaseSync = async function () {
  if (!window.supabaseClient) return;

  try {
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) return;

    const { data: profile, error: profileErr } = await window.supabaseClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile?.company_id) {
      console.warn('[Sync] Profilo senza company_id');
      return;
    }
    _syncTenantCompanyId = profile.company_id;

    const { data: rows, error: rowsErr } = await window.supabaseClient
      .from('contracts')
      .select('*')
      .eq('company_id', _syncTenantCompanyId)
      .order('id', { ascending: true });

    if (rowsErr) {
      console.warn('[Sync] Errore caricamento contratti:', rowsErr.message);
      return;
    }

    if (rows && rows.length > 0) {
      state.companies = rows.map(_rowToEntry);
      if (typeof save === 'function' && typeof scopedKey === 'function') {
        save(scopedKey(SK.data), state.companies);
      }
      if (typeof normalizeCompanyCantieri === 'function') normalizeCompanyCantieri();
      _syncLastState = JSON.stringify(state.companies);
      console.info('[Sync] Caricati', rows.length, 'contratti da Supabase');
    } else {
      const local = _loadLocalCacheForUser();
      if (Array.isArray(local) && local.length > 0) {
        state.companies = local;
        if (typeof normalizeCompanyCantieri === 'function') normalizeCompanyCantieri();
        console.info('[Sync] Migrazione', local.length, 'contratti da cache locale → Supabase');
        await _flushSyncToSupabase(true);
      } else {
        state.companies = [];
        _syncLastState = '[]';
      }
    }

    syncConfig.enabled = true;
    syncConfig.provider = 'supabase';
    if (typeof save === 'function') save(SK.sync, syncConfig);

    if (typeof renderSidebarCompanies === 'function') renderSidebarCompanies();
    if (typeof renderPage === 'function') renderPage();
    if (typeof updateNav === 'function') updateNav();
    if (typeof applyWriteRoleUI === 'function') applyWriteRoleUI();

    await _loadBillingSummary();
  } catch (err) {
    console.warn('[Sync] initSupabaseSync errore:', err);
  }
};

window._billingSummary = null;

async function _loadBillingSummary () {
  if (!window.supabaseClient || !_syncTenantCompanyId) return;
  try {
    const { data } = await window.supabaseClient
      .from('billing_summary')
      .select('*')
      .eq('company_id', _syncTenantCompanyId)
      .maybeSingle();
    window._billingSummary = data || null;
    _renderBillingBanner();
    if (typeof applyWriteRoleUI === 'function') applyWriteRoleUI();
  } catch (_) {}
}

window.refreshBillingSummary = _loadBillingSummary;

function _renderBillingBanner () {
  const el = document.getElementById('billing-status-bar');
  if (!el) return;
  const s = window._billingSummary;
  if (!s) { el.style.display = 'none'; return; }

  const used    = Number(s.contracts_used)  || state.companies.length;
  const maxC    = s.max_contracts != null ? Number(s.max_contracts) : null;
  const subStatus = s.subscription_status || 'trialing';
  const trialDays = s.trial_days_left != null ? Number(s.trial_days_left) : null;

  let cls   = 'billing-bar--ok';
  let parts = [];

  if (subStatus === 'trialing' && trialDays !== null) {
    cls = trialDays <= 3 ? 'billing-bar--warn' : 'billing-bar--trial';
    parts.push(`Trial: ${trialDays} ${trialDays === 1 ? 'giorno rimasto' : 'giorni rimasti'}`);
  } else if (subStatus === 'past_due' || subStatus === 'unpaid') {
    cls = 'billing-bar--err';
    parts.push('Pagamento in sospeso — rinnova per continuare');
  } else if (subStatus === 'canceled') {
    cls = 'billing-bar--err';
    parts.push('Abbonamento cancellato');
  } else {
    parts.push(`Piano ${s.plan_name || 'Starter'} — attivo`);
  }

  if (maxC !== null) {
    const pct = Math.round((used / maxC) * 100);
    parts.push(`Contratti: ${used}/${maxC}`);
    if (pct >= 90) cls = 'billing-bar--warn';
  }

  const manageBtn = (typeof isAdmin === 'function' && isAdmin())
    ? `<button type="button" class="billing-manage-btn" onclick="openBillingPortal()">Gestisci abbonamento</button>`
    : '';

  el.className = `billing-status-bar ${cls}`;
  el.innerHTML = parts.map(p => `<span>${p}</span>`).join('<span class="billing-sep">·</span>') + manageBtn;
  el.style.display = 'flex';
}

window.scheduleSyncToSupabase = function () {
  if (!_syncTenantCompanyId) return;
  if (_syncScheduled) return;
  _syncScheduled = true;
  setTimeout(() => _flushSyncToSupabase(false), SYNC_DEBOUNCE_MS);
};

window.forceSyncToSupabase = function () {
  return _flushSyncToSupabase(true);
};

async function _flushSyncToSupabase (force) {
  _syncScheduled = false;
  if (_syncInProgress || !_syncTenantCompanyId) return;

  const currentState = JSON.stringify(state.companies);
  if (!force && currentState === _syncLastState) return;

  if (typeof canManageData === 'function' && !canManageData()) return;

  _syncInProgress = true;
  try {
    const rows  = state.companies.map(e => _entryToRow(e, _syncTenantCompanyId));
    const supabaseIds = rows.filter(r => r.id).map(r => r.id);

    if (rows.length > 0) {
      const { error: upsertErr } = await window.supabaseClient
        .from('contracts')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
      if (upsertErr) throw upsertErr;
    }

    if (supabaseIds.length > 0) {
      await window.supabaseClient
        .from('contracts')
        .delete()
        .eq('company_id', _syncTenantCompanyId)
        .not('id', 'in', `(${supabaseIds.join(',')})`);
    } else if (state.companies.length === 0) {
      await window.supabaseClient
        .from('contracts')
        .delete()
        .eq('company_id', _syncTenantCompanyId);
    }

    await _refreshSupabaseIds();

    _syncLastState = JSON.stringify(state.companies);
    if (typeof save === 'function' && typeof scopedKey === 'function') {
      save(scopedKey(SK.data), state.companies);
    }
    if (typeof showToast === 'function' && force) showToast('Dati sincronizzati', { duration: 1500 });

    await _loadBillingSummary();
  } catch (err) {
    console.warn('[Sync] _flushSyncToSupabase errore:', err.message);
    if (typeof showToast === 'function') showToast('Errore sincronizzazione: ' + (err.message || err));
  } finally {
    _syncInProgress = false;
  }
}

async function _refreshSupabaseIds () {
  if (!_syncTenantCompanyId) return;
  const { data: rows } = await window.supabaseClient
    .from('contracts')
    .select('id, employee_name, end_date, client_company_name')
    .eq('company_id', _syncTenantCompanyId)
    .order('id', { ascending: true });

  if (!rows) return;

  state.companies.forEach(entry => {
    if (entry.supabaseId) return;
    const match = rows.find(r =>
      (r.client_company_name || '') === (entry.name || '') &&
      (r.employee_name        || '') === (entry.employeeName || '') &&
      (r.end_date             || '') === (entry.endDate || '')
    );
    if (match) {
      entry.id         = match.id;
      entry.supabaseId = match.id;
    }
  });
}

window.registerNewTenant = async function (fullName, companyName) {
  if (!window.supabaseClient) throw new Error('Supabase non disponibile');
  const { data, error } = await window.supabaseClient
    .rpc('register_new_tenant', {
      p_full_name:    (fullName    || '').trim(),
      p_company_name: (companyName || '').trim(),
    });
  if (error) throw error;
  return data;
};
