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
  if(c.renewable)b+=`Il contratto è prorogabile per ${c.renewMonths} mesi — modalità: ${c.renewType}. Preavviso richiesto: ${c.renewNotice} giorni.\nProroghe effettuate: ${c.renewCount||0}/4.\n`;
  if(typeof getDisdettaDaysLeft==='function'){const ddl=getDisdettaDaysLeft(c);if(ddl!==null)b+=`Giorni alla scadenza preavviso disdetta: ${ddl}.\n`;}
  if(typeof analyzeContractCompliance==='function'){const r=analyzeContractCompliance(c);if(r&&r.stato!=='OK')b+=`\nVerifica legale: ${r.stato} — ${r.msg}\n`;}
  b+=`\n`;
  if(!c.renewable)b+=`Il contratto non è prorogabile.\n\n`;
  if(c.notes)b+=`Note: ${c.notes}\n\n`;
  b+=`Si prega di procedere con le formalità necessarie (incluso UNILAV ove previsto entro 5 gg).\n\n— ProrogaPro`;
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
    const thresholds=typeof getAlertDaysForContract==='function'?getAlertDaysForContract(c):(emailSettings.autoSend.daysBeforeExpiry||[]);
    for(const t of thresholds){
      if(d<=t){
        const key=`${c.id}_${t}_${new Date().toISOString().split('T')[0]}`;
        if(sentTracker[key])continue;
        const subj=t===(parseInt(c.renewNotice)||0)?`[DISDETTA] Preavviso ${c.name} (${d}gg)`:`[AUTO] ${c.name} scade tra ${d}gg`;
        const r=await sendEmailReal(`${c.adminEmail}; ${c.companyEmail}`,subj,generateEmailBody(c,d),c.name);
        if(r.ok){sentTracker[key]=new Date().toISOString();save(SK.sent,sentTracker)}
        break;
      }
    }
    if(typeof getDisdettaDaysLeft==='function'){
      const ddl=getDisdettaDaysLeft(c);
      if(ddl!==null&&ddl<=0&&ddl>=-1&&c.renewable!==false){
        const dk=`${c.id}_disdetta_${new Date().toISOString().split('T')[0]}`;
        if(!sentTracker[dk]){
          const r=await sendEmailReal(`${c.adminEmail}; ${c.companyEmail}`,`[DISDETTA] Termine preavviso — ${c.name}`,generateEmailBody(c,d)+'\n\n⚠ Finestra preavviso/disdetta raggiunta.',c.name);
          if(r.ok){sentTracker[dk]=new Date().toISOString();save(SK.sent,sentTracker)}
        }
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
window.exportCSV=()=>{const h=getHeaders();const r=getRows();const csv=[h,...r].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const b=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`prorogapro_export_${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(u);showToast('CSV esportato')}
window.exportExcel=()=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([getHeaders(),...getRows()]);ws['!cols']=[22,20,22,12,12,8,12,10,10,14,10,8,24,24,40].map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,'Contratti');XLSX.writeFile(wb,`prorogapro_export_${new Date().toISOString().split('T')[0]}.xlsx`);showToast('Excel esportato')}
window.exportExcelCompany=name=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([getHeaders(),...getRows(state.companies.filter(c=>c.name===name))]);XLSX.utils.book_append_sheet(wb,ws,name.substring(0,30));XLSX.writeFile(wb,`prorogapro_export_${name.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);showToast('Excel azienda esportato')}
window.exportPDFCompany=name=>{
  const list=state.companies.filter(c=>c.name===name);
  if(!list.length){showToast('Nessun contratto per questa azienda');return}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const safeName=String(name||'azienda').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_-]/g,'');
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text(`ProrogaPro - ${name}`,14,14);
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100);doc.text(`Esportato il ${new Date().toLocaleDateString('it-IT')} - ${list.length} contratti`,14,20);doc.setTextColor(0);
  doc.autoTable({
    head:[['Azienda','Dipendente','Tipo Contratto','Inizio','Scadenza','Gg','Stato','Pror.']],
    body:list.map(c=>{const d=daysLeft(c.endDate);return[c.name,c.employeeName||'—',c.contractType||'',formatDate(c.startDate),formatDate(c.endDate),String(d),d<0?'Scaduto':d<=ALERT_DAYS?'Urgente':d<=30?'In scadenza':'OK',c.renewable?'Sì':'No']}),
    startY:25,theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[42,91,215],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[245,244,240]}
  });
  doc.save(`prorogapro_export_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);showToast('PDF azienda esportato');
}
window.exportPDF=()=>{
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text('ProrogaPro — Scadenze e proroghe contrattuali',14,14);
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100);doc.text(`Esportato il ${new Date().toLocaleDateString('it-IT')} — ${state.companies.length} contratti`,14,20);doc.setTextColor(0);
  doc.autoTable({head:[['Azienda','Dipendente','Tipo Contratto','Inizio','Scadenza','Gg','Stato','Pror.']],body:state.companies.map(c=>{const d=daysLeft(c.endDate);return[c.name,c.employeeName||'—',c.contractType,formatDate(c.startDate),formatDate(c.endDate),String(d),d<0?'Scaduto':d<=ALERT_DAYS?'Urgente':d<=30?'In scadenza':'OK',c.renewable?'Sì':'No',c.renewMonths||'',c.renewType||'',c.renewNotice||'',c.renewCount||0,c.adminEmail||'',c.companyEmail||'',c.notes||'']}).slice(0,100),startY:25,theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[42,91,215],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[245,244,240]}});
  doc.save(`prorogapro_export_${new Date().toISOString().split('T')[0]}.pdf`);showToast('PDF esportato');
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
      format:'prorogapro-backup',
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
    a.download=`prorogapro_backup_${new Date().toISOString().split('T')[0]}.json`;
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
  syncState.connected = !!syncConfig.enabled;
  syncState.lastSync = null;
  updateSyncUI();
}
function syncToCloud(){
  if(!syncConfig.enabled)return;
  syncState.lastSync = new Date().toISOString();
  updateSyncUI();
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
  try{}catch(e){}
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
  if (typeof window.initSupabaseSync === 'function') {
    window.initSupabaseSync().then(() => showToast('Dati ricaricati da Supabase'));
  } else {
    showToast('Sync Supabase non disponibile');
  }
}

function forcePushToCloud(){
  if (!requireWriteAccess('sincronizzare')) return;
  if (typeof window.forceSyncToSupabase === 'function') {
    window.forceSyncToSupabase().then(() => showToast('Sincronizzazione completata'));
  } else {
    showToast('Sync Supabase non disponibile');
  }
}

function updateSyncUI(){
  const el = document.getElementById('sync-status');
  if(!el) return;
  const active = typeof window.isSupabaseSyncActive === 'function' && window.isSupabaseSyncActive();
  el.innerHTML = active
    ? '<div style="font-size:13px;color:var(--text3)"><span class="status-pill ok"><span class="status-dot ok"></span>Supabase connesso</span> — salvataggio automatico attivo</div>'
    : '<div style="font-size:13px;color:var(--text3)">In attesa di connessione Supabase…</div>';
}
// If no explicit login flow is active, show the app and render initial UI
// === LOGIN SCREEN & AUTH ===
function authLegalFooter() {
  return `<p class="login-legal" style="font-size:12px;color:var(--text3);margin-top:16px;text-align:center;line-height:1.55">
    <a href="pages/terms.html" target="_blank" rel="noopener">Termini di Servizio</a>
    · <a href="pages/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>
  </p>`;
}

function renderLoginScreen(msg) {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      ${renderLoginLogo()}
      <div class="login-subtitle">Accedi con email e password</div>
      <div class="login-err" id="login-err" style="display:${msg?'block':'none'}">${msg||''}</div>
      <div class="form-row single"><div class="form-field"><label>Email</label><input id="login-email" class="f-input" type="email" autocomplete="username" style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Password</label><input id="login-password" class="f-input" type="password" autocomplete="current-password" style="width:100%"></div></div>
      <div class="modal-actions" style="margin-top:18px"><button class="m-btn primary" onclick="doLogin()">Accedi</button></div>
      <div class="login-toggle-link"><a href="#" onclick="showRegister();return false;">Non hai un account? Registrati — trial 14 giorni</a></div>
      ${authLegalFooter()}
    </div>
  `;
  loginEl.style.display = 'flex';
}

