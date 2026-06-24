// ══════════════════════════════════════════════════════════════════════
//  SUPERADMIN
// ══════════════════════════════════════════════════════════════════════
const superadminState={
  loaded:false,
  gardes:[],
  profiles:[],
  presences:[],
  presenceSummaries:[],
  selectedGardeId:null,
  selectedProfileUserId:null,
};

function isSuperadminSession(){
  return !!session?.isSuperadmin;
}

function saEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function saGardeName(garde){
  if(!garde)return '—';
  return [garde.prenom,garde.nom].filter(Boolean).join(' ')||'—';
}

function saProfileName(profile){
  if(!profile)return 'Aucun compte';
  const display=profile.display_name&&profile.display_name!==profile.username?` — ${profile.display_name}`:'';
  return `${profile.username||'Compte'}${display}`;
}

function saProfileForUser(userId){
  return superadminState.profiles.find(profile=>profile.user_id===userId)||null;
}

function saGardeForUser(userId){
  return superadminState.gardes.find(garde=>garde.user_id===userId)||null;
}

function saSelectedGarde(){
  return superadminState.gardes.find(garde=>garde.id===superadminState.selectedGardeId)||null;
}

async function callSuperadminFunction(action,payload={}){
  const { data, error } = await window.GrimoireSupabase.functions.invoke('admin-users',{
    body:{action,...payload},
  });
  if(error){
    let message=error.message||'Erreur Edge Function.';
    if(error.context?.json){
      try{
        const body=await error.context.json();
        if(body?.error)message=body.error;
      }catch(parseError){
        console.error(parseError);
      }
    }
    throw new Error(message);
  }
  if(data?.error)throw new Error(data.error);
  return data?.result||data;
}

