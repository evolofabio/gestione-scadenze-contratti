// ═══════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════
function renderCantieriPage(){
  // Only show cantieri from the canonical company record (first contract per azienda)
  const seenCompany = {};
  const all = state.companies.flatMap(c => {
    if (seenCompany[c.name]) return [];
    seenCompany[c.name] = true;
    return (c.cantieri||[]).map((ct,idx) => ({...normalizeCantiere(ct), company: c, _idx: idx, _contractId: c.id}));
  });
  all.sort((a,b)=>daysLeft(getCantiereEndDate(a))-daysLeft(getCantiereEndDate(b)));
  if(!all.length) return `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>Nessun cantiere registrato.<br><br><button class="tb-btn primary" onclick="openAddCantiereGlobal()">+ Aggiungi cantiere</button></div>`;

  const groups=[
    {label:'Scaduti',items:all.filter(ct=>daysLeft(getCantiereEndDate(ct))<0),cls:'danger'},
    {label:'Urgenti — entro 7 giorni',items:all.filter(ct=>{const d=daysLeft(getCantiereEndDate(ct));return d>=0&&d<=7}),cls:'danger'},
    {label:'In scadenza — entro 30 giorni',items:all.filter(ct=>{const d=daysLeft(getCantiereEndDate(ct));return d>7&&d<=30}),cls:'warn'},
    {label:'Regolari',items:all.filter(ct=>daysLeft(getCantiereEndDate(ct))>30),cls:'ok'},
  ];
  const expiredCount=groups[0].items.length;
  const urgentCount=groups[1].items.length;
  const regularCount=groups[3].items.length;

  let h=`<div class="section-head" style="align-items:center">
    <div><div class="section-title">Cantieri (${all.length})</div><div class="section-sub">Panoramica operativa dei cantieri associati alle aziende.</div></div>
    <div><button class="tb-btn primary" onclick="openAddCantiereGlobal()">+ Aggiungi cantiere</button></div>
  </div>`;
  h+=`<div class="dashboard-summary" style="margin-bottom:22px">
    <div class="summary-chip"><div class="summary-chip-label">Totale</div><div class="summary-chip-value">${all.length}</div><div class="summary-chip-meta">cantieri registrati</div></div>
    <div class="summary-chip"><div class="summary-chip-label">Urgenti</div><div class="summary-chip-value">${urgentCount}</div><div class="summary-chip-meta">entro 7 giorni</div></div>
    <div class="summary-chip"><div class="summary-chip-label">Scaduti</div><div class="summary-chip-value">${expiredCount}</div><div class="summary-chip-meta">da riallineare</div></div>
    <div class="summary-chip"><div class="summary-chip-label">Regolari</div><div class="summary-chip-value">${regularCount}</div><div class="summary-chip-meta">oltre 30 giorni</div></div>
  </div>`;
  groups.forEach(g=>{
    if(!g.items.length)return;
    h+=`<div class="urgency-group">
      <div class="group-header"><span class="group-title">${g.label}</span><span class="group-count ${g.cls}">${g.items.length}</span></div>
      ${g.items.map(ct=>{
        const endDate=getCantiereEndDate(ct);
        const d=daysLeft(endDate);
        const uc=d<0||d<=7?'urgent':d<=30?'warning':'ok';
        return `<div class="cantiere-card">
            <div class="cantiere-urgency-bar ${uc}"></div>
            <div class="cantiere-info">
              <div class="cantiere-name">${esc(ct.nome)}</div>
              <div class="cantiere-company">${esc(ct.company.name)}</div>
              ${ct.committente?`<div style="font-size:12px;color:var(--text2);margin-top:4px">Committente: <strong>${esc(ct.committente)}</strong></div>`:''}
              <div class="cantiere-meta-grid">
                <div class="cantiere-meta-item"><div class="cantiere-meta-label">Data inizio</div><div class="cantiere-meta-value">${formatDate(getCantiereStartDate(ct))}</div></div>
                <div class="cantiere-meta-item"><div class="cantiere-meta-label">Data fine</div><div class="cantiere-meta-value">${formatDate(endDate)}</div></div>
                <div class="cantiere-meta-item"><div class="cantiere-meta-label">Importo</div><div class="cantiere-meta-value">${esc(formatCurrency(ct.importo))}</div></div>
                <div class="cantiere-meta-item"><div class="cantiere-meta-label">Stato</div><div class="cantiere-meta-value">${d<0?'Scaduto':'Attivo'}</div></div>
              </div>
              ${ct.note?`<div class="cantiere-note-block">${esc(ct.note)}</div>`:''}
            </div>
            <div class="cantiere-right">
              <div class="cantiere-days ${uc}">${d<0?'Sc.':d}</div>
              <div class="cantiere-days-label">${d<0?'scaduto':'giorni'}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:2px">Fine ${formatDate(endDate)}</div>
              <div class="cantiere-actions">
                <button class="act-btn" onclick="openEditCantiere(${ct.company.id},${ct._idx})">Modifica</button>
                <button class="act-btn danger" onclick="confirmDeleteCantiere(${ct.company.id},${ct._idx})">Elimina</button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  });
  return h;
}

// Open modal showing all events (contracts + cantieri) for a specific day
window.openDayEvents=function(dateStr){
  const items=[];
  state.companies.forEach(c=>{
    if(c.endDate===dateStr)items.push({type:'contratto',label:`${c.name}${c.employeeName?' — '+c.employeeName:''}`,detail:`Scadenza contratto: ${formatDate(c.endDate)}`,contractId:c.id});
    (c.cantieri||[]).forEach(ct=>{if(getCantiereEndDate(ct)===dateStr)items.push({type:'cantiere',label:`${ct.nome}`,detail:`Cantiere per ${c.name}${ct.committente?` • ${ct.committente}`:''}`,contractId:c.id,cantiereIdx:c.cantieri.indexOf(ct)})});
  });
  if(!items.length){showToast('Nessuna scadenza per il giorno selezionato');return}
  const list=items.map(it=>{
    const actions=[];
    if(it.type==='contratto')actions.push(`<button class="m-btn" onclick="hideModal();openEditModal(${it.contractId})">Modifica contratto</button>`);
    if(it.type==='cantiere')actions.push(`<button class="m-btn" onclick="hideModal();openEditCantiere(${it.contractId},${it.cantiereIdx})">Modifica cantiere</button>`);
    return `<div style="padding:10px 0;border-bottom:1px dashed var(--border);display:flex;gap:12px;align-items:center">
      <div style="flex:1"><div style="font-weight:600">${esc(it.label)}</div><div style="font-size:12px;color:var(--text3);margin-top:4px">${esc(it.detail)}</div></div>
      <div style="display:flex;gap:8px">${actions.join('')}</div>
    </div>`;
  }).join('');
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:680px">
    <h3>Scadenze del ${formatDate(dateStr)}</h3>
    <div style="max-height:360px;overflow:auto;padding-top:6px">${list}</div>
    <div class="modal-actions"><button class="m-btn" onclick="hideModal()">Chiudi</button></div>
  </div></div>`);
}

// Global add cantiere (from Cantieri page)
window.openAddCantiereGlobal=function(){
  // build a select of unique companies (use first contract id as canonical)
  const seen={};
  const opts=state.companies.reduce((a,c)=>{if(!seen[c.name]){seen[c.name]=true;a.push(`<option value="${c.id}">${esc(c.name)}</option>`)}return a},[]).join('');
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:720px">
    <h3>Nuovo cantiere</h3>
    <div class="form-row"><div class="form-field"><label>Azienda</label><select id="mc-company" class="f-input" style="width:100%">${opts}</select></div></div>
    <div class="form-row single"><div class="form-field"><label>Nome cantiere</label><input id="mc-nome" class="f-input" type="text" placeholder="Es. Cantiere Nord" style="width:100%"></div></div>
    <div class="form-row"><div class="form-field"><label>Data inizio</label><input id="mc-start" class="f-input" type="date" style="width:100%"></div>
    <div class="form-field"><label>Data fine</label><input id="mc-end" class="f-input" type="date" style="width:100%"></div></div>
    <div class="form-row"><div class="form-field"><label>Committente</label><input id="mc-client" class="f-input" type="text" placeholder="Es. Comune di Milano" style="width:100%"></div>
    <div class="form-field"><label>Importo</label><input id="mc-amount" class="f-input" type="text" placeholder="Es. 1500,00" style="width:100%"></div></div>
    <div class="form-row single"><div class="form-field"><label>Note</label><textarea id="mc-note" class="f-input" placeholder="Opzionale" style="width:100%;min-height:92px;resize:vertical"></textarea></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn primary" onclick="saveModalCantiereGlobal()">Aggiungi cantiere</button>
    </div>
  </div></div>`);
}

