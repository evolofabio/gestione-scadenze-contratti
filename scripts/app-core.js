'use strict';
// ═══════════════════════════════════════
// CONSTANTS & STORAGE
// ═══════════════════════════════════════
const ALERT_DAYS = 6;
const SK = { data:'cm2_data', settings:'cm2_settings', log:'cm2_log', sent:'cm2_sent', sync:'cm2_sync', auth:'cm2_auth', theme:'cm2_theme' };

function esc(s){if(!s)return'';const m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"};return String(s).replace(/[&<>"']/g,c=>m[c])}
function escAttr(s){return esc(s)}
function escJsArg(s){return JSON.stringify(String(s??'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ═══════════════════════════════════════
// DEFAULT DATA
// ═══════════════════════════════════════
function mkDate(d){const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().split('T')[0]}

function defaultData(){return[
  {id:1,name:'Acme S.r.l.',employeeName:'Marco Bianchi',contractType:'Fornitura servizi IT',startDate:'2023-04-15',endDate:mkDate(4),renewable:true,renewMonths:12,renewType:'Senza causale',renewNotice:30,renewCount:2,adminEmail:'admin@example.com',companyEmail:'contratti@acme.it',notes:'Rinnovo automatico salvo disdetta. Verificare aggiornamento prezzi.',cantieri:[{nome:'Cantiere Milano',scadenza:mkDate(10),note:'Verifica sicurezza'},{nome:'Cantiere Roma',scadenza:mkDate(30),note:''}]},
  {id:4,name:'Acme S.r.l.',employeeName:'Laura Verdi',contractType:'Supporto tecnico',startDate:'2024-01-10',endDate:mkDate(45),renewable:true,renewMonths:6,renewType:'Automatica',renewNotice:15,renewCount:0,adminEmail:'admin@example.com',companyEmail:'contratti@acme.it',notes:'Contratto supporto tecnico on-site.',cantieri:[]},
  {id:2,name:'Beta Solutions S.p.A.',employeeName:'Giuseppe Neri',contractType:'Contratto di appalto',startDate:'2022-01-10',endDate:mkDate(18),renewable:true,renewMonths:6,renewType:'Con causale',renewNotice:60,renewCount:1,adminEmail:'admin@example.com',companyEmail:'legal@beta.it',notes:'Proroga subordinata a valutazione performance.',cantieri:[{nome:'Cantiere Napoli',scadenza:mkDate(60),note:'Controllo documenti'}]},
  {id:3,name:'Gamma Trade S.r.l.',employeeName:'Anna Russo',contractType:'Accordo commerciale',startDate:'2024-06-01',endDate:mkDate(90),renewable:false,renewMonths:0,renewType:'',renewNotice:0,renewCount:0,adminEmail:'admin@example.com',companyEmail:'info@gamma.it',notes:'Contratto a termine fisso, non prorogabile.',cantieri:[]}
]} 

function defaultSettings(){return{sendMethod:'mailto',emailjs:{serviceId:'',templateId:'',publicKey:''},autoSend:{enabled:false,daysBeforeExpiry:[30,15,7,3,1],checkIntervalMinutes:60}}}
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyArXvyeZzRZSQFMKpv1Bz6w4fAxcBRu_3U',
  authDomain: 'gestione-scadenze-d2eed.firebaseapp.com',
  databaseURL: 'https://gestione-scadenze-d2eed-default-rtdb.europe-west1.firebasedatabase.app/'
};
const ADMIN_EMAIL = 'evolo434@gmail.com';
function isAdmin(){ return !!(authUser && authUser.email === ADMIN_EMAIL); }
function defaultSync(){return{enabled:true,apiKey:FIREBASE_CONFIG.apiKey,databaseURL:FIREBASE_CONFIG.databaseURL,roomName:'gestione-scadenze'}}
function defaultAuth(){return{apiKey:FIREBASE_CONFIG.apiKey,authDomain:FIREBASE_CONFIG.authDomain,databaseURL:FIREBASE_CONFIG.databaseURL}}

function save(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch(e){} }
function load(key,def){try{const r=localStorage.getItem(key);if(r!==null)return JSON.parse(r)}catch(e){}return typeof def==='function'?def():def}

// Salva lo stato delle aziende su localStorage e, se attivo, prova a sincronizzare col cloud
function saveData(){
  try{
    save(SK.data, state.companies);
  }catch(e){ console.error('saveData', e); }
  try{
    if(syncConfig && syncConfig.enabled && syncState && syncState.db){
      // Non forzare merge in ogni salvataggio, ma tenta upload se connesso
      syncToCloud();
    }
  }catch(e){ console.error('saveData sync', e); }
  // Aggiorna i contratti nell'IDB del Service Worker (per notifiche push offline)
  try{ if(typeof mirrorContractsToIDB==='function') mirrorContractsToIDB(state.companies); }catch(_){}
}

// Minimal global toast helper (evita ReferenceError quando usato da vari handler)
function showToast(msg, opts){
  try{
    opts = opts || {};
    const duration = opts.duration||3500;
    let cont = document.getElementById('toast-container');
    if(!cont){
      cont = document.createElement('div');
      cont.id = 'toast-container';
      cont.style.position = 'fixed';
      cont.style.right = '18px';
      cont.style.bottom = '18px';
      cont.style.zIndex = '9999';
      cont.style.display = 'flex';
      cont.style.flexDirection = 'column';
      cont.style.gap = '8px';
      document.body.appendChild(cont);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = String(msg||'');
    t.style.background = 'rgba(0,0,0,0.85)';
    t.style.color = '#fff';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    t.style.maxWidth = 'min(90vw,420px)';
    t.style.fontSize = '14px';
    t.style.opacity = '0';
    t.style.transition = 'opacity .18s ease, transform .18s ease';
    cont.appendChild(t);
    requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateY(0)'; });
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>{ t.remove(); if(!cont.childElementCount) cont.remove(); },200); }, duration);
    return t;
  }catch(e){ console.error('showToast', e); }
}

// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
let state={
  page:'dashboard',
  companies:load(SK.data,defaultData),
  searchQuery:'',
  sortBy:'urgency',
  filterMonth:'',
  activeCompany:null,
  calYear:new Date().getFullYear(),
  calMonth:new Date().getMonth(),
  expandedCard:null,
  quickRenewId:null,
  quickRenewMonths:{},
  showExportMenu:false,
  showNotifCenter:false,
  theme:load(SK.theme,'light'),
  sidebarCollapsed:false,
};
let emailSettings=load(SK.settings,defaultSettings);
let emailLog=load(SK.log,[]);
let sentTracker=load(SK.sent,{});
let syncConfig=load(SK.sync,defaultSync);
// Forza sempre la sincronizzazione attiva (multi-utente ufficio)
syncConfig.enabled=true;
let syncState={connected:false,lastSync:null,listener:null,db:null,skipNext:false};
let authUser=null,authFirebaseApp=null;
let autoSendInterval=null;


// Inizializza Firebase App principale se non già presente
function ensureFirebaseApp() {
  // If Firebase script hasn't loaded yet, signal failure
  if (typeof window.firebase === 'undefined') return false;
  // If an app is already initialized, we're good
  if (firebase.apps && firebase.apps.length > 0) return true;

  // Configurazione: usa localStorage se presente, altrimenti usa il config hardcoded
  var config = null;
  if (typeof defaultAuth === 'function') {
    config = load(SK.auth, defaultAuth);
  } else {
    config = load(SK.sync, defaultSync);
  }
  // Fallback al config hardcoded se mancano campi essenziali
  if (!config || !config.apiKey || !config.authDomain || !config.databaseURL) {
    config = Object.assign({}, FIREBASE_CONFIG, config || {});
  }
  if (config && config.apiKey && config.authDomain && config.databaseURL) {
    try {
      firebase.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        databaseURL: config.databaseURL
      });
      return true;
    } catch (e) {
      console.error('firebase.initializeApp error', e);
      return false;
    }
  } else {
    // Mostra form per inserire le chiavi Firebase
    var el = document.getElementById('login-screen') || document.body;
    if (el) {
      el.innerHTML = `<div class="login-card">
        <h3>Configurazione Firebase mancante</h3>
        <p>Inserisci qui le chiavi di accesso del tuo progetto Firebase:</p>
        <div class="form-field"><label>API Key</label><input id="firebase-api-key" class="f-input" type="text" placeholder="API Key"></div>
        <div class="form-field"><label>Auth Domain</label><input id="firebase-auth-domain" class="f-input" type="text" placeholder="Auth Domain"></div>
        <div class="form-field"><label>Database URL</label><input id="firebase-db-url" class="f-input" type="text" placeholder="Database URL"></div>
        <button class="tb-btn primary" style="margin-top:16px" onclick="window.saveFirebaseConfig()">Salva e ricarica</button>
      </div>`;
      window.saveFirebaseConfig = function() {
        var apiKey = (document.getElementById('firebase-api-key')||{}).value?.trim();
        var authDomain = (document.getElementById('firebase-auth-domain')||{}).value?.trim();
        var databaseURL = (document.getElementById('firebase-db-url')||{}).value?.trim();
        if (!apiKey || !authDomain || !databaseURL) {
          showToast('Compila tutti i campi!');
          return;
        }
        var cfg = { apiKey, authDomain, databaseURL };
        try { localStorage.setItem(SK.auth, JSON.stringify(cfg)); } catch(e) {}
        location.reload();
      }
    }
    var appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'none';
    return false;
  }
}
ensureFirebaseApp();
applyTheme(state.theme);