async function loadSuperadmin(){
  if(!isSuperadminSession())return;
  const msg=document.getElementById('superadminMsg');
  if(msg)msg.textContent='Chargement...';
  try{
    const [gardesResult,profilesResult,presencesResult,presenceSummaries]=await Promise.all([
      window.GrimoireSupabase
        .from('mk_gardes')
        .select('id,user_id,prenom,nom,race,grade,specialite,date_recrutement,recruteur')
        .order('nom',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_profiles')
        .select('user_id,username,display_name,is_superadmin,sections,sections_edit')
        .order('username',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_presences')
        .select('id,user_id,started_at,ended_at,created_at')
        .order('started_at',{ascending:false})
        .limit(500),
      typeof loadPresenceSummaries==='function'?loadPresenceSummaries():Promise.resolve([]),
    ]);

    if(gardesResult.error)throw gardesResult.error;
    if(profilesResult.error)throw profilesResult.error;
    if(presencesResult.error)console.warn('Impossible de charger les présences superadmin.', presencesResult.error);

    superadminState.gardes=gardesResult.data||[];
    superadminState.profiles=profilesResult.data||[];
    superadminState.presences=presencesResult.error?[]:(presencesResult.data||[]);
    superadminState.presenceSummaries=presenceSummaries||[];
    superadminState.loaded=true;

    if(superadminState.selectedGardeId&&!saSelectedGarde()){
      superadminState.selectedGardeId=null;
      superadminState.selectedProfileUserId=null;
    }

    renderSuperadmin();
    if(msg)msg.textContent='';
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger les données superadmin.';
    toast('Erreur de chargement superadmin.');
  }
}

function renderSuperadmin(){
  if(!isSuperadminSession())return;
  renderSuperadminStats();
  renderSuperadminGardes();
  renderSuperadminDetail();
  renderSuperadminCreatePermissions();
}

function renderSuperadminStats(){
  const gardes=document.getElementById('superadminGardesCount');
  const profiles=document.getElementById('superadminProfilesCount');
  const linked=document.getElementById('superadminLinkedCount');
  const active=document.getElementById('superadminActiveCount');
  if(gardes)gardes.textContent=`Gardes : ${superadminState.gardes.length}`;
  if(profiles)profiles.textContent=`Comptes : ${superadminState.profiles.length}`;
  if(linked)linked.textContent=`Liés : ${superadminState.gardes.filter(garde=>!!garde.user_id).length}`;
  if(active)active.textContent=`Présents : ${superadminState.presenceSummaries.filter(row=>row.is_active).length}`;
}

function filterSuperadminGardes(){
  renderSuperadminGardes();
}

function renderSuperadminGardes(){
  const tbody=document.getElementById('superadminGardesBody');
  if(!tbody)return;

  const query=(document.getElementById('superadminSearch')?.value||'').trim().toLowerCase();
  const rows=superadminState.gardes.filter(garde=>{
    const profile=saProfileForUser(garde.user_id);
    const haystack=[
      saGardeName(garde),
      garde.race,
      garde.grade,
      garde.specialite,
      profile?.username,
      profile?.display_name,
    ].filter(Boolean).join(' ').toLowerCase();
    return !query||haystack.includes(query);
  });

  tbody.innerHTML=rows.map(garde=>{
    const profile=saProfileForUser(garde.user_id);
    const selected=garde.id===superadminState.selectedGardeId?' class="superadmin-selected-row"':'';
    return `<tr${selected}>
      <td class="cell-name">${typeof renderPresenceDot==='function'?renderPresenceDot(garde.user_id):''}${saEsc(saGardeName(garde))}</td>
      <td class="cell-meta">${garde.grade?`<span class="badge badge-tag">${saEsc(garde.grade)}</span>`:'—'}</td>
      <td class="cell-meta">${profile?saEsc(saProfileName(profile)):'<span class="sa-muted">Non lié</span>'}</td>
      <td class="act"><button class="btn-submit superadmin-row-btn" onclick="selectSuperadminGarde('${saEsc(garde.id)}')">Ouvrir</button></td>
    </tr>`;
  }).join('');

  if(!rows.length){
    tbody.innerHTML='<tr><td colspan="4" class="sa-empty">Aucun garde trouvé.</td></tr>';
  }
}

function selectSuperadminGarde(id){
  if(!isSuperadminSession())return;
  const garde=superadminState.gardes.find(row=>row.id===id);
  if(!garde)return;
  superadminState.selectedGardeId=id;
  superadminState.selectedProfileUserId=garde.user_id||null;
  renderSuperadmin();
}

function selectSuperadminProfile(){
  if(!isSuperadminSession())return;
  superadminState.selectedProfileUserId=document.getElementById('superadminProfileSelect')?.value||null;
  renderSuperadminDetail();
}

function renderSuperadminDetail(){
  const detail=document.getElementById('superadminDetail');
  if(!detail)return;
  const garde=saSelectedGarde();
  if(!garde){
    detail.innerHTML='<div class="profile-title">Fiche sélectionnée</div><p class="sa-muted">Sélectionne un garde dans la liste.</p>';
    return;
  }

  const profile=superadminState.selectedProfileUserId?saProfileForUser(superadminState.selectedProfileUserId):null;
  const linkedProfile=saProfileForUser(garde.user_id);
  detail.innerHTML=`
    <div class="profile-title">Fiche sélectionnée</div>
    <dl class="profile-details superadmin-details">
      <dt>Garde</dt><dd>${saEsc(saGardeName(garde))}</dd>
      <dt>Grade</dt><dd>${saEsc(garde.grade||'—')}</dd>
      <dt>Spécialité</dt><dd>${saEsc(garde.specialite||'—')}</dd>
      <dt>Compte lié</dt><dd>${linkedProfile?saEsc(saProfileName(linkedProfile)):'—'}</dd>
    </dl>

    <div class="superadmin-subtitle">Liaison compte</div>
    <div class="superadmin-link-row">
      <select class="filter-sel" id="superadminProfileSelect" onchange="selectSuperadminProfile()">
        <option value="">Aucun compte lié</option>
        ${superadminState.profiles.map(row=>{
          const otherGarde=saGardeForUser(row.user_id);
          const suffix=otherGarde&&otherGarde.id!==garde.id?` — lié à ${saGardeName(otherGarde)}`:'';
          return `<option value="${saEsc(row.user_id)}" ${row.user_id===superadminState.selectedProfileUserId?'selected':''}>${saEsc(saProfileName(row)+suffix)}</option>`;
        }).join('')}
      </select>
      <button class="btn-submit" onclick="linkSelectedSuperadminProfile()">Relier</button>
      <button class="btn-del" onclick="unlinkSelectedSuperadminGarde()">Délier</button>
    </div>

    ${profile?renderSuperadminProfileEditor(profile):'<p class="sa-muted">Choisis un compte pour modifier ses permissions.</p>'}

    ${renderSuperadminPresence(garde.user_id||superadminState.selectedProfileUserId)}

    <div class="superadmin-danger">
      <div>
        <strong>Suppression</strong>
        <p>La fiche seule garde le compte Auth. La suppression de compte passe par l'Edge Function serveur.</p>
      </div>
      <div class="superadmin-danger-actions">
        <button class="btn-del" onclick="deleteSelectedSuperadminGarde()">Supprimer la fiche</button>
        ${linkedProfile?'<button class="btn-del" onclick="deleteSelectedSuperadminAccount()">Supprimer le compte lié</button>':''}
      </div>
    </div>`;
}

function saPresenceSummaryForUser(userId){
  return superadminState.presenceSummaries.find(row=>row.user_id===userId)||null;
}

function saPresenceRowsForUser(userId){
  return superadminState.presences.filter(row=>row.user_id===userId).slice(0,12);
}

function renderSuperadminPresence(userId){
  if(!userId)return `
    <div class="superadmin-subtitle">Présences</div>
    <p class="sa-muted">Aucun compte lié, donc aucun registre de présence.</p>`;

  const summary=saPresenceSummaryForUser(userId);
  const rows=saPresenceRowsForUser(userId);
  const active=summary?.is_active===true;
  const duration=typeof presenceDuration==='function'?presenceDuration:seconds=>`${Math.floor(Number(seconds||0)/60)} min`;
  const date=typeof presenceDate==='function'?presenceDate:value=>value||'—';

  return `
    <div class="superadmin-subtitle">Présences</div>
    <dl class="profile-details superadmin-details">
      <dt>Statut</dt><dd><span class="presence-status">${typeof renderPresenceDot==='function'?renderPresenceDot(userId):''}${active?'Présent':'Off'}</span></dd>
      <dt>Depuis</dt><dd>${active&&summary?.active_since?saEsc(date(summary.active_since)):'—'}</dd>
      <dt>Dernière présence</dt><dd>${summary?.last_seen_at?saEsc(date(summary.last_seen_at)):'—'}</dd>
      <dt>Aujourd'hui</dt><dd>${duration(summary?.today_seconds||0)}</dd>
      <dt>7 jours</dt><dd>${duration(summary?.week_seconds||0)}</dd>
      <dt>Total</dt><dd>${duration(summary?.total_seconds||0)}</dd>
    </dl>
    <div class="table-wrap presence-admin-log">
      <table>
        <thead>
          <tr>
            <th>Début</th>
            <th>Fin</th>
            <th>Durée</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row=>`
            <tr>
              <td>${saEsc(date(row.started_at))}</td>
              <td>${row.ended_at?saEsc(date(row.ended_at)):'En cours'}</td>
              <td>${duration(typeof presenceSecondsBetween==='function'?presenceSecondsBetween(row.started_at,row.ended_at):0)}</td>
            </tr>
          `).join('')||'<tr><td colspan="3" class="sa-empty">Aucune présence enregistrée.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function renderSuperadminProfileEditor(profile){
  const sections=configuredSections();
  const readSections=Array.isArray(profile.sections)?profile.sections:[];
  const editSections=Array.isArray(profile.sections_edit)?profile.sections_edit:[];
  return `
    <div class="superadmin-subtitle">Profil et permissions</div>
    <div class="form-grid superadmin-form-grid">
      <label class="form-field">
        <span>Nom affiché</span>
        <input id="superadminDisplayName" value="${saEsc(profile.display_name||'')}">
      </label>
      <label class="superadmin-check">
        <input type="checkbox" id="superadminIsSuperadmin" ${profile.is_superadmin?'checked':''}>
        <span>Superadmin</span>
      </label>
    </div>
    <table class="profile-perms superadmin-perms">
      <thead>
        <tr>
          <th>Section</th>
          <th>Lecture</th>
          <th>Édition</th>
        </tr>
      </thead>
      <tbody>
        ${sections.map(section=>`
          <tr>
            <td>${saEsc(SECTION_LABELS[section]||section)}</td>
            <td><input type="checkbox" data-sa-read="${saEsc(section)}" ${readSections.includes(section)?'checked':''}></td>
            <td><input type="checkbox" data-sa-edit="${saEsc(section)}" ${editSections.includes(section)?'checked':''}></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="superadmin-actions">
      <button class="btn-submit" onclick="saveSelectedSuperadminProfile()">Enregistrer le profil</button>
    </div>`;
}

function renderSuperadminCreatePermissions(){
  const tbody=document.getElementById('superadminCreatePerms');
  if(!tbody)return;
  const checkedRead=new Set([...tbody.querySelectorAll('[data-sa-create-read]:checked')].map(input=>input.getAttribute('data-sa-create-read')));
  const checkedEdit=new Set([...tbody.querySelectorAll('[data-sa-create-edit]:checked')].map(input=>input.getAttribute('data-sa-create-edit')));
  tbody.innerHTML=configuredSections().map(section=>`
    <tr>
      <td>${saEsc(SECTION_LABELS[section]||section)}</td>
      <td><input type="checkbox" data-sa-create-read="${saEsc(section)}" ${checkedRead.has(section)?'checked':''}></td>
      <td><input type="checkbox" data-sa-create-edit="${saEsc(section)}" ${checkedEdit.has(section)?'checked':''}></td>
    </tr>
  `).join('');
}

async function linkSelectedSuperadminProfile(){
  if(!isSuperadminSession())return;
  const garde=saSelectedGarde();
  if(!garde)return;
  const userId=document.getElementById('superadminProfileSelect')?.value||null;
  const otherGarde=userId?superadminState.gardes.find(row=>row.user_id===userId&&row.id!==garde.id):null;
  if(otherGarde){
    toast(`Ce compte est déjà lié à ${saGardeName(otherGarde)}.`);
    return;
  }

  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_gardes')
      .update({user_id:userId})
      .eq('id',garde.id);
    if(error)throw error;
    superadminState.selectedProfileUserId=userId;
    await loadSuperadmin();
    toast(userId?'Compte relié.':'Liaison retirée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la liaison.');
  }
}

async function unlinkSelectedSuperadminGarde(){
  const select=document.getElementById('superadminProfileSelect');
  if(select)select.value='';
  superadminState.selectedProfileUserId=null;
  await linkSelectedSuperadminProfile();
}

async function saveSelectedSuperadminProfile(){
  if(!isSuperadminSession())return;
  const profile=superadminState.selectedProfileUserId?saProfileForUser(superadminState.selectedProfileUserId):null;
  if(!profile)return;

  const sections=[...document.querySelectorAll('[data-sa-read]:checked')].map(input=>input.getAttribute('data-sa-read'));
  const editSections=[...document.querySelectorAll('[data-sa-edit]:checked')]
    .map(input=>input.getAttribute('data-sa-edit'))
    .filter(section=>sections.includes(section));
  const displayName=(document.getElementById('superadminDisplayName')?.value||'').trim()||profile.username;
  const isSuperadmin=document.getElementById('superadminIsSuperadmin')?.checked===true;

  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_profiles')
      .update({
        display_name:displayName,
        is_superadmin:isSuperadmin,
        sections,
        sections_edit:editSections,
      })
      .eq('user_id',profile.user_id);
    if(error)throw error;

    if(profile.user_id===session.user?.id){
      await loadSession({silent:true});
    }else{
      await loadSuperadmin();
    }
    toast('Profil mis à jour.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la sauvegarde du profil.');
  }
}

async function deleteSelectedSuperadminGarde(){
  if(!isSuperadminSession())return;
  const garde=saSelectedGarde();
  if(!garde)return;
  if(!confirm(`Supprimer la fiche garde de ${saGardeName(garde)} ? Le compte Auth ne sera pas supprimé.`))return;

  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_gardes')
      .delete()
      .eq('id',garde.id);
    if(error)throw error;
    superadminState.selectedGardeId=null;
    superadminState.selectedProfileUserId=null;
    await loadSuperadmin();
    if(typeof loadGardes==='function')await loadGardes();
    toast('Fiche garde supprimée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la suppression.');
  }
}

function readSuperadminCreateForm(){
  const sections=new Set([...document.querySelectorAll('[data-sa-create-read]:checked')]
    .map(input=>input.getAttribute('data-sa-create-read'))
    .filter(Boolean));
  const sectionsEdit=[...document.querySelectorAll('[data-sa-create-edit]:checked')]
    .map(input=>input.getAttribute('data-sa-create-edit'))
    .filter(Boolean);
  sectionsEdit.forEach(section=>sections.add(section));

  return {
    username:(document.getElementById('superadminCreateUsername')?.value||'').trim().toLowerCase(),
    password:document.getElementById('superadminCreatePassword')?.value||'',
    displayName:(document.getElementById('superadminCreateDisplayName')?.value||'').trim(),
    isSuperadmin:document.getElementById('superadminCreateIsSuperadmin')?.checked===true,
    sections:[...sections],
    sectionsEdit,
    garde:{
      prenom:(document.getElementById('superadminCreatePrenom')?.value||'').trim(),
      nom:(document.getElementById('superadminCreateNom')?.value||'').trim(),
      race:(document.getElementById('superadminCreateRace')?.value||'').trim(),
      grade:(document.getElementById('superadminCreateGrade')?.value||'').trim(),
      date_recrutement:document.getElementById('superadminCreateDateRecrutement')?.value||null,
      recruteur:(document.getElementById('superadminCreateRecruteur')?.value||'').trim()||null,
      specialite:(document.getElementById('superadminCreateSpecialite')?.value||'').trim()||'Soldat',
    },
  };
}

function clearSuperadminCreateForm(){
  [
    'superadminCreateUsername',
    'superadminCreatePassword',
    'superadminCreateDisplayName',
    'superadminCreatePrenom',
    'superadminCreateNom',
    'superadminCreateRace',
    'superadminCreateGrade',
    'superadminCreateDateRecrutement',
    'superadminCreateRecruteur',
  ].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const specialite=document.getElementById('superadminCreateSpecialite');
  if(specialite)specialite.value='Soldat';
  const isSuperadmin=document.getElementById('superadminCreateIsSuperadmin');
  if(isSuperadmin)isSuperadmin.checked=false;
  document.querySelectorAll('[data-sa-create-read],[data-sa-create-edit]').forEach(input=>{input.checked=false;});
}

async function createSuperadminAccount(){
  if(!isSuperadminSession())return;
  const payload=readSuperadminCreateForm();
  if(!validUsername(payload.username)){toast('Identifiant invalide.');return;}
  if(payload.password.length<6){toast('Mot de passe trop court.');return;}
  if(!payload.garde.prenom){toast('Prénom du garde requis.');return;}

  try{
    await callSuperadminFunction('createAccount',payload);
    clearSuperadminCreateForm();
    await loadSuperadmin();
    if(typeof loadGardes==='function')await loadGardes();
    toast('Compte créé.');
  }catch(error){
    console.error(error);
    toast(error?.message||'Erreur lors de la création du compte.');
  }
}

async function deleteSelectedSuperadminAccount(){
  if(!isSuperadminSession())return;
  const garde=saSelectedGarde();
  const userId=garde?.user_id||null;
  const profile=userId?saProfileForUser(userId):null;
  if(!profile)return;
  if(!confirm(`Supprimer définitivement le compte ${saProfileName(profile)} ?`))return;

  try{
    await callSuperadminFunction('deleteAccount',{userId:profile.user_id});
    superadminState.selectedGardeId=null;
    superadminState.selectedProfileUserId=null;
    await loadSuperadmin();
    if(typeof loadGardes==='function')await loadGardes();
    toast('Compte supprimé.');
  }catch(error){
    console.error(error);
    toast(error?.message||'Erreur lors de la suppression du compte.');
  }
}