window.saveModalCantiereGlobal=function(){
  const companyId=parseInt((document.getElementById('mc-company')||{}).value,10);
  const nome=(document.getElementById('mc-nome')||{}).value?.trim();
  const startDate=(document.getElementById('mc-start')||{}).value;
  const endDate=(document.getElementById('mc-end')||{}).value;
  const committente=(document.getElementById('mc-client')||{}).value?.trim()||'';
  const importoRaw=(document.getElementById('mc-amount')||{}).value?.trim()||'';
  const note=(document.getElementById('mc-note')||{}).value?.trim()||'';
  const importo=normalizeCurrencyInput(importoRaw);
  if(importoRaw&&!importo){showToast('Inserisci un importo valido');return}
  if(!companyId||!nome||!endDate){showToast('Seleziona azienda, inserisci nome e data fine');return}
  if(startDate&&endDate&&startDate>endDate){showToast('La data inizio non puo superare la data fine');return}
  const c=state.companies.find(x=>x.id===companyId);
  if(!c)return showToast('Azienda non trovata');
  if(!Array.isArray(c.cantieri))c.cantieri=[];
  // avoid duplicates by nome+data fine
  const key=((nome||'').trim().toLowerCase())+'|'+endDate;
  const exists=c.cantieri.some(ct=>getCantiereKey({nome:ct.nome,endDate:getCantiereEndDate(ct)})===key);
  if(exists){showToast('Cantiere già presente per questa azienda');return}
  c.cantieri.push(normalizeCantiere({nome,startDate,endDate,scadenza:endDate,note,committente,importo}));
  saveData();hideModal();renderPage();showToast('Cantiere aggiunto');
}

// ═══════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════
function renderAnalyticsPage(){
  // Scadenze per mese (prossimi 12 mesi)
  const now=new Date();
  const monthLabels=[];const monthData=[];
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    monthLabels.push(d.toLocaleString('it-IT',{month:'short',year:'2-digit'}));
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthData.push(state.companies.filter(c=>c.endDate&&c.endDate.startsWith(key)).length);
  }
  // Tipo contratto
  const typeMap={};
  state.companies.forEach(c=>{const t=c.contractType||'Altro';typeMap[t]=(typeMap[t]||0)+1});
  const typeLabels=Object.keys(typeMap);const typeData=typeMap;

  const expired=state.companies.filter(c=>daysLeft(c.endDate)<0).length;
  const urgent=state.companies.filter(c=>{const d=daysLeft(c.endDate);return d>=0&&d<=30}).length;
  const renewable=state.companies.filter(c=>c.renewable).length;
  const avgDur=state.companies.length?Math.round(state.companies.reduce((s,c)=>s+durationMonths(c.startDate,c.endDate),0)/state.companies.length):0;
  const activeCompanies=[...new Set(state.companies.map(c=>c.name).filter(Boolean))].length;

  return`<div class="metrics-grid" style="margin-bottom:20px">
    <div class="metric-card"><div class="metric-label">Durata media</div><div class="metric-val">${avgDur}<span style="font-size:16px;font-weight:400"> mesi</span></div></div>
    <div class="metric-card"><div class="metric-label">Prorogabili</div><div class="metric-val c-blue">${renewable}</div><div class="metric-delta">su ${state.companies.length} totali</div></div>
    <div class="metric-card m-amber"><div class="metric-label">In scadenza 30gg</div><div class="metric-val c-amber">${urgent}</div></div>
    <div class="metric-card m-red"><div class="metric-label">Scaduti</div><div class="metric-val c-red">${expired}</div></div>
  </div>
  <div class="analytics-panels">
    <div class="chart-card">
      <div class="chart-title">Scadenze per mese</div>
      <div class="chart-subtitle">Andamento dei contratti in scadenza nei prossimi 12 mesi.</div>
      <div class="chart-canvas-wrap"><canvas id="chart-monthly" height="200"></canvas></div>
    </div>
    <div style="display:grid;gap:16px">
      <div class="chart-card">
        <div class="chart-title">Distribuzione contratti</div>
        <div class="chart-subtitle">Ripartizione per tipologia contrattuale.</div>
        <div class="chart-canvas-wrap"><canvas id="chart-types" height="220"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Colpo d'occhio</div>
        <div class="chart-subtitle">Indicatori sintetici per lettura rapida dello stato attuale.</div>
        <div class="company-stats" style="margin-top:6px">
          <div class="company-stat"><div class="company-stat-label">Aziende</div><div class="company-stat-value">${activeCompanies}</div><div class="company-stat-meta">anagrafiche attive</div></div>
          <div class="company-stat"><div class="company-stat-label">Contratti</div><div class="company-stat-value">${state.companies.length}</div><div class="company-stat-meta">registrati in archivio</div></div>
          <div class="company-stat"><div class="company-stat-label">Urgenti</div><div class="company-stat-value">${urgent}</div><div class="company-stat-meta">entro 30 giorni</div></div>
          <div class="company-stat"><div class="company-stat-label">Scaduti</div><div class="company-stat-value">${expired}</div><div class="company-stat-meta">da gestire subito</div></div>
        </div>
      </div>
    </div>
  </div>
  <script id="chart-data" type="application/json">${JSON.stringify({monthLabels,monthData,typeLabels:Object.keys(typeMap),typeData:Object.values(typeMap)})}<\/script>`;
}

function initCharts(){
  const raw=document.getElementById('chart-data');
  if(!raw||!window.Chart)return;
  let d;try{d=JSON.parse(raw.textContent)}catch(e){return}

  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const grid=isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)';
  const text=isDark?'#8a8984':'#6b6a65';
  Chart.defaults.font.family="'DM Sans', sans-serif";
  Chart.defaults.color=text;

  const mc=document.getElementById('chart-monthly');
  if(mc&&!mc._chart){
    mc._chart=new Chart(mc,{
      type:'bar',
      data:{labels:d.monthLabels,datasets:[{label:'Contratti in scadenza',data:d.monthData,backgroundColor:isDark?'rgba(85,128,232,.5)':'rgba(42,91,215,.5)',borderColor:isDark?'#5580e8':'#2a5bd7',borderWidth:1,borderRadius:4}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:grid}},y:{grid:{color:grid},ticks:{stepSize:1},beginAtZero:true}}}
    });
  }

  const tc=document.getElementById('chart-types');
  if(tc&&!tc._chart&&d.typeLabels.length){
    const colors=['#2a5bd7','#2d8a4e','#c47e0c','#d63c3c','#6d3fcf','#c47e0c'];
    tc._chart=new Chart(tc,{
      type:'doughnut',
      data:{labels:d.typeLabels,datasets:[{data:d.typeData,backgroundColor:colors.slice(0,d.typeLabels.length),borderWidth:0}]},
      options:{responsive:true,plugins:{legend:{position:'right'}}}
    });
  }
}

