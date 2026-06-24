// ══════════════════════════════════════════════════════════════════════
//  SUPABASE
// ══════════════════════════════════════════════════════════════════════
function garSwitchTab(n){
  document.getElementById('gar-page-1').style.display=n===1?'block':'none';
  document.getElementById('gar-page-2').style.display=n===2?'block':'none';
  ['gar-tab-1','gar-tab-2'].forEach((id,i)=>{
    const btn=document.getElementById(id);
    if(!btn) return;
    const active=(i+1===n);
    btn.style.background=active?'var(--green-dark)':'transparent';
    btn.style.color=active?'var(--gold-light)':'var(--ink-mid)';
    btn.style.borderColor=active?'var(--green)':'var(--border-g)';
  });
  if(n===2) renderOrganigramme();
}

// ── Données garde en mémoire ──
let gardeRows = [];
let citoyensRows = [];
let commercesRows = [];
let courRows = [];
let invRows = [];

function renderOrganigramme(){
  const el = document.getElementById('gar-organigramme-content');
  if(!el) return;

  // Grouper les joueurs par grade
  const byGrade = {};
  gardeRows.forEach(r => {
    const g = (r.grade||'').trim();
    if(!byGrade[g]) byGrade[g] = [];
    byGrade[g].push((r.prenom||'')+' '+(r.nom||''));
  });

  const total = gardeRows.length;
  const count = (grades) => grades.reduce((s,g)=>(byGrade[g]||[]).length+s,0);
  const POSTES_ENCADRES = 30;

  // Chaque palier porte sa propre teinte d'accent, du plus clair (commandement)
  // au plus sourd (troupe) — la Spécialité sort de la chaîne et porte une teinte à part.
  const LEVELS = [
    { label:'Commandement',       total:2,  accent:'var(--gold)',       accentLight:'var(--gold-light)', bg:'var(--parch)',
      grades:[["Commandeur de l'Aube",1],["Sénéchal de l'Aube",1]] },
    { label:'Officiers',          total:4,  accent:'#6B5234',           accentLight:'#D4BD8C', bg:'var(--parch)',
      grades:[['Exécuteur de la Garde',4]] },
    { label:'Sous-officiers',     total:6,  accent:'#54402A',           accentLight:'#BCA67C', bg:'var(--parch)',
      grades:[['Traqueur de la Garde',6]] },
    { label:'Troupe',             total:18, accent:'#3D2F1F',           accentLight:'#A8927A', bg:'var(--parch)',
      grades:[['Patrouilleur de la Garde',null],['Aspirant de la Garde',null]] },
    { label:'Spécialité',         total:null, accent:'#4A3B28',         accentLight:'#B0A080', bg:'var(--parch-dark)',
      grades:[['Artisan de la Garde','—'],['Confrère de la Garde','—'],['Mage de la Garde','—'],['Barde de la Garde','—']] },
  ];

  let h = `
    <div style="text-align:center;margin-bottom:2rem;">
      <p style="font-family:'Eagle Lake',serif;font-size:1.15rem;color:var(--green-dark);letter-spacing:.1em;">HIÉRARCHIE DE LA GARDE DE L'AUBE</p>
      <p style="font-family:'IM Fell English',serif;font-style:italic;font-size:1rem;color:var(--ink-mid);margin-top:.3rem;">
        Effectif actuel : <strong style="color:var(--green-dark);">${total}</strong> membres pour ${POSTES_ENCADRES} postes encadrés (Patrouilleurs et Aspirants partagent le même quota de Troupe ; rôles spécialisés illimités à part)
      </p>
      <div style="height:2px;background:linear-gradient(to right,transparent,var(--gold),transparent);margin:.85rem auto 0;max-width:300px;"></div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:stretch;gap:0;max-width:760px;margin:0 auto;">`;

  LEVELS.forEach((lv, li) => {
    const used = count(lv.grades.map(g=>g[0]));
    const isLast = li===LEVELS.length-1;

    h += `
      <div style="${li>0?'margin-top:1.6rem;':''}">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem;">
          <span style="flex:0 0 auto;font-family:'Eagle Lake',serif;font-size:1rem;letter-spacing:.16em;text-transform:uppercase;color:${lv.accent};white-space:nowrap;">${lv.label}</span>
          <span style="flex:1;height:1px;background:${lv.accent};opacity:.45;"></span>
          <span style="flex:0 0 auto;font-family:'Eagle Lake',serif;font-size:1rem;color:${lv.accent};font-weight:700;">${lv.total!==null?used+' / '+lv.total:used}</span>
        </div>
        <div style="display:flex;gap:.7rem;flex-wrap:wrap;justify-content:center;">`;

    // Une carte par membre réellement présent dans le grade — l'ajout d'un
    // membre en base ajoute donc mécaniquement une carte, sans plafond fixe
    // à mettre à jour à la main. Un grade sans titulaire affiche une carte
    // « Vacant » unique pour rester visible dans la hiérarchie.
    lv.grades.forEach(([grade, slots]) => {
      const list = byGrade[grade]||[];
      const badge = slots===null ? '' : `
            <div style="display:inline-block;font-family:'IM Fell English',serif;font-size:1rem;font-style:italic;font-weight:600;
                        color:${lv.accent};background:${lv.accentLight};padding:.18rem .65rem;border-radius:2px;margin-top:.4rem;">
              ${typeof slots==='number'?slots+' poste'+(slots>1?'s':''):'illimité'}</div>`;
      const kicker = `<div style="font-family:'IM Fell English',serif;font-size:1rem;font-style:italic;
                        text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:.35rem;">${grade}</div>`;

      if(list.length === 0){
        // Carte « Vacant » unique pour ce grade
        h += `
          <div style="flex:1 1 160px;max-width:200px;background:${lv.bg};
                      border:1px solid var(--border-g);border-top:3px solid var(--border-g);
                      padding:.85rem 1rem;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            ${kicker}
            <div style="font-style:italic;color:var(--ink-faint);font-size:1rem;">— Vacant —</div>${badge}
          </div>`;
      } else {
        // Une carte par titulaire du grade
        list.forEach(name => {
          h += `
          <div style="flex:1 1 160px;max-width:200px;background:${lv.bg};
                      border:1px solid var(--border-g);border-top:3px solid ${lv.accent};
                      padding:.85rem 1rem;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            ${kicker}
            <div style="font-family:'Eagle Lake',serif;font-size:1rem;color:var(--green-dark);line-height:1.3;">${name}</div>
          </div>`;
        });
      }
    });

    h += `</div></div>`;
    if(!isLast) h += `
      <div style="display:flex;justify-content:center;margin-top:.5rem;">
        <span style="font-family:'IM Fell English',serif;font-size:1rem;color:var(--border-g);line-height:1;">▾</span>
      </div>`;
  });

  h += `</div>
    <div style="margin-top:2.2rem;border-top:1px solid var(--border-g);padding-top:1.2rem;max-width:760px;margin-left:auto;margin-right:auto;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(95px,1fr));gap:.6rem;">`;

  LEVELS.forEach(lv => {
    const used = count(lv.grades.map(g=>g[0]));
    h += `
        <div style="background:var(--parch);border:1px solid var(--border-g);border-top:3px solid ${lv.accent};padding:.7rem .4rem;text-align:center;">
          <div style="font-family:'Eagle Lake',serif;font-size:1.4rem;color:${lv.accent};">${used}${lv.total!==null?`<span style="font-size:1rem;color:var(--ink-faint);">/${lv.total}</span>`:''}</div>
          <div style="font-family:'Eagle Lake',serif;font-size:1rem;letter-spacing:.05em;color:var(--ink-mid);text-transform:uppercase;margin-top:.2rem;line-height:1.2;">${lv.label}</div>
        </div>`;
  });

  h += `</div>
      <div style="margin-top:1rem;text-align:center;font-family:'Eagle Lake',serif;font-size:1rem;letter-spacing:.08em;color:var(--green-dark);">
        TOTAL : <span style="color:var(--gold);font-size:1.05rem;">${total} MEMBRES</span>
      </div>
    </div>`;

  el.innerHTML = h;
}

