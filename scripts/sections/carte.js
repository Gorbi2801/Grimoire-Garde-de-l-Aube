// ══════════════════════════════════════════════════════════════════════
//  CARTE INTERACTIVE
// ══════════════════════════════════════════════════════════════════════
const CARTE_MAP=Object.freeze({
  base:'assets/skyrim-carte-bordeciel.jpg',
  overlay:'assets/skyrim-carte-map-complete.jpg',
  width:1997,
  height:1383,
});

const CARTE_TYPES=['Risque','Intérêt','Rumeur','Patrouille','Enquête','Lieu sûr'];
const CARTE_RISKS=['Faible','Modéré','Élevé','Critique'];
const CARTE_STATUS=['À vérifier','Confirmé','En cours','Résolu','Obsolète'];
const CARTE_RISK_COLORS=Object.freeze({
  Faible:'#2D6A2D',
  Modéré:'#8B5E00',
  Élevé:'#8B3030',
  Critique:'#7A1010',
});

const carteState={
  mounted:false,
  loaded:false,
  loading:false,
  error:'',
  pins:[],
  zones:[],
  pinLinks:[],
  zoneLinks:[],
  reports:[],
  fiches:[],
  patrouilles:[],
  selectedType:null,
  selectedPinId:null,
  selectedZoneId:null,
  draftCoords:null,
  draftZonePoints:[],
  placing:false,
  drawingZone:false,
  sidebarCollapsed:false,
  overlayVisible:false,
  layers:{pins:true,zones:true,patrouilles:true,reports:true},
  filters:{search:'',type:'all',risk:'all',status:'all',linked:'all',timeline:'all'},
  view:{scale:1,x:0,y:0},
  drag:null,
};

function carteEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function carteDate(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
}

function carteTitle(row){
  return row?.title||'Sans titre';
}

function carteColor(row){
  return row?.color||CARTE_RISK_COLORS[row?.risk_level]||CARTE_RISK_COLORS.Modéré;
}

function carteReportLabel(report){
  const fiche=carteState.fiches.find(row=>row.id===report.fiche_id);
  const target=fiche?.nom||fiche?.type||'Fiche';
  const source=report.source||'Rapport';
  return `${target} — ${source} — ${carteDate(report.created_at)}`;
}

function carteReportType(report){
  const fiche=carteState.fiches.find(row=>row.id===report.fiche_id);
  return fiche?.type||'autres';
}

function carteReportTypeLabel(type){
  return {all:'Tous les rapports',lieux:'Lieux',individus:'Individus',groupes:'Groupes',autres:'Sans fiche'}[type]||type;
}

function carteVisibleReports(type='all'){
  return carteState.reports.filter(report=>type==='all'||carteReportType(report)===type);
}

function carteReportChipHtml(reportId){
  const report=carteState.reports.find(row=>row.id===reportId);
  if(!report)return '';
  return `<span class="carte-report-chip">
    ${carteEsc(carteReportLabel(report))}
    <button type="button" onclick="carteRemoveReportFromSelection('${escJs(reportId)}')" aria-label="Retirer ce rapport">×</button>
  </span>`;
}

function carteReportPickerListHtml(type='all'){
  const selected=new Set(carteSelectedReportIds());
  const reports=carteVisibleReports(type).filter(report=>!selected.has(report.id));
  if(!reports.length)return '<p class="sa-empty">Aucun rapport disponible pour ce filtre.</p>';
  return reports.map(report=>`<button type="button" class="carte-report-choice" onclick="carteAddReportToSelection('${escJs(report.id)}')">
    <strong>${carteEsc(carteReportLabel(report))}</strong>
    <span>${carteEsc((report.contenu||'').slice(0,90))}${report.contenu&&report.contenu.length>90?'…':''}</span>
  </button>`).join('');
}

function cartePatrouilleLabel(row){
  if(!row)return '';
  return [row.title,row.location].filter(Boolean).join(' — ')||'Patrouille active';
}

function carteCurrentAuthor(){
  if(!session)return {};
  const name=[session.garde?.prenom,session.garde?.nom].filter(Boolean).join(' ')||session.displayName||session.username||'';
  const grade=session.garde?.grade||session.grade||'';
  return {name,grade};
}

function carteAuthorLabel(row){
  const name=row?.created_by_name||'';
  const grade=row?.created_by_grade||'';
  if(name&&grade&&grade!=='—')return `${name} (${grade})`;
  return name||'Auteur inconnu';
}

function carteLinkedReportIds(kind,id){
  const rows=kind==='zone'?carteState.zoneLinks:carteState.pinLinks;
  const key=kind==='zone'?'zone_id':'pin_id';
  return rows.filter(row=>row[key]===id).map(row=>row.report_id);
}

function carteHasLinkedReport(kind,row){
  return carteLinkedReportIds(kind,row.id).length>0;
}

function carteLinkedPatrouille(row){
  return row?.patrouille_id?carteState.patrouilles.find(p=>p.id===row.patrouille_id)||null:null;
}

function carteMatchesTimeline(row){
  if(carteState.filters.timeline==='all')return true;
  const d=new Date(row.created_at||row.updated_at||Date.now());
  if(Number.isNaN(d.getTime()))return true;
  const now=Date.now();
  const age=now-d.getTime();
  if(carteState.filters.timeline==='today')return age<=24*60*60*1000;
  if(carteState.filters.timeline==='week')return age<=7*24*60*60*1000;
  if(carteState.filters.timeline==='month')return age<=31*24*60*60*1000;
  if(carteState.filters.timeline==='active')return !['Résolu','Obsolète'].includes(row.status);
  return true;
}