// ═══════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════
function renderSettingsPage(){
  const s=emailSettings;
  const allDays=[60,30,15,7,3,1];
  const activeDays=s.autoSend.daysBeforeExpiry||[];
  const ejsOk=isEmailJSConfigured();

  return`<div class="settings-card">
    <h4><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Metodo invio email</h4>
    <div class="send-method">
      <label class="method-option${s.sendMethod==='mailto'?' active':''}">
        <input type="radio" name="sm" value="mailto" ${s.sendMethod==='mailto'?'checked':''} onchange="setSendMethod('mailto')">
        <div><div class="method-title">Mailto — apre client email</div><div class="method-desc">Outlook, Gmail, Apple Mail. Nessuna configurazione richiesta.</div></div>
      </label>
      <label class="method-option${s.sendMethod==='emailjs'?' active':''}">
        <input type="radio" name="sm" value="emailjs" ${s.sendMethod==='emailjs'?'checked':''} onchange="setSendMethod('emailjs')">
        <div><div class="method-title">EmailJS — invio automatico</div><div class="method-desc">Gratis, 200 email/mese. Richiede account su emailjs.com.</div></div>
      </label>
    </div>
    ${s.sendMethod==='emailjs'?`<div class="settings-row triple" style="margin-top:12px">
      <div class="field-group"><label>Service ID</label><input class="f-input" type="text" value="${escAttr(s.emailjs.serviceId)}" placeholder="service_xxx" onchange="saveEJSField('serviceId',this.value)"></div>
      <div class="field-group"><label>Template ID</label><input class="f-input" type="text" value="${escAttr(s.emailjs.templateId)}" placeholder="template_xxx" onchange="saveEJSField('templateId',this.value)"></div>
      <div class="field-group"><label>Public Key</label><input class="f-input" type="text" value="${escAttr(s.emailjs.publicKey)}" placeholder="xxxx" onchange="saveEJSField('publicKey',this.value)"></div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
      ${ejsOk?'<span class="status-pill ok"><span class="status-dot ok"></span>EmailJS configurato</span>':'<span class="status-pill warn"><span class="status-dot warn"></span>Non configurato</span>'}
      <button class="tb-btn" onclick="testEmailJS()">Testa connessione</button>
    </div>`:''}
  </div>

  <div class="settings-card">
    <h4><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Notifiche push di sistema</h4>
    <div id="push-notif-card">${typeof renderPushCardContent==='function'?renderPushCardContent():''}</div>
  </div>

  <div class="settings-card">
    <h4><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Invio automatico</h4>
    <div class="toggle-row">
      <label class="toggle-switch"><input type="checkbox" ${s.autoSend.enabled?'checked':''} onchange="toggleAutoSend(this.checked)"><span class="toggle-track"></span></label>
      <span class="toggle-label">Attiva notifiche automatiche scadenza</span>
    </div>
    ${s.autoSend.enabled?`<div style="margin-bottom:12px">
      <div class="field-group" style="margin-bottom:8px"><label>Invia quando mancano (giorni):</label></div>
      <div class="day-chips">${allDays.map(d=>`<button class="day-chip${activeDays.includes(d)?' active':''}" onclick="toggleDay(${d})">${d} gg</button>`).join('')}</div>
    </div>
    <div class="settings-row">
      <div class="field-group">
        <label>Controlla ogni (minuti)</label>
        <input class="f-input" type="number" min="5" max="1440" value="${s.autoSend.checkIntervalMinutes||60}" onchange="saveCheckInterval(parseInt(this.value))">
      </div>
      <div class="field-group">
        <label>Stato</label>
        <span class="status-pill ok" style="margin-top:8px"><span class="status-dot ok"></span>Attivo</span>
      </div>
    </div>`:'<p style="font-size:13px;color:var(--text2)">Quando attivato, invia email automaticamente ai giorni selezionati prima della scadenza.</p>'}
  </div>

  <div class="settings-card">
    <h4><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Sincronizzazione Cloud (Firebase)</h4>
    <div class="toggle-row">
      <label class="toggle-switch"><input type="checkbox" ${syncConfig.enabled?'checked':''} onchange="toggleCloudSync(this.checked)"><span class="toggle-track"></span></label>
      <span class="toggle-label">Attiva sincronizzazione tra dispositivi</span>
    </div>
    <div class="sync-grid">
      <div class="field-group"><label>API Key</label><input class="f-input" type="text" value="${escAttr(syncConfig.apiKey)}" placeholder="AIzaSy…" onchange="saveSyncField('apiKey',this.value)"></div>
      <div class="field-group"><label>Database URL</label><input class="f-input" type="text" value="${escAttr(syncConfig.databaseURL)}" placeholder="https://…firebaseio.com" onchange="saveSyncField('databaseURL',this.value)"></div>
      <div class="field-group"><label>Nome stanza</label><input class="f-input" type="text" value="${escAttr(syncConfig.roomName)}" placeholder="la-mia-azienda" onchange="saveSyncField('roomName',this.value)"></div>
    </div>
    <div id="sync-status"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="tb-btn" onclick="applySyncConfig()">Applica</button>
      <button class="tb-btn" id="btn-pull" onclick="pullFromCloud()" ${!syncState.connected?'disabled':''}>Scarica dal cloud</button>
      <button class="tb-btn" id="btn-push" onclick="forcePushToCloud()" ${!syncState.connected?'disabled':''}>Carica sul cloud</button>
    </div>
    <p class="field-hint" style="margin-top:8px">Crea un progetto gratuito su console.firebase.google.com → Realtime Database. Tutti i dispositivi con la stessa stanza vedranno gli stessi dati.</p>
  </div>

  <div class="settings-card">
    <h4><svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1"/></svg>Backup e ripristino (JSON)</h4>
    <p style="font-size:13px;color:var(--text2);margin-bottom:10px">Esporta un backup completo o importa un backup in modalità sicura <strong>Unisci</strong> (non elimina i dati locali).</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="tb-btn" onclick="exportBackupJSON()">Scarica backup JSON</button>
      <button class="tb-btn" onclick="triggerImportBackupJSON()">Importa backup JSON (Unisci)</button>
    </div>
  </div>

  <div class="settings-card">
    <h4>Log invii email</h4>
    ${!emailLog.length?'<p style="font-size:13px;color:var(--text3)">Nessun invio registrato.</p>':
    `<div class="log-list">${emailLog.slice(0,15).map(l=>`<div class="log-entry">
      <div class="log-dot ${l.status==='success'?(l.method==='mailto'?'mailto':'ok'):'err'}"></div>
      <div class="log-info"><strong>${esc(l.contractName)}</strong> → ${esc(l.recipients)}<br><span style="font-size:11px;color:var(--text3)">${esc(l.detail)}</span></div>
      <div class="log-time">${new Date(l.date).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
    </div>`).join('')}</div>
    <button class="tb-btn" style="margin-top:10px" onclick="clearEmailLog()">Cancella log</button>`}
  </div>

  ${isAdmin() ? `<div class="settings-card">
    <h4><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>Gestione utenti</h4>
    <p style="font-size:13px;color:var(--text2);margin-bottom:10px">Approva o rifiuta le richieste di registrazione dei collaboratori.</p>
    <button class="tb-btn primary" onclick="loadAdminUsers()" style="margin-bottom:12px">Aggiorna lista utenti</button>
    <div id="admin-users-list"><div style="font-size:13px;color:var(--text3)">Clicca "Aggiorna lista utenti" per vedere le richieste.</div></div>
  </div>` : ''}`;
}

// ═══════════════════════════════════════
// MODALS
// ═══════════════════════════════════════
function showModal(html){
  const layer=document.getElementById('modal-layer');
  layer.innerHTML=html;
}
function hideModal(){document.getElementById('modal-layer').innerHTML=''}

// Add / Edit contract
window.openAddModal=function(){
  showModal(renderContractModal(null,null));
  setTimeout(attachModalListeners,10);
}
window.openAddContractModal=function(name){
  const existing=state.companies.find(c=>c.name===name);
  const base={name,adminEmail:existing?.adminEmail||'',companyEmail:existing?.companyEmail||''};
  showModal(renderContractModal(null,base));
  setTimeout(attachModalListeners,10);
}
window.openEditModal=function(id){
  const c=state.companies.find(x=>x.id===id);
  if(c){
    // open contract modal prefilled; allow editing company fields as well
    showModal(renderContractModal(c,null));
    setTimeout(attachModalListeners,10);
  }
}
window.openAddCantiere=function(id){
  const c=state.companies.find(x=>x.id===id);
  if(!c)return;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:720px">
    <h3>Aggiungi cantiere — ${esc(c.name)}</h3>
    <div class="form-row single"><div class="form-field"><label>Nome cantiere</label><input class="f-input" id="mc-nome" type="text" placeholder="Es. Cantiere Nord" style="width:100%"></div></div>
    <div class="form-row"><div class="form-field"><label>Data inizio</label><input class="f-input" id="mc-start" type="date" style="width:100%"></div>
    <div class="form-field"><label>Data fine</label><input class="f-input" id="mc-end" type="date" style="width:100%"></div></div>
    <div class="form-row"><div class="form-field"><label>Committente</label><input class="f-input" id="mc-client" type="text" placeholder="Es. Comune di Milano" style="width:100%"></div>
    <div class="form-field"><label>Importo</label><input class="f-input" id="mc-amount" type="text" placeholder="Es. 1500,00" style="width:100%"></div></div>
    <div class="form-row single"><div class="form-field"><label>Note</label><textarea class="f-input" id="mc-note" placeholder="Opzionale" style="width:100%;min-height:92px;resize:vertical"></textarea></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn primary" onclick="saveModalCantiere(${id})">Aggiungi</button>
    </div>
  </div></div>`);
}

// Company / Employee separated registration
window.openAddCompanyModal=function(){
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
    <h3>Registra nuova azienda</h3>
    <div class="form-row"><div class="form-field"><label>Nome azienda *</label><input id="ac-name" class="f-input" type="text" placeholder="Es. ACME S.r.l." style="width:100%"></div></div>
    <div class="form-row">
      <div class="form-field"><label>Email amministratore</label><input id="ac-admin" class="f-input" type="email" placeholder="admin@azienda.it" style="width:100%"></div>
      <div class="form-field"><label>Email azienda</label><input id="ac-company" class="f-input" type="email" placeholder="contratti@azienda.it" style="width:100%"></div>
    </div>
    <div class="form-row single"><div class="form-field"><label>Note</label><input id="ac-notes" class="f-input" type="text" placeholder="Opzionale" style="width:100%"></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn primary" onclick="saveCompany()">Registra azienda</button>
    </div>
  </div></div>`);
}

window.saveCompany=function(){
  const name=(document.getElementById('ac-name')||{}).value?.trim();
  const admin=(document.getElementById('ac-admin')||{}).value?.trim();
  const company=(document.getElementById('ac-company')||{}).value?.trim();
  const notes=(document.getElementById('ac-notes')||{}).value?.trim()||'';
  if(!name){showToast('Inserisci il nome dell\'azienda');return}
  // prevent duplicate company name
  const exists=state.companies.some(c=>c.name===name);
  if(exists){showToast('Azienda già registrata');return}
  const newId=Math.max(0,...state.companies.map(c=>c.id||0))+1;
  state.companies.push({id:newId,name,employeeName:'',contractType:'',startDate:'',endDate:'',renewable:false,renewMonths:12,renewType:'',renewNotice:30,renewCount:0,adminEmail:admin,companyEmail:company,notes,cantieri:[]});
  hideModal();saveData();renderSidebarCompanies();
  // Open company page so user can immediately add dipendenti
  setPage('company',name);
  showToast('Azienda registrata');
}

