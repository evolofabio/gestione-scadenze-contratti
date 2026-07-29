'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// ProrogaPro — Modulo compliance normativa (IT)
// ═══════════════════════════════════════════════════════════════════════════

const CAUSALE_PARTIES_DEADLINE = '2026-12-31';
const UNILAV_DEADLINE_DAYS = 5;
const DEFAULT_ALERT_DAYS = [60, 30, 15, 7, 3, 1];

const LEGAL_CATEGORIES = {
  td:              { label: 'Tempo determinato (lavoro)',        labor: true,  maxProroghe: 4, maxMonths: 24, stopGo: true  },
  ti:              { label: 'Tempo indeterminato',             labor: true,  maxProroghe: 0, maxMonths: null, stopGo: false },
  apprendistato:   { label: 'Apprendistato',                   labor: true,  maxProroghe: 4, maxMonths: 48, stopGo: true  },
  somministrazione:{ label: 'Somministrazione',                labor: true,  maxProroghe: 4, maxMonths: 24, stopGo: true  },
  stagionale:      { label: 'Stagionale',                      labor: true,  maxProroghe: 5, maxMonths: 36, stopGo: false },
  cococo:          { label: 'Collaborazione (co.co.co)',       labor: true,  maxProroghe: 0, maxMonths: null, stopGo: false },
  fornitura_b2b:   { label: 'Fornitura / somministrazione B2B', labor: false, maxProroghe: null, maxMonths: null, stopGo: false },
  appalto_privato: { label: 'Appalto privato',                 labor: false, maxProroghe: null, maxMonths: null, stopGo: false },
  appalto_pubblico:{ label: 'Appalto pubblico (D.Lgs. 36/2023)', labor: false, maxProroghe: null, maxMonths: null, stopGo: false },
  altro:           { label: 'Altro / personalizzato',          labor: false, maxProroghe: null, maxMonths: null, stopGo: false },
};

const CAUSALI_ART19 = {
  sostituzione:    { label: 'Art. 19 lett. b-bis — Sostituzione altri lavoratori', needsText: true  },
  parti_top:       { label: 'Art. 19 lett. b — Esigenze TOP individuate dalle parti (fino al 31/12/2026)', needsText: true, deadline: CAUSALE_PARTIES_DEADLINE },
  ccnl:            { label: 'Causale prevista dal CCNL applicato', needsText: true  },
  stagionale:      { label: 'Attività stagionale (art. 21)', needsText: false },
  n_a:             { label: 'Non applicabile / non richiesta', needsText: false },
};

const COMPLIANCE_TYPES = {
  unilav_proroga:        { label: 'UNILAV — Proroga', deadlineDays: UNILAV_DEADLINE_DAYS },
  unilav_rinnovo:        { label: 'UNILAV — Rinnovo', deadlineDays: UNILAV_DEADLINE_DAYS },
  unilav_trasformazione: { label: 'UNILAV — Trasformazione', deadlineDays: UNILAV_DEADLINE_DAYS },
  unilav_cessazione:     { label: 'UNILAV — Cessazione', deadlineDays: UNILAV_DEADLINE_DAYS },
  disdetta:              { label: 'Disdetta / mancato rinnovo', deadlineDays: 0 },
  gara_pubblica:         { label: 'Avvio nuova gara (appalto PA)', deadlineDays: 0 },
  fine_prova:            { label: 'Fine periodo di prova', deadlineDays: 0 },
  preavviso_disdetta:    { label: 'Termine invio disdetta / preavviso', deadlineDays: 0 },
  permesso_soggiorno:    { label: 'Scadenza permesso di soggiorno', deadlineDays: 0 },
  scadenza_custom:       { label: 'Scadenza personalizzata', deadlineDays: 0 },
};

let _complianceTimeFilter = 'all';
let _complianceCategoryFilter = 'all';

const COMPLIANCE_STUDIO_TYPES = new Set([
  'fine_prova', 'preavviso_disdetta', 'permesso_soggiorno', 'scadenza_custom', 'disdetta', 'gara_pubblica',
]);

function isUnilavComplianceTask(t){
  return String(t?.type || '').startsWith('unilav_');
}

function isStudioComplianceTask(t){
  return COMPLIANCE_STUDIO_TYPES.has(t?.type);
}

function filterComplianceTasksByCategory(tasks, category){
  const c = category || 'all';
  if (c === 'unilav') return (tasks || []).filter(isUnilavComplianceTask);
  if (c === 'studio') return (tasks || []).filter(isStudioComplianceTask);
  return tasks || [];
}

function getFilteredComplianceTasks(allTasks, timeFilter, categoryFilter){
  let tasks = filterStudioDeadlines(allTasks || [], timeFilter || 'all');
  return filterComplianceTasksByCategory(tasks, categoryFilter || 'all');
}

function complianceTypeLabel(type, note){
  const base = (COMPLIANCE_TYPES[type] || {}).label || type;
  if (type === 'scadenza_custom' && note) return note;
  return base;
}

function legalCat(code){
  const key = (code && LEGAL_CATEGORIES[code]) ? code : 'altro';
  return { ...LEGAL_CATEGORIES[key], code: key };
}
function hasCausale(c){
  if (!c) return false;
  if (c.causaleCode && c.causaleCode !== 'n_a') return true;
  return c.renewType === 'Con causale';
}

function normalizeContractLegal(c){
  if (!c || typeof c !== 'object') return c;
  if (!c.legalCategory) {
    const t = String(c.contractType || '').toLowerCase();
    if (t.includes('determin')) c.legalCategory = 'td';
    else if (t.includes('apprend')) c.legalCategory = 'apprendistato';
    else if (t.includes('sommin')) c.legalCategory = 'somministrazione';
    else if (t.includes('stagion')) c.legalCategory = 'stagionale';
    else if (t.includes('appalto') && t.includes('pubbl')) c.legalCategory = 'appalto_pubblico';
    else if (t.includes('appalto')) c.legalCategory = 'appalto_privato';
    else if (t.includes('fornit')) c.legalCategory = 'fornitura_b2b';
    else c.legalCategory = 'altro';
  }
  if (!c.causaleCode) c.causaleCode = hasCausale(c) ? 'parti_top' : 'n_a';
  if (!c.causaleText) c.causaleText = '';
  if (!c.ccnlApplied) c.ccnlApplied = '';
  if (!c.lastContractEndDate) c.lastContractEndDate = '';
  if (!Array.isArray(c.complianceTasks)) c.complianceTasks = [];
  if (!Array.isArray(c.contractHistory)) c.contractHistory = [];
  if (!c.publicProcurement || typeof c.publicProcurement !== 'object') {
    c.publicProcurement = { prorogaOption: false, prorogaOptionMax: 0, prorogaTecnica: false, garaAvviata: false, prorogheOpzioneCount: 0 };
  }
  if (!c.taxCode) c.taxCode = '';
  if (!c.jobTitle) c.jobTitle = '';
  if (c.trialDays === undefined || c.trialDays === null) c.trialDays = '';
  if (!c.trialEndDate) c.trialEndDate = '';
  if (!c.workPermitExpiry) c.workPermitExpiry = '';
  if (!Array.isArray(c.customDeadlines)) c.customDeadlines = [];
  c.contractType = legalCat(c.legalCategory).label;
  return c;
}

