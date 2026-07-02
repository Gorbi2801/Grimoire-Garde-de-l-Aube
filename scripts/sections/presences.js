// ══════════════════════════════════════════════════════════════════════
//  PRÉSENCES
// ══════════════════════════════════════════════════════════════════════
const presenceState={
  loaded:false,
  rows:[],
  summaries:[],
};

function presenceEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function presenceDate(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
}

function presenceDuration(seconds){
  const total=Math.max(0,Math.floor(Number(seconds)||0));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  if(hours<=0)return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2,'0')}`;
}

function presenceSecondsBetween(startValue,endValue){
  const start=new Date(startValue);
  const end=endValue?new Date(endValue):new Date();
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 0;
  return Math.max(0,Math.floor((end-start)/1000));
}

function presenceSecondsSince(cutoff){
  const cutoffTime=cutoff.getTime();
  return presenceState.rows.reduce((sum,row)=>{
    const start=new Date(row.started_at);
    const end=row.ended_at?new Date(row.ended_at):new Date();
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end.getTime()<cutoffTime)return sum;
    const effectiveStart=Math.max(start.getTime(),cutoffTime);
    return sum+Math.max(0,Math.floor((end.getTime()-effectiveStart)/1000));
  },0);
}

function presenceActiveRow(){
  return presenceState.rows.find(row=>!row.ended_at)||null;
}

function presenceSummaryForUser(userId){
  return presenceState.summaries.find(row=>row.user_id===userId)||null;
}

function presenceIsActiveForUser(userId){
  return presenceSummaryForUser(userId)?.is_active===true;
}

function renderPresenceDot(userId){
  const active=presenceIsActiveForUser(userId);
  return `<span class="presence-dot ${active?'active':'off'}" title="${active?'Présent':'Off'}"></span>`;
}

async function loadPresenceSummaries(){
  try{
    const { data, error } = await window.GrimoireSupabase
      .from('mk_presence_summary')
      .select('user_id,username,display_name,prenom,nom,grade,is_active,active_since,last_seen_at,total_seconds,today_seconds,week_seconds')
      .order('display_name',{ascending:true});
    if(error)throw error;
    presenceState.summaries=data||[];
  }catch(error){
    console.warn('Impossible de charger le résumé des présences.', error);
    presenceState.summaries=[];
  }
  return presenceState.summaries;
}

async function loadPresences(){
  if(!session)return;
  const msg=document.getElementById('presenceMsg');
  if(msg)msg.textContent='Chargement des présences...';
  try{
    await loadPresenceSummaries();
    const { data, error } = await window.GrimoireSupabase
      .from('mk_presences')
      .select('id,user_id,started_at,ended_at,created_at')
      .eq('user_id',session.user.id)
      .order('started_at',{ascending:false})
      .limit(120);
    if(error)throw error;
    presenceState.rows=data||[];
    presenceState.loaded=true;
    renderPresences();
    if(msg)msg.textContent='';
    // Réactiver l'auto-stop si une présence est déjà ouverte au chargement de la page
    const alreadyActive = presenceActiveRow();
    if(alreadyActive) initPresenceAutoStop(alreadyActive.id, session.user.id);
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger le registre de présence.';
    toast('Erreur de chargement des présences.');
  }
}

function renderPresences(){
  renderPresenceStats();
  renderPresenceControl();
  renderPresenceSummary();
  renderPresenceHistory();
}

function renderPresenceStats(){
  const now=new Date();
  const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const weekStart=new Date(now.getTime()-7*24*60*60*1000);
  const summary=presenceSummaryForUser(session.user.id)||{};
  const today=Number(summary.today_seconds)||presenceSecondsSince(todayStart);
  const week=Number(summary.week_seconds)||presenceSecondsSince(weekStart);
  const total=Number(summary.total_seconds)||presenceState.rows.reduce((sum,row)=>sum+presenceSecondsBetween(row.started_at,row.ended_at),0);
  const active=presenceActiveRow();
  const status=document.getElementById('presenceStatusChip');
  const todayEl=document.getElementById('presenceTodayChip');
  const weekEl=document.getElementById('presenceWeekChip');
  const totalEl=document.getElementById('presenceTotalChip');
  if(status)status.textContent=active?'Statut : Présent':'Statut : Off';
  if(todayEl)todayEl.textContent=`Aujourd'hui : ${presenceDuration(today)}`;
  if(weekEl)weekEl.textContent=`7 jours : ${presenceDuration(week)}`;
  if(totalEl)totalEl.textContent=`Total : ${presenceDuration(total)}`;
}