// Normalize cantieri so they are stored per azienda (first contract entry) and deduplicated
function getCantiereStartDate(ct){return ct?.startDate||''}
function getCantiereEndDate(ct){return ct?.endDate||ct?.scadenza||''}
function normalizeCurrencyInput(value){
  const raw=String(value||'').trim();
  if(!raw)return'';
  let normalized=raw.replace(/\s+/g,'');
  if((normalized.match(/\./g)||[]).length>1&&!normalized.includes(','))normalized=normalized.replace(/\./g,'');
  else if(normalized.includes(',')&&normalized.includes('.'))normalized=normalized.replace(/\./g,'').replace(',','.');
  else if(normalized.includes(','))normalized=normalized.replace(',','.');
  const amount=Number(normalized);
  return Number.isFinite(amount)?amount.toFixed(2):'';
}
function formatCurrency(value){
  if(value===null||value===undefined||value==='')return'—';
  const amount=Number(value);
  if(!Number.isFinite(amount))return String(value);
  return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(amount);
}
function normalizeCantiere(ct){
  const endDate=getCantiereEndDate(ct);
  return {
    nome:String(ct?.nome||'').trim(),
    startDate:getCantiereStartDate(ct),
    endDate,
    scadenza:endDate,
    note:String(ct?.note||'').trim(),
    committente:String(ct?.committente||'').trim(),
    importo:ct?.importo===undefined||ct?.importo===null?'':String(ct.importo).trim(),
  };
}
function getCantiereKey(ct){
  const normalized=normalizeCantiere(ct);
  return normalized.nome.toLowerCase()+'|'+normalized.endDate;
}
function normalizeCompanyCantieri(){
  try{
    const map={};
    state.companies.forEach(c=>{
      const name=c.name||'';
      if(!map[name])map[name]={seen:new Set(),cantieri:[]};
      if(Array.isArray(c.cantieri)){
        c.cantieri.forEach(ct=>{
          const normalized=normalizeCantiere(ct);
          const key=getCantiereKey(normalized);
          if(!map[name].seen.has(key)){map[name].seen.add(key);map[name].cantieri.push(normalized)}
        });
      }
    });
    const seenFirst={};
    state.companies.forEach(c=>{
      const name=c.name||'';
      if(!seenFirst[name]){seenFirst[name]=true;c.cantieri=(map[name]&&map[name].cantieri.length)?map[name].cantieri.slice():[]}
      else{c.cantieri=[]}
    });
  }catch(e){console.error('normalizeCompanyCantieri',e)}
}
normalizeCompanyCantieri();

