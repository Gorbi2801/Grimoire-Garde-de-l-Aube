// ══════════════════════════════════════════════════════════════════════
//  RENSEIGNEMENTS — Supabase
// ══════════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────────
const RENS = {
  fiches:    [],   // mk_rens_fiches
  rapports:  [],   // mk_rens_rapports
  relations: [],   // mk_rens_relations
  activeTab: 'lieux',
  searchQ:   '',
  filterStatut: ''
};

// ── Helpers UI ───────────────────────────────────────────────────────
function showTab(id, el){
  RENS.activeTab = id;
  document.querySelectorAll('[id^="tab-"]').forEach(t=>t.style.display='none');
  const tab = document.getElementById('tab-'+id);
  if(tab) tab.style.display='block';
  document.querySelectorAll('#page-renseignements .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  if(id==='carte') renderCarte();
  else renderTab(id);
}

function toggleFiche(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('open');
}
function toggleRap(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('open');
}
function toggleAdd(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('open');
}
function toggleRelForm(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('open');
}

function goToFiche(ficheId, tab){
  const tabBtns = document.querySelectorAll('#page-renseignements .tab');
  const idx = ['lieux','individus','groupes'].indexOf(tab);
  if(idx >= 0 && tabBtns[idx]) showTab(tab, tabBtns[idx]);
  setTimeout(()=>{
    const target = document.getElementById('fiche-'+ficheId);
    if(!target) return;
    target.classList.add('open');
    target.scrollIntoView({behavior:'smooth', block:'start'});
    target.classList.add('highlight');
    setTimeout(()=>target.classList.remove('highlight'), 1500);
  }, 120);
}

// ── Chargement Supabase ──────────────────────────────────────────────
async function rensLoad(){
  const [rf, rr, rl] = await Promise.all([
    sbGet('mk_rens_fiches','?select=*&order=created_at.desc'),
    sbGet('mk_rens_rapports','?select=*&order=created_at.desc'),
    sbGet('mk_rens_relations','?select=*')
  ]);
  RENS.fiches    = rf  || [];
  RENS.rapports  = rr  || [];
  RENS.relations = rl  || [];
  rensRenderAll();
}

// ── Rendu complet ────────────────────────────────────────────────────
function rensRenderAll(){
  rensRenderStats();
  renderTab(RENS.activeTab);
}

function rensRenderStats(){
  const total     = RENS.fiches.length;
  const lieux     = RENS.fiches.filter(f=>f.type==='lieux').length;
  const individus = RENS.fiches.filter(f=>f.type==='individus').length;
  const groupes   = RENS.fiches.filter(f=>f.type==='groupes').length;
  const urgents   = RENS.fiches.filter(f=>f.urgente).length;
  const nbRap     = RENS.rapports.length;
  const statsEl   = document.getElementById('rens-stats');
  if(!statsEl) return;
  statsEl.innerHTML = `
    <div class="stat">Lieux : <strong>${lieux}</strong></div>
    <div class="stat">Individus : <strong>${individus}</strong></div>
    <div class="stat">Groupes : <strong>${groupes}</strong></div>
    ${urgents>0?`<div class="stat" style="color:#7A1010;">🔴 Urgents : <strong>${urgents}</strong></div>`:''}
    <div class="stat">Rapports total : <strong>${nbRap}</strong></div>`;
}

function renderTab(type){
  const container = document.getElementById('tab-'+type);
  if(!container) return;
  let fiches = RENS.fiches.filter(f=>f.type===type);
  // Filtre recherche
  if(RENS.searchQ){
    const q = RENS.searchQ.toLowerCase();
    fiches = fiches.filter(f=>f.nom.toLowerCase().includes(q)||(f.sous_titre||'').toLowerCase().includes(q));
  }
  // Filtre statut
  if(RENS.filterStatut) fiches = fiches.filter(f=>f.statut===RENS.filterStatut);

  const labelEl = container.querySelector('.section-label');
  if(labelEl) labelEl.textContent = `${fiches.length} ${type==='lieux'?'lieu(x)':type==='individus'?'individu(s)':'groupe(s)'} recensé(s)`;

  const listEl = container.querySelector('.fiches-list');
  if(!listEl) return;
  if(fiches.length===0){
    listEl.innerHTML = '<p style="font-style:italic;color:var(--ink-faint);font-size:.92rem;padding:.5rem 0;">Aucune fiche.</p>';
    return;
  }
  listEl.innerHTML = fiches.map(f=>buildFicheHTML(f)).join('');
}

// ── Construction HTML d'une fiche ────────────────────────────────────
function buildFicheHTML(f){
  const raps = RENS.rapports.filter(r=>r.fiche_id===f.id);
  const rels = RENS.relations.filter(r=>r.fiche_source===f.id || r.fiche_cible===f.id);

  const badgeUrgente = f.urgente ? `<span class="badge badge-urgente">🔴 Urgente</span>` : '';
  const badgeStatut  = f.statut && f.statut!=='neutre'
    ? `<span class="badge badge-${f.statut==='surveillance'?'surveille':f.statut==='recherche'?'recherche':'neutralise'}">${f.statut==='surveillance'?'Surveillance active':f.statut==='recherche'?'Recherché':'Neutralisé'}</span>` : '';
  const badgeType    = f.type_label ? `<span class="badge badge-type">${f.type_label}</span>` : '';

  // Champs rapides depuis meta JSON
  const meta = f.meta || {};
  const quickFields = Object.entries(meta).map(([k,v])=>`
    <div class="fiche-qf"><label>${k}</label><span>${v}</span></div>`).join('');

  // Relations HTML
  const relsHTML = buildRelationsHTML(f, rels);

  // Rapports HTML
  const rapsHTML = raps.map(r=>buildRapportHTML(r)).join('');

  const peutModifier = canAccessSection('renseignements');
  const peutSupprimer = canEditSection('renseignements');

  return `
  <div class="fiche${f.urgente?' urgente':''}" id="fiche-${f.id}" data-id="${f.id}" data-tab="${f.type}">
    <div class="fiche-header" onclick="toggleFiche('fiche-${f.id}')">
      <div class="fiche-left">
        <span class="fiche-chevron">▶</span>
        <div>
          <div class="fiche-nom">${escH(f.nom)}</div>
          ${f.sous_titre?`<div class="fiche-sub">${escH(f.sous_titre)} · ${raps.length} rapport(s)</div>`:''}
        </div>
      </div>
      <div class="fiche-badges">
        ${badgeType}${badgeUrgente}${badgeStatut}
        ${peutModifier?`<button class="btn-sm" style="margin-left:.5rem;" onclick="event.stopPropagation();openEditFiche('${f.id}')">Modifier</button>`:''}
        ${peutSupprimer?`<button class="btn-sm" style="color:#7A1010;" onclick="event.stopPropagation();deleteFiche('${f.id}')">Suppr.</button>`:''}
      </div>
    </div>
    <div class="fiche-body">
      ${quickFields?`<div class="fiche-quick">${quickFields}</div>`:''}
      ${f.notes?`<div style="font-size:.9rem;color:var(--ink);background:rgba(28,26,24,.04);border-left:3px solid var(--border-g);padding:.5rem .75rem;margin-bottom:.75rem;white-space:pre-wrap;">${escH(f.notes)}</div>`:''}
      ${relsHTML}
      <div class="rapports-section">
        <div class="rapports-title">
          Rapports &amp; renseignements
          ${peutModifier?`<button class="btn-sm" onclick="toggleAdd('addrap-${f.id}')">+ Déposer un rapport</button>`:''}
        </div>
        ${raps.length===0?'<p style="font-style:italic;color:var(--ink-faint);font-size:.92rem;">Aucun rapport déposé.</p>':''}
        ${rapsHTML}
        ${peutModifier?buildAddRapportFormHTML(f.id):''}
      </div>
      ${peutModifier?buildAddFicheNotes(f):''}
    </div>
  </div>`;
}

function buildRelationsHTML(f, rels){
  const peutModifier = canAccessSection('renseignements');
  const peutSupprimer = canEditSection('renseignements');
  const linksHTML = rels.map(rel=>{
    const otherId = rel.fiche_source===f.id ? rel.fiche_cible : rel.fiche_source;
    const relId   = rel.id;
    const other   = RENS.fiches.find(x=>x.id===otherId);
    if(!other) return '';
    const typeLabel = other.type==='lieux'?'Lieu':other.type==='individus'?'Individu':'Groupe';
    return `<a class="fiche-link" onclick="goToFiche('${other.id}','${other.type}')">
      <span class="fl-type">${typeLabel} ·</span> ${escH(other.nom)}
      ${peutSupprimer?`<span class="fl-del" onclick="event.stopPropagation();deleteRelation('${relId}','${f.id}')" title="Supprimer ce lien">×</span>`:''}
    </a>`;
  }).join('');

  // Options disponibles pour le select (toutes fiches sauf soi-même et déjà liées)
  const dejalie = rels.map(r=>r.fiche_source===f.id?r.fiche_cible:r.fiche_source);
  const opts = ['lieux','individus','groupes'].map(type=>{
    const dispo = RENS.fiches.filter(x=>x.type===type && x.id!==f.id && !dejalie.includes(x.id));
    if(!dispo.length) return '';
    return `<optgroup label="${type==='lieux'?'Lieux':type==='individus'?'Individus':'Groupes'}">
      ${dispo.map(x=>`<option value="${x.id}">${escH(x.nom)}</option>`).join('')}
    </optgroup>`;
  }).join('');

  return `
  <div class="relations-section">
    <div class="relations-title">
      Fiches liées
      ${peutModifier?`<button class="btn-sm" onclick="toggleRelForm('relform-${f.id}')">+ Ajouter une relation</button>`:''}
    </div>
    <div class="relations-list" id="rels-${f.id}">
      ${linksHTML || '<span style="font-style:italic;color:var(--ink-faint);font-size:.88rem;">Aucune fiche liée.</span>'}
    </div>
    ${peutModifier?`
    <div class="add-relation-form" id="relform-${f.id}">
      <label>Lier à :</label>
      <select id="relsel-${f.id}">
        <option value="">— Sélectionner une fiche —</option>
        ${opts||'<option disabled>Aucune fiche disponible</option>'}
      </select>
      <button class="btn-add" style="font-size:.78rem;padding:.28rem .7rem;" onclick="addRelation('${f.id}')">Lier</button>
      <button class="btn-sm" onclick="toggleRelForm('relform-${f.id}')">Annuler</button>
    </div>`:''}
  </div>`;
}

function buildRapportHTML(r){
  const peutModifier = canAccessSection('renseignements');
  const peutSupprimer = canEditSection('renseignements');
  const ficheLabel = {confirme:'✅ Confirmée', nonverif:'⚠ Non vérifiée', urgente:'🔴 Urgente'}[r.fiabilite]||r.fiabilite;
  const date = r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '';
  const preview = (r.contenu||'').substring(0,60)+(r.contenu&&r.contenu.length>60?'…':'');
  return `
  <div class="rapport-accordion ${r.fiabilite||''}" id="rap-${r.id}">
    <div class="rapport-acc-head" onclick="toggleRap('rap-${r.id}')">
      <div class="rapport-acc-left">
        <span class="rapport-acc-chevron">▶</span>
        <span class="rapport-acc-date">${date}</span>
        <span class="badge badge-${r.fiabilite||'nonverif'}">${ficheLabel}</span>
        <span class="rapport-acc-source">${escH(r.source||'Inconnu')}</span>
        <span class="rapport-acc-preview">${escH(preview)}</span>
      </div>
      <div style="display:flex;gap:.3rem;">
        ${peutSupprimer?`<button class="btn-sm" onclick="event.stopPropagation();deleteRapport('${r.id}','${r.fiche_id}')">Suppr.</button>`:''}
      </div>
    </div>
    <div class="rapport-acc-body">
      <div class="rapport-contenu">${escH(r.contenu||'')}</div>
      ${r.action_recommandee?`
      <div class="rapport-action">
        <label>Action recommandée</label>
        <p>${escH(r.action_recommandee)}</p>
      </div>`:''}
    </div>
  </div>`;
}

function buildAddRapportFormHTML(ficheId){
  return `
  <div class="add-rapport" id="addrap-${ficheId}">
    <div style="font-family:'Eagle Lake',serif;font-size:.85rem;color:var(--green-dark);margin-bottom:.75rem;">Déposer un nouveau rapport</div>
    <div class="form-row">
      <div class="field"><label>Source</label><input type="text" id="raf-src-${ficheId}" placeholder="Garde ou informateur..."></div>
      <div class="field"><label>Fiabilité</label>
        <select id="raf-fib-${ficheId}">
          <option value="confirme">✅ Confirmée</option>
          <option value="nonverif" selected>⚠ Non vérifiée</option>
          <option value="urgente">🔴 Urgente</option>
        </select>
      </div>
    </div>
    <label>Contenu</label>
    <textarea id="raf-cnt-${ficheId}" rows="7" placeholder="Faits, témoignages, observations..."></textarea>
    <label>Action recommandée <span style="font-style:italic;font-weight:normal;font-family:'IM Fell English',serif;font-size:.88rem;color:var(--ink-faint);">(facultatif)</span></label>
    <textarea id="raf-act-${ficheId}" rows="3"></textarea>
    <div style="display:flex;gap:.5rem;margin-top:.65rem;">
      <button class="btn-add" style="font-size:.82rem;padding:.3rem .8rem;" onclick="saveRapport('${ficheId}')">Enregistrer</button>
      <button class="btn-sm" onclick="toggleAdd('addrap-${ficheId}')">Annuler</button>
    </div>
  </div>`;
}

function buildAddFicheNotes(f){
  return buildEditFicheFormHTML(f);
}

// ── Formulaire nouvelle fiche ─────────────────────────────────────────
function buildNewFicheFormHTML(){
  return `
  <div class="add-rapport" id="rens-add-form" style="display:none;margin-top:.75rem;">
    <div style="font-family:'Eagle Lake',serif;font-size:.9rem;color:var(--green-dark);margin-bottom:.75rem;">Nouvelle fiche</div>
    <div class="form-row">
      <div class="field"><label>Nom *</label><input type="text" id="nf-nom" placeholder="Nom de la cible..."></div>
      <div class="field"><label>Type *</label>
        <select id="nf-type">
          <option value="lieux">Lieu</option>
          <option value="individus">Individu</option>
          <option value="groupes">Groupe</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="field"><label>Sous-titre / description courte</label><input type="text" id="nf-sub" placeholder="Ex: Grotte · Châtellerie de Blancherive"></div>
      <div class="field"><label>Label de type</label><input type="text" id="nf-typelabel" placeholder="Ex: Repaire suspecté, Suspect, Vampires..."></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Statut</label>
        <select id="nf-statut">
          <option value="neutre">Neutre</option>
          <option value="surveillance">Surveillance active</option>
          <option value="recherche">Recherché</option>
          <option value="neutralise">Neutralisé</option>
        </select>
      </div>
      <div class="field"><label style="display:flex;align-items:center;gap:.5rem;"><input type="checkbox" id="nf-urgente"> Marquer comme urgente</label></div>
    </div>
    <label>Notes / contexte</label>
    <textarea id="nf-notes" rows="4" placeholder="Informations générales, contexte..."></textarea>
    <div style="display:flex;gap:.5rem;margin-top:.65rem;">
      <button class="btn-add" style="font-size:.82rem;padding:.3rem .8rem;" onclick="saveFiche()">Créer la fiche</button>
      <button class="btn-sm" onclick="document.getElementById('rens-add-form').style.display='none'">Annuler</button>
    </div>
  </div>`;
}

// ── Notification Discord ─────────────────────────────────────────────
async function notifyDiscordRenseignement(){
  const url = window.GrimoireConfig?.discordRenseignementWebhook;
  if(!url) return;
  try{
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<:corbeau:1517815921258008697> **Nouveau renseignement disponible**\n-# *Une nouvelle fiche vient d\'être versée aux archives de Fort-Aube.*\n\n<:aube:1516926588359540856> Consultez la fiche ci-dessus et transmettez tout élément complémentaire à votre supérieur.'
      })
    });
  }catch(e){ console.warn('Discord webhook renseignement :', e); }
}

