// ══════════════════════════════════════════════════════════════════════
//  INVENTAIRE
// ══════════════════════════════════════════════════════════════════════
function loadInvHistory(){try{return JSON.parse(localStorage.getItem('mk_inv_history')||'[]');}catch(e){return[];}}
function saveInvHistory(h){try{localStorage.setItem('mk_inv_history',JSON.stringify(h.slice(0,200)));}catch(e){}}

// ── État filtres inventaire ───────────────────────────────────────────
let invActiveCat = 'tout';

const CATEGORIES = ['Équipement','Potions','Nourriture','Ingrédient','Livres','Matériaux'];
const CAT_SLUG   = {'Équipement':'cat-equip','Potions':'cat-potions','Nourriture':'cat-nourriture','Ingrédient':'cat-ingredient','Livres':'cat-livres','Matériaux':'cat-materiaux'};

// ── Onglets catégorie — injectés dynamiquement avant le tableau ────────

// ── Onglets catégorie ─────────────────────────────────────────────────
function invShowTab(cat, el){
  invActiveCat = cat;
  document.querySelectorAll('[id^="inv-tab-"]').forEach(t=>t.style.display='none');
  const panel = document.getElementById('inv-tab-'+cat);
  if(panel) panel.style.display='block';
  document.querySelectorAll('#page-inventaire .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ── Recherche sur l'onglet actif ──────────────────────────────────────
function invSearch(q){
  const stock = document.getElementById('inv-filter-stock')?.value||'';
  const tbodyId = invActiveCat==='tout'?'inv-tbody-tout':'inv-tbody-'+invActiveCat;
  const tbody = document.getElementById(tbodyId);
  if(!tbody)return;
  tbody.querySelectorAll('tr').forEach(row=>{
    const name = row.getAttribute('data-search')||'';
    const s    = row.getAttribute('data-stock')||'';
    row.style.display = (!q||name.includes(q.toLowerCase()))&&(!stock||s===stock)?'':'none';
  });
}

// ── Indicateur de stock ───────────────────────────────────────────────
function stockDot(qty){
  const color = qty<=0?'#7A1010':qty<=2?'#8B6914':'#2D6A2D';
  const title = qty<=0?'Épuisé':qty<=2?'Stock bas':'En stock';
  return `<span title="${title}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:.4rem;vertical-align:middle;"></span>`;
}

// ── Ligne de tableau ──────────────────────────────────────────────────
function invRow(r, canAdmin, showCat){
  return `<tr data-search="${esc(r.nom.toLowerCase())}" data-stock="${r.quantite<=0?'vide':'dispo'}" data-cat="${esc(r.categorie||'')}">
    <td class="cell-name">${stockDot(r.quantite)}${esc(r.nom)}</td>
    ${showCat?`<td class="cell-meta">${r.categorie?`<span class="badge badge-${CAT_SLUG[r.categorie]||'tag'}">${esc(r.categorie)}</span>`:'—'}</td>`:''}
    <td>${canAdmin
      ?`<div style="display:flex;align-items:center;gap:.5rem;">
          <button class="btn-del" style="border-color:var(--border-g);color:var(--ink-mid);font-size:1rem;width:26px;height:26px;display:flex;align-items:center;justify-content:center;padding:0;" onclick="updateQty('${r.id}','${escJs(r.nom)}',${r.quantite},-1)">−</button>
          <input type="number" min="0" value="${r.quantite}" style="width:3.4rem;text-align:center;font-family:'Eagle Lake',serif;font-size:1rem;background:var(--parch);border:1px solid var(--border-g);color:${r.quantite<=0?'#7A1010':'var(--green-dark)'};padding:.15rem 0;" onchange="setQty('${r.id}','${escJs(r.nom)}',${r.quantite},this.value)">
          <button class="btn-del" style="border-color:var(--border-g);color:var(--ink-mid);font-size:1rem;width:26px;height:26px;display:flex;align-items:center;justify-content:center;padding:0;" onclick="updateQty('${r.id}','${escJs(r.nom)}',${r.quantite},1)">+</button>
        </div>`
      :`<span style="font-family:'Eagle Lake',serif;font-size:1rem;color:${r.quantite<=0?'#7A1010':'var(--green-dark)'};">${r.quantite}</span>`
    }</td>
    ${canAdmin?`<td class="act"><button class="btn-del" onclick="editInvItem('${r.id}')">Modifier</button> <button class="btn-del" onclick="delInvItem('${r.id}')">Suppr.</button></td>`:''}
  </tr>`;
}

let ordresFabRows=[];
async function loadOrdresFab(){
  try{const rows=await sbGet('mk_ordres_fabrication','?order=created_at.asc');renderOrdresFab(rows);}catch(e){console.error(e);}
}
function renderOrdresFab(rows){
  ordresFabRows=rows;
  const list=document.getElementById('ordres-fab-list');if(!list)return;
  list.innerHTML=rows.map(r=>{
    const current=r.avancement||0;
    const objectif=r.objectif||0;
    const pct=objectif>0?Math.min(100,Math.round(current/objectif*100)):0;
    const done=objectif>0&&current>=objectif;
    return `<div style="background:var(--parch);border:1px solid var(--border-g);border-left:4px solid ${done?'#2D6A2D':'var(--gold)'};padding:0.7rem 1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
        <span style="font-family:'Eagle Lake',serif;font-size:1rem;color:var(--green-dark);">${esc(r.objet)}${done?' ✅':''}</span>
        <button class="btn-del" onclick="delOrdreFab('${r.id}')">Suppr.</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
        <button class="btn-del" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;padding:0;" onclick="incrementOrdreFab('${r.id}',${current},-1)">−</button>
        <input type="number" min="0" value="${current}" style="width:4rem;text-align:center;font-family:'Eagle Lake',serif;font-size:1rem;background:var(--parch-dark);border:1px solid var(--border-g);color:var(--green-dark);padding:.15rem 0;" onchange="setOrdreFabAvancement('${r.id}',${current},this.value)">
        <button class="btn-del" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;padding:0;" onclick="incrementOrdreFab('${r.id}',${current},1)">+</button>
        <span style="font-family:'IM Fell English',serif;font-size:1rem;color:var(--ink-mid);white-space:nowrap;">/ ${objectif}</span>
        <div style="flex:1;min-width:80px;height:8px;background:var(--parch-dark);border:1px solid var(--border-g);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${done?'#2D6A2D':'var(--gold)'}; transition:width .3s;"></div>
        </div>
        <span style="font-family:'IM Fell English',serif;font-size:1rem;color:var(--ink-faint);white-space:nowrap;">${pct}%</span>
      </div>
    </div>`;
  }).join('') || `<p style="font-family:'IM Fell English',serif;font-style:italic;color:var(--ink-faint);font-size:1rem;padding:0.5rem 0.2rem;">Aucun ordre de fabrication en cours.</p>`;
}
async function addOrdreFab(){
  const objet=document.getElementById('ordre-fab-objet').value.trim();
  const objectif=Math.max(1,parseInt(document.getElementById('ordre-fab-objectif').value)||1);
  if(!objet){toast('Objet requis.');return;}
  try{
    await sbPost('mk_ordres_fabrication',{objet,objectif,avancement:0});
    document.getElementById('ordre-fab-objet').value='';document.getElementById('ordre-fab-objectif').value='10';
    toggleForm('ordre-fab-form');await loadOrdresFab();toast(`Ordre de fabrication lancé : ${objet}.`);
  }catch(e){toast('Erreur.');}
}
async function applyOrdreFabAvancement(id,current,newVal){
  newVal=Math.max(0,newVal);if(newVal===current)return;
  try{await sbPatch('mk_ordres_fabrication',`?id=eq.${id}`,{avancement:newVal});await loadOrdresFab();}catch(e){toast('Erreur.');}
}
async function incrementOrdreFab(id,current,delta){await applyOrdreFabAvancement(id,current,current+delta);}
async function setOrdreFabAvancement(id,current,newValRaw){await applyOrdreFabAvancement(id,current,parseInt(newValRaw)||0);}
async function delOrdreFab(id){if(!confirm('Supprimer cet ordre de fabrication ?'))return;try{await sbDelete('mk_ordres_fabrication',`?id=eq.${id}`);await loadOrdresFab();toast('Ordre supprimé.');}catch(e){toast('Erreur.');}}

async function loadInventaire(){try{const rows=await sbGet('mk_inventaire','?order=nom.asc');renderInventaire(rows);}catch(e){console.error(e);}}

// ══════════════════════════════════════════════════════════════════════
//  RECETTES
// ══════════════════════════════════════════════════════════════════════
let recettesRows=[];
async function loadRecettes(){
  try{const rows=await sbGet('mk_recettes','?order=objet.asc');renderRecettes(rows);}catch(e){console.error(e);}
}
function renderRecettes(rows){
  recettesRows=rows;
  const canEdit=canEditSection('inventaire');
  const list=document.getElementById('recettes-list');if(!list)return;
  list.innerHTML=rows.map(r=>`<div style="background:var(--parch);border:1px solid var(--border-g);border-left:4px solid var(--gold);padding:0.65rem 1rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">
      <span style="font-family:'Eagle Lake',serif;font-size:1rem;color:var(--green-dark);">${esc(r.objet)}</span>
      ${canEdit?`<button class="btn-del" onclick="delRecette('${r.id}')">Suppr.</button>`:''}
    </div>
    <p style="font-family:'IM Fell English',serif;font-size:1rem;color:var(--ink-mid);white-space:pre-wrap;margin:0;">${esc(r.recette)}</p>
  </div>`).join('') || `<p style="font-family:'IM Fell English',serif;font-style:italic;color:var(--ink-faint);font-size:1rem;padding:0.5rem 0.2rem;">Aucune recette enregistrée.</p>`;
}
async function addRecette(){
  const objet=document.getElementById('recette-objet').value.trim();
  const recette=document.getElementById('recette-texte').value.trim();
  if(!objet||!recette){toast('Objet et recette requis.');return;}
  try{
    await sbPost('mk_recettes',{objet,recette});
    document.getElementById('recette-objet').value='';document.getElementById('recette-texte').value='';
    toggleForm('recette-form');await loadRecettes();toast(`Recette enregistrée : ${objet}.`);
  }catch(e){toast('Erreur.');}
}
async function delRecette(id){if(!confirm('Supprimer cette recette ?'))return;try{await sbDelete('mk_recettes',`?id=eq.${id}`);await loadRecettes();toast('Recette supprimée.');}catch(e){toast('Erreur.');}}

// ══════════════════════════════════════════════════════════════════════
//  RENDU INVENTAIRE — groupé par catégorie
// ══════════════════════════════════════════════════════════════════════
function renderInventaire(rows){
  invRows=rows;
  const canAdmin=canEditSection('inventaire');
  const empty=rows.filter(r=>r.quantite<=0).length;
  document.getElementById('inv-total').textContent=rows.length;
  document.getElementById('inv-empty').textContent=empty;

  // Têtes de colonnes Actions sur tous les panneaux
  ['inv-act-head','inv-act-head-equip','inv-act-head-potions',
   'inv-act-head-nourrit','inv-act-head-ingred','inv-act-head-livres','inv-act-head-mat'
  ].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=canAdmin?'':'none';});

  // Panneau "Tout" — toutes catégories avec badge
  const toutTbody=document.getElementById('inv-tbody-tout');
  if(toutTbody) toutTbody.innerHTML=rows.map(r=>invRow(r,canAdmin,true)).join('');

  // Panneaux par catégorie
  CATEGORIES.forEach(cat=>{
    const tbody=document.getElementById('inv-tbody-'+cat);
    if(!tbody)return;
    const catRows=rows.filter(r=>r.categorie===cat);
    tbody.innerHTML=catRows.length
      ?catRows.map(r=>invRow(r,canAdmin,false)).join('')
      :`<tr><td colspan="${canAdmin?3:2}" style="font-family:'IM Fell English',serif;font-style:italic;color:var(--ink-faint);padding:.6rem;">Aucun objet dans cette catégorie.</td></tr>`;
  });
}
function editInvItem(id){
  const row=invRows.find(r=>r.id===id);if(!row)return;
  editState={type:'inventaire',id};
  document.getElementById('inv-nom').value=row.nom||'';
  document.getElementById('inv-categorie').value=row.categorie||'';
  document.getElementById('inv-qty').value=row.quantite||0;
  document.getElementById('inv-submit-btn').textContent='Mettre à jour';
  openFormById('inv-form');
}
async function addInvItem(){
  const nom=document.getElementById('inv-nom').value.trim();
  const categorie=document.getElementById('inv-categorie').value;
  const quantite=Math.max(0,parseInt(document.getElementById('inv-qty').value)||0);
  if(!nom){toast('Nom requis.');return;}
  try{
    const isEdit=editState&&editState.type==='inventaire';
    if(isEdit)await sbPatch('mk_inventaire',`?id=eq.${editState.id}`,{nom,categorie,quantite});
    else await sbPost('mk_inventaire',{nom,categorie,quantite});
    document.getElementById('inv-nom').value='';
    document.getElementById('inv-categorie').value='';
    document.getElementById('inv-qty').value='0';
    clearEditState('inv-form');
    toggleForm('inv-form');await loadInventaire();toast(`${nom} ${isEdit?'mis à jour':'ajouté'}.`);
  }catch(e){toast('Erreur.');}
}
async function applyQty(id,nom,current,newQty){
  newQty=Math.max(0,newQty);if(newQty===current)return;
  const delta=newQty-current;
  try{
    await sbPatch('mk_inventaire',`?id=eq.${id}`,{quantite:newQty});
    const h=loadInvHistory();
    h.unshift({id,nom,oldQty:current,newQty,delta,player:session?session.username:'—',time:new Date().toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})});
    saveInvHistory(h);
    await loadInventaire();
    if(isLogged())renderInvHistory();
  }catch(e){console.error(e);toast('Erreur de mise à jour.');}
}
async function updateQty(id,nom,current,delta){await applyQty(id,nom,current,current+delta);}
async function setQty(id,nom,current,newValueRaw){await applyQty(id,nom,current,parseInt(newValueRaw)||0);}
async function delInvItem(id){if(!confirm('Supprimer ?'))return;try{await sbDelete('mk_inventaire',`?id=eq.${id}`);await loadInventaire();}catch(e){toast('Erreur.');}}

