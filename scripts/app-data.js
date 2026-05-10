// ═══════════════════════════════════════
// EMAIL MODAL
// ═══════════════════════════════════════
let emailDraft=null;
let emailTabMode='preview';

window.openEmailModal=function(id){
  const c=state.companies.find(x=>x.id===id);
  if(!c)return;
  const days=daysLeft(c.endDate);
  emailDraft={contractId:id,to:`${c.adminEmail}; ${c.companyEmail}`,subject:`[ALERT] Contratto in scadenza — ${c.name} (${days}gg)`,body:generateEmailBody(c,days)};
  emailTabMode='preview';
  showModal(renderEmailModal(c));
}
function generateEmailBody(c,days){
  let b=`Gentile amministratore,\n\nquesto è un avviso: il contratto con ${c.name}${c.employeeName?' — dipendente: '+c.employeeName:''} (${c.contractType}) scadrà il ${formatDate(c.endDate)}, tra ${days} giorni.\n\n`;
  if(c.renewable)b+=`Il contratto è prorogabile per ${c.renewMonths} mesi — modalità: ${c.renewType}. Preavviso richiesto: ${c.renewNotice} giorni.\nProroghe effettuate: ${c.renewCount||0}/4.\n\n`;
  else b+=`Il contratto non è prorogabile.\n\n`;
  if(c.notes)b+=`Note: ${c.notes}\n\n`;
  b+=`Si prega di procedere con le formalità necessarie.\n\n— Sistema gestione contratti`;
  return b;
}
function renderEmailModal(c){
  const mode=emailTabMode;const d=emailDraft;
  const content=mode==='preview'
    ?`<div class="email-preview-box"><div class="email-preview-header">A: ${esc(d.to)}<br>Oggetto: ${esc(d.subject)}</div><div class="email-preview-body">${esc(d.body).replace(/\n/g,'<br>')}</div></div>`
    :`<div class="email-edit-field"><label>Destinatari</label><input type="text" value="${escAttr(d.to)}" oninput="emailDraft.to=this.value"></div>
     <div class="email-edit-field"><label>Oggetto</label><input type="text" value="${escAttr(d.subject)}" oninput="emailDraft.subject=this.value"></div>
     <div class="email-edit-field"><label>Corpo</label><textarea oninput="emailDraft.body=this.value">${esc(d.body)}</textarea></div>`;
  const canSend=emailSettings.sendMethod==='mailto'||(emailSettings.sendMethod==='emailjs'&&isEmailJSConfigured());
  return`<div class="modal-bg" onclick="hideModal()"><div class="modal modal-wide" onclick="event.stopPropagation()">
    <h3>Email notifica${c.employeeName?' — '+esc(c.employeeName):''}</h3>
    <div class="email-tab-row">
      <button class="email-tab${mode==='preview'?' active':''}" onclick="setEmailTab('preview')">Anteprima</button>
      <button class="email-tab${mode==='edit'?' active':''}" onclick="setEmailTab('edit')">Modifica</button>
    </div>
    ${content}
    <div class="modal-actions">
      <button class="m-btn" onclick="resetEmailDraft(${c.id})">Ripristina</button>
      <button class="m-btn" onclick="hideModal()">Chiudi</button>
      ${canSend?`<button class="m-btn primary" onclick="realSend(${c.id})">${emailSettings.sendMethod==='mailto'?'Apri in client email':'Invia email'}</button>`:''}
    </div>
  </div></div>`;
}
window.setEmailTab=function(t){emailTabMode=t;const c=state.companies.find(x=>x.id===emailDraft?.contractId);if(c)showModal(renderEmailModal(c))}
window.resetEmailDraft=function(id){const c=state.companies.find(x=>x.id===id);if(c){emailDraft={contractId:id,to:`${c.adminEmail}; ${c.companyEmail}`,subject:`[ALERT] Contratto in scadenza — ${c.name} (${daysLeft(c.endDate)}gg)`,body:generateEmailBody(c,daysLeft(c.endDate))};showModal(renderEmailModal(c))}}
window.realSend=async function(id){
  const c=state.companies.find(x=>x.id===id);if(!c||!emailDraft)return;
  const r=await sendEmailReal(emailDraft.to,emailDraft.subject,emailDraft.body,c.name);
  hideModal();emailDraft=null;
  showToast(r.ok?(r.method==='mailto'?'Email aperta nel client':'Email inviata!'):'Errore: '+r.error);
}

// ═══════════════════════════════════════
// EMAIL ENGINE
// ═══════════════════════════════════════
function isEmailJSConfigured(){const s=emailSettings.emailjs;return!!(s.serviceId&&s.templateId&&s.publicKey)}

function addLog(contractName,recipients,status,method,detail){
  emailLog.unshift({date:new Date().toISOString(),contractName,recipients,status,method,detail:detail||''});
  if(emailLog.length>100)emailLog.length=100;
  save(SK.log,emailLog);
}