function renderRegisterScreen(msg) {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      ${renderLoginLogo()}
      <div class="login-subtitle">Crea un nuovo account</div>
      <div class="login-err" id="register-err" style="display:${msg?'block':'none'}">${msg||''}</div>
      <div class="form-row single"><div class="form-field"><label>Email</label><input id="register-email" class="f-input" type="email" autocomplete="username" style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Password</label><input id="register-password" class="f-input" type="password" autocomplete="new-password" style="width:100%"></div></div>
      <div class="modal-actions" style="margin-top:18px"><button class="m-btn primary" onclick="doRegister()">Registrati</button></div>
      <div class="login-toggle-link"><a href="#" onclick="showLogin();return false;">Hai già un account? Accedi</a></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}

window.showLogin = function() { renderLoginScreen(); };
window.showRegister = function() { renderRegisterScreen(); };

function currentAuthId() {
  return authUser?.id || authUser?.uid || null;
}

async function loadProfileById(uid) {
  if (!uid) return null;
  const { data, error } = await window.supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (error) {
    console.error('loadProfileById', error);
    return null;
  }
  return data;
}

async function saveProfilePatch(uid, patch) {
  if (!uid) return false;
  const payload = Object.assign({ id: uid }, patch || {});
  const { error } = await window.supabaseClient
    .from('profiles')
    .upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('saveProfilePatch', error);
    return false;
  }
  return true;
}