// ══════════════════════════════════════════════════════════════════════
//  GARDES
// ══════════════════════════════════════════════════════════════════════
async function loadGardes(){
  try{
    const [rows]=await Promise.all([
      sbGet('mk_gardes','?user_id=not.is.null&order=nom.asc'),
      typeof loadPresenceSummaries==='function'?loadPresenceSummaries():Promise.resolve([]),
    ]);
    renderGardes(rows);
  }catch(e){console.error(e);}
}

function renderGardes(rows){
  gardeRows=rows;
  const tbody=document.getElementById('gar-tbody');
  const canEdit=canEditSection('garde');
  document.getElementById('gar-total').textContent=rows.length;
  document.getElementById('gar-act-head').style.display=canEdit?'':'none';

  tbody.innerHTML=rows.map(r=>{
    const dateRecr=r.date_recrutement
      ?new Date(r.date_recrutement).toLocaleDateString('fr-FR')
      :'—';
    const recruteur=r.recruteur?esc(r.recruteur):'—';
    const specialite=r.specialite||'Soldat';
    return `<tr data-search="${esc((r.prenom+' '+r.nom+' '+r.race+' '+r.grade+' '+specialite).toLowerCase())}" data-grade="${esc(r.grade||'')}">
      <td class="cell-name">${typeof renderPresenceDot==='function'?renderPresenceDot(r.user_id):''}${esc(r.prenom)}${r.nom?" "+esc(r.nom):""}</td>
      <td class="cell-meta">${r.race?`<span class="badge badge-tag">${esc(r.race)}</span>`:'—'}</td>
      <td class="cell-meta">${r.grade?`<span class="badge badge-tag">${esc(r.grade)}</span>`:'—'}</td>
      <td class="cell-meta" style="font-size:1rem;">
        <span style="display:block;">${dateRecr}</span>
        <span style="color:var(--ink-faint);font-style:italic;font-size:1rem;">par ${recruteur}</span>
      </td>
      <td class="cell-meta"><span class="badge badge-tag">${esc(specialite)}</span></td>
      ${canEdit?`<td class="act"><button class="btn-del" onclick="editGarde('${r.id}')">Modifier</button> <button class="btn-del" onclick="delGarde('${r.id}')">Révoquer</button></td>`:''}
    </tr>`;
  }).join('');
  // Tri par défaut : par grade, selon la hiérarchie de l'Ordre
  const sortedRows=Array.from(tbody.querySelectorAll('tr'));
  sortedRows.sort((a,b)=>{
    const ga=(a.getAttribute('data-grade')||'').trim();
    const gb=(b.getAttribute('data-grade')||'').trim();
    const ia=GRADE_ORDER.indexOf(ga)===-1?99:GRADE_ORDER.indexOf(ga);
    const ib=GRADE_ORDER.indexOf(gb)===-1?99:GRADE_ORDER.indexOf(gb);
    return ia-ib;
  });
  sortedRows.forEach(tr=>tbody.appendChild(tr));
}
function editGarde(id){
  const row=gardeRows.find(r=>r.id===id);if(!row)return;
  editState={type:'garde',id};
  document.getElementById('gar-prenom').value=row.prenom||'';
  document.getElementById('gar-nom').value=row.nom||'';
  document.getElementById('gar-race').value=row.race||'';
  document.getElementById('gar-grade').value=row.grade||'';
  document.getElementById('gar-date-recrutement').value=row.date_recrutement||'';
  document.getElementById('gar-recruteur').value=row.recruteur||'';
  document.getElementById('gar-specialite').value=row.specialite||'Soldat';
  document.getElementById('gar-submit-btn').textContent='Mettre à jour';
  openFormById('gar-form');
}
async function addGarde(){
  const prenom=document.getElementById('gar-prenom').value.trim();
  const nom=document.getElementById('gar-nom').value.trim();
  const race=document.getElementById('gar-race').value;
  const grade=document.getElementById('gar-grade').value;
  const date_recrutement=document.getElementById('gar-date-recrutement').value||null;
  const recruteur=document.getElementById('gar-recruteur').value.trim()||null;
  const specialite=document.getElementById('gar-specialite').value||'Soldat';
  if(!prenom){toast('Prénom requis.');return;}
  try{
    const isEdit=editState&&editState.type==='garde';
    if(isEdit)await sbPatch('mk_gardes',`?id=eq.${editState.id}`,{prenom,nom,race,grade,date_recrutement,recruteur,specialite});
    else await sbPost('mk_gardes',{prenom,nom,race,grade,date_recrutement,recruteur,specialite});
    ['gar-prenom','gar-nom','gar-recruteur'].forEach(id=>document.getElementById(id).value='');
    ['gar-race','gar-grade'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('gar-date-recrutement').value='';
    document.getElementById('gar-specialite').value='Soldat';
    clearEditState('gar-form');
    toggleForm('gar-form');await loadGardes();toast(`${prenom}${nom?' '+nom:''} ${isEdit?'mis à jour':'enrôlé'}.`);
  }catch(e){toast('Erreur Supabase : '+(e.message||e).slice(0,80));}
}
async function delGarde(id){if(!confirm('Révoquer ce garde ?'))return;try{await sbDelete('mk_gardes',`?id=eq.${id}`);await loadGardes();toast('Garde révoqué.');}catch(e){toast('Erreur.');}}