// ═══════════════════════════════════════
// THEME
// ═══════════════════════════════════════
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  save(SK.theme,t);
  const icon=document.getElementById('theme-icon');
  if(icon)icon.innerHTML=t==='dark'
    ?'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    :'<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
}

function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark';applyTheme(state.theme)}

// ═══════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════
function daysLeft(d){if(!d) return 9999;const t=new Date();t.setHours(0,0,0,0);const e=new Date(d);e.setHours(0,0,0,0);return Math.round((e-t)/86400000)}
function formatDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'})}
function durationMonths(s,e){if(!s||!e)return 0;const a=new Date(s),b=new Date(e);return(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())+(b.getDate()>a.getDate()?1:0)}
function remainingMonths(e){if(!e)return 0;const t=new Date();t.setHours(0,0,0,0);const b=new Date(e);b.setHours(0,0,0,0);if(b<=t)return 0;return(b.getFullYear()-t.getFullYear())*12+(b.getMonth()-t.getMonth())+(b.getDate()>t.getDate()?1:0)}
function progressPct(s,e){if(!s||!e)return 0;const total=new Date(e)-new Date(s);const elapsed=Date.now()-new Date(s);return Math.min(100,Math.max(0,(elapsed/total)*100))}

// ═══════════════════════════════════════
// URGENCY
// ═══════════════════════════════════════
function urgClass(days){if(days<0)return'expired';if(days<=ALERT_DAYS)return'urgent';if(days<=30)return'warning';return'ok'}
function urgBadge(days){
  if(days<0)return{cls:'badge-gray',txt:'Scaduto'};
  if(days<=ALERT_DAYS)return{cls:'badge-red',txt:days+'gg'};
  if(days<=15)return{cls:'badge-amber',txt:days+'gg'};
  if(days<=30)return{cls:'badge-amber',txt:days+'gg'};
  return{cls:'badge-green',txt:days+'gg'};
}
function daysCls(days){if(days<0||days<=ALERT_DAYS)return'c-red';if(days<=30)return'c-amber';return'c-green'}
function progCls(days){if(days<0)return'gray';if(days<=ALERT_DAYS)return'red';if(days<=30)return'amber';return'green'}
function compactBadgeCount(n){const v=Number(n)||0;return v>99?'99+':String(v)}