window.openEditCompanyModal=function(name){
  const contracts=state.companies.filter(c=>c.name===name);
  if(!contracts.length){showToast('Azienda non trovata');return}
  const first=contracts[0];
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
    <h3>Modifica azienda — ${esc(name)}</h3>
    <div class="form-row"><div class="form-field"><label>Nome azienda *</label><input id="ec-name" class="f-input" type="text" value="${escAttr(first.name)}" style="width:100%"></div></div>
    <div class="form-row">
      <div class="form-field"><label>Email amministratore</label><input id="ec-admin" class="f-input" type="email" value="${escAttr(first.adminEmail||'')}" style="width:100%"></div>
      <div class="form-field"><label>Email azienda</label><input id="ec-company" class="f-input" type="email" value="${escAttr(first.companyEmail||'')}" style="width:100%"></div>
    </div>
    <div class="form-row single"><div class="form-field"><label>Note</label><input id="ec-notes" class="f-input" type="text" value="${escAttr(first.notes||'')}" style="width:100%"></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn danger" onclick="confirmDeleteCompany(${escJsArg(name)})">Elimina azienda</button>
      <button class="m-btn primary" onclick="saveEditedCompany(${escJsArg(name)})">Salva</button>
    </div>
  </div></div>`);
}

window.saveEditedCompany=function(oldName){
  const newName=(document.getElementById('ec-name')||{}).value?.trim();
  const admin=(document.getElementById('ec-admin')||{}).value?.trim();
  const company=(document.getElementById('ec-company')||{}).value?.trim();
  const notes=(document.getElementById('ec-notes')||{}).value?.trim()||'';
  if(!newName){showToast('Inserisci il nome dell\'azienda');return}
  if(newName!==oldName && state.companies.some(c=>c.name===newName)){showToast('Esiste già un\'altra azienda con lo stesso nome');return}
  state.companies=state.companies.map(c=>c.name===oldName?{...c,name:newName,adminEmail:admin,companyEmail:company,notes}:c);
  // If we were viewing the old company page, keep showing the updated company
  if(state.activeCompany===oldName){
    setPage('company',newName);
  }else{
    hideModal();saveData();renderPage();renderSidebarCompanies();
  }
  showToast('Azienda aggiornata');
}

window.confirmDeleteCompany=function(name){
  const cnt=state.companies.filter(c=>c.name===name).length;
  if(!cnt){showToast('Azienda non trovata');return}
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
    <h3>Conferma eliminazione azienda</h3>
    <p style="font-size:14px;color:var(--text2);">Eliminare l'azienda <strong style="color:var(--text)">${esc(name)}</strong> e tutti i suoi ${cnt} contratti e cantieri associati? Questa azione è irreversibile.</p>
    <div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn danger" onclick="doDeleteCompany(${escJsArg(name)})">Elimina</button></div>
  </div></div>`);
}

window.doDeleteCompany=function(name){
  const removed=state.companies.filter(c=>c.name===name);
  state.companies=state.companies.filter(c=>c.name!==name);
  hideModal();saveData();renderPage();renderSidebarCompanies();showToast(`Azienda "${name}" e ${removed.length} contratti eliminati`);
}

window.openAddEmployeeModal=function(){
  const names=[...new Set(state.companies.map(c=>c.name))];
  if(!names.length){
    showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:420px">
      <h3>Nessuna azienda</h3>
      <p style="color:var(--text2)">Non ci sono aziende registrate. Prima registra l'azienda, poi aggiungi i dipendenti.</p>
      <div class="modal-actions"><button class="m-btn" onclick="hideModal()">Chiudi</button><button class="m-btn primary" onclick="hideModal();openAddCompanyModal()">Registra azienda</button></div>
    </div></div>`);
    return;
  }
  const opts=names.map(n=>`<option value="${escAttr(n)}">${esc(n)}</option>`).join('');
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
    <h3>Nuovo dipendente</h3>
    <div class="form-row"><div class="form-field"><label>Azienda *</label><select id="ae-company" class="f-input" style="width:100%">${opts}</select></div></div>
    <div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="doOpenAddContractForSelectedCompany()">Aggiungi dipendente</button></div>
  </div></div>`);
}

window.doOpenAddContractForSelectedCompany=function(){
  const sel=document.getElementById('ae-company');
  if(!sel)return;const name=sel.value;hideModal();openAddContractModal(name);
}
window.saveModalCantiere=function(id,idx){
  const nome=(document.getElementById('mc-nome')||{}).value?.trim();
  const startDate=(document.getElementById('mc-start')||{}).value;
  const endDate=(document.getElementById('mc-end')||{}).value;
  const committente=(document.getElementById('mc-client')||{}).value?.trim()||'';
  const importoRaw=(document.getElementById('mc-amount')||{}).value?.trim()||'';
  const note=(document.getElementById('mc-note')||{}).value?.trim()||'';
  const importo=normalizeCurrencyInput(importoRaw);
  if(importoRaw&&!importo){showToast('Inserisci un importo valido');return}
  if(!nome||!endDate){showToast('Inserisci nome cantiere e data fine');return}
  if(startDate&&endDate&&startDate>endDate){showToast('La data inizio non puo superare la data fine');return}
  const original=state.companies.find(x=>x.id===id);
  if(!original)return;
  // operate on canonical company record (first contract with same name)
  const c=state.companies.find(x=>x.name===original.name) || original;
  if(!Array.isArray(c.cantieri))c.cantieri=[];
  if(idx===null||idx===undefined){
    const key=((nome||'').trim().toLowerCase())+'|'+endDate;
    if(c.cantieri.some(ct=>getCantiereKey({nome:ct.nome,endDate:getCantiereEndDate(ct)})===key)){showToast('Cantiere già presente per questa azienda');return}
    c.cantieri.push(normalizeCantiere({nome,startDate,endDate,scadenza:endDate,note,committente,importo}));
    saveData();hideModal();renderPage();showToast('Cantiere aggiunto');
  }else{
    if(!c.cantieri[idx]){showToast('Cantiere non trovato');return}
    c.cantieri[idx]=Object.assign({},c.cantieri[idx],normalizeCantiere({nome,startDate,endDate,scadenza:endDate,note,committente,importo}));
    saveData();hideModal();renderPage();showToast('Cantiere aggiornato');
  }
}

// Edit / Delete cantieri
window.openEditCantiere=function(contractId,idx){
  const c=state.companies.find(x=>x.id===contractId);
  if(!c||!Array.isArray(c.cantieri)||!c.cantieri[idx])return;
  const ct=normalizeCantiere(c.cantieri[idx]);
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:720px">
    <h3>Modifica cantiere — ${esc(c.name)}</h3>
    <div class="form-row single"><div class="form-field"><label>Nome cantiere</label><input class="f-input" id="mc-nome" type="text" value="${escAttr(ct.nome)}" style="width:100%"></div></div>
    <div class="form-row"><div class="form-field"><label>Data inizio</label><input class="f-input" id="mc-start" type="date" value="${ct.startDate||''}" style="width:100%"></div>
    <div class="form-field"><label>Data fine</label><input class="f-input" id="mc-end" type="date" value="${ct.endDate||''}" style="width:100%"></div></div>
    <div class="form-row"><div class="form-field"><label>Committente</label><input class="f-input" id="mc-client" type="text" value="${escAttr(ct.committente||'')}" style="width:100%"></div>
    <div class="form-field"><label>Importo</label><input class="f-input" id="mc-amount" type="text" value="${escAttr(ct.importo||'')}" style="width:100%"></div></div>
    <div class="form-row single"><div class="form-field"><label>Note</label><textarea class="f-input" id="mc-note" style="width:100%;min-height:92px;resize:vertical">${esc(ct.note||'')}</textarea></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn danger" onclick="confirmDeleteCantiere(${contractId},${idx})">Elimina</button>
      <button class="m-btn primary" onclick="saveModalCantiere(${contractId},${idx})">Salva</button>
    </div>
  </div></div>`);
}

window.confirmDeleteCantiere=function(contractId,idx){
  const c=state.companies.find(x=>x.id===contractId);
  const ct=c?.cantieri?.[idx];
  if(!ct)return;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:420px">
    <h3>Conferma eliminazione cantiere</h3>
    <p style="font-size:14px;color:var(--text2);">Eliminare il cantiere <strong style="color:var(--text)">${esc(ct.nome)}</strong> dal contratto <strong style="color:var(--text)">${esc(c.name)}</strong>? Questa azione non è reversibile.</p>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn danger" onclick="doDeleteCantiere(${contractId},${idx})">Elimina</button>
    </div>
  </div></div>`);
}

window.doDeleteCantiere=function(contractId,idx){
  const c=state.companies.find(x=>x.id===contractId);
  if(!c||!Array.isArray(c.cantieri)||!c.cantieri[idx]){hideModal();return}
  const removed=c.cantieri.splice(idx,1)[0];
  saveData();hideModal();renderPage();showToast(`Cantiere "${removed?.nome||''}" eliminato`);
}

