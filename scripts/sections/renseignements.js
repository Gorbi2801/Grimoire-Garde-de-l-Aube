// ══════════════════════════════════════════════════════════════════════
//  RENSEIGNEMENTS — Supabase
// ══════════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────────
const RENS = {
  fiches:         [],   // mk_rens_fiches
  rapports:       [],   // mk_rens_rapports
  relations:      [],   // mk_rens_relations
  rapportLiens:   [],   // mk_rens_rapport_liens (rapport → fiche)
  rapportRapport: [],   // mk_rens_rapport_rapport (rapport → rapport)
  mapNodes:       [],   // mk_rens_map_nodes
  mapLinks:       [],   // mk_rens_map_links
  activeTab: 'lieux',
  searchQ:   '',
  filterStatut: '',
  mapReady: true,
  mapPickerType: 'all',
  mapLinkMode: false,
  mapLinkSource: '',
  mapLinkColor: '#8A1010',
  selectedMapNode: '',
  selectedMapLink: ''
};
let rensMapNetwork = null;

// ── Helpers UI ───────────────────────────────────────────────────────
function showTab(id, el){
  RENS.activeTab = id;
  document.querySelectorAll('[id^="tab-"]').forEach(t=>t.style.display='none');
  const tab = document.getElementById('tab-'+id);
  if(tab) tab.style.display='block';
  document.querySelectorAll('#page-renseignements .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  // Cacher le bouton "Nouvelle fiche" sur l'onglet carte
  const addWrap = document.getElementById('rens-add-wrap');
  if(addWrap) addWrap.style.display = id==='carte' ? 'none' : '';
  if(id==='carte') rensRenderCarte();
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

function goToRapport(rapportId){
  const rapport = RENS.rapports.find(r=>r.id===rapportId);
  if(!rapport) return;
  const fiche = RENS.fiches.find(f=>f.id===rapport.fiche_id);
  if(!fiche) return;
  goToFiche(fiche.id, fiche.type);
  setTimeout(()=>{
    const target = document.getElementById('rap-'+rapportId);
    if(!target) return;
    target.classList.add('open');
    target.scrollIntoView({behavior:'smooth', block:'center'});
    target.classList.add('highlight');
    setTimeout(()=>target.classList.remove('highlight'), 1500);
  }, 260);
}

// ── Chargement Supabase ──────────────────────────────────────────────
async function rensOptionalGet(table, params = ''){
  try{
    return await sbGet(table, params);
  }catch(error){
    console.warn(`Table optionnelle indisponible: ${table}`, error);
    RENS.mapReady = false;
    return [];
  }
}

async function rensLoad(){
  RENS.mapReady = true;
  const [rf, rr, rl, rpl, rrp, mn, ml] = await Promise.all([
    sbGet('mk_rens_fiches','?select=*&order=created_at.desc'),
    sbGet('mk_rens_rapports','?select=*&order=created_at.desc'),
    sbGet('mk_rens_relations','?select=*'),
    rensOptionalGet('mk_rens_rapport_liens','?select=*'),
    rensOptionalGet('mk_rens_rapport_rapport','?select=*'),
    rensOptionalGet('mk_rens_map_nodes','?select=*&order=created_at.asc'),
    rensOptionalGet('mk_rens_map_links','?select=*')
  ]);
  RENS.fiches          = rf  || [];
  RENS.rapports        = rr  || [];
  RENS.relations       = rl  || [];
  RENS.rapportLiens    = rpl || [];
  RENS.rapportRapport  = rrp || [];
  RENS.mapNodes        = mn  || [];
  RENS.mapLinks        = ml  || [];
  rensRenderAll();
}

// ── Rendu complet ────────────────────────────────────────────────────
function rensRenderAll(){
  rensRenderStats();
  if(RENS.activeTab==='carte') rensRenderCarte();
  else renderTab(RENS.activeTab);
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

function rensFilteredFiches(type){
  let fiches = type ? RENS.fiches.filter(f=>f.type===type) : [...RENS.fiches];
  if(RENS.searchQ){
    const q = RENS.searchQ.toLowerCase();
    fiches = fiches.filter(f=>f.nom.toLowerCase().includes(q));
  }
  if(RENS.filterStatut) fiches = fiches.filter(f=>f.statut===RENS.filterStatut);
  return fiches;
}

function renderTab(type){
  const container = document.getElementById('tab-'+type);
  if(!container) return;
  const fiches = rensFilteredFiches(type);

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

  // Champs rapides depuis meta JSON
  const meta = f.meta || {};
  const quickFields = Object.entries(meta).map(([k,v])=>`
    <div class="fiche-qf"><label>${k}</label><span>${v}</span></div>`).join('');

  // Relations HTML
  const relsHTML = buildRelationsHTML(f, rels);

  // Rapports HTML
  const rapsHTML = raps.map(r=>buildRapportHTML(r)).join('');

  const peutAjouter = rensCanWrite();
  const peutModifier = rensCanEditOwn(f);
  const peutSupprimer = rensCanDelete();

  return `
  <div class="fiche${f.urgente?' urgente':''}" id="fiche-${f.id}" data-id="${f.id}" data-tab="${f.type}">
    <div class="fiche-header" onclick="toggleFiche('fiche-${f.id}')">
      <div class="fiche-left">
        <span class="fiche-chevron">▶</span>
        <div>
          <div class="fiche-nom">${escH(f.nom)}${raps.length>0?`<span style="display:inline-block;margin-left:.5rem;padding:.05rem .45rem;font-size:.72rem;font-family:'Eagle Lake',serif;background:var(--green-dark);color:var(--gold-light);border-radius:2px;vertical-align:middle;">${raps.length}</span>`:''}</div>
        </div>
      </div>
      <div class="fiche-badges">
        ${badgeUrgente}${badgeStatut}
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
          ${peutAjouter?`<button class="btn-sm" onclick="toggleAdd('addrap-${f.id}')">+ Déposer un rapport</button>`:''}
        </div>
        ${raps.length===0?'<p style="font-style:italic;color:var(--ink-faint);font-size:.92rem;">Aucun rapport déposé.</p>':''}
        ${rapsHTML}
        ${peutAjouter?buildAddRapportFormHTML(f.id):''}
      </div>
      ${peutModifier?buildAddFicheNotes(f):''}
    </div>
  </div>`;
}

function buildRelationsHTML(f, rels){
  const peutModifier = rensCanWrite();
  const peutSupprimer = rensCanDelete();
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
  const peutModifier = rensCanEditOwn(r);
  const peutSupprimer = rensCanDelete();
  const ficheLabel = {confirme:'✅ Confirmée', nonverif:'⚠ Non vérifiée', urgente:'🔴 Urgente', fausse:'❌ Invalidée'}[r.fiabilite]||r.fiabilite;
  const date = r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '';
  const preview = (r.contenu||'').substring(0,60)+(r.contenu&&r.contenu.length>60?'…':'');
  const author = rensAuthorLabel(r);
  return `
  <div class="rapport-accordion ${r.fiabilite||''}" id="rap-${r.id}">
    <div class="rapport-acc-head" onclick="toggleRap('rap-${r.id}')">
      <div class="rapport-acc-left">
        <span class="rapport-acc-chevron">▶</span>
        <span class="rapport-acc-date">${date}</span>
        <span class="badge badge-${r.fiabilite==="fausse"?"invalidee":r.fiabilite||"nonverif"}">${ficheLabel}</span>
        <span class="rapport-acc-titre">${escH(r.titre||'Inconnu')}</span>
        <span class="rapport-acc-preview">${escH(preview)}</span>
        ${author?`<span class="rapport-acc-author">- ${escH(author)}</span>`:''}
      </div>
      <div style="display:flex;gap:.3rem;">
        ${peutModifier?`<button class="btn-sm" onclick="event.stopPropagation();openEditRapport('${r.id}')">Modifier</button>`:''}
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
      ${buildRapportLiensHTML(r)}
      ${peutModifier?buildEditRapportFormHTML(r):''}
    </div>
  </div>`;
}

// ── Liens rapport → fiches tierces ───────────────────────────────────
function buildRapportLiensHTML(r){
  const peutModifier  = rensCanWrite();
  const peutSupprimer = rensCanDelete();

  // ── Liens vers fiches ───────────────────────────────────────────────
  const liens = RENS.rapportLiens.filter(l=>l.rapport_id===r.id);
  const liensHTML = liens.map(l=>{
    const fiche = RENS.fiches.find(f=>f.id===l.fiche_id);
    if(!fiche) return '';
    const typeLabel = fiche.type==='lieux'?'Lieu':fiche.type==='individus'?'Individu':'Groupe';
    return `<a class="fiche-link" onclick="goToFiche('${fiche.id}','${fiche.type}')">
      <span class="fl-type">${typeLabel} ·</span> ${escH(fiche.nom)}
      ${peutSupprimer?`<span class="fl-del" onclick="event.stopPropagation();deleteRapportLien('${l.id}')" title="Supprimer ce lien">×</span>`:''}
    </a>`;
  }).join('');

  // ── Liens vers rapports ─────────────────────────────────────────────
  const rapliens = RENS.rapportRapport.filter(l=>l.rapport_a===r.id||l.rapport_b===r.id);
  const rapliensHTML = rapliens.map(l=>{
    const autreId = l.rapport_a===r.id ? l.rapport_b : l.rapport_a;
    const autre   = RENS.rapports.find(x=>x.id===autreId);
    if(!autre) return '';
    const ficheLiee = RENS.fiches.find(f=>f.id===autre.fiche_id);
    const date = autre.created_at ? new Date(autre.created_at).toLocaleDateString('fr-FR') : '';
    const label = `${date} — ${escH(autre.titre||'Inconnu')} · ${escH((autre.contenu||'').substring(0,40))}…`;
    return `<a class="fiche-link" onclick="goToRapport('${autre.id}')">
      <span class="fl-type">Rapport ·</span> ${ficheLiee?escH(ficheLiee.nom)+' — ':''} ${label}
      ${peutSupprimer?`<span class="fl-del" onclick="event.stopPropagation();deleteRapportRapport('${l.id}')" title="Supprimer ce lien">×</span>`:''}
    </a>`;
  }).join('');

  const toutHTML = [liensHTML, rapliensHTML].filter(Boolean).join('');

  // ── Options select : fiches groupées + rapports ─────────────────────
  const dejalieFiches   = liens.map(l=>l.fiche_id);
  const dejalieRapports = rapliens.map(l=>l.rapport_a===r.id?l.rapport_b:l.rapport_a);

  const optsFiches = ['lieux','individus','groupes'].map(type=>{
    const dispo = RENS.fiches.filter(x=>x.type===type && x.id!==r.fiche_id && !dejalieFiches.includes(x.id));
    if(!dispo.length) return '';
    return `<optgroup label="${type==='lieux'?'Lieux':type==='individus'?'Individus':'Groupes'}">
      ${dispo.map(x=>`<option value="f:${x.id}">${escH(x.nom)}</option>`).join('')}
    </optgroup>`;
  }).join('');

  const optsRapports = (()=>{
    const dispo = RENS.rapports.filter(x=>x.id!==r.id && !dejalieRapports.includes(x.id));
    if(!dispo.length) return '';
    return `<optgroup label="Rapports">
      ${dispo.map(x=>{
        const fiche = RENS.fiches.find(f=>f.id===x.fiche_id);
        const date  = x.created_at ? new Date(x.created_at).toLocaleDateString('fr-FR') : '';
        const label = `${date} — ${x.titre||'Inconnu'} · ${(x.contenu||'').substring(0,35)}…`;
        return `<option value="r:${x.id}">${fiche?escH(fiche.nom)+' / ':''} ${escH(label)}</option>`;
      }).join('')}
    </optgroup>`;
  })();

  return `
  <div class="relations-section">
    <div class="relations-title">
      Éléments liés à ce rapport
      ${peutModifier?`<button class="btn-sm" onclick="toggleRelForm('rlform-${r.id}')">+ Ajouter une relation</button>`:''}
    </div>
    <div class="relations-list" id="rl-list-${r.id}">
      ${toutHTML||'<span style="font-style:italic;color:var(--ink-faint);font-size:.88rem;">Aucun élément lié.</span>'}
    </div>
    ${peutModifier?`
    <div class="add-relation-form" id="rlform-${r.id}">
      <label>Lier à :</label>
      <select id="rl-sel-${r.id}">
        <option value="">— Sélectionner —</option>
        ${optsFiches}${optsRapports}
      </select>
      <button class="btn-add" style="font-size:.78rem;padding:.28rem .7rem;" onclick="addRapportLien('${r.id}')">Lier</button>
      <button class="btn-sm" onclick="toggleRelForm('rlform-${r.id}')">Annuler</button>
    </div>`:''
    }
  </div>`;
}

async function addRapportLien(rapportId){
  const sel = document.getElementById('rl-sel-'+rapportId);
  const val = sel?.value;
  if(!val){ toast('Sélectionne un élément.'); return; }
  try{
    if(val.startsWith('f:')){
      // Lien vers une fiche
      await sbPost('mk_rens_rapport_liens',{rapport_id:rapportId, fiche_id:val.slice(2)});
    } else if(val.startsWith('r:')){
      // Lien vers un rapport
      await sbPost('mk_rens_rapport_rapport',{rapport_a:rapportId, rapport_b:val.slice(2)});
    }
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); }
}

async function deleteRapportLien(lienId){
  if(!confirm('Supprimer ce lien ?')) return;
  try{
    await sbDelete('mk_rens_rapport_liens',`?id=eq.${lienId}`);
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); }
}

async function deleteRapportRapport(lienId){
  if(!confirm('Supprimer ce lien ?')) return;
  try{
    await sbDelete('mk_rens_rapport_rapport',`?id=eq.${lienId}`);
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); }
}

