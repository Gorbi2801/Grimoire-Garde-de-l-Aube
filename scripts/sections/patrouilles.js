// ══════════════════════════════════════════════════════════════════════
//  PATROUILLES
// ══════════════════════════════════════════════════════════════════════
const patrouilleState={
  loaded:false,
  rows:[],
  members:[],
  guards:[],
  selectedMemberIds:[],
};

function patrouilleEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function patrouilleDate(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
}

function patrouilleDuration(minutes){
  const total=Math.max(0,Math.floor(Number(minutes)||0));
  if(!total)return 'Durée libre';
  const hours=Math.floor(total/60);
  const mins=total%60;
  if(!hours)return `${mins} min`;
  return mins?`${hours} h ${String(mins).padStart(2,'0')}`:`${hours} h`;
}

function patrouilleElapsed(startValue,endValue){
  const start=new Date(startValue);
  const end=endValue?new Date(endValue):new Date();
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return '—';
  return patrouilleDuration(Math.floor(Math.max(0,end-start)/60000));
}

function patrouilleGuardName(row){
  if(!row)return 'Compte inconnu';
  return [row.prenom,row.nom].filter(Boolean).join(' ')||row.display_name||row.username||'Compte';
}

function patrouilleGuardMeta(row){
  return row?.grade||row?.username||'';
}

function patrouilleGuard(userId){
  return patrouilleState.guards.find(row=>row.user_id===userId)||null;
}

function sortedPatrouilleGuards(){
  return patrouilleState.guards
    .filter(row=>row.user_id)
    .sort((a,b)=>{
      const activeDiff=Number(b.is_active===true)-Number(a.is_active===true);
      if(activeDiff)return activeDiff;
      return patrouilleGuardName(a).localeCompare(patrouilleGuardName(b),'fr');
    });
}

function patrouilleMembers(row){
  return patrouilleState.members.filter(member=>member.patrouille_id===row.id);
}

function activePatrouilles(){
  return patrouilleState.rows.filter(row=>row.status==='active'&&!row.ended_at);
}

function activePatrouilleForUser(userId){
  const activeIds=new Set(activePatrouilles().map(row=>row.id));
  const member=patrouilleState.members.find(row=>row.user_id===userId&&activeIds.has(row.patrouille_id));
  return member?patrouilleState.rows.find(row=>row.id===member.patrouille_id):null;
}

function canManagePatrouille(row){
  return !!session&&(session.isSuperadmin||row.created_by===session.user.id||canEditSection('patrouilles'));
}