function carteFilteredRows(kind){
  const rows=kind==='zone'?carteState.zones:carteState.pins;
  const q=carteState.filters.search.trim().toLowerCase();
  return rows.filter(row=>{
    const search=[row.title,row.description,row.type,row.risk_level,row.status].filter(Boolean).join(' ').toLowerCase();
    const matchSearch=!q||search.includes(q);
    const matchType=carteState.filters.type==='all'||row.type===carteState.filters.type;
    const matchRisk=carteState.filters.risk==='all'||row.risk_level===carteState.filters.risk;
    const matchStatus=carteState.filters.status==='all'||(row.status||'À vérifier')===carteState.filters.status;
    const linked=carteHasLinkedReport(kind,row);
    const matchLinked=carteState.filters.linked==='all'||(carteState.filters.linked==='linked'?linked:!linked);
    return matchSearch&&matchType&&matchRisk&&matchStatus&&matchLinked&&carteMatchesTimeline(row);
  });
}

function carteSelectedPin(){
  return carteState.pins.find(row=>row.id===carteState.selectedPinId)||null;
}

function carteSelectedZone(){
  return carteState.zones.find(row=>row.id===carteState.selectedZoneId)||null;
}

function carteSelectNothing(){
  carteState.selectedType=null;
  carteState.selectedPinId=null;
  carteState.selectedZoneId=null;
}

function mountCarteSection(){
  if(carteState.mounted)return;

  const content=document.querySelector('.content');
  if(content&&!document.getElementById('page-carte')){
    const section=document.createElement('section');
    section.className='section-page';
    section.id='page-carte';
    section.innerHTML=`
      <div class="sect-header carte-header">
        <h2>Carte des risques</h2>
        <p>Repères, zones d'intérêt et liens vers les rapports de renseignement.</p>
        <div class="sect-stats">
          <span class="stat-chip" id="cartePinCount">Pings : 0</span>
          <span class="stat-chip" id="carteZoneCount">Zones : 0</span>
          <span class="stat-chip" id="cartePatrouilleCount">Patrouilles : 0</span>
          <span class="stat-chip" id="carteRiskCount">Critiques : 0</span>
        </div>
      </div>

      <div class="carte-shell" id="carteShell">
        <button type="button" id="carteSidebarArrow" class="carte-sidebar-handle" onclick="carteToggleSidebar()" aria-label="Masquer les filtres">‹</button>
        <aside class="carte-sidebar" id="carteSidebar">
          <div class="carte-sidebar-head"><h3>Filtres</h3></div>
          <div class="carte-filter-stack">
            <label class="form-field">
              <span>Recherche</span>
              <input type="search" id="carteSearch" placeholder="Nom, note, type..." oninput="carteSetFilter('search',this.value)">
            </label>
            <label class="form-field">
              <span>Type</span>
              <select id="carteTypeFilter" onchange="carteSetFilter('type',this.value)">
                <option value="all">Tous les types</option>
                ${CARTE_TYPES.map(type=>`<option value="${carteEsc(type)}">${carteEsc(type)}</option>`).join('')}
              </select>
            </label>
            <label class="form-field">
              <span>Niveau</span>
              <select id="carteRiskFilter" onchange="carteSetFilter('risk',this.value)">
                <option value="all">Tous les niveaux</option>
                ${CARTE_RISKS.map(risk=>`<option value="${carteEsc(risk)}">${carteEsc(risk)}</option>`).join('')}
              </select>
            </label>
            <label class="form-field">
              <span>Statut</span>
              <select id="carteStatusFilter" onchange="carteSetFilter('status',this.value)">
                <option value="all">Tous les statuts</option>
                ${CARTE_STATUS.map(status=>`<option value="${carteEsc(status)}">${carteEsc(status)}</option>`).join('')}
              </select>
            </label>
            <label class="form-field">
              <span>Période</span>
              <select id="carteTimelineFilter" onchange="carteSetFilter('timeline',this.value)">
                <option value="all">Tout afficher</option>
                <option value="active">Non résolu</option>
                <option value="today">24 dernières heures</option>
                <option value="week">7 derniers jours</option>
                <option value="month">30 derniers jours</option>
              </select>
            </label>
            <label class="form-field">
              <span>Rapports</span>
              <select id="carteLinkedFilter" onchange="carteSetFilter('linked',this.value)">
                <option value="all">Tous</option>
                <option value="linked">Avec rapport lié</option>
                <option value="unlinked">Sans rapport</option>
              </select>
            </label>
          </div>

          <div class="carte-layers">
            <div class="profile-title">Calques</div>
            ${[
              ['pins','Pings'],
              ['zones','Zones'],
              ['patrouilles','Patrouilles actives'],
              ['reports','Liens rapports'],
            ].map(([key,label])=>`<label><input type="checkbox" checked onchange="carteSetLayer('${key}',this.checked)"> ${label}</label>`).join('')}
          </div>

          <div id="carte-add-wrap" class="carte-create-actions">
            <button type="button" class="btn-submit" onclick="carteToggleCreatePanel()">Créer un ping</button>
            <button type="button" class="btn-action btn-gold" onclick="carteStartZoneDrawing()">Dessiner une zone</button>
          </div>
          <div class="carte-pin-list" id="cartePinList"></div>
        </aside>

        <section class="carte-main">
          <div class="carte-map-toolbar">
            <button type="button" id="carteOverlayToggle" class="btn-action carte-overlay-toggle" onclick="carteToggleOverlay()">Carte annotée : masquée</button>
            <span id="cartePlacementHint" class="carte-placement-hint"></span>
          </div>
          <div class="carte-stage" id="carteStage" aria-label="Carte interactive">
            <div class="carte-world" id="carteWorld">
              <img class="carte-map-img" src="${CARTE_MAP.base}" alt="Carte de Bordeciel">
              <img class="carte-map-img carte-overlay-img" id="carteOverlayImg" src="${CARTE_MAP.overlay}" alt="Carte annotée de Bordeciel">
              <svg class="carte-zones" id="carteZones" viewBox="0 0 ${CARTE_MAP.width} ${CARTE_MAP.height}" preserveAspectRatio="none"></svg>
              <div class="carte-pins" id="cartePins"></div>
            </div>
            <div class="carte-map-controls">
              <button type="button" class="btn-action" onclick="carteZoomIn()">+</button>
              <button type="button" class="btn-action" onclick="carteZoomOut()">−</button>
              <button type="button" class="btn-action" onclick="carteResetView()">Centrer</button>
            </div>
          </div>
          <div class="carte-editor" id="carteEditor"></div>
          <div class="msg" id="carteMsg"></div>
        </section>
      </div>`;

    const superadmin=document.getElementById('page-superadmin');
    content.insertBefore(section,superadmin||null);
  }

  carteState.mounted=true;
  bindCarteMap();
  renderCarte();
}