function rensCurrentAuthor(){
  if(!session)return {};
  const name = [session.garde?.prenom,session.garde?.nom].filter(Boolean).join(' ') || session.displayName || session.username || '';
  const grade = session.garde?.grade || session.grade || '';
  return {name, grade};
}

function rensAuthorLabel(row){
  const name = row?.created_by_name || '';
  const grade = row?.created_by_grade || '';
  if(name&&grade&&grade!=='—')return `${name} (${grade})`;
  return name||'';
}

function rensCanWrite(){
  return canAccessSection('renseignements');
}

function rensCanDelete(){
  return canEditSection('renseignements');
}

function rensIsOwner(row){
  return !!row?.created_by && !!session?.user?.id && row.created_by===session.user.id;
}

function rensCanEditOwn(row){
  return rensCanDelete() || rensIsOwner(row);
}

function buildAddRapportFormHTML(ficheId){
  return `
  <div class="add-rapport" id="addrap-${ficheId}">
    <div style="font-family:'Eagle Lake',serif;font-size:.85rem;color:var(--green-dark);margin-bottom:.75rem;">Déposer un nouveau rapport</div>
    <div class="form-row">
      <div class="field"><label>Titre</label><input type="text" id="raf-tit-${ficheId}" placeholder="Titre du rapport..."></div>
      <div class="field"><label>Fiabilité</label>
        <select id="raf-fib-${ficheId}">
          <option value="confirme">✅ Confirmée</option>
          <option value="nonverif" selected>⚠ Non vérifiée</option>
          <option value="fausse">❌ Invalidée</option>
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

function buildEditRapportFormHTML(r){
  return `
  <div class="add-rapport" id="editrap-${r.id}" style="display:none;margin-top:.75rem;">
    <div style="font-family:'Eagle Lake',serif;font-size:.85rem;color:var(--green-dark);margin-bottom:.75rem;">Modifier le rapport</div>
    <div class="form-row">
      <div class="field"><label>Titre</label><input type="text" id="er-tit-${r.id}" value="${escH(r.titre||'')}" placeholder="Titre du rapport..."></div>
      <div class="field"><label>Fiabilité</label>
        <select id="er-fib-${r.id}">
          <option value="confirme"${r.fiabilite==='confirme'?' selected':''}>✅ Confirmée</option>
          <option value="nonverif"${r.fiabilite==='nonverif'?' selected':''}>⚠ Non vérifiée</option>
          <option value="urgente"${r.fiabilite==='urgente'?' selected':''}>🔴 Urgente</option>
          <option value="fausse"${r.fiabilite==='fausse'?' selected':''}>❌ Invalidée</option>
        </select>
      </div>
    </div>
    <label>Contenu</label>
    <textarea id="er-cnt-${r.id}" rows="7" placeholder="Faits, témoignages, observations...">${escH(r.contenu||'')}</textarea>
    <label>Action recommandée <span style="font-style:italic;font-weight:normal;font-family:'IM Fell English',serif;font-size:.88rem;color:var(--ink-faint);">(facultatif)</span></label>
    <textarea id="er-act-${r.id}" rows="3">${escH(r.action_recommandee||'')}</textarea>
    <div style="display:flex;gap:.5rem;margin-top:.65rem;">
      <button class="btn-add" style="font-size:.82rem;padding:.3rem .8rem;" onclick="saveEditRapport('${r.id}')">Enregistrer</button>
      <button class="btn-sm" onclick="openEditRapport('${r.id}')">Annuler</button>
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
    <label>Notes</label>
    <textarea id="nf-notes" rows="4" placeholder="Description de la fiche — précisez ce qu'elle représente et ce qu'elle est susceptible de contenir."></textarea>
    <div style="display:flex;gap:.5rem;margin-top:.65rem;">
      <button class="btn-add" style="font-size:.82rem;padding:.3rem .8rem;" onclick="saveFiche()">Créer la fiche</button>
      <button class="btn-sm" onclick="document.getElementById('rens-add-form').style.display='none'">Annuler</button>
    </div>
  </div>`;
}

// ── Notification Discord ─────────────────────────────────────────────
async function notifyDiscordRenseignement(type, detail){
  const url = window.GrimoireConfig?.discordRenseignementWebhook;
  if(!url) return;

  const prenom     = session?.garde?.prenom || '';
  const nom        = session?.garde?.nom    || '';
  const grade      = session?.garde?.grade  || session?.grade || '';
  const nomComplet = [prenom, nom].filter(Boolean).join(' ') || session?.displayName || 'Garde inconnu';
  const auteur     = grade ? `${nomComplet} *(${grade})*` : nomComplet;

  const isFiche    = type === 'fiche';
  const titre      = isFiche
    ? '<:corbeau:1517815921258008697> **Nouvelle fiche versée aux archives**'
    : '<:corbeau:1517815921258008697> **Nouveau rapport déposé**';
  const sousTitre  = isFiche
    ? `-# *Une nouvelle fiche vient d'être versée aux archives de Fort-Aube.*`
    : `-# *Un nouveau rapport de renseignement vient d'être déposé.*`;
  const detailLine = detail ? `\n> **${isFiche ? 'Fiche' : 'Rapport'} :** ${detail}` : '';

  const content = `${titre}\n${sousTitre}${detailLine}\n> **Par :** ${auteur}\n\n<:aube:1516926588359540856> Consultez les archives et transmettez tout élément complémentaire à votre supérieur.`;

  try{
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  }catch(e){ console.warn('Discord webhook renseignement :', e); }
}