async function sendEmailReal(to,subject,body,name){
  if(emailSettings.sendMethod==='emailjs'&&isEmailJSConfigured()){
    try{
      const s=emailSettings.emailjs;emailjs.init(s.publicKey);
      await emailjs.send(s.serviceId,s.templateId,{to_email:to,subject,message:body,contract_name:name});
      addLog(name,to,'success','emailjs','Inviata via EmailJS');return{ok:true,method:'emailjs'};
    }catch(err){const msg=(err&&err.text)||String(err);addLog(name,to,'error','emailjs',msg);return{ok:false,method:'emailjs',error:msg}}
  }
  const a=document.createElement('a');
  a.href=`mailto:${to.replace(/;/g,',').replace(/\s/g,'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  a.click();addLog(name,to,'success','mailto','Aperto client email');return{ok:true,method:'mailto'};
}

function startAutoSend(){stopAutoSend();if(!emailSettings.autoSend.enabled)return;runAutoCheck();autoSendInterval=setInterval(runAutoCheck,(emailSettings.autoSend.checkIntervalMinutes||60)*60000)}
function stopAutoSend(){if(autoSendInterval){clearInterval(autoSendInterval);autoSendInterval=null}}
async function runAutoCheck(){
  if(!emailSettings.autoSend.enabled)return;
  for(const c of state.companies){
    const d=daysLeft(c.endDate);if(d<0)continue;
    for(const t of(emailSettings.autoSend.daysBeforeExpiry||[])){
      if(d<=t){
        const key=`${c.id}_${t}_${new Date().toISOString().split('T')[0]}`;
        if(sentTracker[key])continue;
        const r=await sendEmailReal(`${c.adminEmail}; ${c.companyEmail}`,`[AUTO] ${c.name} scade tra ${d}gg`,generateEmailBody(c,d),c.name);
        if(r.ok){sentTracker[key]=new Date().toISOString();save(SK.sent,sentTracker)}
        break;
      }
    }
  }
}

// settings handlers (defined below once)

// ═══════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════
function getHeaders(){return['Nome Azienda','Dipendente','Tipo Contratto','Data Inizio','Data Scadenza','Giorni Rim.','Stato','Prorogabile','Durata Proroga (mesi)','Tipo Proroga','Preavviso (gg)','Proroghe fatte','Email Admin','Email Azienda','Note']}
function getRows(companies){
  return(companies||state.companies).map(c=>{const d=daysLeft(c.endDate);const s=d<0?'Scaduto':d<=ALERT_DAYS?'Urgente':d<=30?'In scadenza':'Regolare';return[c.name,c.employeeName||'',c.contractType,formatDate(c.startDate),formatDate(c.endDate),d,s,c.renewable?'Sì':'No',c.renewMonths||'',c.renewType||'',c.renewNotice||'',c.renewCount||0,c.adminEmail||'',c.companyEmail||'',c.notes||'']});
}
window.exportCSV=()=>{const h=getHeaders();const r=getRows();const csv=[h,...r].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const b=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`evolution_system_gestione_scadenze_${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(u);showToast('CSV esportato')}
window.exportExcel=()=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([getHeaders(),...getRows()]);ws['!cols']=[22,20,22,12,12,8,12,10,10,14,10,8,24,24,40].map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,'Contratti');XLSX.writeFile(wb,`evolution_system_gestione_scadenze_${new Date().toISOString().split('T')[0]}.xlsx`);showToast('Excel esportato')}
window.exportExcelCompany=name=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([getHeaders(),...getRows(state.companies.filter(c=>c.name===name))]);XLSX.utils.book_append_sheet(wb,ws,name.substring(0,30));XLSX.writeFile(wb,`evolution_system_gestione_scadenze_${name.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);showToast('Excel azienda esportato')}
window.exportPDFCompany=name=>{
  const list=state.companies.filter(c=>c.name===name);
  if(!list.length){showToast('Nessun contratto per questa azienda');return}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const safeName=String(name||'azienda').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_-]/g,'');
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text(`Evolution System - ${name}`,14,14);
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100);doc.text(`Esportato il ${new Date().toLocaleDateString('it-IT')} - ${list.length} contratti`,14,20);doc.setTextColor(0);
  doc.autoTable({
    head:[['Azienda','Dipendente','Tipo Contratto','Inizio','Scadenza','Gg','Stato','Pror.']],
    body:list.map(c=>{const d=daysLeft(c.endDate);return[c.name,c.employeeName||'—',c.contractType||'',formatDate(c.startDate),formatDate(c.endDate),String(d),d<0?'Scaduto':d<=ALERT_DAYS?'Urgente':d<=30?'In scadenza':'OK',c.renewable?'Sì':'No']}),
    startY:25,theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[42,91,215],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[245,244,240]}
  });
  doc.save(`evolution_system_gestione_scadenze_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);showToast('PDF azienda esportato');
}
window.exportPDF=()=>{
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text('Evolution System - Gestione Scadenze Contratti',14,14);
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100);doc.text(`Esportato il ${new Date().toLocaleDateString('it-IT')} — ${state.companies.length} contratti`,14,20);doc.setTextColor(0);
  doc.autoTable({head:[['Azienda','Dipendente','Tipo Contratto','Inizio','Scadenza','Gg','Stato','Pror.']],body:state.companies.map(c=>{const d=daysLeft(c.endDate);return[c.name,c.employeeName||'—',c.contractType,formatDate(c.startDate),formatDate(c.endDate),String(d),d<0?'Scaduto':d<=ALERT_DAYS?'Urgente':d<=30?'In scadenza':'OK',c.renewable?'Sì':'No',c.renewMonths||'',c.renewType||'',c.renewNotice||'',c.renewCount||0,c.adminEmail||'',c.companyEmail||'',c.notes||'']}).slice(0,100),startY:25,theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[42,91,215],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[245,244,240]}});
  doc.save(`evolution_system_gestione_scadenze_${new Date().toISOString().split('T')[0]}.pdf`);showToast('PDF esportato');
}
window.triggerImportExcel=()=>{
  const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls,.csv';
  inp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array',cellDates:true});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
        importRows(rows);
      }catch(err){showToast('Errore lettura: '+err.message)}
    };r.readAsArrayBuffer(f);inp.remove();
  };document.body.appendChild(inp);inp.click();
}

