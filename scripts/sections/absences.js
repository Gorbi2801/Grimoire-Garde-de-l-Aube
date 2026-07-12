// ══════════════════════════════════════════════════════════════════════
//  ABSENCES
// ══════════════════════════════════════════════════════════════════════
const absenceState={
  loaded:false,
  loading:false,
  rows:[],
  gardes:[],
  editId:null,
  archiveOpen:false,
};

function absenceEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function absenceDate(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
}

function absenceDurationSeconds(startValue,endValue){
  const start=new Date(startValue);
  const end=new Date(endValue);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 0;
  return Math.max(0,Math.floor((end-start)/1000));
}

function absenceDuration(startValue,endValue){
  const seconds=absenceDurationSeconds(startValue,endValue);
  if(typeof presenceDuration==='function')return presenceDuration(seconds);
  const days=Math.floor(seconds/86400);
  const hours=Math.floor((seconds%86400)/3600);
  const minutes=Math.floor((seconds%3600)/60);
  if(days>0)return `${days} j ${hours} h`;
  if(hours>0)return `${hours} h ${String(minutes).padStart(2,'0')}`;
  return `${minutes} min`;
}

function absenceStatus(row, now=new Date()){
  const start=new Date(row.starts_at);
  const end=new Date(row.ends_at);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 'past';
  if(start<=now&&end>=now)return 'active';
  if(start>now)return 'upcoming';
  return 'past';
}

function absenceStatusLabel(status){
  if(status==='active')return 'En cours';
  if(status==='upcoming')return 'À venir';
  return 'Terminée';
}

function absenceStatusClass(status){
  if(status==='active')return 'active';
  if(status==='upcoming')return 'closed';
  return 'empty';
}

function absenceToLocalInput(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function absenceFromLocalInput(value){
  if(!value)return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}

function absenceNameForUser(userId){
  const garde=absenceState.gardes.find(row=>row.user_id===userId)
    || (typeof gardeRows!=='undefined'?gardeRows.find(row=>row.user_id===userId):null)
    || null;
  const rp=[garde?.prenom,garde?.nom].filter(Boolean).join(' ');
  return {
    name:rp||'Garde inconnu',
    grade:garde?.grade||'—',
    garde,
  };
}

function absenceActiveForUser(userId){
  if(!userId)return null;
  const now=new Date();
  return absenceState.rows.find(row=>row.user_id===userId&&absenceStatus(row,now)==='active')||null;
}

function absenceUpcomingForUser(userId){
  if(!userId)return null;
  const now=new Date();
  return absenceState.rows
    .filter(row=>row.user_id===userId&&absenceStatus(row,now)==='upcoming')
    .sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0]||null;
}

function absenceIsActiveForUser(userId){
  return !!absenceActiveForUser(userId);
}

function renderAbsenceBadge(userId){
  const absence=absenceActiveForUser(userId);
  if(!absence)return '';
  const title=`Absent jusqu'au ${absenceDate(absence.ends_at)}`;
  return `<span class="badge" title="${absenceEsc(title)}" style="background:rgba(122,16,16,.12);color:#7A1010;border:1px solid #7A1010;margin-left:.4rem;font-size:.78rem;">Absent</span>`;
}