async function initCarte(){
  mountCarteSection();
  if(!session)return;
  if(!carteState.loaded&&!carteState.loading)await loadCarte();
  else renderCarte();
  setTimeout(carteResetView,0);
}

async function loadCarte(){
  if(!session||carteState.loading)return;
  mountCarteSection();
  carteState.loading=true;
  carteState.error='';
  const msg=document.getElementById('carteMsg');
  if(msg){msg.style.display='block';msg.textContent='Chargement de la carte...';}

  try{
    const results=await Promise.allSettled([
      sbGet('mk_map_pins','?select=*&order=created_at.desc'),
      sbGet('mk_map_zones','?select=*&order=created_at.desc'),
      sbGet('mk_map_pin_reports','?select=*'),
      sbGet('mk_map_zone_reports','?select=*'),
      sbGet('mk_rens_rapports','?select=id,fiche_id,source,fiabilite,contenu,created_at&order=created_at.desc&limit=200'),
      sbGet('mk_rens_fiches','?select=id,type,nom&order=nom.asc'),
      sbGet('mk_patrouilles','?select=id,title,location,objective,started_at,planned_duration_minutes,status&status=eq.active&order=started_at.desc'),
    ]);
    const value=(index,fallback=[])=>results[index].status==='fulfilled'&&Array.isArray(results[index].value)?results[index].value:fallback;
    if(results[0].status==='rejected'||results[1].status==='rejected'){
      throw results[0].reason||results[1].reason;
    }
    carteState.pins=value(0).map(row=>({...row,status:row.status||'À vérifier',color:row.color||CARTE_RISK_COLORS[row.risk_level]||CARTE_RISK_COLORS.Modéré}));
    carteState.zones=value(1).map(row=>({...row,status:row.status||'À vérifier',color:row.color||CARTE_RISK_COLORS[row.risk_level]||CARTE_RISK_COLORS.Modéré,points:Array.isArray(row.points)?row.points:[]}));
    carteState.pinLinks=value(2);
    carteState.zoneLinks=value(3);
    carteState.reports=value(4);
    carteState.fiches=value(5);
    carteState.patrouilles=value(6);
    carteState.loaded=true;
    renderCarte();
    if(msg){msg.style.display='none';msg.textContent='';}
  }catch(error){
    console.error(error);
    carteState.error='Carte non configurée côté Supabase. Applique le script supabase/sql/carte.sql.';
    renderCarte();
    if(msg){msg.style.display='block';msg.textContent=carteState.error;}
  }finally{
    carteState.loading=false;
  }
}

function renderCarte(){
  renderCarteStats();
  renderCarteZones();
  renderCartePins();
  renderCarteList();
  renderCarteDetail();
  applyCarteView();

  const shell=document.getElementById('carteShell');
  if(shell)shell.classList.toggle('sidebar-collapsed',carteState.sidebarCollapsed);
  const sidebarArrow=document.getElementById('carteSidebarArrow');
  if(sidebarArrow){
    sidebarArrow.textContent=carteState.sidebarCollapsed?'›':'‹';
    sidebarArrow.setAttribute('aria-label',carteState.sidebarCollapsed?'Afficher les filtres':'Masquer les filtres');
  }
  const overlay=document.getElementById('carteOverlayImg');
  if(overlay)overlay.classList.toggle('visible',carteState.overlayVisible);
  const overlayToggle=document.getElementById('carteOverlayToggle');
  if(overlayToggle){
    overlayToggle.classList.toggle('active',carteState.overlayVisible);
    overlayToggle.textContent=carteState.overlayVisible?'Carte annotée : visible':'Carte annotée : masquée';
  }
  const hint=document.getElementById('cartePlacementHint');
  if(hint){
    if(carteState.drawingZone)hint.textContent='Clique pour poser les points de la zone. Termine avec le bouton en bas.';
    else if(carteState.placing)hint.textContent='Clique sur la carte pour placer le ping.';
    else hint.textContent='';
  }
  const addWrap=document.getElementById('carte-add-wrap');
  if(addWrap)addWrap.style.display=canEditSection('carte')?'grid':'none';
}

function renderCarteStats(){
  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  const critical=[...carteState.pins,...carteState.zones].filter(row=>row.risk_level==='Critique'&&!['Résolu','Obsolète'].includes(row.status)).length;
  setText('cartePinCount',`Pings : ${carteState.pins.length}`);
  setText('carteZoneCount',`Zones : ${carteState.zones.length}`);
  setText('cartePatrouilleCount',`Patrouilles : ${carteState.patrouilles.length}`);
  setText('carteRiskCount',`Critiques : ${critical}`);
}