async function ensureProfileForUser(user) {
  if (!user || !user.id) return null;
  let profile = await loadProfileById(user.id);
  if (profile) return profile;
  await saveProfilePatch(user.id, {
    email: user.email || '',
    role: 'viewer',
    status: 'pending',
    created_at: new Date().toISOString()
  });
  profile = await loadProfileById(user.id);
  return profile;
}

function renderPendingScreen() {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      ${renderLoginLogo()}
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
      ${renderLoginLogo()}
      <div class="login-subtitle">Accesso negato</div>
      <div style="text-align:center;padding:16px 0;color:var(--text2);font-size:14px;line-height:1.6">
        La tua richiesta di registrazione è stata rifiutata.<br>Contatta l'amministratore per maggiori informazioni.
      </div>
      <div class="modal-actions" style="margin-top:8px"><button class="m-btn" onclick="showLogin()">Torna al login</button></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}


function formatAuthError(e) {
  const msg = String(e?.message || e?.statusText || e || '');
  if (/fetch|network|failed to fetch|521|502|503|504|timeout|ECONNREFUSED/i.test(msg)) {
    return 'Backend Supabase non raggiungibile. Apri supabase.com/dashboard e verifica che il progetto sia attivo (i progetti free in pausa vanno riattivati).';
  }
  if (/already registered|already exists|user already registered/i.test(msg)) {
    return 'Email già registrata — accedi con le tue credenziali.';
  }
  if (/invalid email/i.test(msg)) return 'Email non valida';
  if (/password/i.test(msg) && /short|least|weak/i.test(msg)) return 'Password troppo debole (minimo 8 caratteri)';
  if (/rate limit|too many/i.test(msg)) return 'Troppi tentativi — riprova tra qualche minuto';
  return msg.startsWith('Errore') ? msg : ('Errore: ' + msg);
}