function renderPresenceControl(){
  const el=document.getElementById('presenceCurrent');
  if(!el)return;
  const active=presenceActiveRow();
  if(active){
    el.innerHTML=`${renderPresenceDot(session.user.id)} Présent depuis ${presenceEsc(presenceDate(active.started_at))} · ${presenceDuration(presenceSecondsBetween(active.started_at,null))}`;
  }else{
    const summary=presenceSummaryForUser(session.user.id);
    el.innerHTML=`${renderPresenceDot(session.user.id)} Off${summary?.last_seen_at?` · dernière présence ${presenceEsc(presenceDate(summary.last_seen_at))}`:''}`;
  }
}

function renderPresenceSummary(){
  const el=document.getElementById('presenceSummary');
  if(!el)return;
  const now=new Date();
  const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const weekStart=new Date(now.getTime()-7*24*60*60*1000);
  const summary=presenceSummaryForUser(session.user.id)||{};
  const today=Number(summary.today_seconds)||presenceSecondsSince(todayStart);
  const week=Number(summary.week_seconds)||presenceSecondsSince(weekStart);
  const total=Number(summary.total_seconds)||presenceState.rows.reduce((sum,row)=>sum+presenceSecondsBetween(row.started_at,row.ended_at),0);
  const closed=presenceState.rows.filter(row=>row.ended_at);
  const average=closed.length?Math.floor(total/closed.length):0;
  el.innerHTML=[
    ['Aujourd\'hui',presenceDuration(today)],
    ['7 derniers jours',presenceDuration(week)],
    ['Total déclaré',presenceDuration(total)],
    ['Sessions closes',String(closed.length)],
    ['Moyenne par session',presenceDuration(average)],
  ].map(([label,value])=>`
    <div class="presence-summary-item">
      <strong>${presenceEsc(value)}</strong>
      <span>${presenceEsc(label)}</span>
    </div>
  `).join('');
}

function renderPresenceHistory(){
  const tbody=document.getElementById('presenceHistoryBody');
  if(!tbody)return;
  tbody.innerHTML=presenceState.rows.map(row=>`
    <tr>
      <td>${presenceEsc(presenceDate(row.started_at))}</td>
      <td>${row.ended_at?presenceEsc(presenceDate(row.ended_at)):'En cours'}</td>
      <td>${presenceDuration(presenceSecondsBetween(row.started_at,row.ended_at))}</td>
    </tr>
  `).join('');
  if(!presenceState.rows.length){
    tbody.innerHTML='<tr><td colspan="3" class="sa-empty">Aucune présence enregistrée.</td></tr>';
  }
}


// ── Notification Discord ─────────────────────────────────────────────
async function notifyPresenceDiscord(type) {
  const send = window.GrimoireDiscord?.send || window.sendDiscordNotification;
  if(typeof send!=='function')return;
  await send(type==='start'?'presence_start':'presence_stop');
}


// ══════════════════════════════════════════════════════════════════════
//  AUTO-ARRÊT DE PRÉSENCE — fermeture de page/onglet
//  Stocke l'ID de la présence active pour éviter de dépendre du state
//  au moment du beforeunload (peut être désynchronisé).
// ══════════════════════════════════════════════════════════════════════
let _activePresenceId       = null;  // ID de la ligne mk_presences ouverte
let _activePresenceUserId   = null;  // user_id correspondant
let _presenceBeaconBound    = false;