// ── CRUD Fiches ──────────────────────────────────────────────────────
async function saveFiche(){
  const nom = document.getElementById('nf-nom').value.trim();
  const type= document.getElementById('nf-type').value;
  if(!nom){ alert('Le nom est obligatoire.'); return; }
  const payload = {
    nom, type,
    sous_titre:   document.getElementById('nf-sub').value.trim()||null,
    type_label:   document.getElementById('nf-typelabel').value.trim()||null,
    statut:       document.getElementById('nf-statut').value,
    urgente:      document.getElementById('nf-urgente').checked,
    notes:        document.getElementById('nf-notes').value.trim()||null,
    meta:         {}
  };
  try{await sbPost('mk_rens_fiches',payload);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await notifyDiscordRenseignement();
  document.getElementById('rens-add-form').style.display='none';
  await rensLoad();
  // Aller sur le bon onglet
  const tabBtns = document.querySelectorAll('#page-renseignements .tab');
  const idx = ['lieux','individus','groupes'].indexOf(type);
  if(idx>=0 && tabBtns[idx]) showTab(type, tabBtns[idx]);
}

async function deleteFiche(id){
  if(!confirm('Supprimer cette fiche ? Tous ses rapports et relations seront supprimés.')) return;
  try{await sbDelete('mk_rens_fiches',`?id=eq.${id}`);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── Modification fiche — formulaire inline ────────────────────────
function buildEditFicheFormHTML(f){
  return `
  <div class="add-rapport" id="editform-${f.id}" style="display:none;margin-top:.75rem;">
    <div style="font-family:'Eagle Lake',serif;font-size:.9rem;color:var(--green-dark);margin-bottom:.75rem;">Modifier la fiche</div>
    <div class="form-row">
      <div class="field"><label>Nom *</label><input type="text" id="ef-nom-${f.id}" value="${escH(f.nom)}" placeholder="Nom de la cible..."></div>
      <div class="field"><label>Label de type</label><input type="text" id="ef-typelabel-${f.id}" value="${escH(f.type_label||'')}" placeholder="Ex: Repaire suspecté, Suspect..."></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Sous-titre</label><input type="text" id="ef-sub-${f.id}" value="${escH(f.sous_titre||'')}" placeholder="Ex: Grotte · Châtellerie de Blancherive"></div>
      <div class="field"><label>Statut</label>
        <select id="ef-statut-${f.id}">
          <option value="neutre"${f.statut==='neutre'?' selected':''}>Neutre</option>
          <option value="surveillance"${f.statut==='surveillance'?' selected':''}>Surveillance active</option>
          <option value="recherche"${f.statut==='recherche'?' selected':''}>Recherché</option>
          <option value="neutralise"${f.statut==='neutralise'?' selected':''}>Neutralisé</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="field"><label style="display:flex;align-items:center;gap:.5rem;"><input type="checkbox" id="ef-urgente-${f.id}"${f.urgente?' checked':''}> Marquer comme urgente</label></div>
    </div>
    <label>Notes / contexte</label>
    <textarea id="ef-notes-${f.id}" rows="4" placeholder="Informations générales, contexte...">${escH(f.notes||'')}</textarea>
    <div style="display:flex;gap:.5rem;margin-top:.65rem;">
      <button class="btn-add" style="font-size:.82rem;padding:.3rem .8rem;" onclick="saveEditFiche('${f.id}')">Enregistrer</button>
      <button class="btn-sm" onclick="document.getElementById('editform-${f.id}').style.display='none'">Annuler</button>
    </div>
  </div>`;
}

function openEditFiche(id){
  const formEl = document.getElementById('editform-'+id);
  if(formEl){ formEl.style.display = formEl.style.display==='none'?'block':'none'; return; }
  // Formulaire pas encore injecté — rare, mais fallback sécurisé
  const f = RENS.fiches.find(x=>x.id===id);
  if(!f) return;
  const body = document.querySelector(`#fiche-${id} .fiche-body`);
  if(!body) return;
  const div = document.createElement('div');
  div.innerHTML = buildEditFicheFormHTML(f);
  body.prepend(div.firstElementChild);
  document.getElementById('editform-'+id).style.display = 'block';
}

async function saveEditFiche(id){
  const nom = document.getElementById('ef-nom-'+id)?.value.trim();
  if(!nom){ alert('Le nom est obligatoire.'); return; }
  const payload = {
    nom,
    sous_titre:  document.getElementById('ef-sub-'+id)?.value.trim()||null,
    type_label:  document.getElementById('ef-typelabel-'+id)?.value.trim()||null,
    statut:      document.getElementById('ef-statut-'+id)?.value||'neutre',
    urgente:     document.getElementById('ef-urgente-'+id)?.checked||false,
    notes:       document.getElementById('ef-notes-'+id)?.value.trim()||null,
  };
  try{ await sbPatch('mk_rens_fiches',`?id=eq.${id}`,payload); }
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── CRUD Rapports ────────────────────────────────────────────────────
async function saveRapport(ficheId){
  const source   = document.getElementById('raf-src-'+ficheId).value.trim();
  const fiabilite= document.getElementById('raf-fib-'+ficheId).value;
  const contenu  = document.getElementById('raf-cnt-'+ficheId).value.trim();
  const action   = document.getElementById('raf-act-'+ficheId).value.trim();
  if(!contenu){ alert('Le contenu est obligatoire.'); return; }
  try{await sbPost('mk_rens_rapports',{fiche_id: ficheId, source: source||null, fiabilite, contenu, action_recommandee: action||null});}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

async function deleteRapport(rapId, ficheId){
  if(!confirm('Supprimer ce rapport ?')) return;
  try{await sbDelete('mk_rens_rapports',`?id=eq.${rapId}`);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── CRUD Relations ───────────────────────────────────────────────────
async function addRelation(ficheSourceId){
  const sel = document.getElementById('relsel-'+ficheSourceId);
  const cibleId = sel ? sel.value : '';
  if(!cibleId){ alert('Sélectionne une fiche cible.'); return; }
  try{await sbPost('mk_rens_relations',{fiche_source: ficheSourceId, fiche_cible: cibleId});}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

async function deleteRelation(relId, ficheId){
  if(!confirm('Supprimer ce lien ?')) return;
  try{await sbDelete('mk_rens_relations',`?id=eq.${relId}`);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── removeRel (alias fallback) ────────────────────────────────────
function removeRel(btn){ btn.closest('.fiche-link').remove(); }

// ── Recherche & filtre ────────────────────────────────────────────
function rensSearch(q){ RENS.searchQ = q; renderTab(RENS.activeTab); }
function rensFilter(v){ RENS.filterStatut = v==='Tous les statuts'?'':v; renderTab(RENS.activeTab); }

// ── Init renseignements (appelé depuis init() Supabase) ───────────
async function initRenseignements(){
  // Injecter le formulaire "Nouvelle fiche" si admin
  const wrap = document.getElementById('rens-add-wrap');
  if(wrap && canEditSection('renseignements')){
    wrap.innerHTML = `
      <button class="btn-add" onclick="document.getElementById('rens-add-form').style.display=document.getElementById('rens-add-form').style.display==='none'?'block':'none'">+ Nouvelle fiche</button>
      ${buildNewFicheFormHTML()}`;
  }
  // Brancher recherche et filtre
  const srch = document.getElementById('rens-search');
  if(srch) srch.addEventListener('input', e=>rensSearch(e.target.value));
  const filt = document.getElementById('rens-filter');
  if(filt) filt.addEventListener('change', e=>rensFilter(e.target.value));
  // Injecter l'onglet Carte
  injectCarteTab();
  // Charger les données
  await rensLoad();
}

// ── Carte mentale ────────────────────────────────────────────────────

function injectCarteTab(){
  // Bouton tab
  const firstTab = document.querySelector('#page-renseignements .tab');
  if(!firstTab) return;
  if(!document.getElementById('tab-btn-carte')){
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.id = 'tab-btn-carte';
    btn.textContent = '🗺 Carte';
    btn.onclick = () => showTab('carte', btn);
    firstTab.parentElement.appendChild(btn);
  }
  // Conteneur
  if(!document.getElementById('tab-carte')){
    const lastTabContent = [...document.querySelectorAll('#page-renseignements [id^="tab-"]')].pop();
    if(!lastTabContent) return;
    const div = document.createElement('div');
    div.id = 'tab-carte';
    div.style.display = 'none';
    div.innerHTML = `
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;font-size:.82rem;color:var(--ink-faint);">
        <span style="display:flex;align-items:center;gap:.35rem;"><span style="width:12px;height:12px;border-radius:2px;background:#c8b89a;border:1px solid #8a6a3a;display:inline-block;"></span>Lieu</span>
        <span style="display:flex;align-items:center;gap:.35rem;"><span style="width:12px;height:12px;border-radius:2px;background:#9aabbc;border:1px solid #3a5a7a;display:inline-block;"></span>Individu</span>
        <span style="display:flex;align-items:center;gap:.35rem;"><span style="width:12px;height:12px;border-radius:2px;background:#9ab8a0;border:1px solid #3a6a4a;display:inline-block;"></span>Groupe</span>
        <span style="display:flex;align-items:center;gap:.35rem;"><span style="width:12px;height:12px;border-radius:2px;background:#e8d0d0;border:2px solid #8a1010;display:inline-block;"></span>Urgente / Recherché</span>
        <span style="margin-left:auto;font-style:italic;">Cliquez sur une fiche pour l'ouvrir</span>
      </div>
      <div id="rens-network" style="width:100%;height:560px;border:1px solid var(--border-g);border-radius:4px;background:var(--paper, #f5f0e8);"></div>`;
    lastTabContent.parentElement.appendChild(div);
  }
}

function loadVisNetwork(callback){
  if(window.vis){ callback(); return; }
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
  s.onload = callback;
  s.onerror = ()=>console.error('Impossible de charger vis-network');
  document.head.appendChild(s);
}

function renderCarte(){
  const container = document.getElementById('rens-network');
  if(!container) return;

  loadVisNetwork(()=>{
    // Couleurs par type
    const TC = {
      lieux:     { bg:'#c8b89a', border:'#8a6a3a', hbg:'#d8c8aa', hborder:'#6a4a2a' },
      individus: { bg:'#9aabbc', border:'#3a5a7a', hbg:'#aabbcc', hborder:'#2a4a6a' },
      groupes:   { bg:'#9ab8a0', border:'#3a6a4a', hbg:'#aac8b0', hborder:'#2a5a3a' },
    };
    // Couleur de bordure par statut
    const SB = { surveillance:'#c8820a', recherche:'#8a1010', neutralise:'#5a5a5a' };
    // Label statut
    const SL = { surveillance:'⚠ Surveillance', recherche:'🔴 Recherché', neutralise:'✓ Neutralisé' };

    const nodes = new vis.DataSet(RENS.fiches.map(f=>{
      const c   = TC[f.type] || TC.lieux;
      const urgente = f.urgente || f.statut==='recherche';
      const borderColor = urgente ? '#8a1010' : (SB[f.statut] || c.border);
      const bgColor     = urgente ? '#e8d0d0' : c.bg;
      const label = f.nom + (SL[f.statut] ? '\n'+SL[f.statut] : '');
      return {
        id:          f.id,
        label,
        title:       f.sous_titre || f.nom,
        shape:       'box',
        color:{
          background: bgColor,
          border:     borderColor,
          highlight:{ background: c.hbg, border: c.hborder }
        },
        borderWidth:  urgente ? 3 : 1.5,
        font:{ face:'serif', size:13, color:'#1c1a18', multi:false },
        margin:       10,
      };
    }));

    const edges = new vis.DataSet(RENS.relations.map(r=>({
      id:     r.id,
      from:   r.fiche_source,
      to:     r.fiche_cible,
      color:{ color:'#8a7a6a', highlight:'#3a2a1a', opacity:0.8 },
      width:  1.5,
      smooth:{ type:'curvedCW', roundness:0.15 },
    })));

    const options = {
      physics:{
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based:{ gravitationalConstant:-60, centralGravity:0.01, springLength:160, springConstant:0.08, damping:0.4 },
        stabilization:{ iterations:300, updateInterval:50 },
      },
      interaction:{ dragNodes:false, zoomView:true, dragView:true, hover:true },
      layout:{ improvedLayout:true },
    };

    // Réinitialiser le conteneur si déjà un réseau
    container.innerHTML = '';
    const network = new vis.Network(container, { nodes, edges }, options);

    // Clic → ouvrir la fiche dans son onglet
    network.on('click', params=>{
      if(params.nodes.length>0){
        const f = RENS.fiches.find(x=>x.id===params.nodes[0]);
        if(f) goToFiche(f.id, f.type);
      }
    });

    // Curseur pointer au survol d'un nœud
    network.on('hoverNode', ()=>{ container.style.cursor='pointer'; });
    network.on('blurNode',  ()=>{ container.style.cursor='default'; });
  });
}

// ── Escape HTML ───────────────────────────────────────────────────
function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