let pendingBackupImport=null;
window.exportBackupJSON=()=>{
  try{
    const payload={
      format:'evolution-backup',
      version:1,
      exportedAt:new Date().toISOString(),
      data:{
        companies:state.companies,
        emailSettings,
        emailLog,
        sentTracker,
        syncConfig,
        theme:state.theme
      }
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`evolution_system_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON esportato');
  }catch(e){showToast('Errore export backup: '+(e.message||e))}
}

function normalizeBackupPayload(raw){
  const base=(raw&&typeof raw==='object'&&raw.data&&typeof raw.data==='object')?raw.data:raw;
  return {
    companies:Array.isArray(base?.companies)?base.companies:[],
    emailSettings:(base?.emailSettings&&typeof base.emailSettings==='object')?base.emailSettings:null,
    emailLog:Array.isArray(base?.emailLog)?base.emailLog:[],
    sentTracker:(base?.sentTracker&&typeof base.sentTracker==='object')?base.sentTracker:{},
    syncConfig:(base?.syncConfig&&typeof base.syncConfig==='object')?base.syncConfig:null,
    theme:typeof base?.theme==='string'?base.theme:null
  };
}

window.triggerImportBackupJSON=()=>{
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='.json,application/json';
  inp.onchange=e=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const parsed=JSON.parse(String(ev.target.result||'{}'));
        const normalized=normalizeBackupPayload(parsed);
        if(!Array.isArray(normalized.companies)){
          showToast('Backup non valido: manca companies');
          return;
        }
        const incomingCount=normalized.companies.length;
        if(!incomingCount){
          showToast('Backup vuoto: nessun contratto da importare');
          return;
        }
        pendingBackupImport=normalized;
        showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
          <h3>Importa backup JSON</h3>
          <p style="font-size:14px;color:var(--text2);line-height:1.55">Hai selezionato un backup con <strong style="color:var(--text)">${incomingCount}</strong> contratti.</p>
          <p style="font-size:14px;color:var(--text2);line-height:1.55">L'importazione avverrà in modalità <strong style="color:var(--text)">Unisci</strong>: i dati locali non vengono cancellati.</p>
          <div class="modal-actions">
            <button class="m-btn" onclick="hideModal()">Annulla</button>
            <button class="m-btn primary" onclick="applyImportedBackupJSON()">Importa e unisci</button>
          </div>
        </div></div>`);
      }catch(err){showToast('Backup JSON non valido: '+(err.message||err))}
    };
    r.readAsText(f);
    inp.remove();
  };
  document.body.appendChild(inp);
  inp.click();
}

window.applyImportedBackupJSON=()=>{
  if(!pendingBackupImport){showToast('Nessun backup selezionato');return}
  try{
    const prevCount=state.companies.length;
    const mergedCompanies=mergeCompanies(pendingBackupImport.companies||[],state.companies||[]);
    state.companies=mergedCompanies;

    if(pendingBackupImport.emailSettings){
      emailSettings={
        ...emailSettings,
        ...pendingBackupImport.emailSettings,
        emailjs:{...(emailSettings.emailjs||{}),...((pendingBackupImport.emailSettings||{}).emailjs||{})},
        autoSend:{...(emailSettings.autoSend||{}),...((pendingBackupImport.emailSettings||{}).autoSend||{})}
      };
      save(SK.settings,emailSettings);
    }
    if(pendingBackupImport.syncConfig){
      syncConfig={...syncConfig,...pendingBackupImport.syncConfig};
      save(SK.sync,syncConfig);
      saveUserConfig();
    }
    if(pendingBackupImport.theme && (pendingBackupImport.theme==='light' || pendingBackupImport.theme==='dark')){
      state.theme=pendingBackupImport.theme;
      applyTheme(state.theme);
    }

    const mergedLog=[...(pendingBackupImport.emailLog||[]),...(emailLog||[])];
    const seenLog=new Set();
    emailLog=mergedLog.filter(it=>{
      const key=`${it?.date||''}|${it?.contractName||''}|${it?.detail||''}`;
      if(seenLog.has(key))return false;
      seenLog.add(key);
      return true;
    }).slice(0,100);
    save(SK.log,emailLog);

    sentTracker={...(pendingBackupImport.sentTracker||{}),...(sentTracker||{})};
    save(SK.sent,sentTracker);

    normalizeCompanyCantieri();
    saveData();
    renderSidebarCompanies();
    renderPage();
    hideModal();
    const added=Math.max(0,state.companies.length-prevCount);
    showToast(`Backup importato: ${added} contratti aggiunti (${state.companies.length} totali)`);
  }catch(e){showToast('Errore import backup: '+(e.message||e))}
  finally{pendingBackupImport=null}
}

