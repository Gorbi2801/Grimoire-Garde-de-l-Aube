// ══════════════════════════════════════════════════════════════════════
//  AUTH SUPABASE
// ══════════════════════════════════════════════════════════════════════
const SECTION_LABELS={
  citoyens:'Civils & Alliés',
  biblio:'Bibliothèque',
  garde:'Garde',
  commerces:'Commerces',
  diplomatie:'Diplomatie',
  cour:"Cour de l'Ordre",
  inventaire:'Inventaire',
  lois:'Codex',
  presences:'Présences',
  'presence-logs':'Logs présences',
  patrouilles:'Patrouilles',
  carte:'Carte',
  missives:'Missives',
  renseignements:'Renseignements',
};
const DEFAULT_SECTION_ORDER=['citoyens','biblio','garde','commerces','diplomatie','cour','inventaire','lois','presences','patrouilles','carte','missives','renseignements'];

function normalizeUsername(value){
  return value.trim().toLowerCase();
}

function usernameToEmail(username){
  return `${normalizeUsername(username)}@${window.GrimoireConfig.authEmailDomain}`;
}

function validUsername(username){
  return /^[a-z0-9_-]{3,32}$/.test(username);
}

async function doLogin(){
  const username=normalizeUsername(document.getElementById('loginUser')?.value||'');
  const password=document.getElementById('loginPass')?.value||'';
  const errEl=document.getElementById('loginErr');
  if(!username||!password)return;
  if(!validUsername(username)){errEl.textContent='Identifiant invalide.';errEl.style.display='block';return;}
  if(locked()){const s=Math.ceil((attempts.until-Date.now())/1000);errEl.textContent=`Trop de tentatives. Réessayez dans ${s}s.`;errEl.style.display='block';return;}

  const { error } = await window.GrimoireSupabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if(error){
    failAttempt();
    errEl.textContent='Identifiants incorrects.';
    errEl.style.display='block';
    return;
  }

  resetAttempts();
  errEl.style.display='none';
  await loadSession();
  if(session){
    await showAppShell();
    toast(`Bienvenue, ${escH(session.displayName)}.`);
  }
}

async function doLogout(){
  if(typeof window.stopRealtime==='function')window.stopRealtime();
  await window.GrimoireSupabase.auth.signOut();
  setLoggedOutUI();
  toast('Déconnexion effectuée.');
}

async function loadSession(options={}){
  const { data:{ user }, error:userError } = await window.GrimoireSupabase.auth.getUser();
  if(userError||!user){setLoggedOutUI();return;}

  const { data:profile, error:profileError } = await window.GrimoireSupabase
    .from('mk_profiles')
    .select('username,display_name,is_superadmin,sections,sections_edit')
    .eq('user_id', user.id)
    .single();

  if(profileError||!profile){
    setLoggedOutUI();
    if(!options.silent)toast('Profil introuvable.');
    return;
  }

  const sections=Array.isArray(profile.sections)?profile.sections.map(String).filter(Boolean):[];
  const editSections=Array.isArray(profile.sections_edit)?profile.sections_edit.map(String).filter(Boolean):[];
  const garde=await loadCurrentGarde(user.id);
  session=Object.freeze({
    user,
    username:profile.username,
    displayName:profile.display_name||profile.username,
    grade:garde?.grade||'—',
    garde,
    isSuperadmin:profile.is_superadmin===true,
    sections,
    editSections,
  });

  const loginErr=document.getElementById('loginErr');
  const sessionLabel=document.getElementById('sessionLabel');
  const gradeLabel=document.getElementById('gradeLabel');
  if(sessionLabel)sessionLabel.textContent=session.displayName;
  if(gradeLabel)gradeLabel.textContent=session.grade;
  if(loginErr)loginErr.style.display='none';
  await prepareAuthorizedApp();
}

async function loadCurrentGarde(userId){
  if(!userId)return null;
  const { data, error } = await window.GrimoireSupabase
    .from('mk_gardes')
    .select('id,user_id,prenom,nom,race,grade,specialite,date_recrutement,recruteur')
    .eq('user_id', userId)
    .maybeSingle();

  if(error){
    console.error('Impossible de charger la fiche garde liée au compte.', error);
    return null;
  }
  return data||null;
}

function setLoggedOutUI(){
  if(typeof window.stopRealtime==='function')window.stopRealtime();
  session=null;
  const userInput=document.getElementById('loginUser');
  const passInput=document.getElementById('loginPass');
  const loginErr=document.getElementById('loginErr');
  const sessionLabel=document.getElementById('sessionLabel');
  const gradeLabel=document.getElementById('gradeLabel');
  if(sessionLabel)sessionLabel.textContent='—';
  if(gradeLabel)gradeLabel.textContent='—';
  if(userInput)userInput.value='';
  if(passInput)passInput.value='';
  if(loginErr)loginErr.style.display='none';
  hideAppShell();
  if(isCoverOpen())hideAuthGate();
  else showAuthGate();
  updateAdminUI();
}