async function loadPatrouilles(){
  if(!session)return;
  const msg=document.getElementById('patrouilleMsg');
  if(msg)msg.textContent='Chargement des patrouilles...';

  try{
    const [patrouillesResult,membersResult,guardsResult]=await Promise.all([
      window.GrimoireSupabase
        .from('mk_patrouilles')
        .select('id,created_by,title,location,objective,planned_duration_minutes,status,started_at,ended_at,notes,created_at')
        .order('created_at',{ascending:false})
        .limit(120),
      window.GrimoireSupabase
        .from('mk_patrouille_members')
        .select('patrouille_id,user_id,joined_at')
        .order('joined_at',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_presence_summary')
        .select('user_id,username,display_name,prenom,nom,grade,is_active,active_since,last_seen_at')
        .order('display_name',{ascending:true}),
    ]);

    if(patrouillesResult.error)throw patrouillesResult.error;
    if(membersResult.error)throw membersResult.error;
    if(guardsResult.error)throw guardsResult.error;

    patrouilleState.rows=patrouillesResult.data||[];
    patrouilleState.members=membersResult.data||[];
    patrouilleState.guards=(guardsResult.data||[]).filter(row=>row.user_id);
    const availableIds=new Set(patrouilleState.guards.map(row=>row.user_id));
    patrouilleState.selectedMemberIds=patrouilleState.selectedMemberIds.filter(userId=>availableIds.has(userId));
    patrouilleState.loaded=true;
    renderPatrouilles();
    if(msg)msg.textContent='';
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger les patrouilles.';
    toast('Erreur de chargement des patrouilles.');
  }
}

function renderPatrouilles(){
  renderPatrouilleStats();
  renderPatrouilleGuardSelect();
  renderPatrouilleBoard();
  renderPatrouilleList();
}

function renderPatrouilleStats(){
  const active=activePatrouilles();
  const outsideIds=new Set(patrouilleState.members
    .filter(member=>active.some(row=>row.id===member.patrouille_id))
    .map(member=>member.user_id));
  const connectedOutside=[...outsideIds].filter(userId=>patrouilleGuard(userId)?.is_active===true).length;
  const connectedFort=patrouilleState.guards.filter(row=>row.is_active===true&&!outsideIds.has(row.user_id)).length;
  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  setText('patrouilleActiveCount',`Sorties actives : ${active.length}`);
  setText('patrouilleOutsideCount',`Dehors : ${outsideIds.size}`);
  setText('patrouilleConnectedOutsideCount',`Connectés dehors : ${connectedOutside}`);
  setText('patrouilleAvailableCount',`Présents au fort : ${connectedFort}`);
}

function renderPatrouilleGuardSelect(){
  const select=document.getElementById('patrouilleMemberPicker');
  const selected=document.getElementById('patrouilleSelectedMembers');
  const selectedIds=new Set(patrouilleState.selectedMemberIds);

  if(select){
    const rows=sortedPatrouilleGuards().filter(row=>!selectedIds.has(row.user_id));
    select.innerHTML=[
      '<option value="">Ajouter un garde...</option>',
      ...rows.map(row=>{
        const active=activePatrouilleForUser(row.user_id);
        const status=active?`dehors : ${active.location||active.title||'patrouille'}`:(row.is_active?'présent':'off');
        return `<option value="${patrouilleEsc(row.user_id)}">${patrouilleEsc(patrouilleGuardName(row))}${row.grade?` — ${patrouilleEsc(row.grade)}`:''} (${patrouilleEsc(status)})</option>`;
      }),
    ].join('');
    select.value='';
  }

  if(!selected)return;
  const rows=patrouilleState.selectedMemberIds
    .map(userId=>patrouilleGuard(userId))
    .filter(Boolean);

  selected.innerHTML=rows.map(row=>{
    const active=activePatrouilleForUser(row.user_id);
    const status=active?`dehors : ${active.location||active.title||'patrouille'}`:(row.is_active?'présent':'off');
    return `<button type="button" class="patrouille-selected-guard" onclick="removePatrouilleMember('${patrouilleEsc(row.user_id)}')" title="Retirer ${patrouilleEsc(patrouilleGuardName(row))}">
      <span>${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}${patrouilleEsc(patrouilleGuardName(row))}${row.grade?` — ${patrouilleEsc(row.grade)}`:''} <small>${patrouilleEsc(status)}</small></span>
      <strong aria-hidden="true">×</strong>
    </button>`;
  }).join('')||'<p class="sa-empty">Aucun garde ajouté.</p>';
}

function addPatrouilleMember(userId){
  if(!userId||!patrouilleGuard(userId))return;
  if(!patrouilleState.selectedMemberIds.includes(userId)){
    patrouilleState.selectedMemberIds.push(userId);
  }
  renderPatrouilleGuardSelect();
}

function removePatrouilleMember(userId){
  patrouilleState.selectedMemberIds=patrouilleState.selectedMemberIds.filter(id=>id!==userId);
  renderPatrouilleGuardSelect();
}

function renderPatrouilleBoard(){
  const board=document.getElementById('patrouilleBoard');
  if(!board)return;
  const activeIds=new Set(activePatrouilles().map(row=>row.id));
  const outsideIds=new Set(patrouilleState.members
    .filter(member=>activeIds.has(member.patrouille_id))
    .map(member=>member.user_id));

  const groups=[
    {
      title:'Présents au fort',
      rows:patrouilleState.guards.filter(row=>row.is_active===true&&!outsideIds.has(row.user_id)),
      empty:'Aucun garde présent disponible.',
    },
    {
      title:'En sortie',
      rows:patrouilleState.guards.filter(row=>outsideIds.has(row.user_id)),
      empty:'Aucun garde dehors.',
    },
  ];

  board.innerHTML=groups.map(group=>`
    <div class="patrouille-roster-card">
      <div class="profile-title">${patrouilleEsc(group.title)}</div>
      <div class="patrouille-roster">
        ${group.rows.map(row=>{
          const active=activePatrouilleForUser(row.user_id);
          return `<div class="patrouille-guard ${active?'outside':'available'}">
            ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}
            <span>
              <strong>${patrouilleEsc(patrouilleGuardName(row))}</strong>
              <small>${patrouilleEsc(active?`${active.location||active.title||'Patrouille'} · ${patrouilleElapsed(active.started_at,null)}`:patrouilleGuardMeta(row))}</small>
            </span>
          </div>`;
        }).join('')||`<p class="sa-empty">${patrouilleEsc(group.empty)}</p>`}
      </div>
    </div>
  `).join('');
}