function importRows(rows){
  if(!rows.length){showToast('File vuoto');return}
  const map={nome:'name',azienda:'name','nome azienda':'name',dipendente:'employeeName','tipo contratto':'contractType','tipo':'contractType','data inizio':'startDate',inizio:'startDate','data scadenza':'endDate',scadenza:'endDate',prorogabile:'renewable','durata proroga':'renewMonths','durata proroga (mesi)':'renewMonths','tipo proroga':'renewType',preavviso:'renewNotice','preavviso (gg)':'renewNotice','proroghe effettuate':'renewCount','email admin':'adminEmail','email azienda':'companyEmail',note:'notes'};
  const headers=Object.keys(rows[0]);const mapping={};
  headers.forEach(h=>{const k=map[h.toLowerCase().trim()];if(k)mapping[h]=k});
  if(!Object.keys(mapping).length){showToast('Intestazioni non riconosciute');return}
  let maxId=state.companies.reduce((m,c)=>Math.max(m,c.id||0),0);let count=0;
  rows.forEach(row=>{
    const v={};Object.keys(mapping).forEach(h=>{v[mapping[h]]=row[h]});
    v.startDate=parseDate(v.startDate);v.endDate=parseDate(v.endDate);
    if(!v.name||!v.endDate)return;
    maxId++;state.companies.push({id:maxId,name:String(v.name).trim(),employeeName:String(v.employeeName||'').trim(),contractType:String(v.contractType||'Non specificato').trim(),startDate:v.startDate||'',endDate:v.endDate,renewable:parseBool(v.renewable),renewMonths:parseInt(v.renewMonths)||12,renewType:String(v.renewType||'Senza causale').trim(),renewNotice:parseInt(v.renewNotice)||30,renewCount:parseInt(v.renewCount)||0,adminEmail:String(v.adminEmail||'').trim(),companyEmail:String(v.companyEmail||'').trim(),notes:String(v.notes||'').trim(),cantieri:[]});count++;
  });
  if(count){saveData();renderPage();renderSidebarCompanies();showToast('Importati '+count+' contratti')}
  else showToast('Nessun contratto valido trovato');
}
function parseDate(v){if(!v)return'';if(v instanceof Date){return`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`}const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;const d=new Date(s);return isNaN(d.getTime())?'':d.toISOString().split('T')[0]}
function parseBool(v){if(typeof v==='boolean')return v;return['sì','si','yes','true','1','vero','x'].includes(String(v||'').toLowerCase().trim())}

// export menu
window.toggleExportMenu=e=>{e.stopPropagation();state.showExportMenu=!state.showExportMenu;document.getElementById('export-menu').style.display=state.showExportMenu?'block':'none'}
window.closeExportMenu=()=>{state.showExportMenu=false;const m=document.getElementById('export-menu');if(m)m.style.display='none'}
document.addEventListener('click',()=>closeExportMenu());