async function checkSupabaseHealth() {
  try {
    if (window.supabaseClientReady) await window.supabaseClientReady;
    if (!window.supabaseClient) return false;
    const cfg = window.ES_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    const res = await fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/auth/v1/health', {
      headers: { apikey: cfg.supabaseAnonKey },
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function completePendingTenantRegistration(user) {
  if (!user?.id || typeof window.registerNewTenant !== 'function') return false;
  const meta = user.user_metadata || {};
  const fullName = (meta.full_name || meta.fullName || user.email?.split('@')[0] || '').trim();
  const companyName = (meta.company_name || meta.companyName || '').trim();
  if (!companyName) return false;
  const existing = await loadProfileById(user.id);
  if (existing?.company_id) return true;
  await window.registerNewTenant(fullName, companyName);
  return true;
}

window.doLogin = async function() {
  try {
    if (window.supabaseClientReady) await window.supabaseClientReady;
  } catch (_) {
    renderLoginScreen('Impossibile connettersi a Supabase. Ricarica la pagina.');
    return;
  }
  if (!window.supabaseClient || !window.supabaseClient.auth) {
    renderLoginScreen('Supabase non inizializzato correttamente');
    return;
  }
  const email = (document.getElementById('login-email')||{}).value?.trim();
  const password = (document.getElementById('login-password')||{}).value;
  if (!email || !password) { renderLoginScreen('Inserisci email e password'); return; }
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    authUser = data?.user ? { ...data.user, uid: data.user.id } : null;
    await afterLogin();
  } catch (e) {
    renderLoginScreen(formatAuthError(e));
  }
};


function renderRegisterFullScreen(msg) {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card">
      ${renderLoginLogo('Registrazione')}
      <div class="login-subtitle">Crea il tuo account e inizia il trial gratuito di 14 giorni</div>
      <div class="login-err" id="register-err" style="display:${msg?'block':'none'}">${msg||''}</div>
      <div class="form-row single"><div class="form-field"><label>Nome completo</label><input id="register-fullname" class="f-input" type="text" placeholder="Mario Rossi" style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Nome azienda</label><input id="register-company" class="f-input" type="text" placeholder="Acme S.r.l." style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Email</label><input id="register-email" class="f-input" type="email" autocomplete="username" style="width:100%"></div></div>
      <div class="form-row single"><div class="form-field"><label>Password <span style="color:var(--text3);font-size:12px">(min. 8 caratteri)</span></label><input id="register-password" class="f-input" type="password" autocomplete="new-password" style="width:100%"></div></div>
      <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text2);margin-top:12px;line-height:1.45;cursor:pointer">
        <input type="checkbox" id="register-terms" style="margin-top:3px">
        <span>Accetto i <a href="pages/terms.html" target="_blank" rel="noopener" onclick="event.stopPropagation()">Termini di Servizio</a> e la <a href="pages/privacy.html" target="_blank" rel="noopener" onclick="event.stopPropagation()">Privacy Policy</a></span>
      </label>
      <div class="modal-actions" style="margin-top:18px"><button class="m-btn primary" onclick="doRegister()">Crea account</button></div>
      <div class="login-toggle-link"><a href="#" onclick="showLogin();return false;">Hai già un account? Accedi</a></div>
    </div>
  `;
  loginEl.style.display = 'flex';
}

window.showRegister = function() { renderRegisterFullScreen(); };

window.doRegister = async function() {
  try {
    if (window.supabaseClientReady) await window.supabaseClientReady;
  } catch (_) {
    renderRegisterFullScreen('Impossibile connettersi a Supabase. Ricarica la pagina.');
    return;
  }
  if (!window.supabaseClient || !window.supabaseClient.auth) {
    renderRegisterFullScreen('Supabase non inizializzato correttamente');
    return;
  }
  const fullName   = (document.getElementById('register-fullname') ||{}).value?.trim();
  const companyName= (document.getElementById('register-company')  ||{}).value?.trim();
  const email      = (document.getElementById('register-email')    ||{}).value?.trim();
  const password   = (document.getElementById('register-password') ||{}).value;
  if (!email || !password) { renderRegisterFullScreen('Inserisci email e password'); return; }
  if (password.length < 8) { renderRegisterFullScreen('La password deve essere di almeno 8 caratteri'); return; }
  if (!companyName) { renderRegisterFullScreen('Inserisci il nome della tua azienda'); return; }
  if (!(document.getElementById('register-terms') || {}).checked) {
    renderRegisterFullScreen('Devi accettare Termini di Servizio e Privacy Policy');
    return;
  }
  try {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email.split('@')[0],
          company_name: companyName,
        },
      },
    });
    if (error) throw error;
    const user = data?.user || null;
    const session = data?.session || null;

    if (!user) {
      renderRegisterFullScreen('Registrazione avviata. Controlla la tua email per confermare l\'account, poi accedi.');
      return;
    }

    if (!session) {
      renderRegisterFullScreen('Account creato! Controlla la tua email, conferma l\'indirizzo e poi accedi — il trial partirà al primo login.');
      return;
    }

    authUser = { ...user, uid: user.id };
    try {
      await window.registerNewTenant(fullName || email.split('@')[0], companyName);
    } catch (rpcErr) {
      console.warn('register_new_tenant RPC:', rpcErr.message);
      throw new Error(rpcErr.message || 'Impossibile creare l\'azienda. Verifica che le migrazioni SQL siano state applicate su Supabase.');
    }
    await afterLogin();
  } catch (e) {
    renderRegisterFullScreen(formatAuthError(e));
  }
};

async function afterLogin() {
  if (!authUser) return;
  try {
    try {
      await completePendingTenantRegistration(authUser);
    } catch (regErr) {
      console.warn('completePendingTenantRegistration', regErr);
    }

    let profile = await loadProfileById(authUser.id);
    if (!profile) profile = await ensureProfileForUser(authUser);
    if (typeof window.setCurrentUserRole === 'function') {
      window.setCurrentUserRole(profile?.role || 'viewer');
    }
    const status = String(profile?.status || 'approved').toLowerCase();
    const role = String(profile?.role || '').toLowerCase();
    const isAdminUser = role === 'owner' || role === 'admin';
    if (!isAdminUser && status === 'pending') {
      await window.supabaseClient.auth.signOut();
      authUser = null;
      renderPendingScreen();
      return;
    }
    if (!isAdminUser && status === 'rejected') {
      await window.supabaseClient.auth.signOut();
      authUser = null;
      renderRejectedScreen();
      return;
    }
    if (status === 'suspended') {
      await window.supabaseClient.auth.signOut();
      authUser = null;
      renderRejectedScreen();
      return;
    }
    await proceedAfterLogin(profile);
  } catch(e) {
    console.error('afterLogin', e);
    await proceedAfterLogin(null);
  }
}

async function proceedAfterLogin(profile) {
  const licKey = 'cm2_license_v1_' + (currentAuthId() || 'guest');
  const acceptedLocal = !!localStorage.getItem(licKey);
  const acceptedRemote = !!profile?.license_accepted_at;
  if (!acceptedLocal && !acceptedRemote) {
    renderLicenseScreen(licKey);
    return;
  }
  if (acceptedRemote && !acceptedLocal) {
    try { localStorage.setItem(licKey, String(profile.license_accepted_at)); } catch(_) {}
  }
  await loadUserConfig(profile);
  _doEnterApp();
}

function renderLicenseScreen(licKey) {
  const loginEl = document.getElementById('login-screen');
  if (!loginEl) return;
  loginEl.innerHTML = `
    <div class="login-card license-card">
      ${renderLoginLogo('Termini di utilizzo')}
      <div class="license-version">Versione 1.0 — Maggio 2026</div>
      <div class="license-body" id="license-body">
        <h4>Contratto di licenza d'uso del software</h4>
        <p>Il presente Contratto di Licenza d'Uso ("Contratto") disciplina l'accesso e l'utilizzo della piattaforma <strong>${APP_NAME}</strong> (il "Software"), sviluppata e di proprietà esclusiva del Fornitore.</p>

        <h4>1. Concessione di licenza</h4>
        <p>Il Fornitore concede all'Utente una licenza personale, non esclusiva, non trasferibile e revocabile per l'utilizzo del Software esclusivamente per le finalità di gestione interna dei contratti di lavoro e dei cantieri. È vietato cedere, sublicenziare, distribuire o rivendere il Software o qualsiasi parte di esso.</p>

        <h4>2. Proprietà intellettuale</h4>
        <p>Il Software, inclusi codice sorgente, interfaccia grafica, logiche applicative, marchi e documentazione, è di proprietà esclusiva del Fornitore ed è protetto dalla normativa italiana ed europea sul diritto d'autore (L. 633/1941 e D.Lgs. 518/1992). L'Utente non acquista alcun diritto di proprietà sul Software.</p>

        <h4>3. Trattamento dei dati personali</h4>
        <p>I dati inseriti nel Software (inclusi dati di dipendenti e contratti) sono trattati nel rispetto del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003. I dati applicativi sono gestiti su infrastruttura Supabase (UE). L'Utente e responsabile della correttezza e liceita dei dati immessi.</p>

        <h4>4. Limitazione di responsabilità</h4>
        <p>Il Software viene fornito "così com'è". Il Fornitore non garantisce che il Software sia privo di errori, interruzioni o incompatibilità. In nessun caso il Fornitore sarà responsabile per perdite di dati, mancati rinnovi contrattuali, sanzioni o danni diretti/indiretti derivanti dall'utilizzo o dalla non disponibilità del Software. L'Utente è l'unico responsabile delle decisioni aziendali basate sui dati gestiti.</p>

        <h4>5. Riservatezza</h4>
        <p>L'Utente si impegna a non divulgare a terzi informazioni riservate relative al funzionamento interno del Software, alle sue credenziali di accesso e ai dati aziendali elaborati.</p>

        <h4>6. Aggiornamenti e modifiche</h4>
        <p>Il Fornitore si riserva il diritto di aggiornare il Software e i presenti Termini in qualsiasi momento. In caso di modifiche sostanziali ai Termini, all'Utente verrà richiesta nuova accettazione. L'uso continuato del Software dopo la notifica costituisce accettazione dei nuovi termini.</p>

        <h4>7. Risoluzione</h4>
        <p>Il Fornitore si riserva il diritto di sospendere o revocare l'accesso al Software in caso di violazione del presente Contratto, senza obbligo di preavviso e senza alcun obbligo di rimborso.</p>

        <h4>8. Contatti</h4>
        <p>Per qualsiasi richiesta relativa alla licenza o al trattamento dei dati: <strong>${(window.ES_CONFIG&&window.ES_CONFIG.contactEmail)||'support@prorogapro.it'}</strong></p>
      </div>
      <div class="license-scroll-hint" id="license-hint">↓ Scorri per leggere prima di accettare</div>
      <div class="license-accept-row">
        <label class="license-checkbox-label">
          <input type="checkbox" id="license-accept-cb" onchange="onLicenseCbChange()">
          <span>Ho letto, compreso e accetto i Termini di utilizzo e la Licenza d'uso del Software</span>
        </label>
      </div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="m-btn" onclick="doLogout()">Annulla</button>
        <button class="m-btn primary" id="license-accept-btn" disabled onclick="acceptLicense('${licKey}')">Accetta e continua</button>
      </div>
    </div>
  `;
  loginEl.style.display = 'flex';
  // Abilita il pulsante solo quando l'utente ha scrollato fino in fondo
  const body = document.getElementById('license-body');
  if (body) {
    body.addEventListener('scroll', function() {
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 10) {
        const hint = document.getElementById('license-hint');
        if (hint) hint.style.display = 'none';
      }
    });
  }
}

window.onLicenseCbChange = function() {
  const cb = document.getElementById('license-accept-cb');
  const btn = document.getElementById('license-accept-btn');
  if (btn) btn.disabled = !(cb && cb.checked);
};

window.acceptLicense = async function(licKey) {
  const cb = document.getElementById('license-accept-cb');
  if (!cb || !cb.checked) return;
  const acceptedAt = new Date().toISOString();
  try { localStorage.setItem(licKey, acceptedAt); } catch(_) {}
  if (authUser) {
    try {
      await saveProfilePatch(currentAuthId(), { license_accepted_at: acceptedAt, license_version: 'v1', email: authUser.email || '' });
    } catch(_) {}
  }
  _doEnterApp();
};

async function _doEnterApp() {
  // Nasconde la schermata di login e mostra la dashboard
  const ls = document.getElementById('login-screen'); if (ls) { ls.innerHTML = ''; ls.style.display = 'none'; }
  const appShell = document.getElementById('app-shell'); if (appShell) appShell.style.display = 'flex';
  // Carica dati da Supabase prima di renderizzare
  if (typeof window.initSupabaseSync === 'function') {
    await window.initSupabaseSync();
  } else {
    updateNav();
    renderSidebarCompanies();
    renderPage();
  }
  startAutoSend();
  if (typeof updateSyncUI === 'function') updateSyncUI();
  if (typeof applyWriteRoleUI === 'function') applyWriteRoleUI();
  if (typeof initPushNotifications === 'function') initPushNotifications();
}
// Salva la configurazione utente su profilo Supabase
async function saveUserConfig() {
  const uid = currentAuthId();
  if (!uid) return;
  const userConfig = {
    settings: emailSettings,
    sync: syncConfig
  };
  try {
    await saveProfilePatch(uid, { settings: userConfig.settings, sync: userConfig.sync, updated_at: new Date().toISOString() });
  } catch(e) { console.error('saveUserConfig', e); }
}

// Carica la configurazione utente da profilo Supabase
function loadUserConfig(profile) {
  return new Promise((resolve) => {
    if (!authUser) return resolve();
    const applyConfig = (val) => {
      if (val && val.settings) {
        emailSettings = val.settings;
        save(SK.settings, emailSettings);
      }
      if (val && val.sync) {
        syncConfig = val.sync;
        save(SK.sync, syncConfig);
      }
      resolve();
    };

    if (profile) {
      applyConfig(profile);
      return;
    }

    const uid = currentAuthId();
    if (!uid) return resolve();
    loadProfileById(uid).then(p => applyConfig(p || {})).catch(() => resolve());
  });
}
window.setSendMethod = v => { emailSettings.sendMethod = v; save(SK.settings, emailSettings); saveUserConfig(); renderPage(); };
window.saveEJSField = (f, v) => { emailSettings.emailjs[f] = (v||'').trim(); save(SK.settings, emailSettings); saveUserConfig(); };
window.toggleAutoSend = checked => { emailSettings.autoSend.enabled = checked; save(SK.settings, emailSettings); saveUserConfig(); if (checked) startAutoSend(); else stopAutoSend(); renderPage(); };
window.toggleDay = d => { const a = emailSettings.autoSend.daysBeforeExpiry; const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); else a.push(d); a.sort((x, y) => y - x); save(SK.settings, emailSettings); saveUserConfig(); renderPage(); };
window.saveCheckInterval = v => { emailSettings.autoSend.checkIntervalMinutes = Math.max(5, Math.min(1440, v || 60)); save(SK.settings, emailSettings); saveUserConfig(); if (emailSettings.autoSend.enabled) startAutoSend(); };
window.clearEmailLog = () => { emailLog = []; save(SK.log, []); renderPage(); showToast('Log cancellato'); };

window.loadProfileSettings = async function(){
  try{
    if(window.supabaseClientReady) await window.supabaseClientReady;
    const emailInput=document.getElementById('settings-profile-email');
    if(!emailInput)return;
    const result=await window.supabaseClient.auth.getUser();
    emailInput.value=result?.data?.user?.email||'';
    const pwdInput=document.getElementById('settings-profile-password');
    if(pwdInput)pwdInput.value='';
  }catch(e){ console.error('loadProfileSettings',e); }
};

window.updateProfileSettings = async function(){
  const feedback=document.getElementById('settings-profile-feedback');
  const emailInput=document.getElementById('settings-profile-email');
  const pwdInput=document.getElementById('settings-profile-password');
  if(!feedback||!emailInput||!pwdInput)return;
  feedback.style.display='none';
  try{
    if(window.supabaseClientReady) await window.supabaseClientReady;
    const email=(emailInput.value||'').trim();
    const password=(pwdInput.value||'').trim();
    if(email){
      const { error: emailErr } = await window.supabaseClient.auth.updateUser({ email });
      if(emailErr) throw emailErr;
    }
    if(password){
      if(password.length < 8) throw new Error('La password deve essere di almeno 8 caratteri');
      const { error: passErr } = await window.supabaseClient.auth.updateUser({ password });
      if(passErr) throw passErr;
    }
    feedback.textContent='Account aggiornato con successo.';
    feedback.style.background='var(--green-bg)';
    feedback.style.color='var(--green)';
    feedback.style.border='1px solid var(--green-border)';
    feedback.style.display='block';
    pwdInput.value='';
  }catch(err){
    feedback.textContent=err?.message||'Errore aggiornamento account';
    feedback.style.background='var(--red-bg)';
    feedback.style.color='var(--red)';
    feedback.style.border='1px solid var(--red-border)';
    feedback.style.display='block';
  }
};

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
  window.supabaseClient.from('profiles').select('id,email,role,status,created_at').order('created_at',{ascending:false}).then(({data,error}) => {
    if (error) throw error;
    const me = String(currentAuthId() || '');
    const users = (data || []).filter(u => String(u.id || '') !== me);
    if (!users.length) { container.innerHTML = '<div style="font-size:13px;color:var(--text3)">Nessun utente registrato.</div>'; return; }
    const statusLabel = { pending: '⏳ In attesa', approved: '✅ Approvato', rejected: '❌ Rifiutato', suspended: '⛔ Sospeso' };
    const roleLabel = { owner: 'Owner', admin: 'Admin', manager: 'Manager', viewer: 'Viewer' };
    container.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${esc(u.email||'')}</div>
          <div style="font-size:11px;color:var(--text3)">${roleLabel[u.role]||u.role||'—'} · ${statusLabel[u.status]||u.status} · ${u.created_at ? new Date(u.created_at).toLocaleString('it-IT') : '—'}</div>
        </div>
        ${u.role === 'owner' ? `
          <span style="font-size:11px;color:var(--text3);font-weight:600">Protetto</span>
        ` : u.status === 'pending' ? `
          <button class="tb-btn primary" onclick="approveUser('${esc(u.id)}')">Approva</button>
          <button class="tb-btn" style="color:var(--danger)" onclick="rejectUser('${esc(u.id)}')">Rifiuta</button>
        ` : u.status === 'approved' ? `
          <button class="tb-btn" style="color:var(--danger)" onclick="suspendUser('${esc(u.id)}')">Sospendi</button>
        ` : `
          <button class="tb-btn primary" onclick="approveUser('${esc(u.id)}')">Riattiva</button>
        `}
      </div>`).join('');
  }).catch(() => { if(container) container.innerHTML = '<div style="font-size:13px;color:var(--danger)">Errore caricamento utenti.</div>'; });
};