// ═══════════════════════════════════════
// CAUSALE CHECK
// ═══════════════════════════════════════
function verificaCausale(durMesi,proroghe,causale){
  durMesi=parseInt(durMesi)||0;proroghe=parseInt(proroghe)||0;causale=!!causale;
  if(proroghe>4)return{stato:'ERRORE',msg:'Superato il limite di 4 proroghe ('+proroghe+' effettuate). Il contratto è da considerarsi a tempo indeterminato.',azione:'Convertire a tempo indeterminato o regolarizzare.'};
  if(durMesi>24)return{stato:'ERRORE',msg:'Durata totale ('+durMesi+' mesi) supera il massimo di 24 mesi.',azione:'Ridurre durata a massimo 24 mesi o convertire a T.I.'};
  if(durMesi>12&&!causale)return{stato:'ERRORE',msg:'Durata >12 mesi ('+durMesi+') senza causale. Causale obbligatoria.',azione:'Inserire causale valida o ridurre durata a ≤12 mesi.'};
  if(durMesi===12&&!causale)return{stato:'ATTENZIONE',msg:'Durata al limite massimo (12 mesi) senza causale.',azione:'Qualsiasi estensione richiederà causale obbligatoria.'};
  if(proroghe===4)return{stato:'ATTENZIONE',msg:'Raggiunto il numero massimo di proroghe (4/4).',azione:'Non è possibile ulteriori proroghe. Valutare conversione T.I.'};
  if(durMesi>=22)return{stato:'ATTENZIONE',msg:'Durata ('+durMesi+' mesi) vicina al limite di 24 mesi.',azione:'Pianificare chiusura o conversione prima dei 24 mesi.'};
  if(proroghe===3)return{stato:'ATTENZIONE',msg:'Effettuate 3 proroghe su 4 massime.',azione:'Resta una sola proroga disponibile.'};
  return{stato:'OK',msg:'Conforme: '+durMesi+' mesi, '+proroghe+'/4 proroghe'+(causale?' con causale':'' )+'.',azione:'Nessuna azione richiesta.'};
}
function causaleForContract(c){if(!c||!c.startDate||!c.endDate)return null;return verificaCausale(durationMonths(c.startDate,c.endDate),c.renewCount||0,c.renewType==='Con causale')}

// ═══════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════
function renderSidebarCompanies(){
  const el=document.getElementById('sidebar-companies');
  if(!el)return;
  // Filtro ricerca aziende
  if(!document.getElementById('company-search-input')){
    const searchBox = document.createElement('div');
    searchBox.innerHTML = `<input id="company-search-input" class="f-input" type="text" placeholder="Cerca azienda..." style="margin-bottom:8px;width:100%" oninput="window.filterSidebarCompanies && window.filterSidebarCompanies(this.value)">`;
    el.parentNode.insertBefore(searchBox, el);
  }
  let search = (document.getElementById('company-search-input')?.value||'').toLowerCase();
  let names=[...new Set(state.companies.map(c=>c.name))];
  names = names.filter(n=>!search||n.toLowerCase().includes(search)).sort((a,b)=>a.localeCompare(b,'it'));
  el.innerHTML=names.map(n=>{
    const active=state.page==='company'&&state.activeCompany===n;
    const init=n.substring(0,2).toUpperCase();
    return`<button class="company-nav-item${active?' active':''}" onclick="setCompanyPage(${escJsArg(n)})" title="${escAttr(n)}">
      <span class="company-initial">${init}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span>
    </button>`;
  }).join('');
}