function zonePointsAttr(points){
  return (Array.isArray(points)?points:[])
    .filter(point=>Number.isFinite(Number(point.x))&&Number.isFinite(Number(point.y)))
    .map(point=>`${Number(point.x)*CARTE_MAP.width},${Number(point.y)*CARTE_MAP.height}`)
    .join(' ');
}

function renderCarteZones(){
  const svg=document.getElementById('carteZones');
  if(!svg)return;
  if(!carteState.layers.zones&&!carteState.draftZonePoints.length){
    svg.innerHTML='';
    return;
  }
  const zones=carteState.layers.zones
    ?carteFilteredRows('zone').filter(zone=>Array.isArray(zone.points)&&zone.points.length>=3)
    :[];
  const draft=carteState.draftZonePoints.length?`
    <polyline class="carte-zone-draft" points="${zonePointsAttr(carteState.draftZonePoints)}"></polyline>
    ${carteState.draftZonePoints.map((point,index)=>`<circle class="carte-zone-point" cx="${point.x*CARTE_MAP.width}" cy="${point.y*CARTE_MAP.height}" r="10"><title>Point ${index+1}</title></circle>`).join('')}
  `:'';
  svg.innerHTML=[
    ...zones.map(zone=>{
      const selected=zone.id===carteState.selectedZoneId;
      const color=carteColor(zone);
      return `<polygon class="carte-zone-shape ${selected?'selected':''}" data-zone-id="${carteEsc(zone.id)}" points="${zonePointsAttr(zone.points)}" style="--zone-color:${carteEsc(color)}">
        <title>${carteEsc(carteTitle(zone))}</title>
      </polygon>`;
    }),
    draft,
  ].join('');
  svg.querySelectorAll('.carte-zone-shape').forEach(shape=>{
    shape.addEventListener('click',event=>{
      event.stopPropagation();
      carteSelectZone(shape.dataset.zoneId);
    });
  });
}

function renderCartePins(){
  const wrap=document.getElementById('cartePins');
  if(!wrap)return;
  if(!carteState.layers.pins){
    wrap.innerHTML='';
    return;
  }
  const invScale=1/Math.max(0.1,carteState.view.scale);
  const savedPins=carteFilteredRows('pin').map(pin=>{
    const selected=pin.id===carteState.selectedPinId;
    const linked=carteState.layers.reports&&carteHasLinkedReport('pin',pin);
    const patrouille=carteState.layers.patrouilles&&carteLinkedPatrouille(pin);
    return `<button type="button" class="carte-pin ${selected?'selected':''}" data-pin-id="${carteEsc(pin.id)}" style="left:${Number(pin.x||0)*100}%;top:${Number(pin.y||0)*100}%;--pin-scale:${invScale};--pin-color:${carteEsc(carteColor(pin))};" title="${carteEsc(carteTitle(pin))}">
      <span><b>${patrouille?'P':linked?'◆':'•'}</b></span>
    </button>`;
  });
  const draft=carteState.draftCoords&&!carteState.selectedPinId
    ?[`<div class="carte-pin carte-pin-draft" style="left:${carteState.draftCoords.x*100}%;top:${carteState.draftCoords.y*100}%;--pin-scale:${invScale};--pin-color:${CARTE_RISK_COLORS.Modéré};" title="Position du nouveau ping"><span><b>+</b></span></div>`]
    :[];
  wrap.innerHTML=[...savedPins,...draft].join('');
  wrap.querySelectorAll('.carte-pin[data-pin-id]').forEach(btn=>{
    btn.addEventListener('click',event=>{
      event.stopPropagation();
      carteSelectPin(btn.dataset.pinId);
    });
  });
}

function renderCarteList(){
  const list=document.getElementById('cartePinList');
  if(!list)return;
  const rows=[
    ...carteFilteredRows('pin').map(row=>({kind:'pin',row})),
    ...carteFilteredRows('zone').map(row=>({kind:'zone',row})),
  ].sort((a,b)=>String(b.row.created_at||'').localeCompare(String(a.row.created_at||'')));
  list.innerHTML=rows.map(({kind,row})=>{
    const selected=(kind==='pin'&&row.id===carteState.selectedPinId)||(kind==='zone'&&row.id===carteState.selectedZoneId);
    const patrouille=carteLinkedPatrouille(row);
    return `<button type="button" class="carte-pin-row ${selected?'active':''}" onclick="${kind==='pin'?`carteSelectPin('${escJs(row.id)}')`:`carteSelectZone('${escJs(row.id)}')`}">
      <strong><span class="carte-list-dot" style="background:${carteEsc(carteColor(row))}"></span>${kind==='pin'?'Ping':'Zone'} — ${carteEsc(carteTitle(row))}</strong>
      <span>${carteEsc(row.type||'Risque')} · ${carteEsc(row.risk_level||'Faible')} · ${carteEsc(row.status||'À vérifier')}${patrouille?` · ${carteEsc(cartePatrouilleLabel(patrouille))}`:''}</span>
    </button>`;
  }).join('')||'<p class="sa-empty">Aucun élément ne correspond aux filtres.</p>';
}