function isLogged(){return session!==null;}

function isCoverOpen(){
  const cover=document.getElementById('couverture');
  return !!cover && cover.style.display!=='none';
}

function showAuthGate(){
  const gate=document.getElementById('authGate');
  if(gate)gate.style.display='flex';
  const userInput=document.getElementById('loginUser');
  if(userInput)setTimeout(()=>userInput.focus(),0);
}

function hideAuthGate(){
  const gate=document.getElementById('authGate');
  if(gate)gate.style.display='none';
}

function hideAppShell(){
  const shell=document.getElementById('appShell');
  if(shell)shell.style.display='none';
}

async function showAppShell(){
  if(!session)return;
  hideAuthGate();
  const shell=document.getElementById('appShell');
  if(shell)shell.style.display='block';
  applySectionAccess();
  activateFirstAllowedSection();
}

function configuredSections(){
  const configured=window.GrimoireConfig?.sections;
  const sections=Array.isArray(configured)
    ?[...DEFAULT_SECTION_ORDER,...configured.filter(sec=>!DEFAULT_SECTION_ORDER.includes(sec))]
    :DEFAULT_SECTION_ORDER;
  return sections.filter(sectionFeatureEnabled);
}

function sectionFeatureEnabled(sec){
  return window.GrimoireConfig?.features?.[sec]!==false;
}

function accessibleSections(){
  const all=configuredSections();
  if(!session)return[];
  if(session.isSuperadmin)return all.slice();
  return all.filter(sec=>session.sections.includes(sec));
}

function canAccessSection(sec){
  if(!session)return false;
  if(sec==='profile')return true;
  if(sec==='superadmin'||sec==='presence-logs')return session.isSuperadmin===true;
  if(!sectionFeatureEnabled(sec))return false;
  if(session.isSuperadmin)return true;
  return session.sections.includes(sec);
}

function canEditSection(sec){
  if(!session) return false;
  if(!sectionFeatureEnabled(sec)) return false;
  if(session.isSuperadmin) return true;
  return canAccessSection(sec) && Array.isArray(session.editSections) && session.editSections.includes(sec);
}

function sectionLabel(value){
  if(value?.isSuperadmin)return 'Superadmin';
  const sections=(Array.isArray(value)?value:value?.sections||String(value||'').split(',').map(s=>s.trim()).filter(Boolean))
    .filter(sectionFeatureEnabled);
  if(!sections.length)return 'Lecture seule';
  return sections.map(x=>SECTION_LABELS[x]||x).join(', ');
}

function updateAdminUI(){
  const ids={citoyens:'cit-add-wrap',garde:'gar-add-wrap',commerces:'com-add-wrap',cour:'cour-add-wrap',inventaire:'inv-add-wrap',lois:'lois-add-wrap',carte:'carte-add-wrap',renseignements:'rens-add-wrap'};
  ['citoyens','garde','commerces','cour','inventaire','lois','carte','renseignements'].forEach(s=>{
    const w=document.getElementById(ids[s]);
    if(w)w.style.display=(s==='renseignements'?canAccessSection(s):canEditSection(s))?'block':'none';
  });
  const fonWrap=document.getElementById('fon-add-wrap');if(fonWrap)fonWrap.style.display=canEditSection('commerces')?'block':'none';
  const ordreFabWrap=document.getElementById('ordre-fab-wrap');if(ordreFabWrap)ordreFabWrap.style.display=canEditSection('inventaire')?'block':'none';
  const recetteWrap=document.getElementById('recette-add-wrap');if(recetteWrap)recetteWrap.style.display=canEditSection('inventaire')?'block':'none';
}

async function prepareAuthorizedApp(){
  updateAdminUI();
  renderProfilePage();
  applySectionAccess();
  activateFirstAllowedSection();
  await loadAccessibleSections();
  renderInvHistory();
  if(typeof window.startRealtime==='function')window.startRealtime();
}

function navSectionForButton(btn){
  return btn?.getAttribute('onclick')?.match(/switchSection\('([^']+)'/)?.[1]||'';
}

function applySectionAccess(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    const sec=navSectionForButton(btn);
    if(sec)btn.style.display=canAccessSection(sec)?'':'none';
  });
  document.querySelectorAll('.section-page').forEach(page=>{
    const sec=page.id.replace(/^page-/,'');
    page.style.display=canAccessSection(sec)?'':'none';
  });
}