window.approveUser = function(uid) {
  if (!isAdmin()) return;
  saveProfilePatch(uid, { status: 'approved', approved_by: currentAuthId(), updated_at: new Date().toISOString() }).then(ok => {
    if (!ok) throw new Error('update failed');
    showToast('Utente approvato');
    loadAdminUsers();
  }).catch(() => showToast('Errore durante l\'approvazione'));
};

window.rejectUser = function(uid) {
  if (!isAdmin()) return;
  saveProfilePatch(uid, { status: 'rejected', approved_by: currentAuthId(), updated_at: new Date().toISOString() }).then(ok => {
    if (!ok) throw new Error('update failed');
    showToast('Utente rifiutato');
    loadAdminUsers();
  }).catch(() => showToast('Errore durante il rifiuto'));
};

window.suspendUser = function(uid) {
  if (!isAdmin()) return;
  saveProfilePatch(uid, { status: 'suspended', approved_by: currentAuthId(), updated_at: new Date().toISOString() }).then(ok => {
    if (!ok) throw new Error('update failed');
    showToast('Utente sospeso');
    loadAdminUsers();
  }).catch(() => showToast('Errore durante la sospensione'));
};

async function checkAuth() {
  if (!window.supabaseClient || !window.supabaseClient.auth) {
    const appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'none';
    renderLoginScreen('Impossibile inizializzare l\'autenticazione Supabase');
    return;
  }

  try {
    if (window.supabaseClientReady) await window.supabaseClientReady;

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session && session.user) {
      authUser = { ...session.user, uid: session.user.id };
      await afterLogin();
    } else {
      authUser = null;
      const appShell = document.getElementById('app-shell');
      if (appShell) appShell.style.display = 'none';
      renderLoginScreen();
    }
  } catch (_) {
    renderLoginScreen();
  }

  window.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session && session.user) {
      authUser = { ...session.user, uid: session.user.id };
      await afterLogin();
    } else if (document.getElementById('app-shell')?.style.display !== 'none') {
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
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Converti a tempo indeterminato</h3><p>Sei sicuro di voler convertire il contratto di <strong>${esc(c.employeeName||c.name)}</strong> a tempo indeterminato?</p><p style="font-size:12px;color:var(--text2)">Verrà creata scadenza UNILAV trasformazione (5 gg).</p><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn primary" onclick="confirmMarkIndeterminate(${id})">Conferma</button></div></div></div>`);
}
window.confirmMarkIndeterminate=function(id){
  const idx=state.companies.findIndex(x=>x.id===id);if(idx<0)return;
  state.companies[idx].indeterminate=true;state.companies[idx].renewable=false;
  if(typeof addComplianceTask==='function') addComplianceTask(state.companies[idx],'unilav_trasformazione',new Date().toISOString().split('T')[0],'Conversione T.I.');
  hideModal();saveData();renderPage();renderSidebarCompanies();showToast('Convertito a T.I. — UNILAV entro 5 gg');
}