function carteCommonForm(kind,row,reportIds){
  const color=carteColor(row||{risk_level:'Modéré'});
  const patrouilleId=row?.patrouille_id||'';
  return `
    <div class="form-grid carte-editor-grid">
      <label class="form-field">
        <span>Titre</span>
        <input id="carteTitle" value="${carteEsc(row?.title||'')}" placeholder="${kind==='pin'?'Ex : Camp suspect':'Ex : Zone de patrouille'}">
      </label>
      <label class="form-field">
        <span>Type</span>
        <select id="carteType">
          ${CARTE_TYPES.map(type=>`<option value="${carteEsc(type)}" ${(row?.type||'Risque')===type?'selected':''}>${carteEsc(type)}</option>`).join('')}
        </select>
      </label>
      <label class="form-field">
        <span>Niveau</span>
        <select id="carteRisk" onchange="carteApplyRiskColor()">
          ${CARTE_RISKS.map(risk=>`<option value="${carteEsc(risk)}" ${(row?.risk_level||'Modéré')===risk?'selected':''}>${carteEsc(risk)}</option>`).join('')}
        </select>
      </label>
      <label class="form-field">
        <span>Statut</span>
        <select id="carteStatus">
          ${CARTE_STATUS.map(status=>`<option value="${carteEsc(status)}" ${(row?.status||'À vérifier')===status?'selected':''}>${carteEsc(status)}</option>`).join('')}
        </select>
      </label>
      <label class="form-field">
        <span>Couleur</span>
        <input id="carteColor" type="color" value="${carteEsc(color)}">
      </label>
      <label class="form-field">
        <span>Patrouille active</span>
        <select id="cartePatrouille">
          <option value="">Aucune</option>
          ${carteState.patrouilles.map(p=>`<option value="${carteEsc(p.id)}" ${patrouilleId===p.id?'selected':''}>${carteEsc(cartePatrouilleLabel(p))}</option>`).join('')}
        </select>
      </label>
      <label class="form-field carte-report-field">
        <span>Rapports liés</span>
        <div id="carteSelectedReports" class="carte-report-selected" data-selected-reports="${carteEsc([...reportIds].join(','))}">
          ${[...reportIds].map(carteReportChipHtml).join('')||'<em>Aucun rapport lié.</em>'}
        </div>
        <button type="button" class="btn-sm carte-report-add" onclick="carteToggleReportPicker()">+ Ajouter rapport</button>
        <div id="carteReportPicker" class="carte-report-picker" hidden>
          <select id="carteReportType" onchange="carteRenderReportPicker()">
            ${['all','lieux','individus','groupes','autres'].map(type=>`<option value="${type}">${carteEsc(carteReportTypeLabel(type))}</option>`).join('')}
          </select>
          <div id="carteReportList" class="carte-report-list">
            ${carteReportPickerListHtml()}
          </div>
        </div>
      </label>
      <label class="form-field carte-description-field">
        <span>Informations</span>
        <textarea id="carteDescription" rows="6" placeholder="Détails, hypothèses, consignes de prudence...">${carteEsc(row?.description||'')}</textarea>
      </label>
    </div>`;
}

function renderCarteDetail(){
  const editor=document.getElementById('carteEditor');
  if(!editor)return;
  const canEdit=canEditSection('carte');
  const pin=carteSelectedPin();
  const zone=carteSelectedZone();

  if(carteState.drawingZone){
    editor.innerHTML=`
      <div class="carte-editor-head">
        <h3>Nouvelle zone</h3>
        <span>${carteState.draftZonePoints.length} point(s)</span>
      </div>
      <p class="carte-help">Clique sur la carte pour tracer le contour. Trois points minimum sont nécessaires.</p>
      <div class="carte-editor-actions">
        <button type="button" class="btn-del" onclick="carteCancelZoneDrawing()">Annuler</button>
        <button type="button" class="btn-submit" onclick="carteFinishZoneDrawing()" ${carteState.draftZonePoints.length<3?'disabled':''}>Terminer la zone</button>
      </div>`;
    return;
  }

  if(canEdit&&(pin||carteState.draftCoords)){
    const reportIds=new Set(pin?carteLinkedReportIds('pin',pin.id):[]);
    const x=pin?.x??carteState.draftCoords?.x??0.5;
    const y=pin?.y??carteState.draftCoords?.y??0.5;
    editor.innerHTML=`
      <div class="carte-editor-head">
        <h3>${pin?'Modifier le ping':'Nouveau ping'}</h3>
        <span>Position : ${Math.round(Number(x)*1000)/10}% / ${Math.round(Number(y)*1000)/10}%${pin?` · Créé par ${carteEsc(carteAuthorLabel(pin))}`:''}</span>
      </div>
      ${carteCommonForm('pin',pin,reportIds)}
      <div class="carte-editor-actions">
        <button type="button" class="btn-action btn-gold" onclick="carteStartPlacement()">${pin?'Déplacer sur la carte':'Choisir sur la carte'}</button>
        ${pin?'<button type="button" class="btn-del" onclick="carteDeleteSelectedPin()">Supprimer</button>':''}
        <button type="button" class="btn-submit" onclick="carteSavePin()">Enregistrer</button>
      </div>`;
    return;
  }

  if(canEdit&&(zone||carteState.draftZonePoints.length>=3)){
    const reportIds=new Set(zone?carteLinkedReportIds('zone',zone.id):[]);
    editor.innerHTML=`
      <div class="carte-editor-head">
        <h3>${zone?'Modifier la zone':'Nouvelle zone'}</h3>
        <span>${(zone?.points||carteState.draftZonePoints).length} point(s)${zone?` · Créé par ${carteEsc(carteAuthorLabel(zone))}`:''}</span>
      </div>
      ${carteCommonForm('zone',zone,reportIds)}
      <div class="carte-editor-actions">
        ${zone?'<button type="button" class="btn-action btn-gold" onclick="carteStartZoneDrawing(true)">Redessiner</button>':''}
        ${zone?'<button type="button" class="btn-del" onclick="carteDeleteSelectedZone()">Supprimer</button>':''}
        <button type="button" class="btn-submit" onclick="carteSaveZone()">Enregistrer</button>
      </div>`;
    return;
  }

  const selected=pin?{kind:'pin',row:pin}:zone?{kind:'zone',row:zone}:null;
  editor.innerHTML=selected?renderCarteReadOnly(selected.kind,selected.row):`
    <div class="carte-empty-detail">
      <h3>Aucun élément sélectionné</h3>
      <p>Sélectionne un ping ou une zone pour voir ses informations. Les éditeurs peuvent créer un ping ou dessiner une zone depuis le panneau de gauche.</p>
    </div>`;
}