function renderPatrouilleList(){
  const list=document.getElementById('patrouilleList');
  if(!list)return;
  const rows=patrouilleState.rows.slice().sort((a,b)=>{
    const activeDiff=Number(b.status==='active')-Number(a.status==='active');
    if(activeDiff)return activeDiff;
    return String(b.created_at||'').localeCompare(String(a.created_at||''));
  });

  list.innerHTML=rows.map(row=>{
    const members=patrouilleMembers(row);
    const creator=patrouilleGuard(row.created_by);
    const active=row.status==='active'&&!row.ended_at;
    return `<article class="patrouille-card ${active?'active':'closed'}">
      <div class="patrouille-card-head">
        <div>
          <span class="patrouille-status">${active?'En cours':'Terminée'}</span>
          <h3>${patrouilleEsc(row.title||'Patrouille')}</h3>
        </div>
        <div class="patrouille-card-actions">
          ${active&&canManagePatrouille(row)?`<button class="btn-submit" onclick="closePatrouille('${patrouilleEsc(row.id)}')">Clôturer</button>`:''}
        </div>
      </div>
      <dl class="profile-details patrouille-details">
        <dt>Lieu</dt><dd>${patrouilleEsc(row.location||'—')}</dd>
        <dt>Départ</dt><dd>${patrouilleEsc(patrouilleDate(row.started_at))}</dd>
        <dt>Durée prévue</dt><dd>${patrouilleEsc(patrouilleDuration(row.planned_duration_minutes))}</dd>
        <dt>Temps dehors</dt><dd>${patrouilleEsc(patrouilleElapsed(row.started_at,row.ended_at))}</dd>
        <dt>Responsable</dt><dd>${patrouilleEsc(creator?`${patrouilleGuardName(creator)}${patrouilleGuardMeta(creator)?` — ${patrouilleGuardMeta(creator)}`:''}`:'Compte inconnu')}</dd>
      </dl>
      <p class="patrouille-objective">${patrouilleEsc(row.objective||'Aucun objectif renseigné.')}</p>
      <div class="patrouille-members">
        ${members.map(member=>{
          const guard=patrouilleGuard(member.user_id);
          return `<span>${typeof renderPresenceDot==='function'?renderPresenceDot(member.user_id):''}${patrouilleEsc(patrouilleGuardName(guard))}</span>`;
        }).join('')||'<span>Aucun membre</span>'}
      </div>
      ${row.notes?`<p class="patrouille-notes">${patrouilleEsc(row.notes)}</p>`:''}
    </article>`;
  }).join('');

  if(!rows.length)list.innerHTML='<p class="sa-empty">Aucune patrouille enregistrée.</p>';
}

function selectedPatrouilleMemberIds(){
  return patrouilleState.selectedMemberIds.filter(userId=>patrouilleGuard(userId));
}

function selectPresentPatrouilleGuards(){
  patrouilleState.selectedMemberIds=sortedPatrouilleGuards()
    .filter(guard=>guard.is_active===true&&!activePatrouilleForUser(guard.user_id))
    .map(guard=>guard.user_id);
  renderPatrouilleGuardSelect();
}

async function createPatrouille(){
  if(!session)return;
  const title=(document.getElementById('patrouilleTitle')?.value||'').trim();
  const location=(document.getElementById('patrouilleLocation')?.value||'').trim();
  const objective=(document.getElementById('patrouilleObjective')?.value||'').trim();
  const durationValue=(document.getElementById('patrouilleDuration')?.value||'').trim();
  const plannedDuration=durationValue?Math.max(0,parseInt(durationValue,10)||0):null;
  const memberIds=[...new Set([session.user.id,...selectedPatrouilleMemberIds()])];

  if(!location){toast('Lieu requis.');return;}
  if(!objective){toast('Objectif requis.');return;}

  try{
    const { data, error } = await window.GrimoireSupabase
      .from('mk_patrouilles')
      .insert({
        created_by:session.user.id,
        title:title||'Patrouille',
        location,
        objective,
        planned_duration_minutes:plannedDuration,
      })
      .select('id')
      .single();
    if(error)throw error;

    const rows=memberIds.map(userId=>({patrouille_id:data.id,user_id:userId}));
    const { error:membersError } = await window.GrimoireSupabase
      .from('mk_patrouille_members')
      .insert(rows);
    if(membersError)throw membersError;

    ['patrouilleTitle','patrouilleLocation','patrouilleObjective','patrouilleDuration'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.value='';
    });
    patrouilleState.selectedMemberIds=[];

    await loadPatrouilles();
    toast('Patrouille ouverte.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la création de la patrouille.');
  }
}

async function closePatrouille(id){
  const row=patrouilleState.rows.find(item=>item.id===id);
  if(!row||!canManagePatrouille(row)){toast('Clôture refusée.');return;}
  const notes=window.prompt('Rapport de retour optionnel :', row.notes||'');
  if(notes===null)return;
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_patrouilles')
      .update({status:'closed',ended_at:new Date().toISOString(),notes:notes.trim()||null})
      .eq('id',id);
    if(error)throw error;
    await loadPatrouilles();
    toast('Patrouille clôturée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la clôture.');
  }
}