// ── CRUD Fiches ──────────────────────────────────────────────────────
async function saveFiche(){
  if(!rensCanWrite())return;
  const nom = document.getElementById('nf-nom').value.trim();
  const type= document.getElementById('nf-type').value;
  if(!nom){ alert('Le nom est obligatoire.'); return; }
  const payload = {
    nom, type,
    statut:       document.getElementById('nf-statut').value,
    urgente:      document.getElementById('nf-urgente').checked,
    notes:        document.getElementById('nf-notes').value.trim()||null,
    meta:         {},
    created_by:   session?.user?.id||null
  };
  try{await sbPost('mk_rens_fiches',payload);}
  catch(error){
    const {created_by, ...fallbackPayload} = payload;
    try{await sbPost('mk_rens_fiches',fallbackPayload);}
    catch(fallbackError){ alert('Erreur : '+fallbackError.message); return; }
  }
  await notifyDiscordRenseignement('fiche', nom);
  document.getElementById('rens-add-form').style.display='none';
  await rensLoad();
  // Aller sur le bon onglet
  const tabBtns = document.querySelectorAll('#page-renseignements .tab');
  const idx = ['lieux','individus','groupes'].indexOf(type);
  if(idx>=0 && tabBtns[idx]) showTab(type, tabBtns[idx]);
}