function renderCarteReadOnly(kind,row){
  const linkedReports=carteLinkedReportIds(kind,row.id)
    .map(id=>carteState.reports.find(report=>report.id===id))
    .filter(Boolean);
  const patrouille=carteLinkedPatrouille(row);
  return `
    <div class="carte-readonly">
      <div class="carte-editor-head">
        <h3><span class="carte-list-dot" style="background:${carteEsc(carteColor(row))}"></span>${carteEsc(carteTitle(row))}</h3>
        <span>${kind==='pin'?'Ping':'Zone'} · ${carteEsc(row.type||'Risque')} · ${carteEsc(row.risk_level||'Faible')} · ${carteEsc(row.status||'À vérifier')} · Créé par ${carteEsc(carteAuthorLabel(row))}</span>
      </div>
      <p>${carteEsc(row.description||'Aucune information renseignée.')}</p>
      ${patrouille?`<div class="carte-linked-reports"><strong>Patrouille liée</strong><span>${carteEsc(cartePatrouilleLabel(patrouille))}</span></div>`:''}
      <div class="carte-linked-reports">
        <strong>Rapports liés</strong>
        ${linkedReports.length?linkedReports.map(report=>`<span>${carteEsc(carteReportLabel(report))}</span>`).join(''):'<span>Aucun rapport lié.</span>'}
      </div>
    </div>`;
}

function carteSetFilter(key,value){
  carteState.filters[key]=value;
  renderCarte();
}

function carteSetLayer(key,value){
  carteState.layers[key]=!!value;
  renderCarte();
}

function carteApplyRiskColor(){
  const risk=document.getElementById('carteRisk')?.value;
  const color=document.getElementById('carteColor');
  if(color&&CARTE_RISK_COLORS[risk])color.value=CARTE_RISK_COLORS[risk];
}

function carteToggleSidebar(){
  carteState.sidebarCollapsed=!carteState.sidebarCollapsed;
  renderCarte();
  setTimeout(carteResetView,0);
}

function carteToggleCreatePanel(){
  if(!canEditSection('carte'))return;
  carteSelectNothing();
  carteState.draftCoords={x:0.5,y:0.5};
  carteState.draftZonePoints=[];
  carteState.placing=true;
  carteState.drawingZone=false;
  renderCarte();
}

function carteStartPlacement(){
  if(!canEditSection('carte'))return;
  if(!carteState.draftCoords){
    const pin=carteSelectedPin();
    carteState.draftCoords=pin?{x:Number(pin.x)||0.5,y:Number(pin.y)||0.5}:{x:0.5,y:0.5};
  }
  carteState.placing=true;
  carteState.drawingZone=false;
  renderCarte();
}

function carteStartZoneDrawing(redraw=false){
  if(!canEditSection('carte'))return;
  const zone=carteSelectedZone();
  carteState.selectedType=redraw&&zone?'zone':null;
  carteState.draftCoords=null;
  carteState.placing=false;
  carteState.drawingZone=true;
  carteState.draftZonePoints=redraw&&zone?[]:[];
  renderCarte();
}

function carteCancelZoneDrawing(){
  carteState.drawingZone=false;
  carteState.draftZonePoints=[];
  renderCarte();
}

function carteFinishZoneDrawing(){
  if(carteState.draftZonePoints.length<3)return;
  carteState.drawingZone=false;
  carteState.selectedType='zone';
  carteState.selectedZoneId=null;
  carteState.selectedPinId=null;
  renderCarte();
}

function carteFormPayload(){
  const risk=document.getElementById('carteRisk')?.value||'Modéré';
  const color=document.getElementById('carteColor')?.value||CARTE_RISK_COLORS[risk]||CARTE_RISK_COLORS.Modéré;
  const patrouilleId=document.getElementById('cartePatrouille')?.value||null;
  return {
    title:document.getElementById('carteTitle')?.value.trim()||'Sans titre',
    type:document.getElementById('carteType')?.value||'Risque',
    risk_level:risk,
    status:document.getElementById('carteStatus')?.value||'À vérifier',
    color,
    patrouille_id:patrouilleId,
    description:document.getElementById('carteDescription')?.value.trim()||'',
    updated_at:new Date().toISOString(),
  };
}

function carteReportSelectionHost(){
  return document.getElementById('carteSelectedReports');
}

function carteSelectedReportIds(){
  const host=carteReportSelectionHost();
  if(!host)return [];
  return String(host.dataset.selectedReports||'').split(',').filter(Boolean);
}

function carteSetSelectedReportIds(ids){
  const host=carteReportSelectionHost();
  if(!host)return;
  const unique=[...new Set((ids||[]).filter(Boolean))];
  host.dataset.selectedReports=unique.join(',');
  host.innerHTML=unique.map(carteReportChipHtml).join('')||'<em>Aucun rapport lié.</em>';
  carteRenderReportPicker();
}

function carteToggleReportPicker(){
  const picker=document.getElementById('carteReportPicker');
  if(!picker)return;
  picker.hidden=!picker.hidden;
  if(!picker.hidden)carteRenderReportPicker();
}

