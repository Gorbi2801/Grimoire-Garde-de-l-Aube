// ══════════════════════════════════════════════════════════════════════
//  COUR DE L'ORDRE — dignités portées par les gardes
// ══════════════════════════════════════════════════════════════════════
async function loadCour(){
  try{
    const rows=await sbGet('mk_gardes','?user_id=not.is.null&order=nom.asc');
    renderCour(rows);
  }catch(e){
    console.error(e);
    toast('Impossible de charger la Cour de l\'Ordre.');
  }
}

function courDignites(){
  return Array.isArray(window.DIGNITES_ORDRE)?window.DIGNITES_ORDRE:DIGNITES_ORDRE;
}

function courDigniteDesc(dignite){
  const desc=window.DIGNITE_DESC||DIGNITE_DESC||{};
  return desc[dignite]||'';
}

function courGardeName(row){
  return `${row?.prenom||''}${row?.nom?' '+row.nom:''}`.trim()||'Garde inconnu';
}

function courFillOptions(rows){
  const gardeSelect=document.getElementById('cour-garde');
  const digniteSelect=document.getElementById('cour-titre');
  const filter=document.getElementById('cour-filter-titre');
  const dignites=courDignites();

  if(gardeSelect){
    const current=gardeSelect.value;
    gardeSelect.innerHTML='<option value="">— Sélectionner un garde —</option>'+rows.map(row=>`
      <option value="${esc(row.id)}">${esc(courGardeName(row))}${row.grade?` — ${esc(row.grade)}`:''}</option>
    `).join('');
    gardeSelect.value=rows.some(row=>row.id===current)?current:'';
  }

  if(digniteSelect){
    const current=digniteSelect.value;
    digniteSelect.innerHTML='<option value="">— Sélectionner —</option>'+dignites.map(dignite=>`
      <option value="${esc(dignite)}">${esc(dignite)}</option>
    `).join('');
    digniteSelect.value=dignites.includes(current)?current:'';
  }

  if(filter){
    const current=filter.value;
    filter.innerHTML='<option value="">Toutes les dignités</option>'+dignites.map(dignite=>`
      <option value="${esc(dignite)}">${esc(dignite)}</option>
    `).join('');
    filter.value=dignites.includes(current)?current:'';
  }
}

function renderCourSummary(rows){
  const el=document.getElementById('cour-dignites-summary');
  if(!el)return;
  const dignites=courDignites();
  const byDignite=Object.fromEntries(dignites.map(dignite=>[dignite,[]]));
  rows.forEach(row=>{
    const dignite=(row.dignite||'').trim();
    if(dignite&&byDignite[dignite])byDignite[dignite].push(row);
  });

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem;">
      ${dignites.map(dignite=>{
        const holders=byDignite[dignite]||[];
        const hasHolders=holders.length>0;
        return `
          <div style="background:var(--parch);border:1px solid var(--border-g);border-top:3px solid ${hasHolders?'var(--gold)':'var(--border-g)'};padding:.85rem 1rem;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;">
              <div style="font-family:'Eagle Lake',serif;font-size:1rem;color:var(--green-dark);line-height:1.3;">${esc(dignite)}</div>
              <div style="font-family:'Eagle Lake',serif;font-size:1.4rem;color:${hasHolders?'var(--gold)':'var(--ink-faint)'};">${holders.length}</div>
            </div>
            <div style="font-family:'IM Fell English',serif;font-size:1rem;color:var(--ink-mid);font-style:italic;margin-top:.35rem;line-height:1.35;">
              ${hasHolders?holders.map(courGardeName).map(esc).join('<br>'):'Aucun titulaire'}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderCour(rows){
  courRows=rows;
  const canEdit=canEditSection('cour');
  const tbody=document.getElementById('cour-tbody');
  const total=document.getElementById('cour-total');
  const actHead=document.getElementById('cour-act-head');
  const dignitaires=rows.filter(row=>(row.dignite||'').trim());

  courFillOptions(rows);
  renderCourSummary(rows);

  if(total)total.textContent=dignitaires.length;
  if(actHead)actHead.style.display=canEdit?'':'none';
  if(!tbody)return;

  tbody.innerHTML=dignitaires.map(row=>{
    const dignite=(row.dignite||'').trim();
    const desc=courDigniteDesc(dignite);
    return `<tr data-search="${esc((courGardeName(row)+' '+(row.grade||'')+' '+dignite).toLowerCase())}" data-titre="${esc(dignite)}">
      <td class="cell-name">
        ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}${esc(courGardeName(row))}
        ${row.grade?`<div style="font-size:1rem;font-style:italic;color:var(--ink-faint);margin-top:.2rem;">${esc(row.grade)}</div>`:''}
      </td>
      <td class="cell-meta">
        <span class="badge badge-tag">${esc(dignite)}</span>
        ${desc?`<div style="font-size:1rem;font-style:italic;color:var(--ink-faint);margin-top:.25rem;max-width:360px;">${esc(desc)}</div>`:''}
      </td>
      ${canEdit?`<td class="act"><button class="btn-del" onclick="editCour('${row.id}')">Modifier</button> <button class="btn-del" onclick="delCour('${row.id}')">Retirer</button></td>`:''}
    </tr>`;
  }).join('');

  if(!dignitaires.length){
    tbody.innerHTML=`<tr><td colspan="${canEdit?3:2}" class="sa-empty">Aucune dignité accordée pour le moment.</td></tr>`;
  }
}

function editCour(id){
  const row=courRows.find(r=>r.id===id);if(!row)return;
  editState={type:'cour',id};
  document.getElementById('cour-garde').value=row.id||'';
  document.getElementById('cour-titre').value=row.dignite||'';
  document.getElementById('cour-submit-btn').textContent='Mettre à jour';
  openFormById('cour-form');
}

async function addCour(){
  const gardeId=document.getElementById('cour-garde')?.value||'';
  const dignite=document.getElementById('cour-titre')?.value||'';
  if(!gardeId||!dignite){toast('Garde et dignité requis.');return;}
  const row=courRows.find(r=>r.id===gardeId);
  if(!row){toast('Garde introuvable.');return;}

  try{
    await sbPatch('mk_gardes',`?id=eq.${gardeId}`,{dignite});
    document.getElementById('cour-garde').value='';
    document.getElementById('cour-titre').value='';
    clearEditState('cour-form');
    toggleForm('cour-form');
    await loadCour();
    if(typeof loadGardes==='function')await loadGardes();
    toast(`${courGardeName(row)} reçoit la dignité : ${dignite}.`);
  }catch(e){
    console.error(e);
    toast('Erreur lors de l\'attribution de la dignité.');
  }
}

async function delCour(id){
  const row=courRows.find(r=>r.id===id);
  if(!row)return;
  if(!confirm(`Retirer la dignité de ${courGardeName(row)} ?`))return;
  try{
    await sbPatch('mk_gardes',`?id=eq.${id}`,{dignite:null});
    await loadCour();
    if(typeof loadGardes==='function')await loadGardes();
    toast('Dignité retirée.');
  }catch(e){
    console.error(e);
    toast('Erreur lors du retrait.');
  }
}
