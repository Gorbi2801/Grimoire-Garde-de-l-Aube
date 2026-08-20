// ══════════════════════════════════════════════════════════════════════
//  RENSEIGNEMENTS — Supabase
// ══════════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────────
const RENS = {
  fiches:         [],   // mk_rens_fiches
  separateurs:    [],   // mk_rens_separateurs
  rapports:       [],   // mk_rens_rapports
  relations:      [],   // mk_rens_relations
  rapportLiens:   [],   // mk_rens_rapport_liens (rapport → fiche)
  rapportRapport: [],   // mk_rens_rapport_rapport (rapport → rapport)
  mapNodes:       [],   // mk_rens_map_nodes
  mapLinks:       [],   // mk_rens_map_links
  attachments:    [],   // mk_rens_attachments
  reportReads:    [],   // mk_rens_report_reads, personnel au compte connecté
  reportReadIds:  new Set(),
  readTrackingReady: false,
  activeTab: 'lieux',
  searchQ:   '',
  filterStatut: '',
  sortDate: '',
  archivesOpen: false,
  mapReady: true,
  mapPickerType: 'all',
  mapLinkMode: false,
  mapLinkSource: '',
  mapLinkColor: '#8A1010',
  selectedMapNode: '',
  selectedMapLink: ''
};
let rensMapNetwork = null;
let _rensMapViewport = null; // viewport sauvegardé entre les re-renders
const RENS_ATTACHMENT_BUCKET = 'renseignements';
const RENS_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024;
const RENS_ATTACHMENT_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);

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
  // Quitter la carte → réinitialiser le viewport pour le prochain fit()
  if(id !== 'carte') _rensMapViewport = null;
  if(id==='carte') rensRenderCarte();
  else renderTab(id);
  renderArchives();
}