window.filterSidebarCompanies = function(val){
  renderSidebarCompanies();
}

function toggleSidebar(){
  state.sidebarCollapsed=!state.sidebarCollapsed;
  const sb=document.getElementById('sidebar');
  const lbl=document.getElementById('sidebar-toggle-label');
  const icon=document.getElementById('sidebar-toggle-icon');
  if(state.sidebarCollapsed){
    sb.classList.add('collapsed');
    if(lbl)lbl.style.display='none';
    if(icon)icon.innerHTML='<path d="M9 18l6-6-6-6"/>';
  }else{
    sb.classList.remove('collapsed');
    if(lbl){lbl.style.display='';lbl.textContent='Comprimi'}
    if(icon)icon.innerHTML='<path d="M15 18l-6-6 6-6"/>';
  }
}
function toggleMobileSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebar-overlay');
  const opened = sb.classList.toggle('mobile-open');
  if(ov){ if(opened) ov.classList.add('show'); else ov.classList.remove('show'); }
}

// ═══════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════
function setPage(p,company){
  state.page=p;
  state.activeCompany=company||null;
  state.searchQuery='';
  state.quickRenewId=null;
  document.getElementById('search-input').value='';
  updateNav();
  renderSidebarCompanies();
  renderPage();
}
function setCompanyPage(name){setPage('company',name)}

function onSearch(val){
  state.searchQuery=(val||'').trim();
  if(state.page==='dashboard'||state.page==='company'){
    renderPage();
  }
}

function getUrgentNotifications(){
  const threshold = ALERT_DAYS * 5;
  const urgentContracts = state.companies.filter(c=>typeof c.endDate!=='undefined' && daysLeft(c.endDate)<=threshold);
  const seenCompany={};
  const urgentCantieri=[];
  state.companies.forEach(c=>{
    if(seenCompany[c.name])return;
    seenCompany[c.name]=true;
    (c.cantieri||[]).forEach((ct,idx)=>{
      const endDate=getCantiereEndDate(ct);
      if(endDate&&daysLeft(endDate)<=threshold){
        urgentCantieri.push({...normalizeCantiere(ct),_contractId:c.id,_idx:idx,_companyName:c.name,endDate});
      }
    });
  });
  return {urgentContracts,urgentCantieri,total:urgentContracts.length+urgentCantieri.length};
}

function updateNav(){
  ['dashboard','calendar','cantieri','indeterminati','cessati','analytics','settings'].forEach(p=>{
    const el=document.getElementById('nav-'+p);
    if(el)el.className=`nav-item${state.page===p?' active':''}`;
  });
  const titles={dashboard:'Dashboard',calendar:'Calendario',cantieri:'Cantieri',indeterminati:'Indeterminati',cessati:'Cessati',analytics:'Analytics',settings:'Impostazioni',company:state.activeCompany||'Azienda'};
  const el=document.getElementById('topbar-title');
  if(el)el.textContent=titles[state.page]||'';
  const sw=document.getElementById('topbar-search-wrap');
  if(sw)sw.style.display=(['dashboard','company'].includes(state.page))?'':'none';
  // update small nav badges (cantieri count) and notification badge
  try{
    const seenCompany={};
    const cantieriCount = state.companies.flatMap(c=>{
      if(seenCompany[c.name]) return [];
      seenCompany[c.name]=true;
      return Array.isArray(c.cantieri)?c.cantieri:[];
    }).length;
    const cb=document.getElementById('cantieri-badge');
    if(cb){
      if(cantieriCount>0){cb.style.display='';cb.textContent=compactBadgeCount(cantieriCount)}
      else{cb.style.display='none';cb.textContent='0'}
    }
    const urgentData=getUrgentNotifications();
    const nb=document.getElementById('notif-badge');
    if(nb){
      if(urgentData.total>0){nb.style.display='';nb.textContent=compactBadgeCount(urgentData.total);nb.title=`${urgentData.total} notifiche`}
      else{nb.style.display='none';nb.textContent='0'}
    }
  }catch(e){console.error('updateNav badges',e)}
}