function getTrialEndDate(c){
  normalizeContractLegal(c);
  if (c.trialEndDate) return c.trialEndDate;
  const days = parseInt(c.trialDays);
  if (c.startDate && days > 0) return addDaysISO(c.startDate, days);
  return null;
}

function getDisdettaDeadlineDate(c){
  if (!c?.endDate || c.renewable === false || c.cessato) return null;
  const notice = parseInt(c.renewNotice) || 30;
  const d = new Date(c.endDate);
  d.setDate(d.getDate() - notice);
  return d.toISOString().split('T')[0];
}

function upsertDerivedTask(c, stableId, type, dueDate, eventDate, note){
  if (!dueDate || !c) return;
  normalizeContractLegal(c);
  const existing = (c.complianceTasks || []).find(t => t.id === stableId);
  if (existing && existing.status === 'done') return;
  const payload = {
    id: stableId,
    type,
    eventDate: eventDate || dueDate,
    dueDate,
    status: 'pending',
    note: note || '',
    doneAt: null,
    derived: true,
  };
  if (existing) {
    Object.assign(existing, payload, { status: existing.status, doneAt: existing.doneAt });
    return;
  }
  c.complianceTasks.unshift(payload);
}

function syncDerivedStudioTasks(c){
  if (!c || c.cessato || c.indeterminate) return;
  normalizeContractLegal(c);
  const cid = c.id;
  const trialEnd = getTrialEndDate(c);
  if (trialEnd) {
    upsertDerivedTask(c, `derived_prova_${cid}`, 'fine_prova', trialEnd, trialEnd, 'Verificare esito periodo di prova');
  }
  const disdettaDue = getDisdettaDeadlineDate(c);
  if (disdettaDue) {
    upsertDerivedTask(c, `derived_disdetta_${cid}`, 'preavviso_disdetta', disdettaDue, c.endDate,
      `Inviare disdetta entro preavviso (${parseInt(c.renewNotice) || 30} gg)`);
  }
  if (c.workPermitExpiry) {
    upsertDerivedTask(c, `derived_permesso_${cid}`, 'permesso_soggiorno', c.workPermitExpiry, c.workPermitExpiry,
      'Verificare rinnovo permesso di soggiorno');
  }
  (c.customDeadlines || []).forEach((cd, i) => {
    if (!cd?.dueDate || cd.status === 'done') return;
    const id = cd.id || `custom_${cid}_${i}`;
    cd.id = id;
    upsertDerivedTask(c, `derived_${id}`, 'scadenza_custom', cd.dueDate, cd.dueDate, cd.label || 'Scadenza personalizzata');
  });
}

function syncAllStudioTasks(){
  (state?.companies || []).forEach(syncDerivedStudioTasks);
}

function normalizeAllContractsLegal(){
  if (!state?.companies) return;
  state.companies = state.companies.map(c => {
    normalizeContractLegal(c);
    syncDerivedStudioTasks(c);
    return c;
  });
}

