// ══════════════════════════════════════════════════════════════════════
//  TRI
// ══════════════════════════════════════════════════════════════════════
const GRADE_ORDER=["Commandeur de l'Aube","Sénéchal de l'Aube","Exécuteur de la Garde","Traqueur de la Garde","Patrouilleur de la Garde","Aspirant de la Garde"];
const SPECIALITE_ORDER=["Sans spécialité","Minage","Menuiserie","Forge","Alchimie","Chasse","Cuisine","Couture","Guerrier"];
const PEINE_ORDER=['Infraction mineure','Infraction majeure','Crime','Crime capital','Haute trahison'];
const DIGNITES_ORDRE=[
  "Maître d'armes",
  'Intendant de Fort Aube',
  'Gardien du Grimoire',
  'Maître des Renseignements',
  'Gardien de Fort Aube',
  'Maître des Recrues',
  "Prévôt de l'Ordre",
];
const DIGNITE_DESC={
  "Maître d'armes":"Formation des Gardes, exercices, évaluation des recrues et transmission des doctrines de combat.",
  'Intendant de Fort Aube':"Vie quotidienne du fort, ressources, bivouacs, accueil et cohésion entre les Gardes.",
  'Gardien du Grimoire':"Conservation du savoir, traditions, cérémonies, serments et mémoire des tombés.",
  'Maître des Renseignements':"Collecte, centralisation et analyse des informations sur les vampires et autres menaces.",
  'Gardien de Fort Aube':"Sécurité du fort, surveillance des visiteurs, défenses et protocoles de contamination.",
  'Maître des Recrues':"Accueil, encadrement et intégration des nouveaux membres de la Garde.",
  "Prévôt de l'Ordre":"Discipline interne, constat des manquements et conseil au commandement sur les sanctions.",
};
if(typeof window!=='undefined'){
  window.DIGNITES_ORDRE=DIGNITES_ORDRE;
  window.DIGNITE_DESC=DIGNITE_DESC;
}
function sortTable(tbodyId,mode,btnId){
  const tbody=document.getElementById(tbodyId);const btn=document.getElementById(btnId);if(!tbody||!btn)return;
  const isAsc=btn.classList.contains('asc');const dir=isAsc?'desc':'asc';
  btn.classList.toggle('asc',!isAsc);btn.classList.toggle('desc',isAsc);
  const rows=Array.from(tbody.querySelectorAll('tr:not(.lois-cat-row)'));
  rows.sort((a,b)=>{
    if(mode==='grade'){const ga=(a.getAttribute('data-grade')||'').trim();const gb=(b.getAttribute('data-grade')||'').trim();const ia=GRADE_ORDER.indexOf(ga)===-1?99:GRADE_ORDER.indexOf(ga);const ib=GRADE_ORDER.indexOf(gb)===-1?99:GRADE_ORDER.indexOf(gb);return dir==='asc'?ia-ib:ib-ia;}
    else if(mode==='specialite'){const sa=(a.getAttribute('data-specialite')||'').trim();const sb=(b.getAttribute('data-specialite')||'').trim();const ia=SPECIALITE_ORDER.indexOf(sa)===-1?99:SPECIALITE_ORDER.indexOf(sa);const ib=SPECIALITE_ORDER.indexOf(sb)===-1?99:SPECIALITE_ORDER.indexOf(sb);return ia===ib?(dir==='asc'?sa.localeCompare(sb,'fr'):sb.localeCompare(sa,'fr')):(dir==='asc'?ia-ib:ib-ia);}
    else if(mode==='peine'){const pa=(a.getAttribute('data-peine')||'').trim();const pb=(b.getAttribute('data-peine')||'').trim();const ia=PEINE_ORDER.indexOf(pa)===-1?99:PEINE_ORDER.indexOf(pa);const ib=PEINE_ORDER.indexOf(pb)===-1?99:PEINE_ORDER.indexOf(pb);return dir==='asc'?ia-ib:ib-ia;}
    else if(mode==='date'){const da=(a.getAttribute('data-date')||'');const db=(b.getAttribute('data-date')||'');return dir==='asc'?da.localeCompare(db):db.localeCompare(da);}
    else{const va=(a.getAttribute('data-search')||'').trim();const vb=(b.getAttribute('data-search')||'').trim();return dir==='asc'?va.localeCompare(vb,'fr'):vb.localeCompare(va,'fr');}
  });
  rows.forEach(tr=>tbody.appendChild(tr));
}
// ══════════════════════════════════════════════════════════════════════
//  FILTRE / RECHERCHE
// ══════════════════════════════════════════════════════════════════════
function filterRows(tbodyId,query){
  const tbody=document.getElementById(tbodyId);if(!tbody)return;
  const q=query.trim().toLowerCase();let extraFilters={};
  if(tbodyId==='cit-tbody'){const race=document.getElementById('cit-filter-race').value;if(race)extraFilters.race=race;const statut=(document.getElementById('cit-filter-statut')||{}).value||'';if(statut)extraFilters.statut=statut;const conStatut=(document.getElementById('cit-filter-con-statut')||{}).value||'';if(conStatut)extraFilters['con-statut']=conStatut;}
  else if(tbodyId==='gar-tbody'){const grade=document.getElementById('gar-filter-grade').value;if(grade)extraFilters.grade=grade;}
  else if(tbodyId==='com-tbody'){const type=document.getElementById('com-filter-type').value;if(type)extraFilters.type=type;}
  else if(tbodyId==='cour-tbody'){const titre=document.getElementById('cour-filter-titre').value;if(titre)extraFilters.titre=titre;}
  else if(tbodyId==='inv-tbody'){const stock=document.getElementById('inv-filter-stock').value;if(stock)extraFilters.stock=stock;const cat=document.getElementById('inv-filter-cat').value;if(cat)extraFilters.cat=cat;}
  else if(tbodyId==='lois-tbody'){const peine=document.getElementById('lois-filter-peine').value;if(peine)extraFilters.peine=peine;}
  tbody.querySelectorAll('tr').forEach(tr=>{
    const search=tr.getAttribute('data-search')||'';const matchQ=!q||search.includes(q);
    const matchExtra=Object.entries(extraFilters).every(([k,v])=>!v||(tr.getAttribute('data-'+k)||'').toLowerCase()===v.toLowerCase());
    tr.classList.toggle('row-hidden',!(matchQ&&matchExtra));
  });
}