async function deleteFiche(id){
  if(!rensCanDelete())return;
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
    </div>
    <div class="form-row">
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
    <label>Notes</label>
    <textarea id="ef-notes-${f.id}" rows="4" placeholder="Description de la fiche — précisez ce qu'elle représente et ce qu'elle est susceptible de contenir.">${escH(f.notes||'')}</textarea>
    <div style="display:flex;gap:.5rem;margin-top:.65rem;">
      <button class="btn-add" style="font-size:.82rem;padding:.3rem .8rem;" onclick="saveEditFiche('${f.id}')">Enregistrer</button>
      <button class="btn-sm" onclick="document.getElementById('editform-${f.id}').style.display='none'">Annuler</button>
    </div>
  </div>`;
}

function openEditFiche(id){
  const f = RENS.fiches.find(x=>x.id===id);
  if(!f || !rensCanEditOwn(f))return;
  const formEl = document.getElementById('editform-'+id);
  if(formEl){ formEl.style.display = formEl.style.display==='none'?'block':'none'; return; }
  // Formulaire pas encore injecté — rare, mais fallback sécurisé
  const body = document.querySelector(`#fiche-${id} .fiche-body`);
  if(!body) return;
  const div = document.createElement('div');
  div.innerHTML = buildEditFicheFormHTML(f);
  body.prepend(div.firstElementChild);
  document.getElementById('editform-'+id).style.display = 'block';
}