function carteRenderReportPicker(){
  const list=document.getElementById('carteReportList');
  if(!list)return;
  const type=document.getElementById('carteReportType')?.value||'all';
  list.innerHTML=carteReportPickerListHtml(type);
}

async function cartePersistSelectedReportLinks(){
  const pin=carteSelectedPin();
  const zone=carteSelectedZone();
  if(!pin&&!zone)return;
  const kind=pin?'pin':'zone';
  const id=pin?.id||zone?.id;
  const reportIds=carteSelectedReportIds();
  try{
    await carteSaveLinks(kind,id,reportIds);
    if(kind==='pin')carteState.pinLinks=[
      ...carteState.pinLinks.filter(row=>row.pin_id!==id),
      ...reportIds.map(reportId=>({pin_id:id,report_id:reportId})),
    ];
    else carteState.zoneLinks=[
      ...carteState.zoneLinks.filter(row=>row.zone_id!==id),
      ...reportIds.map(reportId=>({zone_id:id,report_id:reportId})),
    ];
    toast('Rapports liés mis à jour.');
  }catch(error){
    console.error(error);
    toast('Impossible de sauvegarder les rapports liés.');
  }
}

async function carteAddReportToSelection(reportId){
  carteSetSelectedReportIds([...carteSelectedReportIds(),reportId]);
  await cartePersistSelectedReportLinks();
}

async function carteRemoveReportFromSelection(reportId){
  carteSetSelectedReportIds(carteSelectedReportIds().filter(id=>id!==reportId));
  await cartePersistSelectedReportLinks();
}

async function carteSaveLinks(kind,id,reportIds){
  const table=kind==='zone'?'mk_map_zone_reports':'mk_map_pin_reports';
  const key=kind==='zone'?'zone_id':'pin_id';
  await sbDelete(table,`?${key}=eq.${encodeURIComponent(id)}`);
  if(reportIds.length)await sbPost(table,reportIds.map(reportId=>({[key]:id,report_id:reportId})));
}

async function carteCreateWithAuthor(table,payload){
  const author=carteCurrentAuthor();
  const basePayload={
    ...payload,
    created_by:session.user.id,
    created_by_name:author.name||session.displayName,
  };
  try{
    return await sbPost(table,{...basePayload,created_by_grade:author.grade||null});
  }catch(error){
    return sbPost(table,basePayload);
  }
}

async function carteSavePin(){
  if(!canEditSection('carte'))return;
  const pin=carteSelectedPin();
  const coords=carteState.draftCoords||{x:Number(pin?.x)||0.5,y:Number(pin?.y)||0.5};
  const msg=document.getElementById('carteMsg');

  try{
    if(msg){msg.style.display='block';msg.textContent='Enregistrement du ping...';}
    const payload={...carteFormPayload(),x:coords.x,y:coords.y};
    let pinId=pin?.id;
    if(pinId)await sbPatch('mk_map_pins',`?id=eq.${encodeURIComponent(pinId)}`,payload);
    else{
      const inserted=await carteCreateWithAuthor('mk_map_pins',payload);
      pinId=(Array.isArray(inserted)?inserted[0]:inserted)?.id;
    }
    if(!pinId)throw new Error('Ping créé sans identifiant retourné.');
    await carteSaveLinks('pin',pinId,carteSelectedReportIds());
    carteState.selectedType='pin';
    carteState.selectedPinId=pinId;
    carteState.draftCoords=null;
    carteState.placing=false;
    carteState.loaded=false;
    await loadCarte();
    toast('Ping enregistré.');
  }catch(error){
    console.error(error);
    if(msg){msg.style.display='block';msg.textContent='Impossible d’enregistrer le ping.';}
    toast('Erreur lors de l’enregistrement du ping.');
  }
}

async function carteSaveZone(){
  if(!canEditSection('carte'))return;
  const zone=carteSelectedZone();
  const points=carteState.draftZonePoints.length>=3?carteState.draftZonePoints:zone?.points;
  if(!Array.isArray(points)||points.length<3){toast('Une zone doit contenir au moins trois points.');return;}
  const msg=document.getElementById('carteMsg');

  try{
    if(msg){msg.style.display='block';msg.textContent='Enregistrement de la zone...';}
    const payload={...carteFormPayload(),points};
    let zoneId=zone?.id;
    if(zoneId)await sbPatch('mk_map_zones',`?id=eq.${encodeURIComponent(zoneId)}`,payload);
    else{
      const inserted=await carteCreateWithAuthor('mk_map_zones',payload);
      zoneId=(Array.isArray(inserted)?inserted[0]:inserted)?.id;
    }
    if(!zoneId)throw new Error('Zone créée sans identifiant retourné.');
    await carteSaveLinks('zone',zoneId,carteSelectedReportIds());
    carteState.selectedType='zone';
    carteState.selectedZoneId=zoneId;
    carteState.draftZonePoints=[];
    carteState.drawingZone=false;
    carteState.loaded=false;
    await loadCarte();
    toast('Zone enregistrée.');
  }catch(error){
    console.error(error);
    if(msg){msg.style.display='block';msg.textContent='Impossible d’enregistrer la zone.';}
    toast('Erreur lors de l’enregistrement de la zone.');
  }
}

async function carteDeleteSelectedPin(){
  if(!canEditSection('carte'))return;
  const pin=carteSelectedPin();
  if(!pin)return;
  if(!confirm(`Supprimer le ping "${carteTitle(pin)}" ?`))return;
  try{
    await sbDelete('mk_map_pins',`?id=eq.${encodeURIComponent(pin.id)}`);
    carteSelectNothing();
    carteState.draftCoords=null;
    carteState.placing=false;
    carteState.loaded=false;
    await loadCarte();
    toast('Ping supprimé.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la suppression du ping.');
  }
}

