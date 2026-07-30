// ══════════════════════════════════════════════════════════════════════
//  PATROUILLES
// ══════════════════════════════════════════════════════════════════════
const patrouilleState={
  loaded:false,
  rows:[],
  members:[],
  guards:[],
  selectedMemberIds:[],
  editingId:null,
  editingMemberIds:[],
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

function patrouilleGuardStatus(row,currentPatrouilleId=''){
  const active=activePatrouilleForUser(row.user_id);
  if(active&&active.id===currentPatrouilleId)return 'dans cette sortie';
  if(active)return `dehors : ${active.location||active.title||'patrouille'}`;
  return row.is_active?'présent':'off';
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


function togglePatrouilleForm(){
  const form = document.getElementById('patrouilleCreateForm');
  const btn  = document.getElementById('patrouilleCreateBtn');
  if(!form||!btn) return;
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : '';
  btn.textContent = visible ? '+ Nouvelle patrouille' : '✕ Annuler';
}


function togglePatrouilleHistory(){
  const list   = document.getElementById('patrouilleHistoryList');
  const chevron= document.getElementById('patrouilleHistoryChevron');
  if(!list) return;
  const visible = list.style.display !== 'none';
  list.style.display = visible ? 'none' : '';
  if(chevron) chevron.textContent = visible ? '▶' : '▼';
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
        const status=patrouilleGuardStatus(row);
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
    const status=patrouilleGuardStatus(row);
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

function renderEditPatrouilleGuardSelect(row){
  const select=document.getElementById(`patrouilleEditMemberPicker-${row.id}`);
  const selected=document.getElementById(`patrouilleEditSelectedMembers-${row.id}`);
  const selectedIds=new Set(patrouilleState.editingMemberIds);

  if(select){
    const rows=sortedPatrouilleGuards().filter(guard=>!selectedIds.has(guard.user_id));
    select.innerHTML=[
      '<option value="">Ajouter un garde...</option>',
      ...rows.map(guard=>{
        const status=patrouilleGuardStatus(guard,row.id);
        return `<option value="${patrouilleEsc(guard.user_id)}">${patrouilleEsc(patrouilleGuardName(guard))}${guard.grade?` — ${patrouilleEsc(guard.grade)}`:''} (${patrouilleEsc(status)})</option>`;
      }),
    ].join('');
    select.value='';
  }

  if(!selected)return;
  const rows=patrouilleState.editingMemberIds
    .map(userId=>patrouilleGuard(userId))
    .filter(Boolean);

  selected.innerHTML=rows.map(guard=>{
    const status=patrouilleGuardStatus(guard,row.id);
    return `<button type="button" class="patrouille-selected-guard" onclick="removeEditPatrouilleMember('${patrouilleEsc(guard.user_id)}')" title="Retirer ${patrouilleEsc(patrouilleGuardName(guard))}">
      <span>${typeof renderPresenceDot==='function'?renderPresenceDot(guard.user_id):''}${patrouilleEsc(patrouilleGuardName(guard))}${guard.grade?` — ${patrouilleEsc(guard.grade)}`:''} <small>${patrouilleEsc(status)}</small></span>
      <strong aria-hidden="true">×</strong>
    </button>`;
  }).join('')||'<p class="sa-empty">Aucun garde ajouté.</p>';
}

function addEditPatrouilleMember(userId){
  if(!userId||!patrouilleGuard(userId))return;
  if(!patrouilleState.editingMemberIds.includes(userId)){
    patrouilleState.editingMemberIds.push(userId);
  }
  const row=patrouilleState.rows.find(item=>item.id===patrouilleState.editingId);
  if(row)renderEditPatrouilleGuardSelect(row);
}

function removeEditPatrouilleMember(userId){
  patrouilleState.editingMemberIds=patrouilleState.editingMemberIds.filter(id=>id!==userId);
  const row=patrouilleState.rows.find(item=>item.id===patrouilleState.editingId);
  if(row)renderEditPatrouilleGuardSelect(row);
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

  const activeRows = rows.filter(row=>row.status==='active'&&!row.ended_at);
  const closedRows = rows.filter(row=>row.status!=='active'||row.ended_at);

  const activeHtml = activeRows.map(row=>{
    const members=patrouilleMembers(row);
    const creator=patrouilleGuard(row.created_by);
    const active=row.status==='active'&&!row.ended_at;
    const editing=active&&patrouilleState.editingId===row.id&&canManagePatrouille(row);
    if(editing)return buildPatrouilleEditCard(row,members,creator);
    return `<article class="patrouille-card ${active?'active':'closed'}">
      <div class="patrouille-card-head">
        <div>
          <span class="patrouille-status">${active?'En cours':'Terminée'}</span>
          <h3>${patrouilleEsc(row.title||'Patrouille')}</h3>
        </div>
        <div class="patrouille-card-actions">
          ${active&&canManagePatrouille(row)?`<button class="btn-sm" onclick="openEditPatrouille('${patrouilleEsc(row.id)}')">Modifier</button>`:''}
          ${active&&canManagePatrouille(row)?`<button class="btn-submit" onclick="openClosePatrouille('${patrouilleEsc(row.id)}')">Clôturer</button>`:''}
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
      ${active&&canManagePatrouille(row)?`
      <div id="patrouille-close-form-${row.id}" class="patrouille-close-form" style="display:none;">
        <textarea id="patrouilleCloseNotes-${row.id}" rows="3" placeholder="Rapport de retour (optionnel)…" style="width:100%;font-family:'IM Fell English',serif;font-size:.92rem;background:var(--parch-dark);border:1px solid var(--border-g);color:var(--ink);padding:.4rem .6rem;resize:vertical;"></textarea>
        <div style="display:flex;gap:.5rem;margin-top:.4rem;justify-content:flex-end;">
          <button class="btn-sm" onclick="openClosePatrouille('${patrouilleEsc(row.id)}')">Annuler</button>
          <button class="btn-submit" onclick="closePatrouille('${patrouilleEsc(row.id)}')">Confirmer la clôture</button>
        </div>
      </div>`:''
      }
    </article>`;
  }).join('');

  const closedHtml = closedRows.map(row=>{
    const members=patrouilleMembers(row);
    const creator=patrouilleGuard(row.created_by);
    return `<article class="patrouille-card closed">
      <div class="patrouille-card-head">
        <div>
          <span class="patrouille-status">Terminée</span>
          <h3>${patrouilleEsc(row.title||'Patrouille')}</h3>
        </div>
      </div>
      <dl class="profile-details patrouille-details">
        <dt>Lieu</dt><dd>${patrouilleEsc(row.location||'—')}</dd>
        <dt>Départ</dt><dd>${patrouilleEsc(patrouilleDate(row.started_at))}</dd>
        <dt>Durée</dt><dd>${patrouilleEsc(patrouilleElapsed(row.started_at,row.ended_at))}</dd>
        <dt>Responsable</dt><dd>${patrouilleEsc(creator?`${patrouilleGuardName(creator)}${patrouilleGuardMeta(creator)?` — ${patrouilleGuardMeta(creator)}`:''}`:'Compte inconnu')}</dd>
      </dl>
      <p class="patrouille-objective">${patrouilleEsc(row.objective||'')}</p>
      <div class="patrouille-members">
        ${members.map(member=>{const guard=patrouilleGuard(member.user_id);return `<span>${typeof renderPresenceDot==='function'?renderPresenceDot(member.user_id):''}${patrouilleEsc(patrouilleGuardName(guard))}</span>`;}).join('')||'<span>Aucun membre</span>'}
      </div>
      ${row.notes?`<p class="patrouille-notes">${patrouilleEsc(row.notes)}</p>`:''}
    </article>`;
  }).join('');

  const historiquesHtml = closedRows.length ? `
    <div class="patrouille-history-wrap">
      <button class="patrouille-history-toggle" onclick="togglePatrouilleHistory()">
        <span id="patrouilleHistoryChevron">▶</span> Historique des patrouilles (${closedRows.length})
      </button>
      <div id="patrouilleHistoryList" style="display:none;">${closedHtml}</div>
    </div>` : '';

  list.innerHTML = activeHtml + historiquesHtml;

  const editingRow=rows.find(row=>row.id===patrouilleState.editingId);
  if(editingRow)renderEditPatrouilleGuardSelect(editingRow);

  if(!rows.length)list.innerHTML='<p class="sa-empty">Aucune patrouille enregistrée.</p>';
}

function buildPatrouilleEditCard(row,members,creator){
  const duration=row.planned_duration_minutes??'';
  return `<article class="patrouille-card active editing">
    <div class="patrouille-card-head">
      <div>
        <span class="patrouille-status">Modification en cours</span>
        <h3>${patrouilleEsc(row.title||'Patrouille')}</h3>
      </div>
      <div class="patrouille-card-actions">
        <button class="btn-sm" onclick="cancelEditPatrouille()">Annuler</button>
        <button class="btn-submit" onclick="savePatrouilleEdit('${patrouilleEsc(row.id)}')">Enregistrer</button>
      </div>
    </div>
    <div class="form-grid patrouille-form-grid patrouille-edit-grid">
      <div class="patrouille-edit-readonly">
        <div class="patrouille-edit-readonly-row"><strong>Titre :</strong> ${patrouilleEsc(row.title||'Patrouille')}</div>
        <div class="patrouille-edit-readonly-row"><strong>Lieu :</strong> ${patrouilleEsc(row.location||'—')}</div>
        <div class="patrouille-edit-readonly-row"><strong>Objectif :</strong> ${patrouilleEsc(row.objective||'—')}</div>
      </div>
      <label class="form-field patrouille-members-field">
        <span>Gardes</span>
        <select id="patrouilleEditMemberPicker-${row.id}" onchange="addEditPatrouilleMember(this.value)"></select>
        <div class="patrouille-selected-members" id="patrouilleEditSelectedMembers-${row.id}"></div>
      </label>
      <label class="form-field patrouille-notes-field">
        <span>Notes de mission</span>
        <textarea id="patrouilleEditNotes-${row.id}" rows="3" placeholder="Notes optionnelles...">${patrouilleEsc(row.notes||'')}</textarea>
      </label>
    </div>
    <dl class="profile-details patrouille-details">
      <dt>Départ</dt><dd>${patrouilleEsc(patrouilleDate(row.started_at))}</dd>
      <dt>Temps dehors</dt><dd>${patrouilleEsc(patrouilleElapsed(row.started_at,row.ended_at))}</dd>
      <dt>Responsable</dt><dd>${patrouilleEsc(creator?`${patrouilleGuardName(creator)}${patrouilleGuardMeta(creator)?` — ${patrouilleGuardMeta(creator)}`:''}`:'Compte inconnu')}</dd>
      <dt>Membres actuels</dt><dd>${members.length}</dd>
    </dl>
  </article>`;
}

function openEditPatrouille(id){
  const row=patrouilleState.rows.find(item=>item.id===id);
  if(!row||row.status!=='active'||row.ended_at||!canManagePatrouille(row)){toast('Modification refusée.');return;}
  patrouilleState.editingId=id;
  patrouilleState.editingMemberIds=patrouilleMembers(row).map(member=>member.user_id).filter(userId=>patrouilleGuard(userId));
  renderPatrouilleList();
  renderEditPatrouilleGuardSelect(row);
}

function cancelEditPatrouille(){
  patrouilleState.editingId=null;
  patrouilleState.editingMemberIds=[];
  renderPatrouilleList();
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

function openClosePatrouille(id){
  // Affiche le formulaire de clôture inline dans la carte
  const el = document.getElementById(`patrouille-close-form-${id}`);
  if(el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function closePatrouille(id){
  const row = patrouilleState.rows.find(item=>item.id===id);
  if(!row||!canManagePatrouille(row)){toast('Clôture refusée.');return;}
  const notesEl = document.getElementById(`patrouilleCloseNotes-${id}`);
  const notes   = notesEl ? notesEl.value.trim() : '';
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_patrouilles')
      .update({status:'closed',ended_at:new Date().toISOString(),notes:notes||null})
      .eq('id',id);
    if(error)throw error;
    await loadPatrouilles();
    toast('Patrouille clôturée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la clôture.');
  }
}

async function savePatrouilleEdit(id){
  const row=patrouilleState.rows.find(item=>item.id===id);
  if(!row||row.status!=='active'||row.ended_at||!canManagePatrouille(row)){toast('Modification refusée.');return;}

  const notes=(document.getElementById(`patrouilleEditNotes-${id}`)?.value||'').trim();
  const memberIds=[...new Set(patrouilleState.editingMemberIds.filter(userId=>patrouilleGuard(userId)))];

  if(!memberIds.length){toast('Ajoute au moins un garde.');return;}

  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_patrouilles')
      .update({ notes:notes||null })
      .eq('id',id);
    if(error)throw error;

    const currentIds=patrouilleMembers(row).map(member=>member.user_id);
    const toAdd=memberIds.filter(userId=>!currentIds.includes(userId));
    const toRemove=currentIds.filter(userId=>!memberIds.includes(userId));

    if(toAdd.length){
      const rows=toAdd.map(userId=>({patrouille_id:id,user_id:userId}));
      const { error:insertError } = await window.GrimoireSupabase
        .from('mk_patrouille_members')
        .insert(rows);
      if(insertError)throw insertError;
    }

    if(toRemove.length){
      const { error:deleteError } = await window.GrimoireSupabase
        .from('mk_patrouille_members')
        .delete()
        .eq('patrouille_id',id)
        .in('user_id',toRemove);
      if(deleteError)throw deleteError;
    }

    patrouilleState.editingId=null;
    patrouilleState.editingMemberIds=[];
    await loadPatrouilles();
    toast('Patrouille modifiée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la modification.');
  }
}