function toggleFiche(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.toggle('open');
  const detail = document.getElementById('detail-'+id);
  if(detail) detail.style.display = el.classList.contains('open') ? 'table-row' : 'none';
}
function toggleRap(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.toggle('open');
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
  const fiche = RENS.fiches.find(f=>f.id===ficheId);
  if(fiche && rensIsArchived(fiche)){
    RENS.archivesOpen = true;
    renderArchives();
    setTimeout(()=>{
      const archives = document.getElementById('rens-archives');
      const target = document.getElementById('fiche-'+ficheId);
      if(archives) archives.scrollIntoView({behavior:'smooth', block:'start'});
      if(!target) return;
      target.classList.add('open');
      const detail = document.getElementById('detail-fiche-'+ficheId);
      if(detail) detail.style.display = 'table-row';
      target.classList.add('highlight');
      setTimeout(()=>target.classList.remove('highlight'), 1500);
    }, 120);
    return;
  }
  const tabBtns = document.querySelectorAll('#page-renseignements .tab');
  const idx = ['lieux','individus','groupes','autres'].indexOf(tab);
  if(idx >= 0 && tabBtns[idx]) showTab(tab, tabBtns[idx]);
  setTimeout(()=>{
    const target = document.getElementById('fiche-'+ficheId);
    if(!target) return;
    target.classList.add('open');
    const detail = document.getElementById('detail-fiche-'+ficheId);
    if(detail) detail.style.display = 'table-row';
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

async function rensLoadAttachments(){
  try{
    return await sbGet('mk_rens_attachments','?select=*&order=created_at.asc');
  }catch(error){
    console.warn('Table des pièces jointes indisponible: mk_rens_attachments', error);
    return [];
  }
}

async function rensLoadReportReads(){
  RENS.readTrackingReady = false;
  if(!session?.user?.id || !window.GrimoireSupabase)return [];
  try{
    const { data, error } = await window.GrimoireSupabase
      .from('mk_rens_report_reads')
      .select('report_id,read_at')
      .eq('user_id',session.user.id);
    if(error)throw error;
    RENS.readTrackingReady = true;
    return data || [];
  }catch(error){
    console.warn('Table des lectures de rapports indisponible: mk_rens_report_reads', error);
    return [];
  }
}

async function rensLoad(){
  RENS.mapReady = true;
  const [rf, rr, rl, rpl, rrp, mn, ml, atts, reads, sep] = await Promise.all([
    sbGet('mk_rens_fiches','?select=*&order=created_at.desc'),
    sbGet('mk_rens_rapports','?select=*&order=created_at.desc'),
    sbGet('mk_rens_relations','?select=*'),
    rensOptionalGet('mk_rens_rapport_liens','?select=*'),
    rensOptionalGet('mk_rens_rapport_rapport','?select=*'),
    rensOptionalGet('mk_rens_map_nodes','?select=*&order=created_at.asc'),
    rensOptionalGet('mk_rens_map_links','?select=*'),
    rensLoadAttachments(),
    rensLoadReportReads(),
    rensOptionalGet('mk_rens_separateurs','?select=*&order=ordre.asc')
  ]);
  RENS.fiches          = rf  || [];
  RENS.rapports        = rr  || [];
  RENS.relations       = rl  || [];
  RENS.rapportLiens    = rpl || [];
  RENS.rapportRapport  = rrp || [];
  RENS.mapNodes        = mn  || [];
  RENS.mapLinks        = ml  || [];
  RENS.attachments     = atts || [];
  RENS.reportReads     = reads || [];
  RENS.separateurs     = sep || [];
  RENS.reportReadIds   = new Set(RENS.reportReads.map(row=>row.report_id).filter(Boolean));
  rensRenderAll();
}

// ── Rendu complet ────────────────────────────────────────────────────
function rensRenderAll(){
  rensRenderStats();
  if(RENS.activeTab==='carte') rensRenderCarte();
  else renderTab(RENS.activeTab);
  renderArchives();
}

function rensRenderStats(){
  const activeFiches = RENS.fiches.filter(f=>!rensIsArchived(f));
  const archivedCount = RENS.fiches.length - activeFiches.length;
  const activeIds = new Set(activeFiches.map(f=>f.id));
  const lieux     = activeFiches.filter(f=>f.type==='lieux').length;
  const individus = activeFiches.filter(f=>f.type==='individus').length;
  const groupes   = activeFiches.filter(f=>f.type==='groupes').length;
  const autres    = activeFiches.filter(f=>f.type==='autres').length;
  const urgents   = activeFiches.filter(f=>f.urgente).length;
  const nbRap     = RENS.rapports.filter(r=>activeIds.has(r.fiche_id)).length;
  const unread    = rensUnreadActiveReportCount();
  const statsEl   = document.getElementById('rens-stats');
  if(!statsEl) return;
  statsEl.innerHTML = `
    <div class="stat">Lieux : <strong>${lieux}</strong></div>
    <div class="stat">Individus : <strong>${individus}</strong></div>
    <div class="stat">Groupes : <strong>${groupes}</strong></div>
    ${autres>0?`<div class="stat">Autres : <strong>${autres}</strong></div>`:''}
    ${urgents>0?`<div class="stat" style="color:#7A1010;">🔴 Urgents : <strong>${urgents}</strong></div>`:''}
    ${RENS.readTrackingReady?`<div class="stat" id="rens-unread-stat" ${unread?'':'hidden'}>Non lus : <strong>${unread}</strong></div>`:''}
    <div class="stat">Rapports actifs : <strong>${nbRap}</strong></div>
    ${archivedCount>0?`<div class="stat">Archives : <strong>${archivedCount}</strong></div>`:''}`;
}

function rensIsArchived(fiche){
  return !!fiche?.archived_at;
}

function rensCurrentUserId(){
  return session?.user?.id || '';
}

function rensReadSet(){
  return RENS.reportReadIds || new Set();
}

function rensReportIsUnread(report){
  if(!RENS.readTrackingReady || !report?.id || !rensCurrentUserId())return false;
  if(report.created_by && report.created_by === rensCurrentUserId())return false;
  return !rensReadSet().has(report.id);
}

function rensUnreadReportsForFiche(ficheId){
  return RENS.rapports.filter(report=>report.fiche_id===ficheId && rensReportIsUnread(report));
}

function rensUnreadActiveReportCount(){
  const activeIds = new Set(RENS.fiches.filter(f=>!rensIsArchived(f)).map(f=>f.id));
  return RENS.rapports.filter(report=>activeIds.has(report.fiche_id) && rensReportIsUnread(report)).length;
}

function rensUnreadLabel(count){
  return `${count} non lu${count>1?'s':''}`;
}

function rensUpdateUnreadIndicators(){
  document.querySelectorAll('[data-rens-unread-fiche]').forEach(el=>{
    const count = rensUnreadReportsForFiche(el.getAttribute('data-rens-unread-fiche')).length;
    el.textContent = count ? rensUnreadLabel(count) : '';
    el.hidden = count <= 0;
  });

  document.querySelectorAll('[data-rens-unread-report]').forEach(el=>{
    const report = RENS.rapports.find(row=>row.id===el.getAttribute('data-rens-unread-report'));
    const unread = rensReportIsUnread(report);
    el.hidden = !unread;
    const wrapper = report?.id ? document.getElementById('rap-'+report.id) : null;
    if(wrapper)wrapper.classList.toggle('unread', unread);
  });

  const stat = document.getElementById('rens-unread-stat');
  if(stat){
    const count = rensUnreadActiveReportCount();
    stat.innerHTML = count ? `Non lus : <strong>${count}</strong>` : '';
    stat.hidden = count <= 0;
  }
}

async function rensMarkReportRead(rapportId, opts = {}){
  if(!RENS.readTrackingReady || !rapportId || !rensCurrentUserId())return;
  const report = RENS.rapports.find(row=>row.id===rapportId);
  if(!opts.force && !rensReportIsUnread(report))return;

  const now = new Date().toISOString();
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_rens_report_reads')
      .upsert({
        report_id: rapportId,
        user_id: rensCurrentUserId(),
        read_at: now,
      }, { onConflict: 'report_id,user_id', ignoreDuplicates: true });
    if(error)throw error;

    if(!RENS.reportReads.some(row=>row.report_id===rapportId)){
      RENS.reportReads.push({report_id:rapportId, read_at:now});
      RENS.reportReadIds.add(rapportId);
      rensUpdateUnreadIndicators();
    }
  }catch(error){
    console.warn('Impossible de marquer le rapport comme lu.', error);
    if(!opts.silent && typeof toast==='function')toast('Impossible de marquer le rapport comme lu.');
  }
}

function sortRensByDate(){
  RENS.sortDate = RENS.sortDate === 'desc' ? 'asc' : 'desc';
  rensRenderAll();
}

function rensUpdateDateSortButtons(){
  document.querySelectorAll('[data-rens-sort-date]').forEach(btn=>{
    btn.classList.toggle('asc', RENS.sortDate === 'asc');
    btn.classList.toggle('desc', RENS.sortDate === 'desc');
  });
}

function rensFormatDate(value){
  if(!value)return '—';
  const date = new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  return date.toLocaleDateString('fr-FR');
}

function rensSearchText(value){
  if(value === null || value === undefined)return '';
  if(Array.isArray(value))return value.map(rensSearchText).join(' ');
  if(typeof value === 'object')return Object.entries(value).map(([key,val])=>`${key} ${rensSearchText(val)}`).join(' ');
  return String(value);
}

function rensFicheMatchesSearch(fiche, query){
  const searchParts = [
    fiche.nom,
    fiche.statut,
    fiche.notes,
    fiche.type,
    fiche.created_by_name,
    fiche.created_by_grade,
    rensSearchText(fiche.meta),
  ];

  const ficheReports = RENS.rapports.filter(r=>r.fiche_id===fiche.id);
  ficheReports.forEach(report=>{
    searchParts.push(
      report.titre,
      report.fiabilite,
      report.contenu,
      report.action_recommandee,
      report.created_by_name,
      report.created_by_grade
    );

    RENS.rapportLiens
      .filter(link=>link.rapport_id===report.id)
      .forEach(link=>{
        const linkedFiche = RENS.fiches.find(f=>f.id===link.fiche_id);
        if(linkedFiche)searchParts.push(linkedFiche.nom, linkedFiche.notes, linkedFiche.statut, rensSearchText(linkedFiche.meta));
      });

    RENS.rapportRapport
      .filter(link=>link.rapport_a===report.id || link.rapport_b===report.id)
      .forEach(link=>{
        const linkedReportId = link.rapport_a===report.id ? link.rapport_b : link.rapport_a;
        const linkedReport = RENS.rapports.find(r=>r.id===linkedReportId);
        if(linkedReport)searchParts.push(linkedReport.titre, linkedReport.contenu, linkedReport.action_recommandee);
      });
  });

  RENS.relations
    .filter(rel=>rel.fiche_source===fiche.id || rel.fiche_cible===fiche.id)
    .forEach(rel=>{
      const linkedFicheId = rel.fiche_source===fiche.id ? rel.fiche_cible : rel.fiche_source;
      const linkedFiche = RENS.fiches.find(f=>f.id===linkedFicheId);
      if(linkedFiche)searchParts.push(linkedFiche.nom, linkedFiche.notes, linkedFiche.statut, rensSearchText(linkedFiche.meta));
    });

  return searchParts.join(' ').toLowerCase().includes(query);
}

function rensDefaultFicheCompare(a,b){
  const statutOrder = {recherche:1, surveillance:2, verifie:3, neutre:4, neutralise:5};
  const ua = a.urgente?0:1, ub = b.urgente?0:1;
  if(ua!==ub) return ua-ub;
  const sa = statutOrder[a.statut]??3, sb = statutOrder[b.statut]??3;
  if(sa!==sb) return sa-sb;
  return (a.nom||'').localeCompare(b.nom||'');
}

function rensFilterFicheList(fiches){
  if(RENS.searchQ){
    const q = RENS.searchQ.trim().toLowerCase();
    if(q)fiches = fiches.filter(f=>rensFicheMatchesSearch(f, q));
  }
  if(RENS.filterStatut) fiches = fiches.filter(f=>f.statut===RENS.filterStatut);

  fiches = [...fiches].sort((a,b)=>{
    if(RENS.sortDate){
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      const diff = da - db;
      if(diff) return RENS.sortDate === 'asc' ? diff : -diff;
      return (a.nom||'').localeCompare(b.nom||'');
    }

    // Tri de priorité : Urgentes en premier, puis Recherché, Surveillance, Neutre/Neutralisé
    return rensDefaultFicheCompare(a,b);
  });

  return fiches;
}

function rensStatusLabel(value){
  return {
    surveillance:'Surveillance active',
    recherche:'Recherché',
    verifie:'Vérifié',
    neutralise:'Neutralisé',
    neutre:'Neutre',
  }[value] || value || 'Neutre';
}

function rensReliabilityLabel(value){
  return {
    confirme:'Confirmée',
    verifie:'Vérifié',
    nonverif:'Non vérifiée',
    urgente:'Urgente',
    fausse:'Invalidée',
  }[value] || value || 'Non vérifiée';
}

function rensTypeLabel(value){
  return {
    lieux:'Lieux',
    individus:'Individus',
    groupes:'Groupes',
    autres:'Autres',
  }[value] || value || 'Autres';
}

function rensExportMetaHTML(meta){
  const entries = Object.entries(meta || {}).filter(([,value])=>value !== null && value !== undefined && String(value).trim() !== '');
  if(!entries.length)return '';
  return `<table class="meta-table"><tbody>${entries.map(([key,value])=>`
    <tr><th>${escH(key)}</th><td>${escH(rensSearchText(value))}</td></tr>`).join('')}</tbody></table>`;
}

function rensExportRelationsHTML(fiche){
  const relations = RENS.relations
    .filter(rel=>rel.fiche_source===fiche.id || rel.fiche_cible===fiche.id)
    .map(rel=>{
      const otherId = rel.fiche_source===fiche.id ? rel.fiche_cible : rel.fiche_source;
      return RENS.fiches.find(item=>item.id===otherId);
    })
    .filter(Boolean);

  if(!relations.length)return '';
  return `<div class="links"><strong>Fiches liées :</strong> ${relations.map(item=>`${escH(item.nom)} <em>(${escH(rensTypeLabel(item.type))})</em>`).join(', ')}</div>`;
}

function rensExportReportLinksHTML(report){
  const linkedFiches = RENS.rapportLiens
    .filter(link=>link.rapport_id===report.id)
    .map(link=>RENS.fiches.find(f=>f.id===link.fiche_id))
    .filter(Boolean);

  const linkedReports = RENS.rapportRapport
    .filter(link=>link.rapport_a===report.id || link.rapport_b===report.id)
    .map(link=>{
      const reportId = link.rapport_a===report.id ? link.rapport_b : link.rapport_a;
      return RENS.rapports.find(item=>item.id===reportId);
    })
    .filter(Boolean);

  const parts = [];
  if(linkedFiches.length){
    parts.push(`<div><strong>Fiches liées :</strong> ${linkedFiches.map(item=>`${escH(item.nom)} <em>(${escH(rensTypeLabel(item.type))})</em>`).join(', ')}</div>`);
  }
  if(linkedReports.length){
    parts.push(`<div><strong>Rapports liés :</strong> ${linkedReports.map(item=>`${escH(item.titre||'Rapport sans titre')} <em>(${escH(rensFormatDate(item.created_at))})</em>`).join(', ')}</div>`);
  }
  return parts.length ? `<div class="report-links">${parts.join('')}</div>` : '';
}

function rensExportAttachmentsHTML(report){
  const attachments = rensAttachmentsForRapport(report.id);
  if(!attachments.length)return '';
  return `<div class="attachments"><strong>Pièces jointes :</strong> ${attachments.map(att=>`${escH(att.file_name||'Image')} <em>(${escH(rensFormatFileSize(att.file_size))})</em>`).join(', ')}</div>`;
}

function rensExportReportHTML(report){
  const author = rensAuthorLabel(report);
  return `<article class="report ${report.fiabilite==='urgente'?'urgent':''}">
    <div class="report-head">
      <strong>${escH(report.titre||'Rapport sans titre')}</strong>
      <span>${escH(rensFormatDate(report.created_at))} · ${escH(rensReliabilityLabel(report.fiabilite))}${author?` · ${escH(author)}`:''}</span>
    </div>
    <div class="report-content">${escH(report.contenu||'Aucun contenu renseigné.')}</div>
    ${report.action_recommandee?`<div class="action"><strong>Action recommandée :</strong><br>${escH(report.action_recommandee)}</div>`:''}
    ${rensExportReportLinksHTML(report)}
    ${rensExportAttachmentsHTML(report)}
  </article>`;
}

function rensExportFicheHTML(fiche){
  const reports = RENS.rapports
    .filter(report=>report.fiche_id===fiche.id)
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const badges = [
    rensStatusLabel(fiche.statut),
    fiche.urgente ? 'Urgente' : '',
    rensIsArchived(fiche) ? 'Archivée' : '',
  ].filter(Boolean);

  return `<section class="fiche-export">
    <header>
      <div>
        <small>${escH(rensTypeLabel(fiche.type))}</small>
        <h2>${escH(fiche.nom||'Fiche sans nom')}</h2>
      </div>
      <div class="date">${escH(rensFormatDate(fiche.created_at))}</div>
    </header>
    <div class="badges">${badges.map(label=>`<span>${escH(label)}</span>`).join('')}</div>
    ${fiche.notes?`<p class="notes">${escH(fiche.notes)}</p>`:''}
    ${rensExportMetaHTML(fiche.meta)}
    ${rensExportRelationsHTML(fiche)}
    <h3>Rapports (${reports.length})</h3>
    ${reports.length?reports.map(rensExportReportHTML).join(''):'<p class="empty">Aucun rapport déposé.</p>'}
  </section>`;
}

function rensBuildExportHTML(){
  const generatedAt = new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
  const activeFiches = RENS.fiches.filter(f=>!rensIsArchived(f));
  const archivedFiches = RENS.fiches.filter(rensIsArchived);
  const sections = [
    ['lieux','Lieux'],
    ['individus','Individus'],
    ['groupes','Groupes'],
    ['autres','Autres'],
  ];
  const activeHTML = sections.map(([type,label])=>{
    const rows = activeFiches
      .filter(f=>f.type===type)
      .sort((a,b)=>String(a.nom||'').localeCompare(String(b.nom||''),'fr'));
    return `<section class="group">
      <h1>${escH(label)}</h1>
      ${rows.length?rows.map(rensExportFicheHTML).join(''):'<p class="empty">Aucune fiche.</p>'}
    </section>`;
  }).join('');
  const archivesHTML = archivedFiches.length ? `<section class="group archives">
    <h1>Archives</h1>
    ${archivedFiches
      .slice()
      .sort((a,b)=>String(a.nom||'').localeCompare(String(b.nom||''),'fr'))
      .map(rensExportFicheHTML)
      .join('')}
  </section>` : '';

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Export renseignements - Garde de l'Aube</title>
  <style>
    @page{size:A4;margin:14mm;}
    *{box-sizing:border-box;}
    body{margin:0;background:#efe7d2;color:#1f1a14;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.45;}
    .cover{border:2px solid #7a6637;padding:18px 22px;margin-bottom:18px;background:#f6eed8;}
    .cover h1{margin:0 0 6px;font-size:28px;letter-spacing:.04em;color:#243b26;}
    .cover p{margin:3px 0;color:#5b4b38;font-style:italic;}
    .summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}
    .summary span,.badges span{border:1px solid #b5922e;background:#fff8df;padding:3px 7px;color:#3d3428;font-weight:bold;}
    .group{break-before:page;}
    .group:first-of-type{break-before:auto;}
    .group>h1{font-size:21px;color:#243b26;border-bottom:2px solid #b5922e;padding-bottom:5px;margin:18px 0 12px;}
    .fiche-export{break-inside:avoid;border:1px solid #a79a76;border-left:4px solid #b5922e;background:#f8f0dc;margin:0 0 14px;padding:11px 13px;}
    .fiche-export header{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #c8b98a;padding-bottom:7px;margin-bottom:7px;}
    .fiche-export small{display:block;text-transform:uppercase;letter-spacing:.1em;color:#6b5a42;font-weight:bold;}
    .fiche-export h2{margin:2px 0 0;color:#243b26;font-size:18px;}
    .fiche-export .date{white-space:nowrap;color:#6b5a42;font-style:italic;}
    .badges{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0;}
    .notes{white-space:pre-wrap;background:#efe4c8;border-left:3px solid #8a7a58;padding:7px;margin:8px 0;}
    .meta-table{width:100%;border-collapse:collapse;margin:8px 0;}
    .meta-table th,.meta-table td{border:1px solid #c8b98a;padding:5px;text-align:left;vertical-align:top;}
    .meta-table th{width:30%;background:#eadfbd;color:#4b3b2c;}
    .links,.report-links,.attachments{margin-top:6px;color:#4d4033;}
    h3{font-size:14px;color:#243b26;margin:11px 0 7px;border-bottom:1px solid #c8b98a;padding-bottom:3px;}
    .report{break-inside:avoid;border:1px solid #c8b98a;background:#fff9e8;margin:7px 0;padding:8px 9px;}
    .report.urgent{border-left:4px solid #8a1010;}
    .report-head{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #ddcfa5;padding-bottom:4px;margin-bottom:5px;}
    .report-head strong{font-size:13px;color:#1f1a14;}
    .report-head span{font-size:11px;color:#6b5a42;text-align:right;}
    .report-content,.action{white-space:pre-wrap;margin-top:6px;}
    .action{background:#efe4c8;padding:6px;border-left:3px solid #b5922e;}
    .empty{color:#6b5a42;font-style:italic;}
    em{color:#6b5a42;}
    @media print{.no-print{display:none;}.group{break-before:page;}.group:first-of-type{break-before:auto;}}
  </style>
</head>
<body>
  <section class="cover">
    <h1>Registre des Renseignements</h1>
    <p>Export généré le ${escH(generatedAt)}</p>
    <p>Ce qui est consigné ici ne sort pas de ces pages.</p>
    <div class="summary">
      <span>Fiches actives : ${activeFiches.length}</span>
      <span>Archives : ${archivedFiches.length}</span>
      <span>Rapports : ${RENS.rapports.length}</span>
    </div>
  </section>
  ${activeHTML}
  ${archivesHTML}
</body>
</html>`;
}

function exportRenseignementsPDF(){
  if(!RENS.fiches.length && !RENS.rapports.length){
    toast('Aucun renseignement à exporter.');
    return;
  }
  const win = window.open('', '_blank');
  if(!win){
    toast('Le navigateur a bloqué la fenêtre d’export.');
    return;
  }
  win.document.open();
  win.document.write(rensBuildExportHTML());
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(), 350);
}

function rensFilteredFiches(type){
  let fiches = RENS.fiches.filter(f=>!rensIsArchived(f) && (!type || f.type===type));
  return rensFilterFicheList(fiches);
}

function rensFilteredArchives(){
  return rensFilterFicheList(RENS.fiches.filter(rensIsArchived));
}

function rensTabNoun(type){
  return type==='lieux'?'lieu(x)':type==='individus'?'individu(s)':type==='groupes'?'groupe(s)':'autre(s)';
}

function rensManualUIEnabled(){
  // Ordre manuel + séparateurs visibles uniquement en vue "propre"
  // (pas de recherche, pas de filtre statut, pas de tri par date).
  return !RENS.searchQ && !RENS.filterStatut && !RENS.sortDate;
}

function rensBuildTabItems(type){
  const fiches = RENS.fiches.filter(f=>!rensIsArchived(f) && f.type===type);
  const seps = (RENS.separateurs||[]).filter(s=>s.type===type)
    .slice().sort((a,b)=> (Number(a.ordre)||0)-(Number(b.ordre)||0)
      || String(a.created_at||'').localeCompare(String(b.created_at||'')));
  const bySep = new Map();
  bySep.set(null, []);
  seps.forEach(s=>bySep.set(s.id, []));
  fiches.forEach(f=>{
    const key = (f.separateur_id && bySep.has(f.separateur_id)) ? f.separateur_id : null;
    bySep.get(key).push(f);
  });
  for(const arr of bySep.values()) arr.sort(rensDefaultFicheCompare);
  const items = [];
  bySep.get(null).forEach(f=>items.push({kind:'fiche', item:f}));
  seps.forEach(s=>{
    items.push({kind:'sep', item:s});
    bySep.get(s.id).forEach(f=>items.push({kind:'fiche', item:f}));
  });
  return items;
}

function buildSeparateurHTML(s){
  const peutOrdonner = rensCanDelete();
  const dnd = peutOrdonner
    ? ` draggable="true" ondragstart="rensSepDragStart(event,'${s.id}')" ondragover="rensDragOver(event)" ondrop="rensDropOnSeparateur(event,'${s.id}')"`
    : '';
  return `
  <tr class="rens-separateur" id="sep-${s.id}"${dnd}>
    <td colspan="6" style="background:var(--parch-dark);border-top:2px solid var(--gold);border-bottom:1px solid var(--border-g);padding:.45rem .8rem;cursor:${peutOrdonner?'grab':'default'};">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;">
        <span style="font-family:'Eagle Lake',serif;font-size:.9rem;color:var(--green-dark);letter-spacing:.04em;">\u25ac ${escH(s.label)}</span>
        ${peutOrdonner?`<span style="display:flex;gap:.3rem;flex-wrap:wrap;">
          <button class="btn-sm" title="Monter" onclick="rensMoveSeparateur('${s.id}','up')">\u25b2</button>
          <button class="btn-sm" title="Descendre" onclick="rensMoveSeparateur('${s.id}','down')">\u25bc</button>
          <button class="btn-sm" onclick="rensRenameSeparateur('${s.id}')">Renommer</button>
          <button class="btn-sm" style="color:#7A1010;" onclick="rensDeleteSeparateur('${s.id}')">Suppr.</button>
        </span>`:''}
      </div>
    </td>
  </tr>`;
}

function buildUnassignedZoneHTML(){
  const peutOrdonner = rensCanDelete();
  const drop = peutOrdonner ? ` ondragover="rensDragOver(event)" ondrop="rensDropUnassign(event)"` : '';
  return `
  <tr class="rens-separateur rens-unassigned"${drop}>
    <td colspan="6" style="background:transparent;border-bottom:1px dashed var(--border-g);padding:.35rem .8rem;">
      <span style="font-style:italic;color:var(--ink-faint);font-size:.82rem;">Non class\u00e9${peutOrdonner?' \u2014 glissez une fiche ici pour la retirer de sa section':''}</span>
    </td>
  </tr>`;
}

function renderTab(type){
  const container = document.getElementById('tab-'+type);
  if(!container) return;
  const labelEl = container.querySelector('.section-label');
  const listEl  = container.querySelector('.fiches-list');
  if(!listEl) return;

  // Vue "propre" : sections (séparateurs) + tri auto au sein de chaque section.
  if(rensManualUIEnabled()){
    const items = rensBuildTabItems(type);
    const ficheCount = items.filter(it=>it.kind==='fiche').length;
    if(labelEl) labelEl.textContent = `${ficheCount} ${rensTabNoun(type)} recensé(s)`;
    if(items.length===0){
      listEl.innerHTML = '<tr><td colspan="6" style="font-style:italic;color:var(--ink-faint);font-size:.92rem;padding:.7rem .9rem;">Aucune fiche.</td></tr>';
      rensUpdateDateSortButtons();
      return;
    }
    const hasSep = (RENS.separateurs||[]).some(s=>s.type===type);
    let html = hasSep ? buildUnassignedZoneHTML() : '';
    html += items.map(it=> it.kind==='sep'
      ? buildSeparateurHTML(it.item)
      : buildFicheHTML(it.item, {manual:true})
    ).join('');
    listEl.innerHTML = html;
    rensUpdateDateSortButtons();
    return;
  }

  // Vue filtrée / recherche / tri date : comportement classique, sans séparateurs.
  const fiches = rensFilteredFiches(type);
  if(labelEl) labelEl.textContent = `${fiches.length} ${rensTabNoun(type)} recensé(s)`;
  if(fiches.length===0){
    listEl.innerHTML = '<tr><td colspan="6" style="font-style:italic;color:var(--ink-faint);font-size:.92rem;padding:.7rem .9rem;">Aucune fiche.</td></tr>';
    rensUpdateDateSortButtons();
    return;
  }
  listEl.innerHTML = fiches.map(f=>buildFicheHTML(f)).join('');
  rensUpdateDateSortButtons();
}

// ── Séparateurs : CRUD + sections ────────────────────────────────────
async function rensAddSeparateur(){
  if(!rensCanDelete()) return;
  const type = RENS.activeTab;
  if(!type || type==='carte') return;
  const label = (prompt('Nom du séparateur :','')||'').trim();
  if(!label) return;
  const seps = (RENS.separateurs||[]).filter(s=>s.type===type);
  const maxOrdre = seps.reduce((m,s)=>Math.max(m, Number(s.ordre)||0), 0);
  const payload = { type, label, ordre: maxOrdre+10, created_by: session?.user?.id||null };
  try{
    await sbPost('mk_rens_separateurs',payload);
    await rensLoad();
  }catch(error){
    try{
      const {created_by, ...fallback} = payload;
      await sbPost('mk_rens_separateurs',fallback);
      await rensLoad();
    }catch(fallbackError){ alert('Erreur : '+fallbackError.message); }
  }
}

async function rensRenameSeparateur(id){
  if(!rensCanDelete()) return;
  const sep = (RENS.separateurs||[]).find(s=>s.id===id);
  if(!sep) return;
  const label = (prompt('Renommer le séparateur :', sep.label||'')||'').trim();
  if(!label || label===sep.label) return;
  try{
    await sbPatch('mk_rens_separateurs',`?id=eq.${id}`,{label});
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); }
}

async function rensDeleteSeparateur(id){
  if(!rensCanDelete()) return;
  const sep = (RENS.separateurs||[]).find(s=>s.id===id);
  if(!sep) return;
  if(!confirm(`Supprimer le séparateur "${sep.label}" ? Les fiches qu'il contient repasseront en "Non classé".`)) return;
  try{
    await sbDelete('mk_rens_separateurs',`?id=eq.${id}`);
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); }
}

// ── Assignation d'une fiche à une section ────────────────────────────
function rensFicheSectionSelectHTML(f){
  const seps = (RENS.separateurs||[]).filter(s=>s.type===f.type)
    .slice().sort((a,b)=>(Number(a.ordre)||0)-(Number(b.ordre)||0));
  if(!seps.length) return '';
  const opts = ['<option value="">\u2014 Aucune section \u2014</option>']
    .concat(seps.map(s=>`<option value="${s.id}"${f.separateur_id===s.id?' selected':''}>${escH(s.label)}</option>`))
    .join('');
  return `<select class="rens-sec-sel${f.separateur_id?' has-section':''}" title="Classer dans une section" onclick="event.stopPropagation()" onchange="rensAssignFicheSeparateur('${f.id}', this.value||null)">${opts}</select>`;
}

async function rensAssignFicheSeparateur(ficheId, sepId){
  if(!rensCanDelete()) return;
  const f = RENS.fiches.find(x=>x.id===ficheId);
  if(!f || rensIsArchived(f)) return;
  const val = sepId || null;
  if((f.separateur_id||null)===val) return;
  f.separateur_id = val; // optimiste
  renderTab(f.type);
  try{
    await sbPatch('mk_rens_fiches',`?id=eq.${ficheId}`,{separateur_id:val});
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); await rensLoad(); }
}

// ── Réordonnancement des séparateurs (flèches + glisser) ─────────────
function rensRenumberSeparateurs(seps){
  const updates=[];
  seps.forEach((s,i)=>{
    const no=(i+1)*10;
    if(Number(s.ordre)!==no){ s.ordre=no; updates.push(sbPatch('mk_rens_separateurs',`?id=eq.${s.id}`,{ordre:no})); }
  });
  return updates;
}

async function rensMoveSeparateur(id, dir){
  if(!rensCanDelete()) return;
  const sep = (RENS.separateurs||[]).find(s=>s.id===id);
  if(!sep) return;
  const seps = (RENS.separateurs||[]).filter(s=>s.type===sep.type)
    .slice().sort((a,b)=>(Number(a.ordre)||0)-(Number(b.ordre)||0));
  const idx = seps.findIndex(s=>s.id===id);
  const nidx = dir==='up'?idx-1:idx+1;
  if(nidx<0||nidx>=seps.length) return;
  const t=seps[idx]; seps[idx]=seps[nidx]; seps[nidx]=t;
  const updates = rensRenumberSeparateurs(seps);
  renderTab(sep.type);
  try{ await Promise.all(updates); await rensLoad(); }
  catch(error){ alert('Erreur : '+error.message); await rensLoad(); }
}

async function rensReorderSeparateurBefore(dragId, targetId){
  if(!rensCanDelete() || dragId===targetId) return;
  const drag = (RENS.separateurs||[]).find(s=>s.id===dragId);
  const target = (RENS.separateurs||[]).find(s=>s.id===targetId);
  if(!drag || !target || drag.type!==target.type) return;
  let seps = (RENS.separateurs||[]).filter(s=>s.type===drag.type)
    .slice().sort((a,b)=>(Number(a.ordre)||0)-(Number(b.ordre)||0))
    .filter(s=>s.id!==dragId);
  const ti = seps.findIndex(s=>s.id===targetId);
  seps.splice(ti,0,drag);
  const updates = rensRenumberSeparateurs(seps);
  renderTab(drag.type);
  try{ await Promise.all(updates); await rensLoad(); }
  catch(error){ alert('Erreur : '+error.message); await rensLoad(); }
}

// ── Glisser-déposer (souris) ─────────────────────────────────────────
let rensDragPayload = null;
function rensFicheDragStart(ev, id){
  rensDragPayload = 'fiche:'+id;
  try{ ev.dataTransfer.setData('text/plain', rensDragPayload); ev.dataTransfer.effectAllowed='move'; }catch(e){}
}
function rensSepDragStart(ev, id){
  rensDragPayload = 'sep:'+id;
  try{ ev.dataTransfer.setData('text/plain', rensDragPayload); ev.dataTransfer.effectAllowed='move'; }catch(e){}
  ev.stopPropagation();
}
function rensDragOver(ev){
  if(!rensCanDelete()) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
}
function rensReadDragPayload(ev){
  let p = rensDragPayload;
  try{ const d = ev.dataTransfer.getData('text/plain'); if(d) p=d; }catch(e){}
  return p;
}
async function rensDropOnSeparateur(ev, sepId){
  ev.preventDefault(); ev.stopPropagation();
  const p = rensReadDragPayload(ev); rensDragPayload=null;
  if(!p) return;
  if(p.indexOf('fiche:')===0) await rensAssignFicheSeparateur(p.slice(6), sepId);
  else if(p.indexOf('sep:')===0) await rensReorderSeparateurBefore(p.slice(4), sepId);
}
async function rensDropUnassign(ev){
  ev.preventDefault(); ev.stopPropagation();
  const p = rensReadDragPayload(ev); rensDragPayload=null;
  if(p && p.indexOf('fiche:')===0) await rensAssignFicheSeparateur(p.slice(6), null);
}

// ── Construction HTML d'une fiche ────────────────────────────────────
function buildFicheHTML(f, opts){
  const manual = !!(opts && opts.manual);
  const raps = RENS.rapports.filter(r=>r.fiche_id===f.id);
  const rels = RENS.relations.filter(r=>r.fiche_source===f.id || r.fiche_cible===f.id);
  const archived = rensIsArchived(f);

  const badgeUrgente = f.urgente ? `<span class="badge badge-urgente">🔴 Urgente</span>` : '';
  const badgeArchived = archived ? `<span class="badge badge-archive">Archivée</span>` : '';
  const badgeStatut  = f.statut && f.statut!=='neutre'
    ? `<span class="badge badge-${f.statut==='surveillance'?'surveille':f.statut==='recherche'?'recherche':f.statut==='verifie'?'verifie':'neutralise'}">${escH(rensStatusLabel(f.statut))}</span>` : '';

  // Champs rapides depuis meta JSON
  const meta = f.meta || {};
  const quickFields = Object.entries(meta).map(([k,v])=>`
    <div class="fiche-qf"><label>${k}</label><span>${v}</span></div>`).join('');

  // Relations HTML
  const relsHTML = buildRelationsHTML(f, rels);

  // Rapports HTML
  const rapsHTML = raps.map(r=>buildRapportHTML(r)).join('');
  const unreadCount = rensUnreadReportsForFiche(f.id).length;

  const peutAjouter = rensCanWrite();
  const peutModifier = rensCanEditOwn(f);
  const peutSupprimer = rensCanDelete();
  const peutOrdonner = peutSupprimer;
  const dragAttrs = (manual && peutOrdonner) ? ` draggable="true" ondragstart="rensFicheDragStart(event,'${f.id}')"` : '';
  const createdDate = rensFormatDate(f.created_at);

  return `
  <tr class="rens-row${f.urgente?' urgente':''}${archived?' archived':''}" id="fiche-${f.id}" data-id="${f.id}" data-tab="${f.type}"${dragAttrs} onclick="toggleFiche('fiche-${f.id}')">
    <td class="rens-row-chevron"><span class="fiche-chevron">▶</span></td>
    <td class="rens-row-name">${escH(f.nom)}</td>
    <td>${badgeArchived}${badgeStatut || '<span style="color:var(--ink-faint);font-style:italic;">Neutre</span>'}</td>
    <td class="rens-row-count">
      ${raps.length>0?raps.length:'—'}
      ${RENS.readTrackingReady?`<span class="rens-unread-fiche" data-rens-unread-fiche="${f.id}" ${unreadCount?'':'hidden'}>${unreadCount?rensUnreadLabel(unreadCount):''}</span>`:''}
    </td>
    <td class="rens-row-date">${createdDate}</td>
    <td class="rens-row-actions" onclick="event.stopPropagation()">
      ${manual&&peutOrdonner?rensFicheSectionSelectHTML(f):''}
      ${badgeUrgente}
      ${peutModifier&&!archived?`<button class="btn-sm" onclick="openEditFiche('${f.id}')">Modifier</button>`:''}
      ${peutSupprimer&&!archived?`<button class="btn-sm" onclick="archiveRensFiche('${f.id}')">Archiver</button>`:''}
      ${peutSupprimer&&archived?`<button class="btn-sm" onclick="unarchiveRensFiche('${f.id}')">Désarchiver</button>`:''}
      ${peutSupprimer?`<button class="btn-sm" style="color:#7A1010;" onclick="deleteFiche('${f.id}')">Suppr.</button>`:''}
    </td>
  </tr>
  <tr class="fiche-detail-row" id="detail-fiche-${f.id}">
    <td colspan="6">
      <div class="fiche-body">
        ${quickFields?`<div class="fiche-quick">${quickFields}</div>`:''}
        ${f.notes?`<div style="font-size:.9rem;color:var(--ink);background:rgba(28,26,24,.04);border-left:3px solid var(--border-g);padding:.5rem .75rem;margin-bottom:.75rem;white-space:pre-wrap;">${escH(f.notes)}</div>`:''}
        ${relsHTML}
        <div class="rapports-section">
          <div class="rapports-title">
            Rapports &amp; renseignements
            ${peutAjouter&&!archived?`<button class="btn-sm" onclick="toggleAdd('addrap-${f.id}')">+ Déposer un rapport</button>`:''}
          </div>
          ${raps.length===0?'<p style="font-style:italic;color:var(--ink-faint);font-size:.92rem;">Aucun rapport déposé.</p>':''}
          ${rapsHTML}
          ${peutAjouter&&!archived?buildAddRapportFormHTML(f.id):''}
        </div>
        ${peutModifier&&!archived?buildAddFicheNotes(f):''}
      </div>
    </td>
  </tr>`;
}

function toggleRensArchives(){
  RENS.archivesOpen = !RENS.archivesOpen;
  renderArchives();
}

function renderArchives(){
  const root = document.getElementById('rens-archives');
  if(!root)return;
  const allArchived = RENS.fiches.filter(rensIsArchived);
  const fiches = rensFilteredArchives();
  if(!allArchived.length){
    root.innerHTML = '';
    return;
  }
  root.innerHTML = `
    <div class="rens-archives-head" onclick="toggleRensArchives()">
      <div>
        <strong>Archives</strong>
        <span>${fiches.length}/${allArchived.length} fiche${allArchived.length>1?'s':''}</span>
      </div>
      <button class="btn-sm" onclick="event.stopPropagation();toggleRensArchives()">${RENS.archivesOpen?'Refermer':'Ouvrir'}</button>
    </div>
    <div class="rens-archives-body" ${RENS.archivesOpen?'':'hidden'}>
      ${fiches.length?`
      <div class="rens-table-wrap">
        <table class="rens-table">
          <thead>
            <tr>
              <th class="rens-th-chevron"></th>
              <th>Nom</th>
              <th>Statut</th>
              <th class="rens-th-count">Rapports</th>
              <th class="rens-th-date"><button type="button" class="rens-sort-btn" data-rens-sort-date onclick="sortRensByDate()">Date</button></th>
              <th class="rens-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody class="fiches-list">${fiches.map(f=>buildFicheHTML(f)).join('')}</tbody>
        </table>
      </div>`:'<p class="rens-archives-empty">Aucune archive ne correspond aux filtres actifs.</p>'}
    </div>`;
  rensUpdateDateSortButtons();
}

function buildRelationsHTML(f, rels){
  const archived = rensIsArchived(f);
  const peutModifier = rensCanWrite() && !archived;
  const peutSupprimer = rensCanDelete() && !archived;
  const linksHTML = rels.map(rel=>{
    const otherId = rel.fiche_source===f.id ? rel.fiche_cible : rel.fiche_source;
    const relId   = rel.id;
    const other   = RENS.fiches.find(x=>x.id===otherId);
    if(!other) return '';
    const typeLabel = other.type==='lieux'?'Lieu':other.type==='individus'?'Individu':other.type==='groupes'?'Groupe':'Autre';
    return `<a class="fiche-link" onclick="goToFiche('${other.id}','${other.type}')">
      <span class="fl-type">${typeLabel} ·</span> ${escH(other.nom)}
      ${peutSupprimer?`<span class="fl-del" onclick="event.stopPropagation();deleteRelation('${relId}','${f.id}')" title="Supprimer ce lien">×</span>`:''}
    </a>`;
  }).join('');

  // Options disponibles pour le select (toutes fiches sauf soi-même et déjà liées)
  const dejalie = rels.map(r=>r.fiche_source===f.id?r.fiche_cible:r.fiche_source);
  const opts = ['lieux','individus','groupes','autres'].map(type=>{
    const dispo = RENS.fiches.filter(x=>!rensIsArchived(x) && x.type===type && x.id!==f.id && !dejalie.includes(x.id));
    if(!dispo.length) return '';
    return `<optgroup label="${type==='lieux'?'Lieux':type==='individus'?'Individus':type==='groupes'?'Groupes':'Autres'}">
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
  const archived = rensReportIsArchived(r);
  const peutModifier = rensCanEditOwn(r) && !archived;
  const peutSupprimer = rensCanDelete() && !archived;
  const unread = rensReportIsUnread(r);
  const ficheLabel = {confirme:'✅ Confirmée', verifie:'✅ Vérifié', nonverif:'⚠ Non vérifiée', urgente:'🔴 Urgente', fausse:'❌ Invalidée'}[r.fiabilite]||r.fiabilite;
  const date = r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '';
  const preview = (r.contenu||'').substring(0,60)+(r.contenu&&r.contenu.length>60?'…':'');
  const author = rensAuthorLabel(r);
  return `
  <div class="rapport-accordion ${r.fiabilite||''}${unread?' unread':''}" id="rap-${r.id}">
    <div class="rapport-acc-head" onclick="toggleRap('rap-${r.id}')">
      <div class="rapport-acc-left">
        <span class="rapport-acc-chevron">▶</span>
        <span class="rapport-acc-date">${date}</span>
        ${RENS.readTrackingReady?`<span class="badge badge-nonlu" data-rens-unread-report="${r.id}" ${unread?'':'hidden'}>Non lu</span>`:''}
        <span class="badge badge-${r.fiabilite==="fausse"?"invalidee":r.fiabilite||"nonverif"}">${ficheLabel}</span>
        <span class="rapport-acc-titre">${escH(r.titre||'Inconnu')}</span>
        <span class="rapport-acc-preview">${escH(preview)}</span>
        ${author?`<span class="rapport-acc-author">- ${escH(author)}</span>`:''}
      </div>
      <div style="display:flex;gap:.3rem;">
        ${unread?`<button class="btn-sm" onclick="event.stopPropagation();rensMarkReportRead('${r.id}')">Marquer lu</button>`:''}
        ${peutModifier?`<button class="btn-sm" onclick="event.stopPropagation();openEditRapport('${r.id}')">Modifier</button>`:''}
        ${peutModifier?`<button class="btn-sm" onclick="event.stopPropagation();openTransferRapport('${r.id}')">Transférer</button>`:''}
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
      ${buildRapportAttachmentsHTML(r)}
      ${buildRapportLiensHTML(r)}
      ${peutModifier?buildEditRapportFormHTML(r):''}
    </div>
  </div>`;
}

// ── Liens rapport → fiches tierces ───────────────────────────────────
function buildRapportLiensHTML(r){
  const archived = rensReportIsArchived(r);
  const peutModifier  = rensCanWrite() && !archived;
  const peutSupprimer = rensCanDelete() && !archived;

  // ── Liens vers fiches ───────────────────────────────────────────────
  const liens = RENS.rapportLiens.filter(l=>l.rapport_id===r.id);
  const liensHTML = liens.map(l=>{
    const fiche = RENS.fiches.find(f=>f.id===l.fiche_id);
    if(!fiche) return '';
    const typeLabel = fiche.type==='lieux'?'Lieu':fiche.type==='individus'?'Individu':fiche.type==='groupes'?'Groupe':'Autre';
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

  const optsFiches = ['lieux','individus','groupes','autres'].map(type=>{
    const dispo = RENS.fiches.filter(x=>!rensIsArchived(x) && x.type===type && x.id!==r.fiche_id && !dejalieFiches.includes(x.id));
    if(!dispo.length) return '';
    return `<optgroup label="${type==='lieux'?'Lieux':type==='individus'?'Individus':type==='groupes'?'Groupes':'Autres'}">
      ${dispo.map(x=>`<option value="f:${x.id}">${escH(x.nom)}</option>`).join('')}
    </optgroup>`;
  }).join('');

  const optsRapports = (()=>{
    const dispo = RENS.rapports.filter(x=>!rensReportIsArchived(x) && x.id!==r.id && !dejalieRapports.includes(x.id));
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
  const report = RENS.rapports.find(r=>r.id===rapportId);
  if(!report || rensReportIsArchived(report))return;
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
  const lien = RENS.rapportLiens.find(l=>l.id===lienId);
  const report = RENS.rapports.find(r=>r.id===lien?.rapport_id);
  if(report && rensReportIsArchived(report))return;
  if(!confirm('Supprimer ce lien ?')) return;
  try{
    await sbDelete('mk_rens_rapport_liens',`?id=eq.${lienId}`);
    await rensLoad();
  }catch(error){ alert('Erreur : '+error.message); }
}

async function deleteRapportRapport(lienId){
  const lien = RENS.rapportRapport.find(l=>l.id===lienId);
  const reportA = RENS.rapports.find(r=>r.id===lien?.rapport_a);
  const reportB = RENS.rapports.find(r=>r.id===lien?.rapport_b);
  if((reportA && rensReportIsArchived(reportA)) || (reportB && rensReportIsArchived(reportB)))return;
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

function rensAttachmentsForRapport(rapportId){
  return RENS.attachments.filter(att=>att.rapport_id===rapportId);
}

function rensFormatFileSize(bytes){
  const size = Number(bytes) || 0;
  if(size < 1024) return `${size} o`;
  if(size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} Ko`;
  return `${Math.round(size / 1024 / 102.4) / 10} Mo`;
}

function rensAttachmentExtension(file){
  const byMime = {
    'image/jpeg':'jpg',
    'image/png':'png',
    'image/webp':'webp',
    'image/gif':'gif',
  };
  return byMime[file.type] || (file.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8) || 'img';
}

function rensAttachmentPath(rapportId, file){
  const userId = session?.user?.id || 'unknown';
  const randomId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${userId}/${rapportId}/${randomId}.${rensAttachmentExtension(file)}`;
}

function rensAttachmentInputHTML(inputId){
  return `
    <label>Pièces jointes <span style="font-style:italic;font-weight:normal;font-family:'IM Fell English',serif;font-size:.88rem;color:var(--ink-faint);">(images, facultatif)</span></label>
    <input type="file" id="${inputId}" accept="image/png,image/jpeg,image/webp,image/gif" multiple>
    <p class="rens-file-hint">Formats acceptés : PNG, JPG, WEBP ou GIF. Taille maximale : 5 Mo par image.</p>`;
}

function buildRapportAttachmentsHTML(r){
  const attachments = rensAttachmentsForRapport(r.id);
  const canRemove = rensCanEditOwn(r) && !rensReportIsArchived(r);
  if(!attachments.length)return '';
  return `
  <div class="rens-attachments">
    <div class="rens-attachments-title">Pièces jointes</div>
    <div class="rens-attachment-list">
      ${attachments.map(att=>`
      <div class="rens-attachment-item" id="att-${att.id}">
        <div class="rens-attachment-main">
          <span class="rens-attachment-icon">□</span>
          <span class="rens-attachment-name">${escH(att.file_name||'Image')}</span>
          <span class="rens-attachment-size">${rensFormatFileSize(att.file_size)}</span>
        </div>
        <div class="rens-attachment-actions">
          <button class="btn-sm" onclick="previewRensAttachment('${att.id}')">Prévisualiser</button>
          <button class="btn-sm" onclick="openRensAttachment('${att.id}')">Ouvrir</button>
          ${canRemove?`<button class="btn-sm btn-danger-soft" onclick="deleteRensAttachment('${att.id}')">Suppr.</button>`:''}
        </div>
        <div class="rens-attachment-preview" id="att-preview-${att.id}" hidden></div>
      </div>`).join('')}
    </div>
  </div>`;
}

function rensValidateAttachmentFile(file){
  if(!RENS_ATTACHMENT_TYPES.has(file.type)){
    throw new Error(`${file.name} n'est pas un format image accepté.`);
  }
  if(file.size > RENS_ATTACHMENT_MAX_SIZE){
    throw new Error(`${file.name} dépasse la limite de 5 Mo.`);
  }
}

async function uploadRensAttachments(rapportId, inputId){
  const input = document.getElementById(inputId);
  const files = [...(input?.files || [])];
  if(!files.length)return;
  if(!window.GrimoireSupabase?.storage){
    throw new Error('Le client Supabase Storage est indisponible.');
  }

  files.forEach(rensValidateAttachmentFile);
  const storage = window.GrimoireSupabase.storage.from(RENS_ATTACHMENT_BUCKET);
  for(const file of files){
    const path = rensAttachmentPath(rapportId, file);
    const { error } = await storage.upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if(error)throw error;

    try{
      await sbPost('mk_rens_attachments',{
        rapport_id: rapportId,
        bucket_id: RENS_ATTACHMENT_BUCKET,
        path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        created_by: session?.user?.id || null,
      });
    }catch(error){
      await storage.remove([path]).catch(()=>{});
      throw error;
    }
  }
  input.value = '';
}

async function rensSignedAttachmentUrl(att){
  const bucket = att.bucket_id || RENS_ATTACHMENT_BUCKET;
  const { data, error } = await window.GrimoireSupabase.storage
    .from(bucket)
    .createSignedUrl(att.path, 60 * 10);
  if(error)throw error;
  return data?.signedUrl || data?.signedURL;
}

async function rensRemoveStorageFiles(bucket, paths){
  if(!paths.length)return;
  const { error } = await window.GrimoireSupabase.storage.from(bucket).remove(paths);
  if(error)throw error;
}

async function previewRensAttachment(attId){
  const att = RENS.attachments.find(x=>x.id===attId);
  const preview = document.getElementById('att-preview-'+attId);
  if(!att || !preview)return;
  if(!preview.hidden){
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  preview.hidden = false;
  preview.innerHTML = '<p>Chargement de l’image...</p>';
  try{
    const url = await rensSignedAttachmentUrl(att);
    preview.innerHTML = `<img src="${url}" alt="${escH(att.file_name||'Pièce jointe')}">`;
  }catch(error){
    preview.innerHTML = `<p class="rens-attachment-error">Impossible de charger l’image : ${escH(error.message)}</p>`;
  }
}

async function openRensAttachment(attId){
  const att = RENS.attachments.find(x=>x.id===attId);
  if(!att)return;
  try{
    const url = await rensSignedAttachmentUrl(att);
    window.open(url, '_blank', 'noopener');
  }catch(error){
    alert('Impossible d’ouvrir la pièce jointe : '+error.message);
  }
}

async function deleteRensAttachment(attId){
  const att = RENS.attachments.find(x=>x.id===attId);
  const report = RENS.rapports.find(r=>r.id===att?.rapport_id);
  if(!att || !report || rensReportIsArchived(report) || !rensCanEditOwn(report))return;
  if(!confirm('Supprimer cette pièce jointe ?'))return;
  try{
    await rensRemoveStorageFiles(att.bucket_id || RENS_ATTACHMENT_BUCKET, [att.path]);
    await sbDelete('mk_rens_attachments',`?id=eq.${encodeURIComponent(attId)}`);
    await rensLoad();
  }catch(error){
    alert('Erreur : '+error.message);
  }
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
          <option value="verifie">✅ Vérifié</option>
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
    ${rensAttachmentInputHTML(`raf-files-${ficheId}`)}
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
          <option value="verifie"${r.fiabilite==='verifie'?' selected':''}>✅ Vérifié</option>
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
    ${rensAttachmentInputHTML(`er-files-${r.id}`)}
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
          <option value="autres">Autre</option>
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
          <option value="verifie">Vérifié</option>
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
async function notifyDiscordRenseignement(type, opts){
  const send = window.GrimoireDiscord?.send || window.sendDiscordNotification;
  if(typeof send!=='function')return;
  const payload = typeof opts==='string' ? {detail:opts} : (opts||{});
  await send(type==='fiche'?'renseignement_fiche':'renseignement_rapport', payload);
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
  await notifyDiscordRenseignement('fiche', {detail:nom, category:type});
  document.getElementById('rens-add-form').style.display='none';
  await rensLoad();
  // Aller sur le bon onglet
  const tabBtns = document.querySelectorAll('#page-renseignements .tab');
  const idx = ['lieux','individus','groupes','autres'].indexOf(type);
  if(idx>=0 && tabBtns[idx]) showTab(type, tabBtns[idx]);
}

async function deleteFiche(id){
  if(!rensCanDelete())return;
  if(!confirm('Supprimer cette fiche ? Tous ses rapports et relations seront supprimés.')) return;
  try{await sbDelete('mk_rens_fiches',`?id=eq.${id}`);}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

async function archiveRensFiche(id){
  if(!rensCanDelete())return;
  const fiche = RENS.fiches.find(f=>f.id===id);
  if(!fiche || rensIsArchived(fiche))return;
  if(!confirm(`Archiver la fiche "${fiche.nom}" ? Elle sera déplacée dans les archives avec ses rapports.`))return;
  try{
    const { error } = await window.GrimoireSupabase.rpc('archive_rens_fiche',{p_fiche_id:id});
    if(error)throw error;
    RENS.archivesOpen = true;
    await rensLoad();
    toast('Fiche archivée.');
  }catch(error){
    alert('Erreur : '+error.message);
  }
}

async function unarchiveRensFiche(id){
  if(!rensCanDelete())return;
  const fiche = RENS.fiches.find(f=>f.id===id);
  if(!fiche || !rensIsArchived(fiche))return;
  if(!confirm(`Désarchiver la fiche "${fiche.nom}" ?`))return;
  try{
    const { error } = await window.GrimoireSupabase.rpc('unarchive_rens_fiche',{p_fiche_id:id});
    if(error)throw error;
    RENS.archivesOpen = true;
    await rensLoad();
    toast('Fiche désarchivée.');
  }catch(error){
    alert('Erreur : '+error.message);
  }
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
          <option value="verifie"${f.statut==='verifie'?' selected':''}>Vérifié</option>
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
  if(!f || rensIsArchived(f) || !rensCanEditOwn(f))return;
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
  if(!fiche || rensIsArchived(fiche) || !rensCanEditOwn(fiche))return;
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
  const fiche = RENS.fiches.find(f=>f.id===ficheId);
  if(!fiche || rensIsArchived(fiche)){
    alert('Cette fiche est archivée. Désarchive-la avant d’ajouter un rapport.');
    return;
  }
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
  let createdReport = null;
  try{
    const inserted = await sbPost('mk_rens_rapports',payloadWithAuthor);
    createdReport = Array.isArray(inserted) ? inserted[0] : inserted;
  }
  catch(error){
    try{
      const inserted = await sbPost('mk_rens_rapports',payload);
      createdReport = Array.isArray(inserted) ? inserted[0] : inserted;
    }
    catch(fallbackError){ alert('Erreur : '+fallbackError.message); return; }
  }
  if(createdReport?.id){
    await rensMarkReportRead(createdReport.id, {force:true});
    try{
      await uploadRensAttachments(createdReport.id, `raf-files-${ficheId}`);
    }catch(error){
      alert('Rapport enregistré, mais une pièce jointe n’a pas pu être ajoutée : '+error.message);
    }
  }
  await notifyDiscordRenseignement('rapport', {
    reportId: createdReport?.id || null,
    detail: titre || 'Sans titre',
    ficheName: fiche?.nom || null,
    ficheType: fiche?.type || null,
    fiabilite,
    contenu,
    action_recommandee: action || null,
  });
  await rensLoad();
}

function openEditRapport(rapId){
  const report = RENS.rapports.find(r=>r.id===rapId);
  if(!report || rensReportIsArchived(report) || !rensCanEditOwn(report))return;
  const form = document.getElementById('editrap-'+rapId);
  if(form)form.style.display = form.style.display==='none' ? 'block' : 'none';
}

async function saveEditRapport(rapId){
  const report = RENS.rapports.find(r=>r.id===rapId);
  if(!report || rensReportIsArchived(report) || !rensCanEditOwn(report))return;
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
  try{
    await uploadRensAttachments(rapId, `er-files-${rapId}`);
  }catch(error){
    alert('Rapport modifié, mais une pièce jointe n’a pas pu être ajoutée : '+error.message);
  }
  await rensLoad();
}

async function deleteRapport(rapId, ficheId){
  if(!rensCanDelete())return;
  const report = RENS.rapports.find(r=>r.id===rapId);
  if(!report || rensReportIsArchived(report))return;
  if(!confirm('Supprimer ce rapport ?')) return;
  const attachments = rensAttachmentsForRapport(rapId);
  try{
    const groupedPaths = attachments.reduce((acc, att)=>{
      const bucket = att.bucket_id || RENS_ATTACHMENT_BUCKET;
      if(!acc[bucket])acc[bucket]=[];
      acc[bucket].push(att.path);
      return acc;
    }, {});
    await Promise.all(Object.entries(groupedPaths).map(([bucket, paths])=>
      rensRemoveStorageFiles(bucket, paths)
    ));
    await sbDelete('mk_rens_rapports',`?id=eq.${rapId}`);
  }
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

// ── Transfert d'un rapport vers une autre fiche ───────────────────────
function openTransferRapport(rapId){
  document.querySelectorAll('.rapport-transfer-form').forEach(el=>el.remove());
  const r = RENS.rapports.find(x=>x.id===rapId);
  if(!r) return;
  const autres = RENS.fiches.filter(f=>f.id!==r.fiche_id && !rensIsArchived(f));
  if(!autres.length){ toast('Aucune autre fiche disponible.'); return; }
  const opts = ['lieux','individus','groupes','autres'].map(type=>{
    const dispo = autres.filter(f=>f.type===type);
    if(!dispo.length) return '';
    return `<optgroup label="${type==='lieux'?'Lieux':type==='individus'?'Individus':type==='groupes'?'Groupes':'Autres'}">
      ${dispo.map(f=>`<option value="${f.id}">${escH(f.nom)}</option>`).join('')}
    </optgroup>`;
  }).join('');
  const form = document.createElement('div');
  form.className = 'rapport-transfer-form';
  form.style.cssText = 'padding:.6rem .8rem;background:rgba(28,26,24,.05);border-top:1px dashed var(--border-g);display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-top:.4rem;';
  form.innerHTML = `
    <span style="font-family:'Eagle Lake',serif;font-size:.82rem;color:var(--ink-faint);">Transférer vers :</span>
    <select id="transfer-sel-${rapId}" style="flex:1;font-family:'IM Fell English',serif;font-size:.9rem;min-width:160px;background:var(--parch);border:1px solid var(--border-g);color:var(--ink);padding:.3rem .5rem;">
      <option value="">— Choisir une fiche —</option>
      ${opts}
    </select>
    <button class="btn-add" style="font-size:.78rem;padding:.28rem .7rem;" onclick="transferRapport('${rapId}')">Confirmer</button>
    <button class="btn-sm" onclick="this.closest('.rapport-transfer-form').remove()">Annuler</button>`;
  const body = document.getElementById('rap-'+rapId)?.querySelector('.rapport-acc-body');
  if(body) body.appendChild(form);
  else document.getElementById('rap-'+rapId)?.appendChild(form);
}

async function transferRapport(rapId){
  const sel = document.getElementById('transfer-sel-'+rapId);
  const newFicheId = sel?.value;
  if(!newFicheId){ toast('Sélectionne une fiche cible.'); return; }
  const newFiche = RENS.fiches.find(f=>f.id===newFicheId);
  if(!confirm(`Transférer ce rapport vers "${newFiche?.nom||'cette fiche'}" ?`)) return;
  try{
    await sbPatch('mk_rens_rapports',`?id=eq.${rapId}`,{ fiche_id: newFicheId });
    document.querySelectorAll('.rapport-transfer-form').forEach(el=>el.remove());
    await rensLoad();
    toast(`Rapport transféré vers "${escH(newFiche?.nom||'la fiche cible')}".`);
  }catch(error){
    alert('Erreur : '+error.message);
  }
}

// ── CRUD Relations ───────────────────────────────────────────────────
async function addRelation(ficheSourceId){
  if(!rensCanWrite())return;
  const source = RENS.fiches.find(f=>f.id===ficheSourceId);
  if(!source || rensIsArchived(source))return;
  const sel = document.getElementById('relsel-'+ficheSourceId);
  const cibleId = sel ? sel.value : '';
  if(!cibleId){ alert('Sélectionne une fiche cible.'); return; }
  try{await sbPost('mk_rens_relations',{fiche_source: ficheSourceId, fiche_cible: cibleId});}
  catch(error){ alert('Erreur : '+error.message); return; }
  await rensLoad();
}

async function deleteRelation(relId, ficheId){
  if(!rensCanDelete())return;
  const rel = RENS.relations.find(r=>r.id===relId);
  const source = RENS.fiches.find(f=>f.id===rel?.fiche_source);
  const target = RENS.fiches.find(f=>f.id===rel?.fiche_cible);
  if((source && rensIsArchived(source)) || (target && rensIsArchived(target)))return;
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
  renderArchives();
}
function rensFilter(v){
  RENS.filterStatut = v==='Tous les statuts'?'':v;
  if(RENS.activeTab==='carte') rensRenderCarte();
  else renderTab(RENS.activeTab);
  renderArchives();
}

// ── Init renseignements (appelé depuis init() Supabase) ───────────
async function initRenseignements(){
  // Les lecteurs de la section peuvent créer du contenu, les éditeurs peuvent supprimer.
  const wrap = document.getElementById('rens-add-wrap');
  if(wrap && rensCanWrite()){
    wrap.innerHTML = `
      <button class="btn-add" onclick="document.getElementById('rens-add-form').style.display=document.getElementById('rens-add-form').style.display==='none'?'block':'none'">+ Nouvelle fiche</button>
      ${rensCanDelete()?`<button class="btn-add" style="margin-left:.4rem;" onclick="rensAddSeparateur()">+ Séparateur</button>`:''}
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

// ── Tableau d'enquête (Corkboard) ─────────────────────────────────────

function injectCarteTab(){
  const firstTab = document.querySelector('#page-renseignements .tab');
  if(!firstTab) return;
  const existing = document.querySelector('#page-renseignements .tab[data-tab-id="tableau"]');
  if(!existing){
    const btn = document.createElement('div');
    btn.className = 'tab';
    btn.textContent = '📋 Tableau';
    btn.dataset.tabId = 'tableau';
    btn.onclick = () => showTab('carte', btn);
    firstTab.parentElement.appendChild(btn);
  }
  if(!document.getElementById('tab-carte')){
    const div = document.createElement('div');
    div.id = 'tab-carte';
    div.style.display = 'none';
    div.innerHTML = '<div id="rens-corkboard"></div>';
    const archives = document.getElementById('rens-archives');
    if(archives) archives.parentElement.insertBefore(div, archives);
  }
}

// ── Rendu du corkboard ────────────────────────────────────────────────
function rensRenderCarte(){
  const board = document.getElementById('rens-corkboard');
  if(!board) return;

  const activeFiches  = RENS.fiches.filter(f=>!rensIsArchived(f));
  const groupes       = activeFiches.filter(f=>f.type==='groupes');
  const rapportsActifs= RENS.rapports.filter(r=>!r.archive);

  // Map groupe.id → fiches liées via relations
  const fichesByGroupe = {};
  groupes.forEach(g=>{ fichesByGroupe[g.id] = []; });
  RENS.relations.forEach(rel=>{
    if(fichesByGroupe[rel.fiche_source] !== undefined){
      const f = activeFiches.find(f=>f.id===rel.fiche_cible);
      if(f) fichesByGroupe[rel.fiche_source].push(f);
    }
    if(fichesByGroupe[rel.fiche_cible] !== undefined){
      const f = activeFiches.find(f=>f.id===rel.fiche_source);
      if(f) fichesByGroupe[rel.fiche_cible].push(f);
    }
  });

  // Fiches liées à au moins un groupe
  const fichesDansGroupe = new Set(
    Object.values(fichesByGroupe).flat().map(f=>f.id)
  );
  groupes.forEach(g=>fichesDansGroupe.add(g.id));

  // Rapports orphelins (fiche non liée à un groupe)
  const rapportsOrphelins = rapportsActifs.filter(r=>{
    return !fichesDansGroupe.has(r.fiche_id);
  });

  const fiabIcon = {confirme:'✅',urgente:'🔴',nonverif:'⚠️',fausse:'❌'};
  const statut   = {lieux:'📍',individus:'👤',groupes:'⚔️',autres:'◆'};

  function buildRapportItem(r){
    const icon = fiabIcon[r.fiabilite]||'⚠️';
    const titre= (r.titre||'Rapport').length>35
      ? (r.titre||'Rapport').substring(0,33)+'…'
      : (r.titre||'Rapport');
    return `<div class="cork-rap" onclick="goToRapport('${r.id}','${r.fiche_id}')" title="${escH(r.titre||'')}">
      <span class="cork-rap-icon">${icon}</span>
      <span class="cork-rap-title">${escH(titre)}</span>
    </div>`;
  }

  function buildCard(groupe){
    const membres   = fichesByGroupe[groupe.id]||[];
    const rapsGroupe= rapportsActifs.filter(r=>r.fiche_id===groupe.id);
    // Rapports des membres liés
    const rapsMembres = membres.flatMap(m=>rapportsActifs.filter(r=>r.fiche_id===m.id));
    const urgente   = groupe.urgente?' cork-card--urgente':'';
    const statutBadge = groupe.statut && groupe.statut!=='neutre'
      ? `<span class="badge badge-${groupe.statut==='recherche'?'recherche':groupe.statut==='surveillance'?'surveille':'neutralise'}" style="font-size:.7rem;">${groupe.statut==='recherche'?'Recherché':groupe.statut==='surveillance'?'Surveillance':'Neutralisé'}</span>`:'';

    return `<div class="cork-card${urgente}" id="cork-${groupe.id}">
      <div class="cork-card-header">
        <span class="cork-card-name">${escH(groupe.nom)}</span>
        ${statutBadge}
      </div>
      ${membres.length?`
      <div class="cork-section-label">Membres & lieux associés</div>
      <div class="cork-members">
        ${membres.map(m=>`<span class="cork-member" onclick="goToFiche('${m.id}','${m.type}')">${statut[m.type]||'◆'} ${escH(m.nom)}</span>`).join('')}
      </div>`:''}
      ${rapsGroupe.length||rapsMembres.length?`
      <div class="cork-section-label">Rapports (${rapsGroupe.length+rapsMembres.length})</div>
      <div class="cork-raps">
        ${rapsGroupe.map(buildRapportItem).join('')}
        ${rapsMembres.map(buildRapportItem).join('')}
      </div>`:'<div class="cork-empty">Aucun rapport lié.</div>'}
    </div>`;
  }

  // Card "Non classés"
  const orphanCard = rapportsOrphelins.length
    ? `<div class="cork-card cork-card--orphan">
        <div class="cork-card-header"><span class="cork-card-name">Non classés</span></div>
        <div class="cork-section-label">Rapports sans groupe</div>
        <div class="cork-raps">${rapportsOrphelins.map(buildRapportItem).join('')}</div>
      </div>` : '';

  if(!groupes.length && !rapportsOrphelins.length){
    board.innerHTML = '<p style="font-style:italic;color:var(--ink-faint);padding:1rem;">Aucun groupe recensé. Créez des fiches de type Groupe dans l\'onglet Groupes.</p>';
    return;
  }

  board.innerHTML = `<div class="cork-board">
    ${groupes.map(buildCard).join('')}
    ${orphanCard}
  </div>`;
}


// ── Fonctions utilitaires renseignements ─────────────────────────────
function rensFicheForRapport(report){
  return RENS.fiches.find(f=>f.id===report?.fiche_id)||null;
}

function rensReportIsArchived(report){
  return rensIsArchived(rensFicheForRapport(report));
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
    lieux    :{bg:'#b8785a',border:'#7a4a2a',text:'#fff8f4'},
    individus:{bg:'#5a7aaa',border:'#2a4a7a',text:'#f0f4ff'},
    groupes  :{bg:'#5a8a6a',border:'#2a5a3a',text:'#f0fff4'},
    autres   :{bg:'#8a7a5a',border:'#5a4a2a',text:'#fff8f0'},
  }[type]||{bg:'#8a7a5a',border:'#5a4a2a',text:'#fff8f0'};
}

function rensRapportColors(fiabilite){
  return {
    confirme:{bg:'#d4ead4',border:'#3a6a3a'},
    verifie :{bg:'#d4ead4',border:'#3a6a3a'},
    urgente :{bg:'#ead4d4',border:'#8a1010'},
    nonverif:{bg:'#eae0c4',border:'#8a6a2a'},
    fausse  :{bg:'#d8d8d8',border:'#6a6a6a'},
  }[fiabilite]||{bg:'#eae0c4',border:'#8a6a2a'};
}

// Garder pour compatibilité bootstrap (ne font plus rien)
function rensReorganiserCarte(){}
function rensLoadVisNetwork(){}
function rensComputeAutoEdges(){ return []; }
function rensOpenMapReportPicker(){}
function rensSetMapReportType(){}
function rensSpawnMapReport(){}
function rensSpawnMapFiche(){}
function rensStartMapLink(){}
function rensCancelMapLink(){}
function rensSetMapLinkColor(){}
function rensDeleteSelectedMapItem(){}

function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