async function carteDeleteSelectedZone(){
  if(!canEditSection('carte'))return;
  const zone=carteSelectedZone();
  if(!zone)return;
  if(!confirm(`Supprimer la zone "${carteTitle(zone)}" ?`))return;
  try{
    await sbDelete('mk_map_zones',`?id=eq.${encodeURIComponent(zone.id)}`);
    carteSelectNothing();
    carteState.draftZonePoints=[];
    carteState.loaded=false;
    await loadCarte();
    toast('Zone supprimée.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la suppression de la zone.');
  }
}

function carteSelectPin(pinId){
  const pin=carteState.pins.find(row=>row.id===pinId);
  if(!pin)return;
  carteState.selectedType='pin';
  carteState.selectedPinId=pinId;
  carteState.selectedZoneId=null;
  carteState.draftCoords={x:Number(pin.x)||0.5,y:Number(pin.y)||0.5};
  carteState.draftZonePoints=[];
  carteState.placing=false;
  carteState.drawingZone=false;
  renderCarte();
}

function carteSelectZone(zoneId){
  const zone=carteState.zones.find(row=>row.id===zoneId);
  if(!zone)return;
  carteState.selectedType='zone';
  carteState.selectedZoneId=zoneId;
  carteState.selectedPinId=null;
  carteState.draftCoords=null;
  carteState.draftZonePoints=[];
  carteState.placing=false;
  carteState.drawingZone=false;
  renderCarte();
}

function carteToggleOverlay(){
  carteState.overlayVisible=!carteState.overlayVisible;
  renderCarte();
}

function carteZoomIn(){carteZoom(1.18);}
function carteZoomOut(){carteZoom(1/1.18);}

function carteZoom(factor,clientX=null,clientY=null){
  const stage=document.getElementById('carteStage');
  if(!stage)return;
  const rect=stage.getBoundingClientRect();
  const cx=clientX??rect.left+rect.width/2;
  const cy=clientY??rect.top+rect.height/2;
  const before={
    x:(cx-rect.left-carteState.view.x)/carteState.view.scale,
    y:(cy-rect.top-carteState.view.y)/carteState.view.scale,
  };
  const nextScale=Math.min(4,Math.max(0.15,carteState.view.scale*factor));
  carteState.view.scale=nextScale;
  carteState.view.x=cx-rect.left-before.x*nextScale;
  carteState.view.y=cy-rect.top-before.y*nextScale;
  applyCarteView();
  renderCartePins();
  renderCarteZones();
}

function carteResetView(){
  const stage=document.getElementById('carteStage');
  if(!stage)return;
  const rect=stage.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const scale=Math.min(rect.width/CARTE_MAP.width,rect.height/CARTE_MAP.height)*0.98;
  carteState.view.scale=scale;
  carteState.view.x=(rect.width-CARTE_MAP.width*scale)/2;
  carteState.view.y=(rect.height-CARTE_MAP.height*scale)/2;
  applyCarteView();
  renderCartePins();
  renderCarteZones();
}

function applyCarteView(){
  const world=document.getElementById('carteWorld');
  if(!world)return;
  world.style.width=`${CARTE_MAP.width}px`;
  world.style.height=`${CARTE_MAP.height}px`;
  world.style.transform=`translate(${carteState.view.x}px,${carteState.view.y}px) scale(${carteState.view.scale})`;
}

function carteEventToPoint(event){
  const stage=document.getElementById('carteStage');
  if(!stage)return null;
  const rect=stage.getBoundingClientRect();
  const x=(event.clientX-rect.left-carteState.view.x)/carteState.view.scale/CARTE_MAP.width;
  const y=(event.clientY-rect.top-carteState.view.y)/carteState.view.scale/CARTE_MAP.height;
  if(x<0||x>1||y<0||y>1)return null;
  return {x,y};
}

function bindCarteMap(){
  const stage=document.getElementById('carteStage');
  if(!stage||stage.dataset.bound==='true')return;
  stage.dataset.bound='true';

  stage.addEventListener('wheel',event=>{
    event.preventDefault();
    carteZoom(event.deltaY<0?1.12:1/1.12,event.clientX,event.clientY);
  },{passive:false});

  stage.addEventListener('pointerdown',event=>{
    if(event.target.closest('.carte-pin,.carte-zone-shape,.carte-map-controls'))return;
    stage.setPointerCapture(event.pointerId);
    carteState.drag={
      id:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      viewX:carteState.view.x,
      viewY:carteState.view.y,
      moved:false,
    };
  });

  stage.addEventListener('pointermove',event=>{
    const drag=carteState.drag;
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.startX;
    const dy=event.clientY-drag.startY;
    if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
    if(carteState.drawingZone||carteState.placing)return;
    carteState.view.x=drag.viewX+dx;
    carteState.view.y=drag.viewY+dy;
    applyCarteView();
  });

  stage.addEventListener('pointerup',event=>{
    const drag=carteState.drag;
    if(!drag||drag.id!==event.pointerId)return;
    stage.releasePointerCapture(event.pointerId);
    carteState.drag=null;
    if(drag.moved)return;
    if(carteState.placing)placeCarteDraft(event);
    else if(carteState.drawingZone)addCarteZonePoint(event);
  });
}

function placeCarteDraft(event){
  const point=carteEventToPoint(event);
  if(!point)return;
  carteState.draftCoords=point;
  carteState.placing=false;
  renderCarte();
}

function addCarteZonePoint(event){
  const point=carteEventToPoint(event);
  if(!point)return;
  carteState.draftZonePoints.push(point);
  renderCarte();
}

mountCarteSection();