function addDaysISO(dateStr, days){
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetweenISO(a, b){
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function complianceDueDate(eventDate, type){
  const cfg = COMPLIANCE_TYPES[type];
  const days = cfg ? cfg.deadlineDays : UNILAV_DEADLINE_DAYS;
  return addDaysISO(eventDate, days);
}

function addComplianceTask(c, type, eventDate, note){
  normalizeContractLegal(c);
  const due = complianceDueDate(eventDate, type);
  const id = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  c.complianceTasks.unshift({
    id, type, eventDate, dueDate: due, status: 'pending',
    note: note || '', doneAt: null,
  });
  return c.complianceTasks[0];
}

function pushContractHistory(c, entry){
  normalizeContractLegal(c);
  c.contractHistory.unshift({ date: new Date().toISOString().split('T')[0], ...entry });
}

function checkStopAndGo(prevEndDate, newStartDate, prevDurationMonths){
  if (!prevEndDate || !newStartDate) return { stato: 'OK', msg: 'Date non disponibili per stop-and-go.', azione: '' };
  const gap = daysBetweenISO(prevEndDate, newStartDate);
  const required = (prevDurationMonths || 0) > 6 ? 20 : 10;
  if (gap === null) return { stato: 'OK', msg: '', azione: '' };
  if (gap < required) {
    return {
      stato: 'ERRORE',
      msg: `Stop-and-go violato: intervallo ${gap} gg (minimo ${required} gg art. 21 D.Lgs. 81/2015). Rischio trasformazione T.I.`,
      azione: `Posticipare inizio al ${addDaysISO(prevEndDate, required)} o convertire a T.I.`,
    };
  }
  return { stato: 'OK', msg: `Stop-and-go rispettato (${gap} gg, min ${required}).`, azione: '' };
}

function analyzeContractCompliance(c, opts){
  opts = opts || {};
  const cat = legalCat(c?.legalCategory || 'altro');
  const durMesi = opts.projectedDurationMonths != null
    ? opts.projectedDurationMonths
    : (c?.startDate && c?.endDate ? durationMonths(c.startDate, c.endDate) : 0);
  const proroghe = opts.projectedRenewCount != null ? opts.projectedRenewCount : (parseInt(c?.renewCount) || 0);
  const causale = opts.causale != null ? opts.causale : hasCausale(c);

  if (c?.legalCategory === 'appalto_pubblico') {
    const pp = c.publicProcurement || {};
    if (opts.checkPublicProroga) {
      if (pp.prorogaTecnica && !pp.garaAvviata) {
        return { stato: 'ERRORE', msg: 'Proroga tecnica (art. 120 c.11): richiesta nuova gara già avviata.', azione: 'Avviare gara prima della proroga tecnica.' };
      }
      if (pp.prorogaOption && pp.prorogaOptionMax && (pp.prorogheOpzioneCount || 0) >= pp.prorogaOptionMax) {
        return { stato: 'ERRORE', msg: 'Opzione di proroga (art. 120 c.10): limite massimo raggiunto.', azione: 'Nuova gara obbligatoria.' };
      }
    }
    return { stato: 'OK', msg: 'Appalto pubblico — verificare opzione/proroga tecnica ex art. 120.', azione: '' };
  }

  if (!cat.labor) {
    const notice = parseInt(c?.renewNotice) || 30;
    return { stato: 'OK', msg: `Contratto commerciale — preavviso disdetta: ${notice} gg (art. 1569/1671 c.c.).`, azione: '' };
  }

  if (cat.code === 'stagionale') {
    if (proroghe > (cat.maxProroghe || 5)) {
      return { stato: 'ATTENZIONE', msg: `Stagionale: ${proroghe} proroghe (verificare limite ${cat.maxProroghe}/36 mesi).`, azione: 'Consultare CCNL settore.' };
    }
    return { stato: 'OK', msg: 'Stagionale — esenzione stop-and-go; causali agevolate.', azione: '' };
  }

  const maxP = cat.maxProroghe != null ? cat.maxProroghe : 4;
  const maxM = cat.maxMonths != null ? cat.maxMonths : 24;

  if (proroghe > maxP) {
    return { stato: 'ERRORE', msg: `Superato limite ${maxP} proroghe (${proroghe}).`, azione: 'Convertire a tempo indeterminato.' };
  }
  if (durMesi > maxM) {
    return { stato: 'ERRORE', msg: `Durata ${durMesi} mesi supera max ${maxM}.`, azione: 'Ridurre durata o T.I.' };
  }
  if (durMesi > 12 && !causale) {
    return { stato: 'ERRORE', msg: `Durata >12 mesi (${durMesi}) senza causale art. 19.`, azione: 'Indicare causale CCNL o individuata dalle parti.' };
  }
  if (durMesi > 12 && c?.causaleCode === 'parti_top') {
    const today = new Date().toISOString().split('T')[0];
    if (today > CAUSALE_PARTIES_DEADLINE) {
      return { stato: 'ERRORE', msg: 'Causale individuata dalle parti non più valida dopo il 31/12/2026.', azione: 'Usare causale CCNL o T.I.' };
    }
  }
  if (durMesi > 12 && c?.causaleCode === 'parti_top' && !(c.causaleText || '').trim()) {
    return { stato: 'ATTENZIONE', msg: 'Causale parti: specificare esigenze TOP in modo puntuale.', azione: 'Compilare testo causale.' };
  }
  if (durMesi === 12 && !causale) {
    return { stato: 'ATTENZIONE', msg: 'Durata al limite 12 mesi senza causale.', azione: 'Prossima estensione richiederà causale.' };
  }
  if (proroghe === maxP) {
    return { stato: 'ATTENZIONE', msg: `Raggiunto max proroghe (${maxP}/${maxP}).`, azione: 'Valutare T.I.' };
  }
  if (durMesi >= maxM - 2) {
    return { stato: 'ATTENZIONE', msg: `Durata (${durMesi} mesi) vicina al max ${maxM}.`, azione: 'Pianificare chiusura o T.I.' };
  }
  if (proroghe === maxP - 1) {
    return { stato: 'ATTENZIONE', msg: `Resta 1 proroga su ${maxP}.`, azione: '' };
  }

  if (opts.kind === 'rinnovo' && cat.stopGo && c?.lastContractEndDate && opts.newStartDate) {
    const prevDur = opts.prevDurationMonths || durationMonths(c.startDate, c.lastContractEndDate || c.endDate);
    const sg = checkStopAndGo(c.lastContractEndDate, opts.newStartDate, prevDur);
    if (sg.stato !== 'OK') return sg;
  }

  return { stato: 'OK', msg: `Conforme: ${durMesi} mesi, ${proroghe}/${maxP} proroghe${causale ? ' con causale' : ''}.`, azione: '' };
}

function getAlertDaysForContract(c){
  const notice = Math.max(0, parseInt(c?.renewNotice) || 0);
  const base = (emailSettings?.autoSend?.daysBeforeExpiry || DEFAULT_ALERT_DAYS.slice(1)).slice();
  const set = new Set(base);
  if (notice > 0) set.add(notice);
  DEFAULT_ALERT_DAYS.forEach(d => set.add(d));
  return [...set].filter(d => d > 0).sort((a, b) => b - a);
}

function getDisdettaDaysLeft(c){
  if (!c?.endDate) return null;
  const notice = parseInt(c.renewNotice) || 30;
  return daysLeft(c.endDate) - notice;
}

function getPendingComplianceTasks(companies){
  syncAllStudioTasks();
  const list = (companies || state.companies || []).flatMap(c => {
    normalizeContractLegal(c);
    return (c.complianceTasks || [])
      .filter(t => t.status !== 'done')
      .map(t => ({
        ...t,
        contractId: c.id,
        contractName: c.name,
        employeeName: c.employeeName,
        taxCode: c.taxCode || '',
        label: complianceTypeLabel(t.type, t.note),
      }));
  });
  return list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

function filterStudioDeadlines(tasks, filter){
  const f = filter || _complianceTimeFilter || 'all';
  if (f === 'all') return tasks;
  return tasks.filter(t => {
    const d = daysLeft(t.dueDate);
    if (f === 'overdue') return d < 0;
    if (f === 'today') return d >= 0 && d <= 1;
    if (f === 'week') return d >= 0 && d <= 7;
    return true;
  });
}

function getClientPortfolioStats(){
  syncAllStudioTasks();
  const map = {};
  (state.companies || []).forEach(c => {
    const name = c.name || 'Senza nome';
    if (!map[name]) {
      map[name] = { name, contracts: 0, urgent: 0, overdue: 0, pendingTasks: 0, riskScore: 0 };
    }
    const row = map[name];
    row.contracts++;
    const d = daysLeft(c.endDate);
    if (d >= 0 && d <= 30) row.urgent++;
    if (d < 0) row.overdue++;
    const pending = (c.complianceTasks || []).filter(t => t.status !== 'done');
    row.pendingTasks += pending.length;
    pending.forEach(t => { if (daysLeft(t.dueDate) < 0) row.overdue++; });
  });
  return Object.values(map).map(r => {
    r.riskScore = r.overdue * 100 + r.pendingTasks * 10 + r.urgent * 2;
    return r;
  }).sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name, 'it'));
}

function renderStudioWeekWidget(){
  const tasks = filterStudioDeadlines(getPendingComplianceTasks(), 'week');
  const overdue = getPendingComplianceTasks().filter(t => daysLeft(t.dueDate) < 0);
  const today = tasks.filter(t => daysLeft(t.dueDate) <= 1);
  let html = `<div class="studio-week-panel">
    <div class="studio-week-head">
      <div><div class="studio-week-title">Piano settimanale studio</div>
      <div class="studio-week-sub">${today.length} oggi/domani · ${tasks.length} entro 7 gg · ${overdue.length} scaduti</div></div>
      <button class="tb-btn" onclick="setPage('compliance')">Scadenziario completo</button>
    </div>`;
  if (!tasks.length && !overdue.length) {
    html += `<div class="studio-week-empty">Nessuna scadenza critica nei prossimi 7 giorni.</div>`;
  } else {
    const show = [...overdue.slice(0, 3), ...tasks.filter(t => daysLeft(t.dueDate) >= 0).slice(0, 6)];
    html += `<ul class="studio-week-list">`;
    show.forEach(t => {
      const d = daysLeft(t.dueDate);
      const cls = d < 0 ? 'overdue' : d <= 1 ? 'today' : '';
      html += `<li class="studio-week-item ${cls}"><span class="studio-week-date">${formatDate(t.dueDate)} (${d} gg)</span>
        <strong>${esc(t.label)}</strong> — ${esc(t.contractName)}${t.employeeName ? ' · ' + esc(t.employeeName) : ''}
        <button class="act-btn sm" onclick="markComplianceDone(${escJsArg(t.contractId)},${escJsArg(t.id)})">Fatto</button></li>`;
    });
    html += `</ul>`;
  }
  html += `</div>`;
  return html;
}

function renderStudioPortfolioPage(){
  const clients = getClientPortfolioStats();
  let html = `<div class="dashboard-hero"><div class="dashboard-hero-copy">
    <div class="dashboard-kicker">Studio</div>
    <div class="dashboard-title">Portfolio clienti</div>
    <div class="dashboard-subtitle">Vista per azienda: contratti attivi, adempimenti pendenti e priorità operative.</div>
  </div></div>`;
  if (!clients.length) {
    html += `<div class="empty-state">Nessun cliente registrato.</div>`;
    return html;
  }
  html += `<div class="client-portfolio-grid">`;
  clients.forEach(cl => {
    const badge = cl.overdue > 0 ? 'err' : cl.pendingTasks > 0 ? 'warn' : 'ok';
    html += `<article class="client-portfolio-card">
      <div class="client-portfolio-top">
        <h3>${esc(cl.name)}</h3>
        <span class="client-badge ${badge}">${cl.pendingTasks} ademp.</span>
      </div>
      <div class="client-portfolio-stats">
        <span><strong>${cl.contracts}</strong> contratti</span>
        <span><strong>${cl.urgent}</strong> in scadenza 30gg</span>
        <span class="${cl.overdue ? 'c-red' : ''}"><strong>${cl.overdue}</strong> critici</span>
      </div>
      <div class="client-portfolio-actions">
        <button class="tb-btn" onclick="setCompanyPage(${escJsArg(cl.name)})">Apri contratti</button>
        <button class="tb-btn" onclick="exportClientWeeklyReport(${escJsArg(cl.name)})">Report settimanale</button>
      </div>
    </article>`;
  });
  html += `</div>`;
  return html;
}

window.setComplianceTimeFilter = function(f){
  _complianceTimeFilter = f || 'all';
  renderPage();
};

window.setComplianceCategoryFilter = function(f){
  _complianceCategoryFilter = f || 'all';
  renderPage();
};

window.setComplianceFilter = function(f){
  _complianceTimeFilter = f || 'all';
  renderPage();
};

window.exportClientWeeklyReport = function(clientName){
  syncAllStudioTasks();
  const contracts = (state.companies || []).filter(c => c.name === clientName);
  if (!contracts.length) { showToast('Cliente non trovato'); return; }
  const tasks = getPendingComplianceTasks(contracts);
  if (!window.jspdf) { showToast('jsPDF non disponibile'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 16;
  doc.setFontSize(15); doc.setFont(undefined, 'bold');
  doc.text('ProrogaPro — Report scadenze settimanale', 14, y); y += 8;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`Cliente: ${clientName}`, 14, y); y += 5;
  doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 14, y); y += 5;
  doc.text(`Contratti monitorati: ${contracts.length}`, 14, y); y += 8;
  if (!tasks.length) {
    doc.text('Nessun adempimento pendente.', 14, y);
  } else {
    tasks.slice(0, 35).forEach(t => {
      if (y > 270) { doc.addPage(); y = 16; }
      const dl = daysLeft(t.dueDate);
      doc.text(`• ${formatDate(t.dueDate)} (${dl} gg) — ${t.label} — ${t.employeeName || '—'}`, 14, y);
      y += 5;
    });
  }
  const safe = String(clientName).replace(/[^\w\-]+/g, '_').substring(0, 40);
  doc.save(`prorogapro_report_${safe}_${new Date().toISOString().split('T')[0]}.pdf`);
  showToast('Report cliente esportato');
};

window.duplicateContract = function(id){
  if (!requireWriteAccess('duplicare contratti')) return;
  if (!canAddContract(1)) { showToast('Limite contratti del piano raggiunto'); return; }
  const c = state.companies.find(x => x.id === id);
  if (!c) return;
  const newId = Math.max(0, ...state.companies.map(x => x.id || 0)) + 1;
  const copy = JSON.parse(JSON.stringify(c));
  copy.id = newId;
  delete copy.supabaseId;
  copy.complianceTasks = [];
  copy.contractHistory = [];
  copy.employeeName = (copy.employeeName ? copy.employeeName + ' (copia)' : 'Copia');
  normalizeContractLegal(copy);
  syncDerivedStudioTasks(copy);
  state.companies.push(copy);
  saveData();
  renderPage();
  renderSidebarCompanies();
  showToast('Contratto duplicato — aggiorna le date');
};

function getLegalNotifications(){
  const pending = getPendingComplianceTasks();
  const overdue = pending.filter(t => daysLeft(t.dueDate) < 0);
  const dueSoon = pending.filter(t => { const d = daysLeft(t.dueDate); return d >= 0 && d <= 3; });
  const disdetta = (state.companies || []).filter(c => {
    const dl = getDisdettaDaysLeft(c);
    return dl !== null && dl <= 7 && dl >= -3 && c.renewable !== false;
  });
  return { pending, overdue, dueSoon, disdetta, total: pending.length + disdetta.length };
}

function renderLegalBannerHtml(opts){
  opts = opts || {};
  const alertsOnly = !!opts.alertsOnly;
  const today = new Date().toISOString().split('T')[0];
  const legal = getLegalNotifications();
  const parts = [];
  if (!alertsOnly) {
    if (today <= CAUSALE_PARTIES_DEADLINE) {
      parts.push(`<div class="legal-banner info"><strong>Causale parti (L. 118/2025):</strong> utilizzabile fino al <strong>31/12/2026</strong> se il CCNL non prevede causali proprie.</div>`);
    } else {
      parts.push(`<div class="legal-banner warn"><strong>Post 31/12/2026:</strong> per TD oltre 12 mesi serve causale CCNL — non più quella individuata dalle parti.</div>`);
    }
  }
  if (legal.overdue.length) {
    parts.push(`<div class="legal-banner err"><strong>${legal.overdue.length} adempimenti scaduti</strong> (UNILAV/compliance) — <a href="#" onclick="setPage('compliance');return false">Apri registro</a></div>`);
  } else if (legal.dueSoon.length) {
    parts.push(`<div class="legal-banner warn"><strong>${legal.dueSoon.length} adempimenti in scadenza</strong> entro 3 giorni — <a href="#" onclick="setPage('compliance');return false">Verifica</a></div>`);
  }
  if (legal.disdetta.length) {
    parts.push(`<div class="legal-banner warn"><strong>${legal.disdetta.length} contratti</strong> in finestra disdetta/preavviso — controllare invio disdetta.</div>`);
  }
  return parts.join('');
}

function renderCompliancePage(){
  syncAllStudioTasks();
  const allTasks = getPendingComplianceTasks();
  const tasks = getFilteredComplianceTasks(allTasks, _complianceTimeFilter, _complianceCategoryFilter);
  const done = (state.companies || []).flatMap(c => (c.complianceTasks || []).filter(t => t.status === 'done').map(t => ({
    ...t, contractId: c.id, contractName: c.name, employeeName: c.employeeName, label: complianceTypeLabel(t.type, t.note),
  }))).slice(0, 30);
  const timeFilters = [
    ['all', 'Tutti'],
    ['today', 'Oggi'],
    ['week', '7 giorni'],
    ['overdue', 'Scaduti'],
  ];
  const categoryFilters = [
    ['all', 'Tutti i tipi'],
    ['unilav', 'UNILAV'],
    ['studio', 'Studio & contratto'],
  ];
  let html = `<div class="dashboard-hero"><div class="dashboard-hero-copy"><div class="dashboard-kicker">Scadenziario</div><div class="dashboard-title">Registro adempimenti studio</div><div class="dashboard-subtitle">Filtra per urgenza e tipologia: UNILAV, periodo di prova, disdetta, permessi e scadenze personalizzate.</div></div></div>`;
  html += renderLegalBannerHtml();
  html += `<div class="scadenziario-tabs">
    <div class="scadenziario-tab-group">
      <div class="scadenziario-tab-label">Quando</div>
      <div class="compliance-filter-row">${timeFilters.map(([k, lbl]) => {
        const n = getFilteredComplianceTasks(allTasks, k, _complianceCategoryFilter).length;
        return `<button type="button" class="day-chip${_complianceTimeFilter === k ? ' active' : ''}" onclick="setComplianceTimeFilter(${escJsArg(k)})">${esc(lbl)}${n ? ` (${n})` : ''}</button>`;
      }).join('')}</div>
    </div>
    <div class="scadenziario-tab-group">
      <div class="scadenziario-tab-label">Tipo</div>
      <div class="compliance-filter-row">${categoryFilters.map(([k, lbl]) => {
        const n = getFilteredComplianceTasks(allTasks, _complianceTimeFilter, k).length;
        return `<button type="button" class="day-chip${_complianceCategoryFilter === k ? ' active' : ''}" onclick="setComplianceCategoryFilter(${escJsArg(k)})">${esc(lbl)}${n ? ` (${n})` : ''}</button>`;
      }).join('')}</div>
    </div>
  </div>`;
  html += `<div class="compliance-actions"><button class="tb-btn" onclick="exportComplianceCSV()">Esporta registro CSV</button></div>`;
  if (!tasks.length) {
    html += `<div class="empty-state">Nessun adempimento con i filtri selezionati. Prova ad allargare la finestra temporale o cambiare tipologia.</div>`;
  } else {
    html += `<div class="compliance-table-wrap"><table class="data-table"><thead><tr><th>Scadenza</th><th>Tipo</th><th>Cliente / soggetto</th><th>CF</th><th>Evento</th><th></th></tr></thead><tbody>`;
    tasks.forEach(t => {
      const dl = daysLeft(t.dueDate);
      const rowCls = dl < 0 ? 'row-overdue' : dl <= 1 ? 'row-today' : dl <= 7 ? 'row-week' : '';
      const cls = dl < 0 ? 'c-red' : dl <= 3 ? 'c-amber' : '';
      html += `<tr class="${rowCls}"><td class="${cls}">${formatDate(t.dueDate)} (${dl} gg)</td><td>${esc(t.label)}</td><td>${esc(t.contractName)} — ${esc(t.employeeName || '')}</td><td>${esc(t.taxCode || '—')}</td><td>${formatDate(t.eventDate)}</td><td><button class="act-btn sm" onclick="markComplianceDone(${escJsArg(t.contractId)},${escJsArg(t.id)})">Segna fatto</button></td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  if (done.length) {
    html += `<details class="compliance-done-panel"><summary>Completati di recente (${done.length})</summary><ul class="compliance-done-list">`;
    done.forEach(t => {
      html += `<li>${formatDate(t.doneAt || t.dueDate)} — ${esc(t.label)} — ${esc(t.contractName)}</li>`;
    });
    html += `</ul></details>`;
  }
  return html;
}

function applyContractExtension(id, opts){
  opts = opts || {};
  const idx = state.companies.findIndex(c => c.id === id);
  if (idx < 0) return { ok: false, error: 'Contratto non trovato' };
  const c = state.companies[idx];
  normalizeContractLegal(c);
  const kind = opts.kind || 'proroga';
  const months = parseInt(opts.months) || c.renewMonths || 12;

  if (kind === 'rinnovo') {
    const newStart = opts.newStartDate;
    if (!newStart) return { ok: false, error: 'Data inizio rinnovo obbligatoria' };
    c.lastContractEndDate = c.endDate;
    const prevDur = durationMonths(c.startDate, c.endDate);
    const r = analyzeContractCompliance(c, { kind: 'rinnovo', newStartDate: newStart, prevDurationMonths: prevDur, projectedRenewCount: (c.renewCount || 0) + 1 });
    if (r.stato === 'ERRORE' && !opts.force) return { ok: false, error: r.msg, compliance: r };
    const newEnd = addMonthsISO(newStart, months);
    pushContractHistory(c, { kind: 'rinnovo', months, prevEnd: c.endDate, newStart, newEnd });
    c.startDate = newStart;
    c.endDate = newEnd;
    c.renewCount = (c.renewCount || 0) + 1;
    addComplianceTask(c, 'unilav_rinnovo', newStart, `Rinnovo ${months} mesi`);
  } else {
    if (!c.endDate || !c.startDate) return { ok: false, error: 'Date contratto mancanti' };
    const newEnd = addMonthsISO(c.endDate, months);
    const newDur = durationMonths(c.startDate, newEnd);
    const newRenew = (c.renewCount || 0) + 1;
    const r = analyzeContractCompliance(c, { projectedDurationMonths: newDur, projectedRenewCount: newRenew });
    if (r.stato === 'ERRORE' && !opts.force) return { ok: false, error: r.msg, compliance: r };
    pushContractHistory(c, { kind: 'proroga', months, prevEnd: c.endDate, newEnd });
    c.endDate = newEnd;
    c.renewCount = newRenew;
    addComplianceTask(c, 'unilav_proroga', new Date().toISOString().split('T')[0], `Proroga +${months} mesi`);
    if (c.legalCategory === 'appalto_pubblico' && c.publicProcurement?.prorogaOption) {
      c.publicProcurement.prorogheOpzioneCount = (c.publicProcurement.prorogheOpzioneCount || 0) + 1;
    }
  }
  state.companies[idx] = c;
  saveData();
  return { ok: true };
}

function addMonthsISO(dateStr, months){
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function exportDossierProroga(id){
  const c = state.companies.find(x => x.id === id);
  if (!c || !window.jspdf) { showToast('Contratto non trovato o jsPDF non disponibile'); return; }
  normalizeContractLegal(c);
  const r = analyzeContractCompliance(c);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 16;
  doc.setFontSize(16); doc.setFont(undefined, 'bold');
  doc.text('ProrogaPro — Dossier proroga / compliance', 14, y); y += 10;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 14, y); y += 8;
  doc.text(`Azienda: ${c.name}`, 14, y); y += 6;
  doc.text(`Soggetto: ${c.employeeName || '—'}`, 14, y); y += 6;
  doc.text(`Categoria: ${legalCat(c.legalCategory).label}`, 14, y); y += 6;
  doc.text(`Periodo: ${formatDate(c.startDate)} → ${formatDate(c.endDate)}`, 14, y); y += 6;
  doc.text(`Proroghe: ${c.renewCount || 0} | Preavviso: ${c.renewNotice || 0} gg`, 14, y); y += 6;
  doc.text(`Causale: ${(CAUSALI_ART19[c.causaleCode] || {}).label || c.causaleCode || '—'}`, 14, y); y += 6;
  if (c.causaleText) { doc.text(`Testo: ${c.causaleText.substring(0, 120)}`, 14, y); y += 6; }
  doc.text(`Verifica: ${r.stato} — ${r.msg.substring(0, 100)}`, 14, y); y += 10;
  if ((c.contractHistory || []).length) {
    doc.setFont(undefined, 'bold'); doc.text('Storico estensioni', 14, y); y += 6;
    doc.setFont(undefined, 'normal');
    c.contractHistory.slice(0, 8).forEach(h => {
      doc.text(`• ${h.date} ${h.kind}: ${h.months || '—'} mesi → ${formatDate(h.newEnd || h.newStart)}`, 14, y); y += 5;
    });
  }
  y += 4;
  if ((c.complianceTasks || []).length) {
    doc.setFont(undefined, 'bold'); doc.text('Adempimenti', 14, y); y += 6;
    doc.setFont(undefined, 'normal');
    c.complianceTasks.slice(0, 10).forEach(t => {
      doc.text(`• ${(COMPLIANCE_TYPES[t.type] || {}).label}: scad. ${formatDate(t.dueDate)} [${t.status}]`, 14, y); y += 5;
    });
  }
  doc.save(`prorogapro_dossier_${c.id}_${new Date().toISOString().split('T')[0]}.pdf`);
  showToast('Dossier PDF esportato');
}

function exportComplianceCSV(){
  const rows = getPendingComplianceTasks();
  const h = ['Scadenza', 'Giorni', 'Tipo', 'Azienda', 'Dipendente', 'CF', 'Evento', 'Stato', 'Note'];
  const body = rows.map(t => [t.dueDate, daysLeft(t.dueDate), t.label, t.contractName, t.employeeName || '', t.taxCode || '', t.eventDate, t.status, t.note || '']);
  const csv = [h, ...body].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const b = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = `prorogapro_compliance_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(u);
  showToast('Registro compliance esportato');
}

function legalCategoryOptions(selected){
  return Object.entries(LEGAL_CATEGORIES).map(([k, v]) =>
    `<option value="${k}"${selected === k ? ' selected' : ''}>${esc(v.label)}</option>`
  ).join('');
}

function causaleOptions(selected){
  return Object.entries(CAUSALI_ART19).map(([k, v]) =>
    `<option value="${k}"${selected === k ? ' selected' : ''}>${esc(v.label)}</option>`
  ).join('');
}

function renderStudioFormFields(v){
  v = v || {};
  normalizeContractLegal(v);
  const cd = (v.customDeadlines && v.customDeadlines[0]) || {};
  return `
    <div class="form-section-label">Dati studio / lavoratore</div>
    <div class="form-row">
      <div class="form-field"><label>Codice fiscale</label>
        <input class="f-input" id="f-tax-code" type="text" value="${escAttr(v.taxCode || '')}" placeholder="RSSMRA80A01H501Z" style="width:100%"></div>
      <div class="form-field"><label>Qualifica / mansione</label>
        <input class="f-input" id="f-job-title" type="text" value="${escAttr(v.jobTitle || '')}" placeholder="Es. Impiegato amministrativo" style="width:100%"></div>
    </div>
    <div class="form-row triple">
      <div class="form-field"><label>Giorni prova</label>
        <input class="f-input" id="f-trial-days" type="number" min="0" max="365" value="${v.trialDays !== '' && v.trialDays != null ? escAttr(String(v.trialDays)) : ''}" placeholder="60" style="width:100%"></div>
      <div class="form-field"><label>Fine prova (alternativa)</label>
        <input class="f-input" id="f-trial-end" type="date" value="${v.trialEndDate || ''}" style="width:100%"></div>
      <div class="form-field"><label>Scadenza permesso soggiorno</label>
        <input class="f-input" id="f-permit-expiry" type="date" value="${v.workPermitExpiry || ''}" style="width:100%"></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Scadenza aggiuntiva (label)</label>
        <input class="f-input" id="f-custom-label" type="text" value="${escAttr(cd.label || '')}" placeholder="Es. Visita medica, DURC, formazione" style="width:100%"></div>
      <div class="form-field"><label>Data scadenza aggiuntiva</label>
        <input class="f-input" id="f-custom-date" type="date" value="${cd.dueDate || ''}" style="width:100%"></div>
    </div>`;
}

function readStudioFieldsFromForm(existing){
  const taxCode = (document.getElementById('f-tax-code') || {}).value?.trim().toUpperCase() || '';
  const jobTitle = (document.getElementById('f-job-title') || {}).value?.trim() || '';
  const trialDaysRaw = (document.getElementById('f-trial-days') || {}).value;
  const trialDays = trialDaysRaw === '' ? '' : parseInt(trialDaysRaw) || '';
  const trialEndDate = (document.getElementById('f-trial-end') || {}).value || '';
  const workPermitExpiry = (document.getElementById('f-permit-expiry') || {}).value || '';
  const customLabel = (document.getElementById('f-custom-label') || {}).value?.trim() || '';
  const customDate = (document.getElementById('f-custom-date') || {}).value || '';
  const customDeadlines = Array.isArray(existing?.customDeadlines) ? existing.customDeadlines.slice() : [];
  if (customDate) {
    const prev = customDeadlines[0] || { id: 'custom_' + Date.now() };
    customDeadlines[0] = { ...prev, label: customLabel || 'Scadenza personalizzata', dueDate: customDate, status: prev.status || 'pending' };
  } else if (customDeadlines.length) {
    customDeadlines.length = 0;
  }
  return { taxCode, jobTitle, trialDays, trialEndDate, workPermitExpiry, customDeadlines };
}

function renderLegalFormFields(v){
  v = v || {};
  normalizeContractLegal(v);
  const isPa = v.legalCategory === 'appalto_pubblico';
  const pp = v.publicProcurement || {};
  return `
    <div class="form-section-label">Profilo normativo</div>
    <div class="form-row">
      <div class="form-field"><label>Categoria legale *</label>
        <select class="f-input" id="f-legal-cat" style="width:100%" onchange="toggleLegalFormSections()">${legalCategoryOptions(v.legalCategory)}</select>
      </div>
      <div class="form-field"><label>CCNL applicato</label>
        <input class="f-input" id="f-ccnl" type="text" value="${escAttr(v.ccnlApplied || '')}" placeholder="Es. Commercio, Metalmeccanico" style="width:100%">
      </div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Causale art. 19</label>
        <select class="f-input" id="f-causale-code" style="width:100%">${causaleOptions(v.causaleCode)}</select>
      </div>
      <div class="form-field"><label>Tipo proroga (legacy)</label>
        <select class="f-input" id="f-rtype" style="width:100%">
          <option${v.renewType === 'Con causale' ? ' selected' : ''}>Con causale</option>
          <option${v.renewType === 'Senza causale' ? ' selected' : ''}>Senza causale</option>
          <option${v.renewType === 'Automatica' ? ' selected' : ''}>Automatica</option>
        </select>
      </div>
    </div>
    <div class="form-row single"><div class="form-field"><label>Testo causale / motivazione</label>
      <textarea class="f-input" id="f-causale-text" style="width:100%" placeholder="Esigenze tecnico-organizzative e produttive...">${esc(v.causaleText || '')}</textarea>
    </div></div>
    <div id="legal-pa-fields" style="display:${isPa ? 'block' : 'none'}">
      <div class="form-section-label">Appalto pubblico (D.Lgs. 36/2023 art. 120)</div>
      <div class="form-row">
        <div class="form-field"><label>Opzione proroga in gara</label>
          <select class="f-input" id="f-pp-option" style="width:100%"><option value="no"${!pp.prorogaOption ? ' selected' : ''}>No</option><option value="yes"${pp.prorogaOption ? ' selected' : ''}>Sì</option></select>
        </div>
        <div class="form-field"><label>Max proroghe opzione</label>
          <input class="f-input" id="f-pp-option-max" type="number" min="0" value="${pp.prorogaOptionMax || 0}" style="width:100%">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Proroga tecnica (c.11)</label>
          <select class="f-input" id="f-pp-tecnica" style="width:100%"><option value="no"${!pp.prorogaTecnica ? ' selected' : ''}>No</option><option value="yes"${pp.prorogaTecnica ? ' selected' : ''}>Sì</option></select>
        </div>
        <div class="form-field"><label>Nuova gara avviata</label>
          <select class="f-input" id="f-pp-gara" style="width:100%"><option value="no"${!pp.garaAvviata ? ' selected' : ''}>No</option><option value="yes"${pp.garaAvviata ? ' selected' : ''}>Sì</option></select>
        </div>
      </div>
    </div>${renderStudioFormFields(v)}`;
}

function readLegalFieldsFromForm(existing){
  const cat = (document.getElementById('f-legal-cat') || {}).value || 'altro';
  const causaleCode = (document.getElementById('f-causale-code') || {}).value || 'n_a';
  const causaleText = (document.getElementById('f-causale-text') || {}).value?.trim() || '';
  const ccnlApplied = (document.getElementById('f-ccnl') || {}).value?.trim() || '';
  const rtype = (document.getElementById('f-rtype') || {}).value || 'Senza causale';
  const pp = {
    prorogaOption: (document.getElementById('f-pp-option') || {}).value === 'yes',
    prorogaOptionMax: parseInt((document.getElementById('f-pp-option-max') || {}).value) || 0,
    prorogaTecnica: (document.getElementById('f-pp-tecnica') || {}).value === 'yes',
    garaAvviata: (document.getElementById('f-pp-gara') || {}).value === 'yes',
    prorogheOpzioneCount: existing?.publicProcurement?.prorogheOpzioneCount || 0,
  };
  return {
    legalCategory: cat,
    contractType: legalCat(cat).label,
    causaleCode,
    causaleText,
    ccnlApplied,
    renewType: causaleCode !== 'n_a' ? 'Con causale' : rtype,
    publicProcurement: pp,
    ...readStudioFieldsFromForm(existing),
  };
}

window.toggleLegalFormSections = function(){
  const cat = (document.getElementById('f-legal-cat') || {}).value;
  const el = document.getElementById('legal-pa-fields');
  if (el) el.style.display = cat === 'appalto_pubblico' ? 'block' : 'none';
};

window.markComplianceDone = function(contractId, taskId){
  if (!requireWriteAccess('aggiornare adempimenti')) return;
  const c = state.companies.find(x => String(x.id) === String(contractId));
  if (!c) return;
  const t = (c.complianceTasks || []).find(x => x.id === taskId);
  if (!t) return;
  t.status = 'done';
  t.doneAt = new Date().toISOString().split('T')[0];
  if (t.type === 'scadenza_custom' && String(taskId).startsWith('derived_custom_')) {
    const cid = String(taskId).replace('derived_', '');
    (c.customDeadlines || []).forEach(cd => { if (cd.id === cid) cd.status = 'done'; });
  }
  saveData();
  renderPage();
  updateNav();
  showToast('Adempimento segnato come completato');
};

window.openRenewModal = function(id){
  const c = state.companies.find(x => x.id === id);
  if (!c) return;
  const months = c.renewMonths || 12;
  const minStart = c.endDate ? addDaysISO(c.endDate, 10) : '';
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal modal-wide" onclick="event.stopPropagation()"><h3>Rinnovo contratto — ${esc(c.employeeName || c.name)}</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Il rinnovo crea un nuovo periodo con verifica stop-and-go (10/20 gg art. 21).</p>
    <div class="form-row">
      <div class="form-field"><label>Nuova data inizio *</label><input class="f-input" id="rn-start" type="date" value="${minStart}" style="width:100%"></div>
      <div class="form-field"><label>Durata (mesi)</label><input class="f-input" id="rn-months" type="number" min="1" value="${months}" style="width:100%"></div>
    </div>
    <div id="rn-check"></div>
    <div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="doRenewContract(${id})">Applica rinnovo</button></div>
  </div></div>`);
};

window.doRenewContract = function(id){
  const newStart = (document.getElementById('rn-start') || {}).value;
  const months = parseInt((document.getElementById('rn-months') || {}).value) || 0;
  if (!newStart || months <= 0) { showToast('Date e mesi obbligatori'); return; }
  const res = applyContractExtension(id, { kind: 'rinnovo', newStartDate: newStart, months });
  if (!res.ok) {
    if (res.compliance?.stato === 'ATTENZIONE') {
      showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal"><h3>Attenzione rinnovo</h3><p>${esc(res.error)}</p><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="applyContractExtension(${id},{kind:'rinnovo',newStartDate:'${newStart}',months:${months},force:true});hideModal();renderPage();showToast('Rinnovo applicato')">Procedi</button></div></div></div>`);
      return;
    }
    showToast(res.error || 'Rinnovo non applicabile');
    return;
  }
  hideModal(); renderPage(); renderSidebarCompanies();
  showToast('Rinnovo applicato — creata scadenza UNILAV');
};

// Override verificaCausale per compatibilità
window.verificaCausale = function(durMesi, proroghe, causale, contract){
  const c = contract || { legalCategory: 'td', renewCount: proroghe, renewType: causale ? 'Con causale' : 'Senza causale', causaleCode: causale ? 'parti_top' : 'n_a' };
  return analyzeContractCompliance(c, { projectedDurationMonths: durMesi, projectedRenewCount: proroghe, causale: !!causale });
};

window.causaleForContract = function(c){
  if (!c?.startDate || !c?.endDate) return null;
  normalizeContractLegal(c);
  return analyzeContractCompliance(c);
};

window.normalizeContractLegal = normalizeContractLegal;
window.normalizeAllContractsLegal = normalizeAllContractsLegal;
window.analyzeContractCompliance = analyzeContractCompliance;
window.applyContractExtension = applyContractExtension;
window.getAlertDaysForContract = getAlertDaysForContract;
window.getDisdettaDaysLeft = getDisdettaDaysLeft;
window.getLegalNotifications = getLegalNotifications;
window.renderLegalBannerHtml = renderLegalBannerHtml;
window.renderCompliancePage = renderCompliancePage;
window.renderStudioPortfolioPage = renderStudioPortfolioPage;
window.renderStudioWeekWidget = renderStudioWeekWidget;
window.syncDerivedStudioTasks = syncDerivedStudioTasks;
window.syncAllStudioTasks = syncAllStudioTasks;
window.getClientPortfolioStats = getClientPortfolioStats;
window.renderLegalFormFields = renderLegalFormFields;
window.readLegalFieldsFromForm = readLegalFieldsFromForm;
window.exportDossierProroga = exportDossierProroga;
window.exportComplianceCSV = exportComplianceCSV;
window.addComplianceTask = addComplianceTask;
window.LEGAL_CATEGORIES = LEGAL_CATEGORIES;
window.CAUSALI_ART19 = CAUSALI_ART19;

try { normalizeAllContractsLegal(); } catch (_) {}