async function saveEditFiche(id){
  const fiche = RENS.fiches.find(f=>f.id===id);
  if(!fiche || !rensCanEditOwn(fiche))return;
  const nom = document.getElementById('ef-nom-'+id)?.value.trim();
  if(!nom){ alert('Le nom est obligatoire.'); return; }
  const payload = {
    nom,
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
  if(!rensCanWrite())return;
  const titre    = document.getElementById('raf-tit-'+ficheId).value.trim();
  const fiabilite= document.getElementById('raf-fib-'+ficheId).value;
  const contenu  = document.getElementById('raf-cnt-'+ficheId).value.trim();
  const action   = document.getElementById('raf-act-'+ficheId).value.trim();
  if(!contenu){ alert('Le contenu est obligatoire.'); return; }
  const author=rensCurrentAuthor();
  const payload={fiche_id: ficheId, titre: titre||null, fiabilite, contenu, action_recommandee: action||null};
  const payloadWithAuthor={
    ...payload,
    created_by:session?.user?.id||null,
    created_by_name:author.name||null,
    created_by_grade:author.grade||null,
  };
  try{await sbPost('mk_rens_rapports',payloadWithAuthor);}
  catch(error){
    try{await sbPost('mk_rens_rapports',payload);}
    catch(fallbackError){ alert('Erreur : '+fallbackError.message); return; }
  }
  await notifyDiscordRenseignement('rapport', titre||source||'Sans titre');
  await rensLoad();
}

function openEditRapport(rapId){
  const report = RENS.rapports.find(r=>r.id===rapId);
  if(!report || !rensCanEditOwn(report))return;
  const form = document.getElementById('editrap-'+rapId);
  if(form)form.style.display = form.style.display==='none' ? 'block' : 'none';
}

async function saveEditRapport(rapId){
  const report = RENS.rapports.find(r=>r.id===rapId);
  if(!report || !rensCanEditOwn(report))return;
  const contenu = document.getElementById('er-cnt-'+rapId)?.value.trim();
  if(!contenu){ alert('Le contenu est obligatoire.'); return; }
  const payload = {
    titre: document.getElementById('er-tit-'+rapId)?.value.trim()||null,
    fiabilite: document.getElementById('er-fib-'+rapId)?.value||'nonverif',
    contenu,
    action_recommandee: document.getElementById('er-act-'+rapId)?.value.trim()||null,
  };
  try{ await sbPatch('mk_rens_rapports',`?id=eq.${encodeURIComponent(rapId)}`,payload); }
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

async function deleteRapport(rapId, ficheId){
  if(!rensCanDelete())return;
  if(!confirm('Supprimer ce rapport ?')) return;
  try{await sbDelete('mk_rens_rapports',`?id=eq.${rapId}`);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── CRUD Relations ───────────────────────────────────────────────────
async function addRelation(ficheSourceId){
  if(!rensCanWrite())return;
  const sel = document.getElementById('relsel-'+ficheSourceId);
  const cibleId = sel ? sel.value : '';
  if(!cibleId){ alert('Sélectionne une fiche cible.'); return; }
  try{await sbPost('mk_rens_relations',{fiche_source: ficheSourceId, fiche_cible: cibleId});}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

async function deleteRelation(relId, ficheId){
  if(!rensCanDelete())return;
  if(!confirm('Supprimer ce lien ?')) return;
  try{await sbDelete('mk_rens_relations',`?id=eq.${relId}`);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── removeRel (alias fallback) ────────────────────────────────────
function removeRel(btn){ btn.closest('.fiche-link').remove(); }

// ── Recherche & filtre ────────────────────────────────────────────
function rensSearch(q){
  RENS.searchQ = q;
  if(RENS.activeTab==='carte') rensRenderCarte();
  else renderTab(RENS.activeTab);
}
function rensFilter(v){
  RENS.filterStatut = v==='Tous les statuts'?'':v;
  if(RENS.activeTab==='carte') rensRenderCarte();
  else renderTab(RENS.activeTab);
}

// ── Init renseignements (appelé depuis init() Supabase) ───────────
async function initRenseignements(){
  // Les lecteurs de la section peuvent créer du contenu, les éditeurs peuvent supprimer.
  const wrap = document.getElementById('rens-add-wrap');
  if(wrap && rensCanWrite()){
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
  if(!document.getElementById('btn-carte-rens')){
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.id = 'btn-carte-rens';
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
      <div class="rens-map-notice">Carte mentale des rapports : ajoutez les rapports utiles au tableau, déplacez-les librement, reliez les indices avec des fils colorés. Double-cliquez sur une carte pour ouvrir le rapport.</div>
      <div class="rens-map-toolbar">
        ${rensCanWrite()?`
          <button type="button" class="btn-add" onclick="rensOpenMapReportPicker('rapport')">+ Ajouter rapport</button>
          <button type="button" class="btn-add" onclick="rensOpenMapReportPicker('fiche')" style="background:var(--gold-dark,#7a6030);margin-left:.4rem;">+ Ajouter fiche</button>
          <button type="button" class="btn-sm" onclick="rensStartMapLink()">Relier deux éléments</button>
          <button type="button" class="btn-sm" onclick="rensCancelMapLink()">Annuler liaison</button>
          <label class="rens-map-color">Couleur du fil <input id="rensMapLinkColor" type="color" value="#8A1010" onchange="rensSetMapLinkColor(this.value)"></label>
          ${rensCanDelete()?`<button type="button" class="btn-sm btn-danger-soft" onclick="rensDeleteSelectedMapItem()">Supprimer sélection</button>`:''}
        `:''}
        <span id="rensMapModeLabel" class="rens-map-mode">Déplacez les cartes comme sur un tableau d'enquête.</span>
      </div>
      <div id="rensMapPicker" class="rens-map-picker" hidden>
        <div id="rensMapPickerRapport">
          <select id="rensMapReportType" onchange="rensSetMapReportType(this.value)">
            ${['all','lieux','individus','groupes'].map(type=>`<option value="${type}">${escH({all:'Tous les rapports',lieux:'Lieux',individus:'Individus',groupes:'Groupes'}[type])}</option>`).join('')}
          </select>
          <div id="rensMapReportList" class="rens-map-report-list"></div>
        </div>
        <div id="rensMapPickerFiche" hidden>
          <div id="rensMapFicheList" class="rens-map-report-list"></div>
        </div>
      </div>
      <div class="rens-map-legend">
        <span><i class="rens-map-dot rens-map-dot-lieu"></i>Lieu</span>
        <span><i class="rens-map-dot rens-map-dot-individu"></i>Individu</span>
        <span><i class="rens-map-dot rens-map-dot-groupe"></i>Groupe</span>
        <span><i class="rens-map-dot rens-map-dot-danger"></i>Urgente / Recherché</span>
        <span style="display:inline-flex;align-items:center;gap:.3rem;"><i style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#c8a84b;border:2px solid #7a6030;"></i>Fiche centrale</span>
        <em>Un fil représente une piste ou une connexion d'enquête.</em>
      </div>
      <div class="rens-map-shell">
        <div id="rens-network"></div>
      </div>`;
    lastTabContent.parentElement.appendChild(div);
  }
}

function rensLoadVisNetwork(callback){
  if(window.vis){ callback(); return; }
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
  s.onload = callback;
  s.onerror = ()=>{
    const container = document.getElementById('rens-network');
    if(container)container.innerHTML = '<p class="sa-empty" style="padding:1rem;">Impossible de charger la carte des renseignements.</p>';
    console.error('Impossible de charger vis-network');
  };
  document.head.appendChild(s);
}

function rensFicheForRapport(report){
  return RENS.fiches.find(f=>f.id===report?.fiche_id)||null;
}

function rensRapportType(report){
  return rensFicheForRapport(report)?.type||'autres';
}

function rensRapportLabel(report){
  const fiche = rensFicheForRapport(report);
  const source = report?.titre||'Rapport';
  const date = report?.created_at ? new Date(report.created_at).toLocaleDateString('fr-FR') : '';
  return `${fiche?.nom||'Fiche inconnue'} — ${source}${date?` — ${date}`:''}`;
}

function rensMapTypeColors(type){
  return {
    lieux:{bg:'#c8b89a',border:'#8a6a3a'},
    individus:{bg:'#9aabbc',border:'#3a5a7a'},
    groupes:{bg:'#9ab8a0',border:'#3a6a4a'},
    autres:{bg:'#d8c8aa',border:'#7a6a4a'},
  }[type]||{bg:'#d8c8aa',border:'#7a6a4a'};
}

function rensMapReportListHtml(){
  const spawned = new Set(RENS.mapNodes.map(node=>node.report_id).filter(Boolean));
  const reports = RENS.rapports
    .filter(report=>RENS.mapPickerType==='all'||rensRapportType(report)===RENS.mapPickerType)
    .filter(report=>!spawned.has(report.id));
  if(!reports.length)return '<p class="sa-empty">Aucun rapport disponible pour ce type.</p>';
  return reports.map(report=>`<button type="button" class="rens-map-report-choice" onclick="rensSpawnMapReport('${escJs(report.id)}')">
    <strong>${escH(rensRapportLabel(report))}</strong>
    <span>${escH((report.contenu||'').slice(0,110))}${report.contenu&&report.contenu.length>110?'…':''}</span>
  </button>`).join('');
}

function rensMapFicheListHtml(){
  const spawned = new Set(RENS.mapNodes.map(node=>node.fiche_id).filter(Boolean));
  const fiches = RENS.fiches.filter(f=>!spawned.has(f.id));
  if(!fiches.length)return '<p class="sa-empty">Toutes les fiches sont déjà sur la carte.</p>';
  return fiches.map(f=>`<button type="button" class="rens-map-report-choice" onclick="rensSpawnMapFiche('${escJs(f.id)}')">
    <strong>${escH(f.nom)}</strong>
    <span>${escH({lieux:'Lieu',individus:'Individu',groupes:'Groupe'}[f.type]||f.type)}${f.notes?` · ${escH(f.notes.slice(0,80))}`:''}</span>
  </button>`).join('');
}

function rensRenderMapPicker(){
  const list = document.getElementById('rensMapReportList');
  if(list) list.innerHTML = rensMapReportListHtml();
}

function rensRenderMapFichePicker(){
  const list = document.getElementById('rensMapFicheList');
  if(list) list.innerHTML = rensMapFicheListHtml();
}

function rensOpenMapReportPicker(mode){
  if(!rensCanWrite())return;
  const picker = document.getElementById('rensMapPicker');
  if(!picker)return;
  const rapportDiv = document.getElementById('rensMapPickerRapport');
  const ficheDiv   = document.getElementById('rensMapPickerFiche');
  const isFiche    = mode === 'fiche';
  const isAlreadyOpen = !picker.hidden;
  const isSameMode = (isFiche && ficheDiv && !ficheDiv.hidden) || (!isFiche && rapportDiv && !rapportDiv.hidden);
  if(isAlreadyOpen && isSameMode){ picker.hidden = true; return; }
  picker.hidden = false;
  if(rapportDiv) rapportDiv.hidden = isFiche;
  if(ficheDiv)   ficheDiv.hidden   = !isFiche;
  if(isFiche) rensRenderMapFichePicker();
  else rensRenderMapPicker();
}

function rensSetMapReportType(type){
  RENS.mapPickerType = type || 'all';
  rensRenderMapPicker();
}

function rensUpdateMapModeLabel(text){
  const label = document.getElementById('rensMapModeLabel');
  if(label)label.textContent = text;
}

function rensSetMapLinkColor(value){
  RENS.mapLinkColor = value || '#8A1010';
}

function rensDefaultMapPosition(index = RENS.mapNodes.length){
  const angle = index * 0.9;
  return {
    x: Math.round(Math.cos(angle) * 220),
    y: Math.round(Math.sin(angle) * 150),
  };
}

async function rensSpawnMapReport(reportId){
  if(!rensCanWrite())return;
  if(!RENS.mapReady){toast('Applique le SQL de carte mentale des renseignements avant.');return;}
  const existing = RENS.mapNodes.find(node=>node.report_id===reportId);
  if(existing){
    RENS.selectedMapNode = existing.id;
    rensRenderCarte();
    return;
  }
  const pos = rensDefaultMapPosition();
  try{
    await sbPost('mk_rens_map_nodes',{
      report_id: reportId,
      node_type: 'rapport',
      x: pos.x,
      y: pos.y,
      created_by: session.user.id,
    });
    const picker = document.getElementById('rensMapPicker');
    if(picker)picker.hidden = true;
    await rensLoad();
    toast('Rapport ajouté à la carte mentale.');
  }catch(error){
    console.error(error);
    toast('Impossible d\'ajouter ce rapport à la carte mentale.');
  }
}

async function rensSpawnMapFiche(ficheId){
  if(!rensCanWrite())return;
  if(!RENS.mapReady){toast('Applique le SQL de carte mentale des renseignements avant.');return;}
  const existing = RENS.mapNodes.find(node=>node.fiche_id===ficheId);
  if(existing){
    RENS.selectedMapNode = existing.id;
    rensRenderCarte();
    return;
  }
  const pos = rensDefaultMapPosition();
  try{
    await sbPost('mk_rens_map_nodes',{
      fiche_id: ficheId,
      node_type: 'fiche',
      x: pos.x,
      y: pos.y,
      created_by: session.user.id,
    });
    const picker = document.getElementById('rensMapPicker');
    if(picker)picker.hidden = true;
    await rensLoad();
    toast('Fiche ajoutée à la carte mentale.');
  }catch(error){
    console.error(error);
    toast('Impossible d\'ajouter cette fiche à la carte mentale.');
  }
}
async function rensSaveMapNodePosition(nodeId, x, y){
  const node = RENS.mapNodes.find(row=>row.id===nodeId);
  if(!rensCanEditOwn(node)||!RENS.mapReady)return;
  if(node){node.x=x;node.y=y;}
  try{
    await sbPatch('mk_rens_map_nodes',`?id=eq.${encodeURIComponent(nodeId)}`,{
      x: Math.round(Number(x)),
      y: Math.round(Number(y)),
      updated_at: new Date().toISOString(),
    });
  }catch(error){
    console.error(error);
    toast('Position non sauvegardée.');
  }
}

function rensStartMapLink(){
  if(!rensCanWrite())return;
  RENS.mapLinkMode = true;
  RENS.mapLinkSource = '';
  RENS.mapLinkColor = document.getElementById('rensMapLinkColor')?.value || RENS.mapLinkColor;
  rensUpdateMapModeLabel('Mode liaison : cliquez sur le premier rapport, puis sur le second.');
}

function rensCancelMapLink(){
  RENS.mapLinkMode = false;
  RENS.mapLinkSource = '';
  rensUpdateMapModeLabel('Déplacez les cartes comme sur un tableau d\'enquête.');
  rensRenderCarte();
}

async function rensCreateMapLink(sourceId, targetId){
  if(!rensCanWrite()||!RENS.mapReady||sourceId===targetId)return;
  try{
    await sbPost('mk_rens_map_links',{
      source_node_id: sourceId,
      target_node_id: targetId,
      color: document.getElementById('rensMapLinkColor')?.value || RENS.mapLinkColor,
      created_by: session.user.id,
    });
    RENS.mapLinkMode = false;
    RENS.mapLinkSource = '';
    await rensLoad();
    toast('Lien ajouté.');
  }catch(error){
    console.error(error);
    toast('Impossible de créer ce lien.');
  }
}

async function rensDeleteSelectedMapItem(){
  if(!rensCanDelete())return;
  if(RENS.selectedMapNode){
    if(!confirm('Retirer ce rapport de la carte mentale ?'))return;
    await sbDelete('mk_rens_map_nodes',`?id=eq.${encodeURIComponent(RENS.selectedMapNode)}`);
    RENS.selectedMapNode = '';
    await rensLoad();
    return;
  }
  if(RENS.selectedMapLink){
    if(!confirm('Supprimer ce fil ?'))return;
    await sbDelete('mk_rens_map_links',`?id=eq.${encodeURIComponent(RENS.selectedMapLink)}`);
    RENS.selectedMapLink = '';
    await rensLoad();
    return;
  }
  toast('Sélectionne une carte ou un fil à supprimer.');
}

function rensRenderCarte(){
  const container = document.getElementById('rens-network');
  if(!container) return;
  rensRenderMapPicker();

  if(!RENS.mapReady){
    container.innerHTML = '<p class="rens-map-empty">Carte mentale non configurée côté Supabase. Lance le script supabase/sql/renseignements_map.sql.</p>';
    return;
  }
  if(!RENS.mapNodes.length){
    container.innerHTML = '<p class="rens-map-empty">Aucun rapport posé sur la carte mentale. Utilisez “Ajouter rapport” pour commencer.</p>';
    return;
  }

  container.innerHTML = '<p class="rens-map-empty">Préparation du tableau d\'enquête...</p>';
  rensLoadVisNetwork(()=>{
    const nodes = new vis.DataSet(RENS.mapNodes.map((node,index)=>{
      const isFiche = node.node_type === 'fiche';
      const selected = RENS.selectedMapNode===node.id;
      if(isFiche){
        const fiche = RENS.fiches.find(f=>f.id===node.fiche_id);
        const rapsCount = RENS.rapports.filter(r=>r.fiche_id===node.fiche_id).length;
        return {
          id: node.id, ficheId: node.fiche_id,
          x: Number.isFinite(Number(node.x)) ? Number(node.x) : rensDefaultMapPosition(index).x,
          y: Number.isFinite(Number(node.y)) ? Number(node.y) : rensDefaultMapPosition(index).y,
          label: `${fiche?.nom||'Fiche'}${rapsCount?`
(${rapsCount} rapport${rapsCount>1?'s':''})` :''}`,
          title: fiche?.nom||'Fiche centrale',
          shape: 'ellipse',
          color:{ background: selected ? '#f5ead0' : '#e8d49a', border: selected ? '#8a1010' : '#7a6030', highlight:{background:'#f5ead0',border:'#8a1010'} },
          borderWidth: selected ? 3 : 2,
          font:{face:'serif',size:15,color:'#3a2a0a',bold:true,multi:true}, margin:14,
        };
      }
      const report = RENS.rapports.find(r=>r.id===node.report_id);
      const fiche = rensFicheForRapport(report);
      const type = rensRapportType(report);
      const colors = rensMapTypeColors(type);
      return {
        id: node.id, reportId: node.report_id,
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : rensDefaultMapPosition(index).x,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : rensDefaultMapPosition(index).y,
        label: `${fiche?.nom||'Fiche'}
${report?.titre||'Rapport'}`,
        title: rensRapportLabel(report),
        shape: 'box',
        color:{ background: selected ? '#f0d8d8' : colors.bg, border: selected ? '#8a1010' : colors.border, highlight:{background:'#efe1c4',border:'#8a1010'} },
        borderWidth: selected ? 3 : 1.5,
        font:{face:'serif',size:14,color:'#1c1a18',multi:true}, margin:12,
      };
    }));
    const edges = new vis.DataSet(RENS.mapLinks.map(link=>({
      id: link.id,
      from: link.source_node_id,
      to: link.target_node_id,
      color:{color:link.color||'#8A1010',highlight:'#3a2a1a',opacity:0.92},
      width: RENS.selectedMapLink===link.id ? 4 : 2.2,
      smooth:{type:'curvedCW',roundness:0.12},
    })));

    const options = {
      physics:false,
      interaction:{dragNodes:rensCanWrite(),zoomView:true,dragView:true,hover:true},
      nodes:{chosen:false},
      edges:{chosen:false},
    };

    container.innerHTML = '';
    rensMapNetwork = new vis.Network(container,{nodes,edges},options);
    rensMapNetwork.fit({animation:false});

    rensMapNetwork.on('click', params=>{
      RENS.selectedMapNode = params.nodes[0] || '';
      RENS.selectedMapLink = params.edges[0] || '';
      if(RENS.mapLinkMode && RENS.selectedMapNode){
        if(!RENS.mapLinkSource){
          RENS.mapLinkSource = RENS.selectedMapNode;
          rensUpdateMapModeLabel('Mode liaison : cliquez sur le second rapport.');
        }else{
          rensCreateMapLink(RENS.mapLinkSource, RENS.selectedMapNode);
        }
        return;
      }
      if(RENS.selectedMapNode){
        const node = RENS.mapNodes.find(n=>n.id===RENS.selectedMapNode);
        const label = node?.node_type==='fiche' ? 'Fiche sélectionnée' : 'Carte sélectionnée';
        rensUpdateMapModeLabel(`${label}. Double-cliquez pour ouvrir, ou supprimez-la si besoin.`);
      }
      else if(RENS.selectedMapLink)rensUpdateMapModeLabel('Fil sélectionné. Vous pouvez le supprimer si besoin.');
      else rensUpdateMapModeLabel('Déplacez les cartes comme sur un tableau d’enquête.');
    });

    rensMapNetwork.on('doubleClick', params=>{
      const nodeId = params.nodes[0];
      const node = RENS.mapNodes.find(row=>row.id===nodeId);
      if(!node) return;
      if(node.node_type === 'fiche') goToFiche(node.fiche_id, RENS.fiches.find(f=>f.id===node.fiche_id)?.type);
      else goToRapport(node.report_id);
    });

    rensMapNetwork.on('dragEnd', params=>{
      if(!params.nodes.length)return;
      const positions = rensMapNetwork.getPositions(params.nodes);
      params.nodes.forEach(nodeId=>{
        const pos = positions[nodeId];
        if(pos)rensSaveMapNodePosition(nodeId,pos.x,pos.y);
      });
    });

    rensMapNetwork.on('hoverNode', ()=>{ container.style.cursor='pointer'; });
    rensMapNetwork.on('blurNode',  ()=>{ container.style.cursor='default'; });
  });
}

// ── Escape HTML ───────────────────────────────────────────────────
function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