// ═══════════════════════════════════════
// CLOUD SYNC
// ═══════════════════════════════════════
function encRoom(n){return String(n).replace(/[.#$\[\]\/]/g,'_').substring(0,128)}
function fbArrayFromVal(v){if(!v)return null;if(Array.isArray(v))return v;if(typeof v==='object'){const k=Object.keys(v);if(!k.length)return null;return k.map(i=>v[i]).filter(Boolean)}return null}

function initSync(){
  if(!syncConfig.enabled||!syncConfig.apiKey||!syncConfig.databaseURL||!syncConfig.roomName){disconnectSync();return}
  try{
    const ex=firebase.apps.find(a=>a.name==='syncApp');
    if(ex)ex.delete().then(connectSync).catch(connectSync);
    else connectSync();
  }catch(e){syncState.connected=false;updateSyncUI()}
}
function connectSync(){
  try{
    const app=firebase.initializeApp({apiKey:syncConfig.apiKey,databaseURL:syncConfig.databaseURL},'syncApp');
    syncState.db=app.database();
    syncState.db.ref('.info/connected').on('value',s=>{syncState.connected=s.val()===true;updateSyncUI()});
    const ref=syncState.db.ref('rooms/'+encRoom(syncConfig.roomName)+'/data');
    if(syncState.listener)syncState.listener.off();
    syncState.listener=ref;
    ref.on('value',s=>{
      if(syncState.skipNext){syncState.skipNext=false;return}
      const rd=fbArrayFromVal(s.val());
      if(rd&&JSON.stringify(rd)!==JSON.stringify(state.companies)){
        state.companies=rd;save(SK.data,rd);syncState.lastSync=new Date().toISOString();renderPage();renderSidebarCompanies();
      }updateSyncUI();
    });
  }catch(e){syncState.connected=false;updateSyncUI()}
}
function syncToCloud(){
  if(!syncState.db||!syncConfig.enabled||!syncConfig.roomName)return;
  // Prima di sincronizzare, controlla se ci sono differenze rispetto al cloud
  syncState.db.ref('rooms/'+encRoom(syncConfig.roomName)+'/data').once('value').then(snap=>{
    const cloudData = fbArrayFromVal(snap.val());
    if(cloudData && JSON.stringify(cloudData)!==JSON.stringify(state.companies)){
      // Merge intelligente: unisce dati locali e cloud, evitando duplicati
      const merged = mergeCompanies(cloudData, state.companies);
      if(JSON.stringify(merged)!==JSON.stringify(state.companies)){
        // Avvisa l'utente del conflitto
        showToast('⚠️ Dati cloud diversi: unione automatica effettuata.');
        state.companies = merged;
        save(SK.data, merged);
        renderPage();
        renderSidebarCompanies();
      }
    }
    // Procedi con la sincronizzazione
    syncState.skipNext=true;
    syncState.db.ref('rooms/'+encRoom(syncConfig.roomName)+'/data').set(JSON.parse(JSON.stringify(state.companies))).then(()=>{syncState.lastSync=new Date().toISOString();updateSyncUI()}).catch(()=>{syncState.skipNext=false});
  }).catch(()=>{
    // In caso di errore, fallback sync classico
    syncState.skipNext=true;
    syncState.db.ref('rooms/'+encRoom(syncConfig.roomName)+'/data').set(JSON.parse(JSON.stringify(state.companies))).then(()=>{syncState.lastSync=new Date().toISOString();updateSyncUI()}).catch(()=>{syncState.skipNext=false});
  });
}

// Merge intelligente tra dati cloud e locali
function mergeCompanies(cloud, local){
  // Unisce per id, mantiene il più recente (in base a endDate o modifiche)
  const map = {};
  [...cloud, ...local].forEach(c => {
    if(!c.id) return;
    if(!map[c.id]) map[c.id] = c;
    else {
      // Se esistono due versioni, tiene quella con endDate più recente o più campi valorizzati
      const a = map[c.id], b = c;
      if(new Date(b.endDate||0) > new Date(a.endDate||0)) map[c.id] = b;
      else if(JSON.stringify(b).length > JSON.stringify(a).length) map[c.id] = b;
    }
  });
  // Ordina per id
  return Object.values(map).sort((a,b)=>a.id-b.id);
}
// Gestione della sincronizzazione: metodi utili mancanti
function disconnectSync(){
  try{
    if(syncState.listener){ try{ syncState.listener.off(); }catch(e){} syncState.listener=null; }
    if(syncState.db){ try{ if(typeof syncState.db.goOffline==='function') syncState.db.goOffline(); }catch(e){} syncState.db=null; }
    if(typeof firebase!=='undefined' && firebase.apps){ const ex = firebase.apps.find(a=>a.name==='syncApp'); if(ex) try{ ex.delete(); }catch(e){} }
  }catch(e){}
  syncState.connected=false; syncState.lastSync=null; syncState.skipNext=false; updateSyncUI();
}

function toggleCloudSync(checked){
  syncConfig.enabled = !!checked;
  save(SK.sync, syncConfig);
  saveUserConfig();
  if(syncConfig.enabled){ initSync(); showToast('Sincronizzazione attivata'); }
  else{ disconnectSync(); showToast('Sincronizzazione disattivata'); }
}

function applySyncConfig(){
  save(SK.sync, syncConfig);
  saveUserConfig();
  initSync();
  showToast('Configurazione sincronizzazione applicata');
}

function pullFromCloud(){
  if(!syncState.db || !syncState.connected){ showToast('Non connesso al cloud'); return; }
  syncState.db.ref('rooms/'+encRoom(syncConfig.roomName)+'/data').once('value').then(snap=>{
    const cloudData = fbArrayFromVal(snap.val());
    if(!cloudData){ showToast('Nessun dato nel cloud'); return; }
    const merged = mergeCompanies(cloudData, state.companies);
    if(JSON.stringify(merged)!==JSON.stringify(state.companies)){
      state.companies = merged; save(SK.data, merged); renderPage(); renderSidebarCompanies(); showToast('Dati importati dal cloud');
    } else showToast('Dati cloud identici a quelli locali');
  }).catch(e=>{ showToast('Errore download: '+(e.message||e)); });
}

function forcePushToCloud(){
  if(!syncState.db || !syncState.connected){ showToast('Non connesso al cloud'); return; }
  syncToCloud();
  showToast('Invio dati al cloud...');
}

function updateSyncUI(){
  const el = document.getElementById('sync-status');
  if(!el) return;
  let html = '';
  if(!syncConfig.enabled) html = '<div style="font-size:13px;color:var(--text3)">Sincronizzazione disattivata</div>';
  else if(syncState.connected) html = `<div style="font-size:13px;color:var(--text3)"><span class="status-pill ok"><span class="status-dot ok"></span>Connesso</span>${syncState.lastSync? ' Ultima sincronizzazione: '+new Date(syncState.lastSync).toLocaleString() : ''}</div>`;
  else html = '<div style="font-size:13px;color:var(--text3)"><span class="status-pill warn"><span class="status-dot warn"></span>Non connesso</span></div>';
  el.innerHTML = html;
  const btnPull = document.getElementById('btn-pull'); const btnPush = document.getElementById('btn-push');
  if(btnPull) btnPull.disabled = !syncState.connected; if(btnPush) btnPush.disabled = !syncState.connected;
}
// If no explicit login flow is active, show the app and render initial UI
// === LOGIN SCREEN & AUTH ===
function renderLoginScreen(msg) {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      <div class="login-logo"><div class="logo-mark"><img src="evolution-system.png" alt="Evolution System"></div><span class="login-logo-text">Evolution System - Gestione Scadenze Contratti</span></div>
      <div class="login-subtitle">Accedi con email e password</div>
      <div class="login-err" id="login-err" style="display:${msg?'block':'none'}">${msg||''}</div>
      <div class="form-row single"><div class="form-field"><label>Email</label><input id="login-email" class="f-input" type="email" autocomplete="username" style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Password</label><input id="login-password" class="f-input" type="password" autocomplete="current-password" style="width:100%"></div></div>
      <div class="modal-actions" style="margin-top:18px"><button class="m-btn primary" onclick="doLogin()">Accedi</button></div>
      <div class="login-toggle-link"><a href="#" onclick="showRegister()">Non hai un account? Registrati</a></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}

function renderRegisterScreen(msg) {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      <div class="login-logo"><div class="logo-mark"><img src="evolution-system.png" alt="Evolution System"></div><span class="login-logo-text">Evolution System - Gestione Scadenze Contratti</span></div>
      <div class="login-subtitle">Crea un nuovo account</div>
      <div class="login-err" id="register-err" style="display:${msg?'block':'none'}">${msg||''}</div>
      <div class="form-row single"><div class="form-field"><label>Email</label><input id="register-email" class="f-input" type="email" autocomplete="username" style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Password</label><input id="register-password" class="f-input" type="password" autocomplete="new-password" style="width:100%"></div></div>
      <div class="modal-actions" style="margin-top:18px"><button class="m-btn primary" onclick="doRegister()">Registrati</button></div>
      <div class="login-toggle-link"><a href="#" onclick="showLogin()">Hai già un account? Accedi</a></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}

window.showLogin = function() { renderLoginScreen(); };
window.showRegister = function() { renderRegisterScreen(); };

function renderPendingScreen() {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      <div class="login-logo"><div class="logo-mark"><img src="evolution-system.png" alt="Evolution System"></div><span class="login-logo-text">Evolution System - Gestione Scadenze Contratti</span></div>
      <div class="login-subtitle">Registrazione in attesa</div>
      <div style="text-align:center;padding:16px 0;color:var(--text2);font-size:14px;line-height:1.6">
        Il tuo account è in attesa di approvazione da parte dell'amministratore.<br><br>
        Potrai accedere non appena la richiesta sarà approvata.
      </div>
      <div class="modal-actions" style="margin-top:8px"><button class="m-btn" onclick="showLogin()">Torna al login</button></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}

function renderRejectedScreen() {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      <div class="login-logo"><div class="logo-mark"><img src="evolution-system.png" alt="Evolution System"></div><span class="login-logo-text">Evolution System - Gestione Scadenze Contratti</span></div>
      <div class="login-subtitle">Accesso negato</div>
      <div style="text-align:center;padding:16px 0;color:var(--text2);font-size:14px;line-height:1.6">
        La tua richiesta di registrazione è stata rifiutata.<br>Contatta l'amministratore per maggiori informazioni.
      </div>
      <div class="modal-actions" style="margin-top:8px"><button class="m-btn" onclick="showLogin()">Torna al login</button></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}


window.doLogin = function() {
  ensureFirebaseApp();
  const email = (document.getElementById('login-email')||{}).value?.trim();
  const password = (document.getElementById('login-password')||{}).value;
  if (!email || !password) { renderLoginScreen('Inserisci email e password'); return; }
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(user => { authUser = user.user; afterLogin(); })
    .catch(e => {
      let msg = 'Errore: ' + (e.code || e.message || 'sconosciuto');
      if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') msg = 'Email o password non corretti';
      else if (e.code === 'auth/invalid-email') msg = 'Email non valida';
      else if (e.code === 'auth/too-many-requests') msg = 'Troppi tentativi, riprova più tardi';
      renderLoginScreen(msg);
    });
};


window.doRegister = function() {
  ensureFirebaseApp();
  const email = (document.getElementById('register-email')||{}).value?.trim();
  const password = (document.getElementById('register-password')||{}).value;
  if (!email || !password) { renderRegisterScreen('Inserisci email e password'); return; }
  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then(user => {
      authUser = user.user;
      // L'admin si registra normalmente
      if (email === ADMIN_EMAIL) { afterLogin(); return; }
      // Nuovo utente: salva come pending e disconnetti in attesa di approvazione
      firebase.database().ref('pendingUsers/' + user.user.uid).set({
        email: email,
        status: 'pending',
        createdAt: Date.now()
      }).then(() => {
        firebase.auth().signOut();
        authUser = null;
        renderPendingScreen();
      }).catch(() => {
        firebase.auth().signOut();
        authUser = null;
        renderPendingScreen();
      });
    })
    .catch(e => { renderRegisterScreen('Errore: '+(e.message||'Impossibile registrare')); });
};

function afterLogin() {
  if (!authUser) return;
  // Admin accede direttamente senza controllo approvazione
  if (authUser.email === ADMIN_EMAIL) { proceedAfterLogin(); return; }
  // Verifica lo stato di approvazione dell'utente nel DB
  try {
    firebase.database().ref('pendingUsers/' + authUser.uid).once('value').then(snap => {
      const data = snap.val();
      if (data && data.status === 'pending') {
        firebase.auth().signOut();
        authUser = null;
        renderPendingScreen();
      } else if (data && data.status === 'rejected') {
        firebase.auth().signOut();
        authUser = null;
        renderRejectedScreen();
      } else {
        proceedAfterLogin();
      }
    }).catch(() => { proceedAfterLogin(); });
  } catch(e) { proceedAfterLogin(); }
}

function proceedAfterLogin() {
  // Nasconde la schermata di login e mostra la dashboard
  const ls = document.getElementById('login-screen'); if (ls) { ls.innerHTML = ''; ls.style.display = 'none'; }
  const appShell = document.getElementById('app-shell'); if (appShell) appShell.style.display = 'flex';
  updateNav();
  renderSidebarCompanies();
  renderPage();
  startAutoSend();
  initSync();
  // Registra Service Worker e abilita notifiche push di sistema
  if (typeof initPushNotifications === 'function') initPushNotifications();
}
// Salva la configurazione utente su Firebase DB
function saveUserConfig() {
  if (!authUser) return;
  const uid = authUser.uid;
  const userConfig = {
    settings: emailSettings,
    sync: syncConfig
  };
  try {
    firebase.database().ref('userConfig/' + uid).set(userConfig);
  } catch(e) { console.error('saveUserConfig', e); }
}

// Carica la configurazione utente da Firebase DB
function loadUserConfig() {
  return new Promise((resolve) => {
    if (!authUser) return resolve();
    const uid = authUser.uid;
    firebase.database().ref('userConfig/' + uid).once('value').then(snap => {
      const val = snap.val();
      if (val && val.settings) {
        emailSettings = val.settings;
        save(SK.settings, emailSettings);
      }
      if (val && val.sync) {
        syncConfig = val.sync;
        save(SK.sync, syncConfig);
      }
      resolve();
    }).catch(()=>resolve());
  });
}
window.setSendMethod = v => { emailSettings.sendMethod = v; save(SK.settings, emailSettings); saveUserConfig(); renderPage(); };
window.saveEJSField = (f, v) => { emailSettings.emailjs[f] = (v||'').trim(); save(SK.settings, emailSettings); saveUserConfig(); };
window.toggleAutoSend = checked => { emailSettings.autoSend.enabled = checked; save(SK.settings, emailSettings); saveUserConfig(); if (checked) startAutoSend(); else stopAutoSend(); renderPage(); };
window.toggleDay = d => { const a = emailSettings.autoSend.daysBeforeExpiry; const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); else a.push(d); a.sort((x, y) => y - x); save(SK.settings, emailSettings); saveUserConfig(); renderPage(); };
window.saveCheckInterval = v => { emailSettings.autoSend.checkIntervalMinutes = Math.max(5, Math.min(1440, v || 60)); save(SK.settings, emailSettings); saveUserConfig(); if (emailSettings.autoSend.enabled) startAutoSend(); };
window.clearEmailLog = () => { emailLog = []; save(SK.log, []); renderPage(); showToast('Log cancellato'); };

window.testEmailJS = async () => {
  if (!isEmailJSConfigured()) { showToast('Configura EmailJS prima'); return; }
  try {
    emailjs.init(emailSettings.emailjs.publicKey);
    await emailjs.send(emailSettings.emailjs.serviceId, emailSettings.emailjs.templateId, { to_email: 'test@test.com', subject: 'Test', message: 'Test connessione', contract_name: 'Test' });
    showToast('Connessione EmailJS riuscita!');
    addLog('Test', 'test@test.com', 'success', 'emailjs', 'Test riuscito');
    renderPage();
  } catch (e) {
    showToast('Errore: ' + (e.text || e));
    addLog('Test', 'test@test.com', 'error', 'emailjs', e.text || String(e));
    renderPage();
  }
};

window.saveSyncField = (f, v) => { syncConfig[f] = (v || '').trim(); save(SK.sync, syncConfig); saveUserConfig(); };

// ═══════════════════════════════════════
// ADMIN — GESTIONE UTENTI
// ═══════════════════════════════════════
window.loadAdminUsers = function() {
  if (!isAdmin()) return;
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  container.innerHTML = '<div style="font-size:13px;color:var(--text3)">Caricamento…</div>';
  ensureFirebaseApp();
  firebase.database().ref('pendingUsers').once('value').then(snap => {
    const val = snap.val();
    if (!val) { container.innerHTML = '<div style="font-size:13px;color:var(--text3)">Nessun utente registrato.</div>'; return; }
    const users = Object.entries(val).map(([uid, data]) => ({uid, ...data}));
    users.sort((a, b) => (b.createdAt||0) - (a.createdAt||0));
    const statusLabel = { pending: '⏳ In attesa', approved: '✅ Approvato', rejected: '❌ Rifiutato' };
    container.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${esc(u.email)}</div>
          <div style="font-size:11px;color:var(--text3)">${statusLabel[u.status]||u.status} · ${u.createdAt ? new Date(u.createdAt).toLocaleString('it-IT') : '—'}</div>
        </div>
        ${u.status === 'pending' ? `
          <button class="tb-btn primary" onclick="approveUser('${esc(u.uid)}')">Approva</button>
          <button class="tb-btn" style="color:var(--danger)" onclick="rejectUser('${esc(u.uid)}')">Rifiuta</button>
        ` : u.status === 'approved' ? `
          <button class="tb-btn" style="color:var(--danger)" onclick="rejectUser('${esc(u.uid)}')">Revoca</button>
        ` : `
          <button class="tb-btn primary" onclick="approveUser('${esc(u.uid)}')">Riattiva</button>
        `}
      </div>`).join('');
  }).catch(e => { if(container) container.innerHTML = '<div style="font-size:13px;color:var(--danger)">Errore caricamento utenti.</div>'; });
};

window.approveUser = function(uid) {
  if (!isAdmin()) return;
  firebase.database().ref('pendingUsers/' + uid).update({ status: 'approved' }).then(() => {
    showToast('Utente approvato');
    loadAdminUsers();
  }).catch(() => showToast('Errore durante l\'approvazione'));
};

window.rejectUser = function(uid) {
  if (!isAdmin()) return;
  firebase.database().ref('pendingUsers/' + uid).update({ status: 'rejected' }).then(() => {
    showToast('Utente rifiutato');
    loadAdminUsers();
  }).catch(() => showToast('Errore durante il rifiuto'));
};

function checkAuth() {
  if (!ensureFirebaseApp()) {
    // Firebase non inizializzato: mostra schermata di login/configurazione
    const appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'none';
    renderLoginScreen();
    return;
  }
  if (!firebase || !firebase.auth) {
    const appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'none';
    renderLoginScreen('Impossibile inizializzare l\'autenticazione Firebase');
    return;
  }
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      authUser = user;
      afterLogin();
    } else {
      authUser = null;
      const appShell = document.getElementById('app-shell');
      if (appShell) appShell.style.display = 'none';
      renderLoginScreen();
    }
  });
}

// Funzioni per indeterminati / cessati / note di lavorazione (spostate qui)
window.monthsRemainingTo12 = function(c){
  if(!c||!c.startDate||!c.endDate) return 0;
  const dur = durationMonths(c.startDate,c.endDate);
  return Math.max(0, 12 - dur);
}

window.markIndeterminate = function(id){
  const c = state.companies.find(x=>x.id===id); if(!c) return;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Converti a tempo indeterminato</h3><p>Sei sicuro di voler convertire il contratto di <strong>${esc(c.employeeName||c.name)}</strong> a tempo indeterminato?</p><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="(function(){hideModal();(function doIt(){const idx=state.companies.findIndex(x=>x.id===${id});if(idx<0)return;state.companies[idx].indeterminate=true;state.companies[idx].renewable=false;saveData();renderPage();renderSidebarCompanies();showToast('Contratto convertito a tempo indeterminato');})();})()">Conferma</button></div></div></div>`);
}

window.markCessato = function(id){
  const c = state.companies.find(x=>x.id===id); if(!c) return;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Segna come cessato</h3><p>Segnare come cessato il contratto di <strong>${esc(c.employeeName||c.name)}</strong>?</p><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn danger" onclick="(function(){hideModal();(function doIt(){const idx=state.companies.findIndex(x=>x.id===${id});if(idx<0)return;state.companies[idx].cessato=true;saveData();renderPage();renderSidebarCompanies();showToast('Contratto segnato come cessato');})();})()">Conferma</button></div></div></div>`);
}

window.openWorkNoteModal = function(id){
  const c = state.companies.find(x=>x.id===id); if(!c) return;
  const lastNote = (c.workNotes && c.workNotes.length) ? c.workNotes[c.workNotes.length-1].text : '';
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Nota lavorazione — ${esc(c.employeeName||c.name)}</h3><div class="form-row single"><div class="form-field"><label>Nota</label><textarea id="work-note-text" class="f-input">${esc(lastNote)}</textarea></div></div><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="saveWorkNote(${id})">Salva nota</button></div></div></div>`);
}

window.saveWorkNote = function(id){
  const txt = (document.getElementById('work-note-text')||{}).value?.trim();
  if(!txt){showToast('Inserisci una nota');return}
  const idx = state.companies.findIndex(x=>x.id===id); if(idx<0) return;
  const now = new Date().toISOString();
  if(!state.companies[idx].workNotes) state.companies[idx].workNotes = [];
  state.companies[idx].workNotes.push({date:now,text:txt});
  state.companies[idx].inProgress = true;
  saveData(); hideModal(); renderPage(); renderSidebarCompanies(); showToast('Nota salvata');
}

window.viewWorkNotes = function(id){
  const c = state.companies.find(x=>x.id===id); if(!c) return;
  const notes = (c.workNotes||[]).map(n=>`<div style="margin-bottom:8px"><div style="font-size:12px;color:var(--text3)">${new Date(n.date).toLocaleString()}</div><div style="margin-top:4px">${esc(n.text)}</div></div>`).join('')||'<div class="empty-state">Nessuna nota</div>';
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Note lavorazione — ${esc(c.employeeName||c.name)}</h3>${notes}<div class="modal-actions"><button class="m-btn" onclick="hideModal()">Chiudi</button></div></div></div>`);
}

// Pagine dedicate
function renderIndeterminatiPage(){
  const list = state.companies.filter(c=>c.indeterminate===true);
  if(!list.length) return `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>Nessun contratto a tempo indeterminato.</div>`;
  list.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  return `<div class="section-head"><div class="section-title">Contratti a tempo indeterminato (${list.length})</div></div><div id="indeterminati-list">${list.map(c=>renderContractCard(c)).join('')}</div>`;
}

function renderCessatiPage(){
  const list = state.companies.filter(c=>c.cessato===true);
  if(!list.length) return `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>Nessun contratto cessato.</div>`;
  list.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  return `<div class="section-head"><div class="section-title">Contratti cessati (${list.length})</div></div><div id="cessati-list">${list.map(c=>renderContractCard(c)).join('')}</div>`;
}

window.addEventListener('load', checkAuth);