// Render helper: single contract card
function renderContractCard(c){
  try{
    const d=daysLeft(c.endDate);
    const monthsTo12 = monthsRemainingTo12(c);
    const badge=urgBadge(d)||{cls:'badge-gray',txt:'—'};
    const prog=Math.round(progressPct(c.startDate,c.endDate)||0);
    const pcls=progCls(d)||'gray';
    const urg=urgClass(d)||'';
    const progressLabel = d<0 ? 'Contratto scaduto' : d<=ALERT_DAYS ? 'Intervento prioritario' : 'Monitoraggio regolare';
    return `<div class="contract-card ${urg}" data-id="${escAttr(c.id)}">
      <div class="card-main">
        <div class="card-top">
          <div class="card-ident">
            <div class="card-kicker">Scheda contratto</div>
            <div class="card-company-name">${esc(c.name)}</div>
            <div class="card-employee">${esc(c.employeeName||'Dipendente non specificato')}</div>
            <div class="card-type">${esc(c.contractType||'')}</div>
          </div>
          <div class="card-badges">
              <div class="badge ${badge.cls}">${esc(badge.txt)}</div>
              <div class="renew-pill ${c.renewable ? 'yes' : 'no'}">${c.renewable ? 'Prorogabile' : 'Non prorogabile'}</div>
              ${c.indeterminate?`<div class="badge badge-gray">T.I.</div>`:''}
              ${c.cessato?`<div class="badge badge-gray">Cessato</div>`:''}
              ${c.inProgress?`<div class="badge badge-purple">In lavorazione</div>`:''}
              ${(c.workNotes && c.workNotes.length)?`<div class="badge badge-blue" title="Note di lavorazione: clicca per visualizzare" onclick="viewWorkNotes(${escAttr(c.id)})">${c.workNotes.length} note</div>`:''}
            </div>
        </div>
        <div class="prog-bar"><div class="prog-fill ${pcls}" style="width:${prog}%"></div></div>
        <div class="card-progress-meta"><div class="card-progress-label">${progressLabel}</div><div class="card-progress-value">${prog}% percorso</div></div>
        <div class="card-fields">
          <div><div class="field-label">Scadenza</div><div class="field-val ${d<0?'c-red':d<=ALERT_DAYS?'c-amber':'c-green'}">${formatDate(c.endDate)}</div></div>
          <div><div class="field-label">Giorni</div><div class="field-val">${d<0?'Scaduto':d+' gg'}</div></div>
          <div><div class="field-label">Inizio</div><div class="field-val">${formatDate(c.startDate)}</div></div>
          <div><div class="field-label">Tipo</div><div class="field-val">${esc(c.contractType||'')}</div></div>
          <div><div class="field-label">Proroghe</div><div class="field-val">${c.renewCount||0}/4</div></div>
        </div>
        ${c.notes?`<div class="card-notes"><span class="notes-label">Note</span>${esc(c.notes)}</div>`:''}
        <div class="card-footline"><div style="font-size:12px;color:var(--text3)">Mesi rimanenti a 12: <strong>${monthsTo12}</strong></div><div class="card-foot-pill">ID ${esc(c.id)}</div></div>
        ${Array.isArray(c.cantieri)&&c.cantieri.length?`<div class="cantieri-inline"><div class="cantieri-label">Cantieri</div>`+c.cantieri.map(rawCt=>{const ct=normalizeCantiere(rawCt);const endDate=getCantiereEndDate(ct);return `<div class="cantiere-row"><div class="cantiere-nome">${esc(ct.nome)}</div><div class="cantiere-scad ${daysLeft(endDate)<=0?'':'ok'}">${formatDate(endDate)}</div></div>`}).join('')+`</div>`:''}
      </div>
        <div class="card-actions">
        <button class="act-btn" onclick="openEditModal(${escAttr(c.id)})">Modifica</button>
        <button class="act-btn" onclick="openAddCantiere(${escAttr(c.id)})">+ Cantiere</button>
        ${c.renewable?`<button class="act-btn quick-renew" onclick="openQuickRenew(${escAttr(c.id)})">Proroga</button>`:''}
        <button class="act-btn" onclick="openWorkNoteModal(${escAttr(c.id)})">Nota</button>
        ${!c.indeterminate?`<button class="act-btn" onclick="markIndeterminate(${escAttr(c.id)})">Converti T.I.</button>`:'<button class="act-btn" disabled>Convertito</button>'}
        ${!c.cessato?`<button class="act-btn" onclick="markCessato(${escAttr(c.id)})">Segna cessato</button>`:'<button class="act-btn" disabled>Cessato</button>'}
        <button class="act-btn primary" onclick="openEmailModal(${escAttr(c.id)})">Email</button>
        <button class="act-btn danger" onclick="confirmDelete(${escAttr(c.id)})">Elimina</button>
      </div>
    </div>`;
  }catch(e){console.error('renderContractCard',e);return ''}
}

// Render company page (list of contracts for a company) with optional month filter
function renderCompanyContracts(name){
  const contracts=state.companies.filter(c=>c.name===name);
  if(!contracts.length){
    return `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>Nessun contratto per ${esc(name)}.<br><br><button class="tb-btn primary" onclick="openAddContractModal(${escJsArg(name)})">+ Aggiungi dipendente</button></div>`;
  }
  const first=contracts[0];
  // build month options from contracts (defensive: ensure endDate coerced to string)
  const months=[...new Set(contracts.map(c=>c.endDate?String(c.endDate).slice(0,7):'').filter(Boolean))];
  months.sort();
  const opts=`<option value="">Tutti</option>`+months.map(m=>{
    const d = new Date(m+'-01');
    const lbl = isNaN(d.getTime()) ? m : d.toLocaleString('it-IT',{month:'long',year:'numeric'});
    return `<option value="${escAttr(m)}"${state.filterMonth===m? ' selected' : ''}>${esc(lbl)}</option>`;
  }).join('');

  const filtered = state.filterMonth ? contracts.filter(c=>c.endDate && String(c.endDate).startsWith(state.filterMonth)) : contracts;
  filtered.sort((a,b)=>daysLeft(a.endDate)-daysLeft(b.endDate));
  const urgentContracts=contracts.filter(c=>{const d=daysLeft(c.endDate);return d>=0&&d<=30}).length;
  const expiringSoon=contracts.reduce((best,c)=>{
    const d=daysLeft(c.endDate);
    if(d<0)return best;
    if(best===null||d<best)return d;
    return best;
  },null);
  const cantieriCount=(first.cantieri||[]).length;

  let h=`<div class="company-hero">
    <div class="company-hero-main">
      <div class="company-avatar">${esc(first.name.substring(0,2).toUpperCase())}</div>
      <div class="company-info"><div class="company-name">${esc(first.name)}</div><div class="company-meta">${first.companyEmail?esc(first.companyEmail):''}${first.adminEmail?` • ${esc(first.adminEmail)}`:''}</div></div>
    </div>
    <div class="company-hero-actions"><button class="tb-btn primary" onclick="openAddContractModal(${escJsArg(first.name)})">+ Aggiungi dipendente</button><button class="tb-btn" onclick="exportExcelCompany(${escJsArg(first.name)})">Excel azienda</button><button class="tb-btn" onclick="exportPDFCompany(${escJsArg(first.name)})">PDF azienda</button><button class="tb-btn" onclick="openEditCompanyModal(${escJsArg(first.name)})">Modifica azienda</button></div>
    <div class="company-stats">
      <div class="company-stat"><div class="company-stat-label">Contratti</div><div class="company-stat-value">${contracts.length}</div><div class="company-stat-meta">totale registrati</div></div>
      <div class="company-stat"><div class="company-stat-label">Urgenti</div><div class="company-stat-value">${urgentContracts}</div><div class="company-stat-meta">entro 30 giorni</div></div>
      <div class="company-stat"><div class="company-stat-label">Cantieri</div><div class="company-stat-value">${cantieriCount}</div><div class="company-stat-meta">associati all'azienda</div></div>
      <div class="company-stat"><div class="company-stat-label">Prossima scadenza</div><div class="company-stat-value">${expiringSoon===null?'—':expiringSoon}</div><div class="company-stat-meta">${expiringSoon===null?'nessuna futura':'giorni residui'}</div></div>
    </div>
  </div>`;

  h+=`<div class="company-toolbar"><div class="company-toolbar-spacer"></div><div><label style="font-size:12px;color:var(--text3);margin-right:8px">Filtra mese</label><select id="company-filter-month" class="f-input" onchange="state.filterMonth=this.value;renderPage();">${opts}</select></div></div>`;

  h+=`<div id="company-contracts-list">${filtered.map(c=>renderContractCard(c)).join('')}</div>`;
  return h;
}

// Calendar rendering (basic month view with contract + cantiere events)
function changeCalendarMonth(offset){
  let m = (typeof state.calMonth==='number')?state.calMonth:new Date().getMonth();
  let y = (typeof state.calYear==='number')?state.calYear:new Date().getFullYear();
  m += offset;
  if(m<0){m=11;y-=1}else if(m>11){m=0;y+=1}
  state.calMonth=m;state.calYear=y;renderPage();
}