function _presenceBeaconHandler(){
  const url = window.GrimoireConfig?.supabaseUrl;
  const key  = window.GrimoireConfig?.supabaseKey;
  if(!url || !key) return;

  // Méthode 1 : PATCH direct sur la ligne par ID (le plus fiable)
  if(_activePresenceId){
    const patchUrl = `${url}/rest/v1/mk_presences?id=eq.${_activePresenceId}`;
    const body     = JSON.stringify({ ended_at: new Date().toISOString() });
    const headers  = {
      'Content-Type'  : 'application/json',
      'apikey'        : key,
      'Authorization' : `Bearer ${key}`,
      'Prefer'        : 'return=minimal',
    };
    // fetch keepalive (Chrome/Edge/Firefox récent)
    try{ fetch(patchUrl, { method:'PATCH', headers, body, keepalive:true }); }catch(e){}
  }

  // Méthode 2 : RPC via sendBeacon (POST uniquement, fallback Safari / anciens navigateurs)
  if(_activePresenceUserId){
    const rpcUrl  = `${url}/rest/v1/rpc/force_stop_presence?apikey=${key}`;
    const payload = new Blob(
      [JSON.stringify({ p_user_id: _activePresenceUserId })],
      { type: 'application/json' }
    );
    try{ navigator.sendBeacon(rpcUrl, payload); }catch(e){}
  }
}

function initPresenceAutoStop(presenceId, userId){
  _activePresenceId     = presenceId;
  _activePresenceUserId = userId;
  if(!_presenceBeaconBound){
    window.addEventListener('beforeunload', _presenceBeaconHandler);
    window.addEventListener('pagehide',     _presenceBeaconHandler);
    _presenceBeaconBound = true;
  }
}

function clearPresenceAutoStop(){
  _activePresenceId     = null;
  _activePresenceUserId = null;
  window.removeEventListener('beforeunload', _presenceBeaconHandler);
  window.removeEventListener('pagehide',     _presenceBeaconHandler);
  _presenceBeaconBound = false;
}

async function startPresence(){
  if(!session)return;
  if(presenceActiveRow()){toast('Tu es déjà marqué présent.');return;}
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_presences')
      .insert({user_id:session.user.id});
    if(error)throw error;
    await loadPresences();
    if(typeof loadGardes==='function')await loadGardes();
    await notifyPresenceDiscord('start');
    // Récupérer l'ID depuis le state chargé (évite .select().single() qui peut échouer selon la RLS)
    const active = presenceActiveRow();
    initPresenceAutoStop(active?.id, session.user.id);
    toast('Présence enregistrée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors du pointage.');
  }
}

async function stopPresence(){
  if(!session)return;
  const active=presenceActiveRow();
  if(!active){toast('Aucune présence ouverte.');return;}
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_presences')
      .update({ended_at:new Date().toISOString()})
      .eq('id',active.id);
    if(error)throw error;
    await loadPresences();
    if(typeof loadGardes==='function')await loadGardes();
    await notifyPresenceDiscord('stop');
    clearPresenceAutoStop();
    toast('Présence clôturée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la clôture.');
  }
}

async function forceStopPresence(userId, nomGarde){
  if(!confirm(`Mettre ${nomGarde} hors service de force ?`)) return;
  try{
    const { error } = await window.GrimoireSupabase
      .rpc('force_stop_presence', { p_user_id: userId });
    if(error) throw error;
    await loadPresenceSummaries();
    if(typeof loadGardes==='function') await loadGardes();
    await notifyDiscordForceStop(nomGarde);
    toast(`${nomGarde} mis hors service.`);
  }catch(error){
    console.error(error);
    toast('Erreur lors de la mise hors service.');
  }
}

async function notifyDiscordForceStop(nomGarde){
  // Récupérer le grade du garde depuis gardeRows si disponible
  const gardeRow = typeof gardeRows !== 'undefined'
    ? gardeRows.find(r => (r.prenom+' '+r.nom).trim() === nomGarde.trim())
    : null;
  const grade = gardeRow?.grade || '';
  const send = window.GrimoireDiscord?.send || window.sendDiscordNotification;
  if(typeof send!=='function')return;
  await send('presence_force_stop',{targetName:nomGarde,targetGrade:grade});
}