function activateFirstAllowedSection(){
  const allowed=accessibleSections();
  document.querySelectorAll('.section-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  if(!allowed.length){showProfilePage();return;}
  const target=allowed.includes(activeSection)?activeSection:allowed[0];
  const btn=[...document.querySelectorAll('.nav-btn')].find(b=>navSectionForButton(b)===target);
  switchSection(target,btn);
}

function profileDate(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR');
}

function permPill(allowed){
  return `<span class="perm-pill ${allowed?'ok':'ko'}" title="${allowed?'Autorisé':'Refusé'}">${allowed?'✓':'×'}</span>`;
}

function renderProfilePage(){
  if(!session)return;
  const details=document.getElementById('profileDetails');
  const gardeDetails=document.getElementById('profileGardeDetails');
  const permsBody=document.getElementById('profilePermsBody');
  if(details){
    const role=session.isSuperadmin?'Superadmin':'Compte RP';
    const rows=[
      ['Nom affiché',session.displayName],
      ['Identifiant',session.username],
      ['Rôle',role],
      ['Grade',session.grade],
      ['Accès',sectionLabel(session)],
      ['Peut éditer', sectionLabel(session.editSections||[])],
      ['Email technique',session.user?.email||'—'],
      ['Créé le',profileDate(session.user?.created_at)],
      ['Dernière connexion',profileDate(session.user?.last_sign_in_at)],
    ];
    details.innerHTML=rows.map(([label,value])=>`<dt>${escH(label)}</dt><dd>${escH(value)}</dd>`).join('');
  }
  if(gardeDetails){
    const garde=session.garde;
    const nomRp=garde?[garde.prenom,garde.nom].filter(Boolean).join(' ')||'—':'Aucune fiche reliée';
    const rows=garde?[
      ['Nom RP',nomRp],
      ['Race',garde.race||'—'],
      ['Grade',garde.grade||'—'],
      ['Spécialité',garde.specialite||'—'],
      ['Date de recrutement',garde.date_recrutement||'—'],
      ['Recruteur',garde.recruteur||'—'],
      ['Identifiant fiche',garde.id||'—'],
    ]:[
      ['Statut','Aucune fiche garde reliée à ce compte'],
    ];
    gardeDetails.innerHTML=rows.map(([label,value])=>`<dt>${escH(label)}</dt><dd>${escH(value)}</dd>`).join('');
  }
  if(permsBody){
    permsBody.innerHTML=configuredSections().map(sec=>{
      const allowed=canAccessSection(sec);
      return `<tr>
        <td>${escH(SECTION_LABELS[sec]||sec)}</td>
        <td>${permPill(allowed)}</td>
        <td>${permPill(canEditSection(sec))}</td>
      </tr>`;
    }).join('');
  }
}

async function loadAccessibleSections(){
  const jobs=[];
  if(canAccessSection('citoyens'))jobs.push(loadCitoyens());
  if(canAccessSection('garde'))jobs.push(loadGardes());
  if(canAccessSection('commerces'))jobs.push(loadCommerces());
  if(canAccessSection('diplomatie'))jobs.push(loadDiplomatie());
  if(canAccessSection('cour'))jobs.push(loadCour());
  if(canAccessSection('inventaire'))jobs.push(loadInventaire(),loadOrdresFab(),loadRecettes());
  if(canAccessSection('lois'))jobs.push(loadLois());
  if(canAccessSection('presences')&&typeof loadPresences==='function')jobs.push(loadPresences());
  if(canAccessSection('patrouilles')&&typeof loadPatrouilles==='function')jobs.push(loadPatrouilles());
  if(canAccessSection('carte')&&typeof initCarte==='function')jobs.push(initCarte());
  if(canAccessSection('missives')&&typeof loadMissives==='function')jobs.push(loadMissives());
  if(canAccessSection('renseignements'))jobs.push(initRenseignements());
  await Promise.all(jobs);
}

function showChangePassword(){
  const gate=document.getElementById('authGate');
  if(gate)gate.style.display='flex';
  const loginForm=document.getElementById('loginForm');
  const changeBlock=document.getElementById('changePassBlock');
  if(loginForm)loginForm.style.display='none';
  if(changeBlock){changeBlock.style.display='block';const inp=document.getElementById('changePassNew'); if(inp)setTimeout(()=>inp.focus(),0);}
}

function hideChangePassword(){
  const loginForm=document.getElementById('loginForm');
  const changeBlock=document.getElementById('changePassBlock');
  const err=document.getElementById('changePassErr');
  if(changeBlock)changeBlock.style.display='none';
  if(loginForm)loginForm.style.display='block';
  if(err){err.style.display='none';err.textContent='';}
}

async function doChangePassword(){
  const newPass=document.getElementById('changePassNew')?.value||'';
  const errEl=document.getElementById('changePassErr');
  if(!newPass||newPass.length<6){if(errEl){errEl.textContent='Le mot de passe doit contenir au moins 6 caractères.';errEl.style.display='block';}return;}

  try{
    const { data, error } = await window.GrimoireSupabase.auth.updateUser({ password: newPass });
    if(error){if(errEl){errEl.textContent=error.message||'Erreur lors de la mise à jour.';errEl.style.display='block';}return;}
    hideChangePassword();
    toast('Mot de passe mis à jour.');
    // Refresh session info
    await loadSession({ silent:true });
  }catch(e){if(errEl){errEl.textContent=(e?.message||String(e));errEl.style.display='block';}}
}
