// ══════════════════════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════════════════════
function switchSection(sec,btn){
  if(!canAccessSection(sec))return;
  document.querySelectorAll('.section-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById('page-'+sec);
  if(!page)return;
  page.classList.add('active');
  if(btn)btn.classList.add('active');
  activeSection=sec;
  if(sec==='presences'&&typeof loadPresences==='function')loadPresences();
  if(sec==='missives'&&typeof loadMissives==='function')loadMissives();
  if(sec==='superadmin'&&typeof loadSuperadmin==='function')loadSuperadmin();
}
function showProfilePage(){
  if(!session)return;
  renderProfilePage();
  document.querySelectorAll('.section-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById('page-profile');
  if(page)page.classList.add('active');
  activeSection='profile';
  window.scrollTo({top:0,behavior:'smooth'});
}
// ══════════════════════════════════════════════════════════════════════
//  ÉDITION D'ENTRÉES EXISTANTES (formulaires d'ajout réutilisés)
// ══════════════════════════════════════════════════════════════════════
let editState=null; // {type:'citoyens'|'garde'|'commerce'|'cour'|'inventaire', id}
const EDIT_FORM_TYPE={'cit-form':'citoyens','gar-form':'garde','com-form':'commerce','cour-form':'cour','inv-form':'inventaire'};
const EDIT_SUBMIT_BTN={citoyens:'cit-submit-btn',garde:'gar-submit-btn',commerce:'com-submit-btn',cour:'cour-submit-btn',inventaire:'inv-submit-btn'};
const EDIT_SUBMIT_DEFAULT={'cit-submit-btn':'Inscrire au registre','gar-submit-btn':'Enrôler','com-submit-btn':'Enregistrer','cour-submit-btn':'Nommer','inv-submit-btn':'Ajouter au stock'};
function openFormById(id){
  const head=document.querySelector(`[onclick="toggleForm('${id}')"]`);
  const body=document.getElementById(id);
  if(head)head.classList.add('open');
  if(body)body.classList.add('open');
}
function clearEditState(formId){
  const type=EDIT_FORM_TYPE[formId];
  if(type && editState && editState.type===type){
    editState=null;
    const btnId=EDIT_SUBMIT_BTN[type];
    const btn=document.getElementById(btnId);
    if(btn)btn.textContent=EDIT_SUBMIT_DEFAULT[btnId];
  }
}
function toggleForm(id){const head=document.querySelector(`[onclick="toggleForm('${id}')"]`);const body=document.getElementById(id);if(head)head.classList.toggle('open');if(body)body.classList.toggle('open');clearEditState(id);}
function showMsg(el,type,txt){el.style.display='block';el.style.color=type==='ok'?'var(--s-ok)':'#7A1010';el.textContent=txt;setTimeout(()=>{el.style.display='none';},4000);}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.getElementById('toasts').appendChild(el);setTimeout(()=>el.remove(),3100);}

// ══════════════════════════════════════════════════════════════════════
//  MODALE NOTE
// ══════════════════════════════════════════════════════════════════════
let noteModalCtx=null;
function openNoteModal(type,id){
  const cfg={
    citoyens:{table:'mk_citoyens',rows:citoyensRows,reload:loadCitoyens,label:r=>r.prenom+(r.nom?' '+r.nom:'')},
    commerce:{table:'mk_transactions',rows:commercesRows,reload:loadCommerces,label:r=>r.objet||r.type||'Transaction'},
  }[type];
  if(!cfg)return;
  const row=cfg.rows.find(r=>r.id===id);
  if(!row)return;
  noteModalCtx={table:cfg.table,id,reload:cfg.reload};
  document.getElementById('note-modal-title').textContent=`Note — ${cfg.label(row)}`;
  document.getElementById('note-modal-textarea').value=row.notes||'';
  document.getElementById('note-modal-overlay').style.display='flex';
  document.getElementById('note-modal-textarea').focus();
}
function closeNoteModal(){
  document.getElementById('note-modal-overlay').style.display='none';
  noteModalCtx=null;
}
async function saveNoteModal(){
  if(!noteModalCtx)return;
  const{table,id,reload}=noteModalCtx;
  const notes=document.getElementById('note-modal-textarea').value;
  try{
    await sbPatch(table,`?id=eq.${id}`,{notes});
    closeNoteModal();
    if(reload)await reload();
    toast('Note enregistrée.');
  }catch(e){console.error(e);toast('Erreur lors de l\'enregistrement de la note.');}
}
function esc(str){if(!str)return'';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escJs(str){if(!str)return'';return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// ══════════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════════
async function exportSection(){
  try{
    let csv='',filename='';
    if(activeSection==='citoyens'){const r=await sbGet('mk_citoyens','?order=nom.asc');csv='Prénom,Nom,Race,Métier\n'+r.map(x=>`"${x.prenom}","${x.nom}","${x.race||''}","${x.metier||''}"`).join('\n');filename='civils_aube.csv';}
    else if(activeSection==='garde'){const r=await sbGet('mk_gardes','?order=nom.asc');csv='Prénom,Nom,Race,Grade,Spécialité\n'+r.map(x=>`"${x.prenom}","${x.nom}","${x.race||''}","${x.grade||''}","${x.specialite||'Soldat'}"`).join('\n');filename='garde_aube.csv';}
    else if(activeSection==='commerces'){const r=await sbGet('mk_transactions','?order=date.desc');csv='Date,Type,Objet,Prix,Vendeur/Acheteur,Garde\n'+r.map(x=>`"${x.date||''}","${x.type||''}","${(x.objet||'').replace(/"/g,"'")}","${(x.valeur||'').replace(/"/g,"'")}","${(x.partie_externe||'').replace(/"/g,"'")}","${(x.enregistre_par||'').replace(/"/g,"'")}"`).join('\n');filename='transactions_aube.csv';}
    else if(activeSection==='cour'){const r=await sbGet('mk_cour','?order=titre.asc');csv='Prénom,Nom,Titre\n'+r.map(x=>`"${x.prenom}","${x.nom}","${x.titre||''}"`).join('\n');filename='cour_aube.csv';}
    else if(activeSection==='inventaire'){const r=await sbGet('mk_inventaire','?order=nom.asc');csv='Objet,Catégorie,Quantité\n'+r.map(x=>`"${x.nom}","${x.categorie||''}",${x.quantite}`).join('\n');filename='inventaire_aube.csv';}
    else if(activeSection==='lois'){const r=await sbGet('mk_lois','?order=created_at.asc');csv='Titre,Peine,Sanction,Description\n'+r.map(x=>`"${x.titre}","${x.peine||''}","${x.sanction||''}","${(x.description||'').replace(/"/g,"'")}"`).join('\n');filename='reglement_aube.csv';}
    else{toast('Export non disponible pour cette section.');return;}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));a.download=filename;a.click();
  }catch(e){toast('Erreur d\'export.');}
}
// ══════════════════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════════════════