async function loadAbsenceCache(){
  if(!session||!window.GrimoireSupabase)return [];
  try{
    const [absenceResult,gardeResult]=await Promise.all([
      window.GrimoireSupabase
        .from('mk_absences')
        .select('id,user_id,starts_at,ends_at,reason_hrp,reason_rp,created_by,created_at,updated_at')
        .order('starts_at',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_gardes')
        .select('id,user_id,prenom,nom,grade')
        .not('user_id','is',null)
        .order('nom',{ascending:true}),
    ]);
    if(absenceResult.error)throw absenceResult.error;
    if(gardeResult.error)console.warn('Impossible de charger les noms des gardes pour les absences.', gardeResult.error);
    absenceState.rows=absenceResult.data||[];
    absenceState.gardes=gardeResult.error?absenceState.gardes:(gardeResult.data||[]);
    absenceState.loaded=true;
  }catch(error){
    console.warn('Impossible de charger les absences.', error);
    absenceState.rows=[];
    absenceState.loaded=false;
  }
  return absenceState.rows;
}

async function loadAbsences(){
  if(!session)return;
  const msg=document.getElementById('absenceMsg');
  absenceState.loading=true;
  if(msg)msg.textContent='Chargement des absences...';
  try{
    await loadAbsenceCache();
    renderAbsences();
    if(msg)msg.textContent='';
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger les absences.';
    toast('Erreur de chargement des absences.');
  }finally{
    absenceState.loading=false;
  }
}

function absenceFilteredRows(includeArchive=false){
  const query=(document.getElementById('absenceSearch')?.value||'').trim().toLowerCase();
  const filter=document.getElementById('absenceStatusFilter')?.value||'open';
  const now=new Date();

  return absenceState.rows
    .map(row=>{
      const status=absenceStatus(row,now);
      const garde=absenceNameForUser(row.user_id);
      return {...row,status,name:garde.name,grade:garde.grade,garde:garde.garde};
    })
    .filter(row=>{
      if(includeArchive&&row.status!=='past')return false;
      if(!includeArchive){
        if(filter==='open'&&row.status==='past')return false;
        if(filter!=='open'&&filter!=='all'&&row.status!==filter)return false;
        if(filter==='past'&&row.status!=='past')return false;
      }
      const haystack=[row.name,row.grade,row.reason_hrp,row.reason_rp].filter(Boolean).join(' ').toLowerCase();
      return !query||haystack.includes(query);
    })
    .sort((a,b)=>{
      const order={active:0,upcoming:1,past:2};
      if(order[a.status]!==order[b.status])return order[a.status]-order[b.status];
      return new Date(a.starts_at)-new Date(b.starts_at);
    });
}

function canManageAbsence(row){
  if(!session)return false;
  if(session.isSuperadmin||canEditSection('absences'))return true;
  return row?.user_id===session.user.id||row?.created_by===session.user.id;
}

function renderAbsenceActions(row){
  if(!canManageAbsence(row))return '—';
  return `
    <button class="btn-del" onclick="editAbsence('${absenceEsc(row.id)}')">Modifier</button>
    <button class="btn-del" onclick="deleteAbsence('${absenceEsc(row.id)}')">Supprimer</button>
  `;
}

function renderAbsenceRow(row, archive=false){
  const status=row.status||absenceStatus(row);
  return `
    <tr data-search="${absenceEsc([row.name,row.grade,row.reason_hrp,row.reason_rp].filter(Boolean).join(' ').toLowerCase())}">
      <td class="cell-name">
        ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}
        <strong>${absenceEsc(row.name)}</strong>
        <span>${absenceEsc(row.grade)}</span>
      </td>
      <td>${absenceEsc(absenceDate(row.starts_at))}<br><span class="sa-muted">au ${absenceEsc(absenceDate(row.ends_at))}</span></td>
      <td>${absenceEsc(absenceDuration(row.starts_at,row.ends_at))}</td>
      <td>${absenceEsc(row.reason_hrp||'—')}</td>
      <td>${absenceEsc(row.reason_rp||'—')}</td>
      ${archive?'':`<td><span class="presence-log-status ${absenceStatusClass(status)}">${absenceEsc(absenceStatusLabel(status))}</span></td>`}
      <td class="act">${renderAbsenceActions(row)}</td>
    </tr>
  `;
}

function renderAbsences(){
  const now=new Date();
  const active=absenceState.rows.filter(row=>absenceStatus(row,now)==='active');
  const upcoming=absenceState.rows.filter(row=>absenceStatus(row,now)==='upcoming');
  const past=absenceState.rows.filter(row=>absenceStatus(row,now)==='past');
  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  setText('absenceActiveCount',`En cours : ${active.length}`);
  setText('absenceUpcomingCount',`À venir : ${upcoming.length}`);
  setText('absenceArchivedCount',`Terminées : ${past.length}`);

  const tbody=document.getElementById('absenceBody');
  if(tbody){
    const rows=absenceFilteredRows(false).filter(row=>row.status!=='past');
    tbody.innerHTML=rows.map(row=>renderAbsenceRow(row,false)).join('');
    if(!rows.length)tbody.innerHTML='<tr><td colspan="7" class="sa-empty">Aucune absence en cours ou à venir.</td></tr>';
  }

  const archive=document.getElementById('absenceArchiveBody');
  if(archive){
    const rows=absenceFilteredRows(true).reverse();
    archive.innerHTML=rows.map(row=>renderAbsenceRow(row,true)).join('');
    if(!rows.length)archive.innerHTML='<tr><td colspan="6" class="sa-empty">Aucune absence terminée.</td></tr>';
  }

  renderPresenceAbsenceSummary();
}

function filterAbsences(){
  renderAbsences();
}

function toggleAbsenceArchive(){
  absenceState.archiveOpen=!absenceState.archiveOpen;
  const wrap=document.getElementById('absenceArchiveWrap');
  if(wrap)wrap.style.display=absenceState.archiveOpen?'block':'none';
}

function updateAbsenceDurationPreview(){
  const start=absenceFromLocalInput(document.getElementById('absenceStart')?.value||'');
  const end=absenceFromLocalInput(document.getElementById('absenceEnd')?.value||'');
  const el=document.getElementById('absenceDurationPreview');
  if(!el)return;
  if(!start||!end){el.textContent='Durée : —';return;}
  el.textContent=`Durée : ${absenceDuration(start,end)}`;
}

function resetAbsenceForm(){
  absenceState.editId=null;
  ['absenceStart','absenceEnd','absenceReasonHrp','absenceReasonRp'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  const submit=document.getElementById('absenceSubmitBtn');
  const cancel=document.getElementById('absenceCancelEditBtn');
  if(submit)submit.textContent='Déclarer l\'absence';
  if(cancel)cancel.style.display='none';
  updateAbsenceDurationPreview();
}

function cancelAbsenceEdit(){
  resetAbsenceForm();
}

function editAbsence(id){
  const row=absenceState.rows.find(item=>String(item.id)===String(id));
  if(!row||!canManageAbsence(row)){toast('Modification refusée.');return;}
  absenceState.editId=row.id;
  const start=document.getElementById('absenceStart');
  const end=document.getElementById('absenceEnd');
  const hrp=document.getElementById('absenceReasonHrp');
  const rp=document.getElementById('absenceReasonRp');
  if(start)start.value=absenceToLocalInput(row.starts_at);
  if(end)end.value=absenceToLocalInput(row.ends_at);
  if(hrp)hrp.value=row.reason_hrp||'';
  if(rp)rp.value=row.reason_rp||'';
  const submit=document.getElementById('absenceSubmitBtn');
  const cancel=document.getElementById('absenceCancelEditBtn');
  if(submit)submit.textContent='Mettre à jour l\'absence';
  if(cancel)cancel.style.display='';
  updateAbsenceDurationPreview();
  document.getElementById('absenceFormCard')?.scrollIntoView({behavior:'smooth',block:'start'});
}

async function saveAbsence(){
  if(!session)return;
  const starts_at=absenceFromLocalInput(document.getElementById('absenceStart')?.value||'');
  const ends_at=absenceFromLocalInput(document.getElementById('absenceEnd')?.value||'');
  const reason_hrp=(document.getElementById('absenceReasonHrp')?.value||'').trim()||null;
  const reason_rp=(document.getElementById('absenceReasonRp')?.value||'').trim()||null;
  if(!starts_at||!ends_at){toast('Début et fin requis.');return;}
  if(new Date(ends_at)<=new Date(starts_at)){toast('La fin doit être après le début.');return;}

  try{
    const payload={starts_at,ends_at,reason_hrp,reason_rp};
    const isEdit=!!absenceState.editId;
    let error;
    let createdId=null;
    if(isEdit){
      const result=await window.GrimoireSupabase
        .from('mk_absences')
        .update({...payload,updated_at:new Date().toISOString()})
        .eq('id',absenceState.editId);
      error=result.error;
    }else{
      const result=await window.GrimoireSupabase
        .from('mk_absences')
        .insert({...payload,user_id:session.user.id,created_by:session.user.id})
        .select('id')
        .single();
      error=result.error;
      createdId=result.data?.id||null;
    }
    if(error)throw error;
    if(!isEdit&&createdId)await notifyAbsenceCreated(createdId);
    resetAbsenceForm();
    await loadAbsences();
    if(typeof loadGardes==='function')await loadGardes();
    toast(isEdit?'Absence mise à jour.':'Absence déclarée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de l\'enregistrement de l\'absence.');
  }
}

async function notifyAbsenceCreated(absenceId){
  try{
    const { error } = await window.GrimoireSupabase
      .rpc('mk_notify_absence_created',{p_absence_id:absenceId});
    if(error)throw error;
  }catch(error){
    console.warn('[Discord] Notification absence non envoyée.', error);
  }
}

async function deleteAbsence(id){
  const row=absenceState.rows.find(item=>String(item.id)===String(id));
  if(!row||!canManageAbsence(row)){toast('Suppression refusée.');return;}
  if(!confirm('Supprimer cette absence ?'))return;
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_absences')
      .delete()
      .eq('id',id);
    if(error)throw error;
    await loadAbsences();
    if(typeof loadGardes==='function')await loadGardes();
    toast('Absence supprimée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la suppression.');
  }
}

function renderPresenceAbsenceSummary(){
  const el=document.getElementById('presenceAbsenceSummary');
  if(!el||!session?.user?.id)return;
  const active=absenceActiveForUser(session.user.id);
  const upcoming=absenceUpcomingForUser(session.user.id);
  const rows=[
    ['Absence en cours',active?`jusqu'au ${absenceDate(active.ends_at)}`:'Aucune'],
    ['Prochaine absence',upcoming?`${absenceDate(upcoming.starts_at)} au ${absenceDate(upcoming.ends_at)}`:'Aucune'],
    ['Absences déclarées',String(absenceState.rows.filter(row=>row.user_id===session.user.id).length)],
  ];
  el.innerHTML=rows.map(([label,value])=>`
    <div class="presence-summary-item">
      <strong>${absenceEsc(value)}</strong>
      <span>${absenceEsc(label)}</span>
    </div>
  `).join('');
}