window.markCessato = function(id){
  const c = state.companies.find(x=>x.id===id); if(!c) return;
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()"><h3>Segna come cessato</h3><p>Segnare come cessato il contratto di <strong>${esc(c.employeeName||c.name)}</strong>?</p><p style="font-size:12px;color:var(--text2)">Verrà creata scadenza UNILAV cessazione (5 gg).</p><div class="modal-actions"><button class="m-btn" onclick="hideModal()">Annulla</button><button class="m-btn danger" onclick="confirmMarkCessato(${id})">Conferma</button></div></div></div>`);
}
window.confirmMarkCessato=function(id){
  const idx=state.companies.findIndex(x=>x.id===id);if(idx<0)return;
  state.companies[idx].cessato=true;
  const ev=state.companies[idx].endDate||new Date().toISOString().split('T')[0];
  if(typeof addComplianceTask==='function') addComplianceTask(state.companies[idx],'unilav_cessazione',ev,'Cessazione rapporto');
  hideModal();saveData();renderPage();renderSidebarCompanies();showToast('Cessato — UNILAV entro 5 gg');
}

window.openWorkNoteModal = function(id){
  const numId = Number(id);
  const c = state.companies.find(x=>Number(x.id)===numId); if(!c) return;
  const history = (c.workNotes||[]).slice().reverse().map(n=>
    `<div class="worknote-history-item"><div class="worknote-history-date">${new Date(n.date).toLocaleString('it-IT')}</div><div class="worknote-history-text">${esc(n.text)}</div></div>`
  ).join('');
  const historyBlock = history
    ? `<div class="worknote-history">${history}</div>`
    : '';
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()">
    <h3>Note lavorazione — ${esc(c.employeeName||c.name)}</h3>
    ${historyBlock}
    <div class="form-row single"><div class="form-field"><label>Nuova nota</label><textarea id="work-note-text" class="f-input" placeholder="Scrivi una nota di lavorazione…" rows="4"></textarea></div></div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Annulla</button>
      <button class="m-btn primary" onclick="saveWorkNote(${numId})">Salva nota</button>
    </div>
  </div></div>`);
  setTimeout(()=>{const ta=document.getElementById('work-note-text');if(ta)ta.focus();},50);
}

window.saveWorkNote = function(id){
  try{
    const numId = Number(id);
    const ta = document.getElementById('work-note-text');
    if(!ta){showToast('Errore: campo nota non trovato');return;}
    const txt = ta.value.trim();
    if(!txt){showToast('Inserisci una nota prima di salvare');return;}
    const idx = state.companies.findIndex(x=>Number(x.id)===numId);
    if(idx<0){showToast('Errore: contratto non trovato');return;}
    const now = new Date().toISOString();
    if(!state.companies[idx].workNotes) state.companies[idx].workNotes = [];
    state.companies[idx].workNotes.push({date:now,text:txt});
    state.companies[idx].inProgress = true;
    saveData(); hideModal(); renderPage(); renderSidebarCompanies(); showToast('Nota salvata');
  }catch(e){console.error('saveWorkNote',e);showToast('Errore durante il salvataggio');}
}

window.viewWorkNotes = function(id){
  const numId = Number(id);
  const c = state.companies.find(x=>Number(x.id)===numId); if(!c) return;
  const notes = (c.workNotes||[]).slice().reverse().map(n=>
    `<div class="worknote-history-item"><div class="worknote-history-date">${new Date(n.date).toLocaleString('it-IT')}</div><div class="worknote-history-text">${esc(n.text)}</div></div>`
  ).join('')||'<div class="empty-state" style="padding:16px 0">Nessuna nota registrata.</div>';
  showModal(`<div class="modal-bg" onclick="hideModal()"><div class="modal" onclick="event.stopPropagation()">
    <h3>Note lavorazione — ${esc(c.employeeName||c.name)}</h3>
    <div class="worknote-history">${notes}</div>
    <div class="modal-actions">
      <button class="m-btn" onclick="hideModal()">Chiudi</button>
      <button class="m-btn primary" onclick="hideModal();openWorkNoteModal(${numId})">+ Aggiungi nota</button>
    </div>
  </div></div>`);
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

function renderGestiteePage(){
  const list=state.companies.filter(c=>c.status==='gestita');
  if(!list.length)return`<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>Nessun contratto marcato come Gestita.<br><br><small style="color:var(--text3)">Seleziona "Gestita" su un contratto dalla Dashboard per spostarlo qui.</small></div>`;
  list.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  return`<div class="section-head"><div><div class="section-title">Contratti Gestiti (${list.length})</div><div class="section-sub">Contratti già gestiti e conclusi con esito positivo.</div></div></div><div id="gestite-list">${list.map(c=>renderContractCard(c)).join('')}</div>`;
}

function renderTerminatePage(){
  const list=state.companies.filter(c=>c.status==='terminato');
  if(!list.length)return`<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Nessun contratto marcato come Terminato.<br><br><small style="color:var(--text3)">Seleziona "Terminato" su un contratto dalla Dashboard per spostarlo qui.</small></div>`;
  list.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  return`<div class="section-head"><div><div class="section-title">Contratti Terminati (${list.length})</div><div class="section-sub">Contratti terminati e non più attivi.</div></div></div><div id="terminate-list">${list.map(c=>renderContractCard(c)).join('')}</div>`;
}

window.addEventListener('load', checkAuth);