// ══════════════════════════════════════════════════════════════════════
//  HISTORIQUE
// ══════════════════════════════════════════════════════════════════════
function renderInvHistory(){
  const list=document.getElementById('inv-history-list');
  const empty=document.getElementById('inv-history-empty');
  if(!list)return;
  const h=loadInvHistory();
  if(h.length===0){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=h.slice(0,100).map((e,idx)=>`<div style="background:var(--parch);border:1px solid var(--border-g);border-left:3px solid ${e.delta>0?'var(--green-dark)':'#8B5E00'};padding:0.5rem 0.7rem;font-size:1rem;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.15rem;">
      <span style="font-family:'Eagle Lake',serif;font-size:1rem;color:var(--green-dark);">${esc(e.nom)}</span>
      <div style="display:flex;align-items:center;gap:0.4rem;">
        <span style="font-size:1rem;color:var(--ink-faint);font-style:italic;">${e.time}</span>
        <button onclick="revertInvEntry(${idx})" style="background:none;border:1px solid rgba(122,16,16,0.3);color:#7A1010;font-size:1rem;width:18px;height:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
      </div>
    </div>
    <span style="color:var(--ink-mid);">${e.oldQty} → ${e.newQty} <strong style="color:${e.delta>0?'var(--green-dark)':'#8B5E00'}">(${e.delta>0?'+':''}${e.delta})</strong></span>
  </div>`).join('');
}
async function revertInvEntry(idx){
  const h=loadInvHistory();const e=h[idx];if(!e)return;
  try{await sbPatch('mk_inventaire',`?id=eq.${e.id}`,{quantite:e.oldQty});h.splice(idx,1);saveInvHistory(h);await loadInventaire();renderInvHistory();toast(`${e.nom} rétabli à ${e.oldQty}.`);}catch(err){toast('Erreur.');}
}
function clearInvHistory(){if(!confirm('Effacer l\'historique ?'))return;saveInvHistory([]);renderInvHistory();toast('Historique effacé.');}