function renderCalendarPage(){
  const month = (typeof state.calMonth==='number')?state.calMonth:new Date().getMonth();
  const year = (typeof state.calYear==='number')?state.calYear:new Date().getFullYear();
  const first = new Date(year,month,1);
  // Monday-first (Italian convention): Sun=0 → position 6, Mon=1 → position 0, ...
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year,month+1,0).getDate();
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const now = new Date();
  const isCurrentMonth = year===now.getFullYear() && month===now.getMonth();

  // collect events by day — deduplicate cantieri to canonical company
  const eventsMap = {};
  const seenCantiereCompany={};
  state.companies.forEach(c=>{
    if(c.endDate && String(c.endDate).startsWith(`${year}-${String(month+1).padStart(2,'0')}`)){
      const d = parseInt(String(c.endDate).split('-')[2],10);
      (eventsMap[d] = eventsMap[d]||[]).push({type:'contract',contractId:c.id,title:`${c.employeeName||c.name}${c.employeeName?' ('+c.name+')':''}`,urg:daysLeft(c.endDate)});
    }
    if(Array.isArray(c.cantieri)&&!seenCantiereCompany[c.name]){
      seenCantiereCompany[c.name]=true;
      c.cantieri.forEach((ct,idx)=>{
        const endDate=getCantiereEndDate(ct);
        if(endDate && String(endDate).startsWith(`${year}-${String(month+1).padStart(2,'0')}`)){
          const d = parseInt(String(endDate).split('-')[2],10);
          (eventsMap[d] = eventsMap[d]||[]).push({type:'cantiere',contractId:c.id,idx:idx,title:`${ct.nome}`,urg:daysLeft(endDate),dateStr:`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
        }
      });
    }
  });

  const rawLabel = new Date(year,month,1).toLocaleString('it-IT',{month:'long',year:'numeric'});
  const monthLabel = rawLabel.charAt(0).toUpperCase()+rawLabel.slice(1);

  let html = `<div class="cal-nav">
    <button class="tb-btn" onclick="changeCalendarMonth(-1)" title="Mese precedente"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <div class="cal-month-label">${monthLabel}</div>
    <button class="tb-btn" onclick="changeCalendarMonth(1)" title="Mese successivo"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    ${!isCurrentMonth?`<button class="tb-btn" onclick="goToCalendarToday()" style="font-size:12px">Oggi</button>`:''}
  </div>`;

  html += `<div class="calendar-scroll"><div class="calendar-grid">`;
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(d=>{html+=`<div class="cal-header-cell">${d}</div>`});

  const MAX_EVENTS_PER_DAY = 3;
  for(let i=0;i<totalCells;i++){
    const day = i - lead + 1;
    if(day<1 || day>daysInMonth){
      html += `<div class="cal-day other-month"><div class="cal-day-num"></div></div>`;
    }else{
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dateObj = new Date(year,month,day);
      const isToday = now.toDateString()===dateObj.toDateString();
      const evs = eventsMap[day]||[];
      const cls = `cal-day${isToday?' today':''}`;
      html += `<div class="${cls}" onclick="handleCalDayClick(event,'${dateStr}')">`;
      html += `<div class="cal-day-num">${day}</div>`;
      const visible = evs.slice(0,MAX_EVENTS_PER_DAY);
      const moreCount = evs.length - MAX_EVENTS_PER_DAY;
      html += visible.map(ev=>{
        const evCls = ev.type==='cantiere' ? 'cantiere' : (ev.urg<=0?'urgent':ev.urg<=7?'urgent':ev.urg<=30?'warning':'ok');
        const onclick = `event.stopPropagation();onCalendarEventClick(${ev.contractId},${ev.type==='cantiere'?ev.idx:'null'},'${ev.type}')`;
        return `<div class="cal-event ${evCls}" title="${escAttr(ev.title)}" onclick="${onclick}">${esc(ev.title)}</div>`;
      }).join('');
      if(moreCount>0) html += `<div class="cal-event-more" onclick="event.stopPropagation();openDayEvents('${dateStr}')">+${moreCount} altri</div>`;
      html += `</div>`;
    }
  }
  html += `</div>`;
  html += `<div class="cal-legend">
    <div class="leg-item"><span class="leg-dot" style="background:var(--red)"></span>Scaduto</div>
    <div class="leg-item"><span class="leg-dot" style="background:var(--amber)"></span>In scadenza</div>
    <div class="leg-item"><span class="leg-dot" style="background:var(--green)"></span>Regolare</div>
    <div class="leg-item"><span class="leg-dot" style="background:var(--purple)"></span>Cantiere</div>
  </div></div>`;
  return html;
}

window.goToCalendarToday=function(){
  const n=new Date();state.calYear=n.getFullYear();state.calMonth=n.getMonth();renderPage();
}
window.handleCalDayClick=function(event,dateStr){
  if(event.target===event.currentTarget||event.target.classList.contains('cal-day-num')){
    openDayEvents(dateStr);
  }
}

// Calendar / notification helpers
window.onCalendarEventClick=function(contractId,idx,type){
  try{
    if(type==='contract'){
      const c=state.companies.find(x=>x.id===contractId);
      if(c)showModal(renderContractModal(c));
    }else if(type==='cantiere'){
      openEditCantiere(contractId,idx);
    }
  }catch(e){console.error('onCalendarEventClick',e)}
}

window.openContractFromNotif=function(id){closeNotifCenter();const c=state.companies.find(x=>x.id===id);if(c)showModal(renderContractModal(c))}
window.closeNotifCenter=function(){
  state.showNotifCenter=false;
  const nc=document.getElementById('notif-center');
  if(nc){nc.style.display='none';nc.innerHTML=''}
}
window.hideNotifAndOpen=function(contractId,idx,type){
  closeNotifCenter();
  if(type==='cantiere'){openEditCantiere(contractId,idx)}
  else{const c=state.companies.find(x=>x.id===contractId);if(c)showModal(renderContractModal(c))}
}
window.toggleNotifCenter=function(){
  state.showNotifCenter=!state.showNotifCenter;
  const nc=document.getElementById('notif-center');
  if(!nc)return;
  if(!state.showNotifCenter){closeNotifCenter();return}

  const { urgentContracts, urgentCantieri, total } = getUrgentNotifications();
  const nc_header=`<div class="notif-header"><div>Notifiche${total>0?`<span class="notif-count">${total}</span>`:''}</div><button class="notif-close-btn" onclick="closeNotifCenter()">×</button></div>`;

  if(!total){
    nc.innerHTML=nc_header+`<div class="notif-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.35;display:block;margin:0 auto 8px"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Nessuna notifica urgente</div>`;
    nc.style.display='flex';return;
  }

  const scadutiC=urgentContracts.filter(c=>daysLeft(c.endDate)<0);
  const urgC=urgentContracts.filter(c=>{const d=daysLeft(c.endDate);return d>=0&&d<=7});
  const inScadC=urgentContracts.filter(c=>{const d=daysLeft(c.endDate);return d>7});
  const scadutiCt=urgentCantieri.filter(ct=>daysLeft(ct.endDate)<0);
  const urgCt=urgentCantieri.filter(ct=>{const d=daysLeft(ct.endDate);return d>=0&&d<=7});
  const inScadCt=urgentCantieri.filter(ct=>{const d=daysLeft(ct.endDate);return d>7});

  function cItem(c){
    const d=daysLeft(c.endDate);
    const cls=d<0?'urgent':d<=7?'urgent':'warning';
    const badge=d<0?'Scaduto':d+' gg';
    return `<div class="notif-item" onclick="hideNotifAndOpen(${c.id},null,'contract')">
      <div class="notif-item-left"><div class="notif-dot ${cls}"></div></div>
      <div class="notif-item-body">
        <div class="notif-item-title">${esc(c.employeeName||c.name)}</div>
        <div class="notif-item-sub">${esc(c.name)} · ${formatDate(c.endDate)}</div>
      </div>
      <span class="notif-badge-pill ${cls}">${badge}</span>
    </div>`;
  }
  function ctItem(ct){
    const d=daysLeft(ct.endDate);
    const cls=d<0?'urgent':d<=7?'urgent':'warning';
    const badge=d<0?'Scaduto':d+' gg';
    return `<div class="notif-item" onclick="hideNotifAndOpen(${ct._contractId},${ct._idx},'cantiere')">
      <div class="notif-item-left"><div class="notif-dot cantiere"></div></div>
      <div class="notif-item-body">
        <div class="notif-item-title">${esc(ct.nome)}</div>
        <div class="notif-item-sub">${esc(ct._companyName)}${ct.committente?' · '+esc(ct.committente):''} · ${formatDate(ct.endDate)}</div>
      </div>
      <span class="notif-badge-pill ${cls}">${badge}</span>
    </div>`;
  }

  let body='';
  if(scadutiC.length||scadutiCt.length){
    body+=`<div class="notif-group-label">⚠ Scaduti</div>`;
    body+=scadutiC.map(cItem).join('');
    body+=scadutiCt.map(ctItem).join('');
  }
  if(urgC.length||urgCt.length){
    body+=`<div class="notif-group-label">Urgenti — entro 7 giorni</div>`;
    body+=urgC.map(cItem).join('');
    body+=urgCt.map(ctItem).join('');
  }
  if(inScadC.length||inScadCt.length){
    body+=`<div class="notif-group-label">In scadenza</div>`;
    body+=inScadC.map(cItem).join('');
    body+=inScadCt.map(ctItem).join('');
  }

  nc.innerHTML=nc_header+`<div class="notif-body">${body}</div>`;
  nc.style.display='flex';

  // close on outside click
  setTimeout(()=>{
    function outsideHandler(e){
      const nc2=document.getElementById('notif-center');
      const btn=document.getElementById('notif-btn');
      if(nc2&&!nc2.contains(e.target)&&btn&&!btn.contains(e.target)){
        closeNotifCenter();
        document.removeEventListener('click',outsideHandler,true);
      }
    }
    document.addEventListener('click',outsideHandler,true);
  },0);
}

window.openQuickRenew=function(id){

  const c=state.companies.find(x=>x.id===id);if(!c)return;const months=c.renewMonths||12;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Proroga rapida — ${esc(c.employeeName||c.name)}</h3>
    <div class="form-row"><div class="form-field"><label>Mesi da aggiungere</label><input id="qr-months" class="f-input" type="number" min="1" value="${months}" oninput="updateQuickRenewCausale(${id})"></div></div>
    <div id="qr-causale" style="margin-bottom:10px"></div>
    <div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" id="qr-apply" onclick="doQuickRenew(${id})">Applica proroga</button></div></div></div>`);
  // initialize causale info after modal is inserted
  setTimeout(()=>updateQuickRenewCausale(id),20);
}

window.doQuickRenew=function(id){
  try{
    const m=parseInt((document.getElementById('qr-months')||{}).value)||0;const idx=state.companies.findIndex(c=>c.id===id);if(idx<0)return;const c=state.companies[idx];
    if(m<=0){showToast('Inserire mesi validi');return}
    if(!c.endDate||!c.startDate){showToast('Contratto senza data di scadenza o inizio');return}
    const d=new Date(c.endDate);d.setMonth(d.getMonth()+m);const newEndStr=d.toISOString().split('T')[0];
    const newDur=durationMonths(c.startDate,newEndStr);const newRenew=(c.renewCount||0)+1;
    const r=verificaCausale(newDur,newRenew,c.renewType==='Con causale');
    if(r.stato==='ERRORE'){showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Impossibile applicare proroga</h3><div style="margin-bottom:12px">${esc(r.msg)}</div><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Chiudi</button></div></div></div>`);return}
    if(r.stato==='ATTENZIONE'){
      showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Attenzione nella proroga</h3><div style="margin-bottom:12px">${esc(r.msg)}</div><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="doQuickRenewConfirm(${id},${m})">Procedi comunque</button></div></div></div>`);
      return;
    }
    // OK — apply
    state.companies[idx].endDate=newEndStr;state.companies[idx].renewCount=(state.companies[idx].renewCount||0)+1;saveData();hideModal();renderPage();renderSidebarCompanies();showToast('Proroga applicata');
  }catch(e){console.error('doQuickRenew',e);showToast('Errore durante la proroga')}
}

// Main page renderer
function renderPage(){
  const el=document.getElementById('page-content');
  if(!el) return;
  try{
    let html='';
    switch(state.page){
      case 'dashboard':
        // Dashboard metrics (quick counts)
        const expiredCnt = state.companies.filter(c=>daysLeft(c.endDate)<0).length;
        const urgentCnt = state.companies.filter(c=>{const d=daysLeft(c.endDate);return d>=0&&d<=30}).length;
        const renewableCnt = state.companies.filter(c=>c.renewable).length;
        const avgDur = state.companies.length?Math.round(state.companies.reduce((s,c)=>s+durationMonths(c.startDate,c.endDate),0)/state.companies.length):0;
        const companyCount = [...new Set(state.companies.map(c=>c.name).filter(Boolean))].length;
        const nextDeadline = state.companies.reduce((best,c)=>{
          const d=daysLeft(c.endDate);
          if(d<0)return best;
          if(best===null||d<best)return d;
          return best;
        },null);
        html+=`<div class="dashboard-hero">
    <div class="dashboard-hero-copy">
      <div class="dashboard-kicker">Controllo operativo</div>
      <div class="dashboard-title">Tutte le scadenze sotto controllo</div>
      <div class="dashboard-subtitle">Vista unificata di contratti, rinnovi e priorità per gestire rapidamente le prossime azioni.</div>
    </div>
    <div><button class="tb-btn primary" onclick="openAddModal()">+ Nuovo contratto</button></div>
  </div>`;
        html+=`<div class="metrics-grid" style="margin-bottom:20px">
    <div class="metric-card"><div class="metric-label">Durata media</div><div class="metric-val">${avgDur}<span style="font-size:16px;font-weight:400"> mesi</span></div></div>
    <div class="metric-card"><div class="metric-label">Prorogabili</div><div class="metric-val c-blue">${renewableCnt}</div><div class="metric-delta">su ${state.companies.length} totali</div></div>
    <div class="metric-card m-amber"><div class="metric-label">In scadenza 30gg</div><div class="metric-val c-amber">${urgentCnt}</div></div>
    <div class="metric-card m-red"><div class="metric-label">Scaduti</div><div class="metric-val c-red">${expiredCnt}</div></div>
  </div>`;
        html+=`<div class="dashboard-summary">
    <div class="summary-chip"><div class="summary-chip-label">Aziende</div><div class="summary-chip-value">${companyCount}</div><div class="summary-chip-meta">anagrafiche gestite</div></div>
    <div class="summary-chip"><div class="summary-chip-label">Contratti</div><div class="summary-chip-value">${state.companies.length}</div><div class="summary-chip-meta">in monitoraggio</div></div>
    <div class="summary-chip"><div class="summary-chip-label">Prossima scadenza</div><div class="summary-chip-value">${nextDeadline===null?'—':nextDeadline}</div><div class="summary-chip-meta">${nextDeadline===null?'nessuna futura':'giorni residui'}</div></div>
  </div>`;

        html+=`<div class="section-head"><div><div class="section-title">Contratti (${state.companies.length})</div><div class="section-sub">Elenco ordinato per urgenza con accesso rapido alle azioni operative.</div></div></div>`;
        // apply search filter
        const q=(state.searchQuery||'').toLowerCase();
        const list=state.companies.filter(c=>!q||(`${c.name} ${c.employeeName} ${c.contractType}`).toLowerCase().includes(q));
        list.sort((a,b)=>daysLeft(a.endDate)-daysLeft(b.endDate));
        html+=`<div id="contracts-list">${list.map(c=>renderContractCard(c)).join('')}</div>`;
        break;
      case 'company':
        html=renderCompanyContracts(state.activeCompany||'');
        break;
      case 'cantieri':
        html=renderCantieriPage();
        break;
      case 'indeterminati':
        html=renderIndeterminatiPage();
        break;
      case 'cessati':
        html=renderCessatiPage();
        break;
      case 'analytics':
        html=renderAnalyticsPage();
        break;
      case 'settings':
        html=renderSettingsPage();
        break;
      case 'calendar':
        html=`<div class="section-head"><div class="section-title">Calendario</div></div>`;
        html+=renderCalendarPage();
        break;
      default:
        html='';
    }
    el.innerHTML=html;
    if(state.page==='analytics') setTimeout(initCharts,50);
  }catch(e){console.error('renderPage error',e);el.innerHTML='<div class="empty-state">Errore durante il rendering</div>'}
}

function renderContractModal(c,base){
  const isEdit=!!c;
  const v=c||base||{};
  const dm=c?durationMonths(c.startDate,c.endDate):0;

  let causaleInit='';
  if(c&&c.startDate&&c.endDate){
    const r=verificaCausale(dm,c.renewCount||0,c.renewType==='Con causale');
    if(r.stato!=='OK'){
      const cls=r.stato==='ERRORE'?'err':'warn';
      causaleInit=`<div class="causale-inline ${cls}" id="causale-live">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div><span class="causale-title">${r.stato}: </span>${esc(r.msg)}</div>
      </div>`;
    }else causaleInit=`<div id="causale-live"></div>`;
  }else causaleInit=`<div id="causale-live"></div>`;

  const title=isEdit?`Modifica contratto — ${esc(c.name)}`:(base?.name?`Nuovo dipendente — ${esc(base.name)}`:'Nuovo contratto');

  return`<div class="modal-bg" onclick="hideModal()"><div class="modal modal-wide" onclick="event.stopPropagation()">
    <h3>${title}</h3>
    ${!isEdit&&!base?`<div class="form-row">
      <div class="form-field"><label>Nome azienda *</label><input class="f-input" id="f-name" type="text" value="${escAttr(v.name||'')}" placeholder="Acme S.r.l." style="width:100%"></div>
      <div class="form-field"><label>Tipo contratto</label><input class="f-input" id="f-type" type="text" value="${escAttr(v.contractType||'')}" placeholder="Fornitura servizi" style="width:100%"></div>
    </div>`:`<input id="f-name" type="hidden" value="${escAttr(v.name||'')}">
    ${isEdit?`<div class="form-row single"><div class="form-field"><label>Tipo contratto</label><input class="f-input" id="f-type" type="text" value="${escAttr(v.contractType||'')}" placeholder="Fornitura servizi" style="width:100%"></div></div>`:''}`}
    <div class="form-row">
      <div class="form-field"><label>Nome dipendente</label><input class="f-input" id="f-emp" type="text" value="${escAttr(v.employeeName||'')}" placeholder="Mario Rossi" style="width:100%"></div>
      ${(!isEdit&&base)?`<div class="form-field"><label>Tipo contratto</label><input class="f-input" id="f-type" type="text" value="${escAttr(v.contractType||'')}" placeholder="Fornitura servizi" style="width:100%"></div>`:''}
    </div>
    <div class="form-row">
      <div class="form-field"><label>Data inizio</label><input class="f-input" id="f-start" type="date" value="${v.startDate||''}" style="width:100%"></div>
      <div class="form-field"><label>Data scadenza *</label><input class="f-input" id="f-end" type="date" value="${v.endDate||''}" style="width:100%"></div>
    </div>
    ${!base?`<div class="form-row">
      <div class="form-field"><label>Email amministratore</label><input class="f-input" id="f-admin" type="email" value="${escAttr(v.adminEmail||'')}" placeholder="admin@esempio.it" style="width:100%"></div>
      <div class="form-field"><label>Email azienda</label><input class="f-input" id="f-company" type="email" value="${escAttr(v.companyEmail||'')}" placeholder="contratti@azienda.it" style="width:100%"></div>
    </div>`:`<input id="f-admin" type="hidden" value="${escAttr(v.adminEmail||'')}"><input id="f-company" type="hidden" value="${escAttr(v.companyEmail||'')}">`}
    <div class="form-row triple">
      <div class="form-field"><label>Prorogabile</label><select class="f-input" id="f-renew" style="width:100%"><option value="yes"${v.renewable!==false?' selected':''}>Sì</option><option value="no"${v.renewable===false?' selected':''}>No</option></select></div>
      <div class="form-field"><label>Durata proroga (mesi)</label><input class="f-input" id="f-months" type="number" min="1" value="${v.renewMonths||dm||12}" style="width:100%"></div>
      <div class="form-field"><label>Tipo proroga</label><select class="f-input" id="f-rtype" style="width:100%"><option${v.renewType==='Con causale'?' selected':''}>Con causale</option><option${v.renewType==='Senza causale'?' selected':''}>Senza causale</option><option${v.renewType==='Automatica'?' selected':''}>Automatica</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Preavviso (giorni)</label><input class="f-input" id="f-notice" type="number" min="0" value="${v.renewNotice||30}" style="width:100%"></div>
      <div class="form-field"><label>Proroghe effettuate</label><input class="f-input" id="f-rcount" type="number" min="0" value="${v.renewCount||0}" style="width:100%"></div>
    </div>
    ${causaleInit}
    <div class="form-row single"><div class="form-field"><label>Note</label><textarea class="f-input" id="f-notes" style="width:100%">${esc(v.notes||'')}</textarea></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn primary" onclick="saveContract(${isEdit?c.id:'null'})">${isEdit?'Salva modifiche':'Aggiungi'}</button>
    </div>
  </div></div>`;
}

function attachModalListeners(){
  ['f-start','f-end','f-rtype','f-rcount'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener('input',updateCausaleLive);
  });
  window.doQuickRenewConfirm=function(id,m){
    try{
      const idx=state.companies.findIndex(c=>c.id===id);if(idx<0)return;const c=state.companies[idx];if(!c.endDate){showToast('Contratto senza data di scadenza');hideModal();return}
      const d=new Date(c.endDate);d.setMonth(d.getMonth()+m);const newEndStr=d.toISOString().split('T')[0];
      state.companies[idx].endDate=newEndStr;state.companies[idx].renewCount=(state.companies[idx].renewCount||0)+1;saveData();hideModal();renderPage();renderSidebarCompanies();showToast('Proroga applicata (procedi comunque)');
    }catch(e){console.error('doQuickRenewConfirm',e);showToast('Errore')}
  }
  // Aggiorna messaggio causale quando si modificano campi nel modal
  function updateCausaleLive(){
    const s = (document.getElementById('f-start')||{}).value;
    const e = (document.getElementById('f-end')||{}).value;
    const rt = (document.getElementById('f-rtype')||{}).value || '';
    const rc = parseInt((document.getElementById('f-rcount')||{}).value) || 0;
    const fb = document.getElementById('causale-live');
    if(!fb) return;
    if(!s||!e){fb.innerHTML='';return}
    const dm = durationMonths(s,e);
    const r = verificaCausale(dm,rc,rt==='Con causale');
    if(r.stato==='OK'){fb.innerHTML='';return}
    const cls = r.stato==='ERRORE' ? 'err' : 'warn';
    const icon = r.stato==='ERRORE'
      ? '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    fb.innerHTML = `<div class="causale-inline ${cls}">${icon}<div><span class="causale-title">${r.stato}: </span>${esc(r.msg)}</div></div>`;
  }

  // Funzione di utilità per la modal di Quick Renew
  window.updateQuickRenewCausale = function(id){
    try{
      const el = document.getElementById('qr-months'); if(!el) return;
      const m = parseInt(el.value)||0;
      const idx = state.companies.findIndex(c=>c.id===id); if(idx<0) return;
      const c = state.companies[idx]; if(!c.startDate||!c.endDate){document.getElementById('qr-causale').innerHTML='';return}
      const d = new Date(c.endDate); d.setMonth(d.getMonth()+m); const newEnd = d.toISOString().split('T')[0];
      const newDur = durationMonths(c.startDate,newEnd);
      const newRenew = (c.renewCount||0)+1;
      const r = verificaCausale(newDur,newRenew,c.renewType==='Con causale');
      const elC = document.getElementById('qr-causale'); if(!elC) return;
      if(r.stato==='OK'){elC.innerHTML='';document.getElementById('qr-apply').disabled=false;return}
      const cls = r.stato==='ERRORE' ? 'err' : 'warn';
      const icon = r.stato==='ERRORE'
        ? '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      elC.innerHTML = `<div class="causale-inline ${cls}">${icon}<div><span class="causale-title">${r.stato}: </span>${esc(r.msg)}</div></div>`;
      document.getElementById('qr-apply').disabled = (r.stato==='ERRORE');
    }catch(e){console.error('updateQuickRenewCausale',e)}
  }
  // inizializza stato causale
  updateCausaleLive();
}

window.saveContract=function(editId){
  const name=(document.getElementById('f-name')||{}).value?.trim();
  const emp=(document.getElementById('f-emp')||{}).value?.trim();
  const type=(document.getElementById('f-type')||{}).value?.trim()||'Non specificato';
  const start=(document.getElementById('f-start')||{}).value;
  const end=(document.getElementById('f-end')||{}).value;
  const admin=(document.getElementById('f-admin')||{}).value?.trim();
  const company=(document.getElementById('f-company')||{}).value?.trim();
  const renewable=(document.getElementById('f-renew')||{}).value==='yes';
  const months=parseInt((document.getElementById('f-months')||{}).value)||12;
  const rtype=(document.getElementById('f-rtype')||{}).value||'Senza causale';
  const notice=parseInt((document.getElementById('f-notice')||{}).value)||30;
  const rcount=parseInt((document.getElementById('f-rcount')||{}).value)||0;
  const notes=(document.getElementById('f-notes')||{}).value?.trim();

  if(!name||!end){showToast('Inserire nome azienda e data scadenza');return}

  if(start&&end){
    const dm=durationMonths(start,end);
    const r=verificaCausale(dm,rcount,rtype==='Con causale');
    if(r.stato==='ERRORE'){showToast('⚠ '+r.msg);return}
    if(r.stato==='ATTENZIONE')showToast('⚠ Attenzione: '+r.msg);
  }

  if(editId!==null&&editId!==undefined){
    const idx=state.companies.findIndex(c=>c.id===editId);
    if(idx>=0){
      state.companies[idx]={...state.companies[idx],name,employeeName:emp,contractType:type,startDate:start,endDate:end,adminEmail:admin,companyEmail:company,renewable,renewMonths:months,renewType:rtype,renewNotice:notice,renewCount:rcount,notes};
    }
    showToast('Contratto aggiornato');
  }else{
    const newId=Math.max(0,...state.companies.map(c=>c.id||0))+1;
    state.companies.push({id:newId,name,employeeName:emp,contractType:type,startDate:start,endDate:end,adminEmail:admin,companyEmail:company,renewable,renewMonths:months,renewType:rtype,renewNotice:notice,renewCount:rcount,notes,cantieri:[]});
    showToast('Contratto aggiunto');
  }
  hideModal();saveData();renderPage();renderSidebarCompanies();
}

// Delete
window.confirmDelete=function(id){
  const c=state.companies.find(x=>x.id===id);
  if(!c)return;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:400px">
    <h3>Conferma eliminazione</h3>
    <p style="font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:4px">Eliminare il contratto di <strong style="color:var(--text)">${esc(c.employeeName||c.name)}</strong> con <strong style="color:var(--text)">${esc(c.name)}</strong>?<br>Questa azione non è reversibile.</p>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn danger" onclick="doDelete(${id})">Elimina</button>
    </div>
  </div></div>`);
}
window.doDelete=function(id){
  const c=state.companies.find(x=>x.id===id);
  state.companies=state.companies.filter(x=>x.id!==id);
  hideModal();saveData();
  if(state.page==='company'&&!state.companies.some(x=>x.name===state.activeCompany))setPage('dashboard');
  else renderPage();
  renderSidebarCompanies();
  showToast(`Contratto "${c?.employeeName||c?.name||''}" eliminato`);
}

