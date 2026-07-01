// ══════════════════════════════════════════════════════════════════════
//  AGENDA
// ══════════════════════════════════════════════════════════════════════
const agendaState={
  loaded:false,
  loading:false,
  events:[],
  view:'week',
  cursor:new Date(),
  selectedId:null,
  editing:false,
};

const AGENDA_TYPES=['Événement','Cours','Intervention','Patrouille','Réunion','Entraînement'];
const AGENDA_STATUS=['Prévu','Confirmé','Annulé','Terminé'];

function agendaEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function agendaPad(value){
  return String(value).padStart(2,'0');
}

function agendaStartOfDay(date){
  return new Date(date.getFullYear(),date.getMonth(),date.getDate());
}

function agendaAddDays(date,days){
  const next=new Date(date);
  next.setDate(next.getDate()+days);
  return next;
}

function agendaStartOfWeek(date){
  const d=agendaStartOfDay(date);
  const day=(d.getDay()+6)%7;
  return agendaAddDays(d,-day);
}

function agendaStartOfMonth(date){
  return new Date(date.getFullYear(),date.getMonth(),1);
}

function agendaDateLabel(date,options={weekday:'short',day:'2-digit',month:'short'}){
  return date.toLocaleDateString('fr-FR',options);
}

function agendaTimeLabel(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

function agendaFullDate(value){
  if(!value)return '—';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '—';
  return d.toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'short'});
}

function agendaInputValue(value){
  const d=value?new Date(value):new Date();
  if(Number.isNaN(d.getTime()))return '';
  return `${d.getFullYear()}-${agendaPad(d.getMonth()+1)}-${agendaPad(d.getDate())}T${agendaPad(d.getHours())}:${agendaPad(d.getMinutes())}`;
}

function agendaIsoFromInput(id){
  const value=document.getElementById(id)?.value;
  if(!value)return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}

function agendaRange(){
  const base=agendaStartOfDay(agendaState.cursor);
  if(agendaState.view==='day'){
    return {start:base,end:agendaAddDays(base,1),days:[base]};
  }
  if(agendaState.view==='month'){
    const monthStart=agendaStartOfMonth(base);
    const monthEnd=new Date(base.getFullYear(),base.getMonth()+1,1);
    const gridStart=agendaStartOfWeek(monthStart);
    const gridEnd=agendaAddDays(agendaStartOfWeek(agendaAddDays(monthEnd,6)),7);
    const days=[];
    for(let d=new Date(gridStart);d<gridEnd;d=agendaAddDays(d,1))days.push(new Date(d));
    return {start:monthStart,end:monthEnd,gridStart,gridEnd,days};
  }
  const start=agendaStartOfWeek(base);
  const days=Array.from({length:7},(_,index)=>agendaAddDays(start,index));
  return {start,end:agendaAddDays(start,7),days};
}

function agendaRangeTitle(){
  const range=agendaRange();
  if(agendaState.view==='day')return agendaDateLabel(range.start,{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  if(agendaState.view==='month')return range.start.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  return `${agendaDateLabel(range.start,{day:'2-digit',month:'short'})} — ${agendaDateLabel(agendaAddDays(range.end,-1),{day:'2-digit',month:'short',year:'numeric'})}`;
}

function agendaEventOverlapsDay(event,day){
  const start=new Date(event.starts_at);
  const end=new Date(event.ends_at||event.starts_at);
  const dayStart=agendaStartOfDay(day);
  const dayEnd=agendaAddDays(dayStart,1);
  return start<dayEnd && end>=dayStart;
}

function agendaSelectedEvent(){
  return agendaState.events.find(event=>event.id===agendaState.selectedId)||null;
}

function agendaOrganizer(){
  const name=[session?.garde?.prenom,session?.garde?.nom].filter(Boolean).join(' ')||session?.displayName||session?.username||'Organisateur inconnu';
  const grade=session?.garde?.grade||session?.grade||'';
  return {name,grade};
}

function agendaEventOrganizer(event){
  const name=event?.organizer_name||'Organisateur inconnu';
  const grade=event?.organizer_grade||'';
  return grade&&grade!=='—'?`${name} (${grade})`:name;
}

function agendaDiscordDate(value){
  if(!value)return '—';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '—';
  return d.toLocaleString('fr-FR',{weekday:'long',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
}

async function notifyDiscordAgenda(event){
  const url=window.GrimoireConfig?.discordAgendaWebhook;
  if(!url||url==='DISCORD_WEBHOOK_URL')return;

  const organizer=agendaEventOrganizer(event);
  const lines=[
    '<:aube:1516926588359540856> **Nouvel événement ajouté à l’agenda**',
    '-# *Un nouveau rendez-vous vient d’être inscrit au programme de la Garde.*',
    `> **Titre :** ${event.title||'Sans titre'}`,
    `> **Type :** ${event.type||'Événement'} · **Statut :** ${event.status||'Prévu'}`,
    `> **Début :** ${agendaDiscordDate(event.starts_at)}`,
    `> **Fin :** ${agendaDiscordDate(event.ends_at)}`,
    `> **Lieu :** ${event.location||'Non renseigné'}`,
    `> **Organisateur :** ${organizer}`,
  ];
  if(event.description)lines.push(`\n${event.description.slice(0,450)}${event.description.length>450?'...':''}`);
  lines.push('\nConsultez l’agenda du grimoire pour les détails et les changements éventuels.');

  try{
    await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:lines.join('\n')}),
    });
  }catch(error){
    console.warn('[Discord] Notification agenda non envoyée.', error);
  }
}

async function loadAgenda(){
  if(!session)return;
  const msg=document.getElementById('agendaMsg');
  agendaState.loading=true;
  if(msg)msg.textContent='Chargement de l’agenda...';

  try{
    const { data, error } = await window.GrimoireSupabase
      .from('mk_agenda_events')
      .select('id,title,description,location,type,status,starts_at,ends_at,organizer_user_id,organizer_name,organizer_grade,created_at,updated_at')
      .order('starts_at',{ascending:true})
      .limit(1000);
    if(error)throw error;
    agendaState.events=data||[];
    agendaState.loaded=true;
    renderAgenda();
    if(msg)msg.textContent='';
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger l’agenda. Applique le script supabase/sql/agenda.sql.';
    toast('Erreur de chargement de l’agenda.');
  }finally{
    agendaState.loading=false;
  }
}

function renderAgenda(){
  renderAgendaToolbar();
  renderAgendaStats();
  renderAgendaCalendar();
  renderAgendaDetail();
}

function agendaFilteredEvents(){
  const query=(document.getElementById('agendaSearch')?.value||'').trim().toLowerCase();
  const range=agendaRange();
  const start=agendaState.view==='month'?range.gridStart||range.start:range.start;
  const end=agendaState.view==='month'?range.gridEnd||range.end:range.end;
  return agendaState.events.filter(event=>{
    const eventStart=new Date(event.starts_at);
    const eventEnd=new Date(event.ends_at||event.starts_at);
    const inRange=eventStart<end&&eventEnd>=start;
    const haystack=[event.title,event.description,event.location,event.type,event.status,event.organizer_name,event.organizer_grade].filter(Boolean).join(' ').toLowerCase();
    return inRange&&(!query||haystack.includes(query));
  });
}

function renderAgendaToolbar(){
  document.querySelectorAll('[data-agenda-view]').forEach(button=>{
    button.classList.toggle('active',button.getAttribute('data-agenda-view')===agendaState.view);
  });
  const createBtn=document.getElementById('agendaCreateBtn');
  if(createBtn)createBtn.style.display=canEditSection('agenda')?'inline-flex':'none';
}

function renderAgendaStats(){
  const range=agendaRange();
  const today=agendaStartOfDay(new Date());
  const events=agendaFilteredEvents();
  const todayCount=agendaState.events.filter(event=>agendaEventOverlapsDay(event,today)).length;
  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  setText('agendaRangeLabel',`Période : ${agendaRangeTitle()}`);
  setText('agendaEventCount',`Événements : ${events.length}`);
  setText('agendaTodayCount',`Aujourd'hui : ${todayCount}`);
  const weekdays=document.getElementById('agendaWeekdays');
  if(weekdays){
    const labels=agendaState.view==='day'
      ?[agendaDateLabel(range.start,{weekday:'long'})]
      :['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    weekdays.innerHTML=labels.map(label=>`<span>${agendaEsc(label)}</span>`).join('');
    weekdays.style.gridTemplateColumns=`repeat(${labels.length},minmax(0,1fr))`;
  }
}

function renderAgendaCalendar(){
  const calendar=document.getElementById('agendaCalendar');
  if(!calendar)return;
  const range=agendaRange();
  const todayKey=agendaStartOfDay(new Date()).toISOString().slice(0,10);
  const month=agendaState.cursor.getMonth();
  const events=agendaFilteredEvents();
  calendar.className=`agenda-calendar agenda-calendar-${agendaState.view}`;
  calendar.innerHTML=range.days.map(day=>{
    const dayKey=agendaStartOfDay(day).toISOString().slice(0,10);
    const dayEvents=events
      .filter(event=>agendaEventOverlapsDay(event,day))
      .sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
    const outside=agendaState.view==='month'&&day.getMonth()!==month;
    return `
      <div class="agenda-day ${outside?'outside':''} ${dayKey===todayKey?'today':''}">
        <div class="agenda-day-head">
          <strong>${agendaEsc(agendaDateLabel(day,agendaState.view==='month'?{day:'2-digit'}:{weekday:'short',day:'2-digit',month:'short'}))}</strong>
          <span>${dayEvents.length||''}</span>
        </div>
        <div class="agenda-events">
          ${dayEvents.map(agendaEventChip).join('')||'<p class="agenda-empty">Aucun événement.</p>'}
        </div>
      </div>`;
  }).join('');
}

function agendaEventChip(event){
  const selected=event.id===agendaState.selectedId?' selected':'';
  const statusClass=String(event.status||'Prévu').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-');
  return `<button type="button" class="agenda-event agenda-status-${statusClass}${selected}" onclick="selectAgendaEvent('${escJs(event.id)}')">
    <span>${agendaEsc(agendaTimeLabel(event.starts_at))}</span>
    <strong>${agendaEsc(event.title||'Sans titre')}</strong>
    <em>${agendaEsc(event.location||agendaEventOrganizer(event))}</em>
  </button>`;
}

function renderAgendaDetail(){
  const detail=document.getElementById('agendaDetail');
  if(!detail)return;
  const event=agendaSelectedEvent();
  if(agendaState.editing){
    detail.innerHTML=renderAgendaForm(event);
    return;
  }
  if(!event){
    detail.innerHTML='<div class="profile-title">Événement sélectionné</div><p class="sa-muted">Sélectionne un événement dans le calendrier.</p>';
    return;
  }
  detail.innerHTML=`
    <div class="profile-title">Événement sélectionné</div>
    <div class="agenda-detail-status">${agendaEsc(event.type||'Événement')} · ${agendaEsc(event.status||'Prévu')}</div>
    <h3>${agendaEsc(event.title||'Sans titre')}</h3>
    <dl class="profile-details agenda-details">
      <dt>Début</dt><dd>${agendaEsc(agendaFullDate(event.starts_at))}</dd>
      <dt>Fin</dt><dd>${agendaEsc(agendaFullDate(event.ends_at))}</dd>
      <dt>Lieu</dt><dd>${agendaEsc(event.location||'—')}</dd>
      <dt>Organisateur</dt><dd>${agendaEsc(agendaEventOrganizer(event))}</dd>
    </dl>
    <div class="agenda-description">${agendaEsc(event.description||'Aucun descriptif renseigné.')}</div>
    ${canEditSection('agenda')?`<div class="agenda-actions">
      <button type="button" class="btn-submit" onclick="editAgendaEvent()">Modifier</button>
      <button type="button" class="btn-del" onclick="deleteAgendaEvent()">Supprimer</button>
    </div>`:''}`;
}

function renderAgendaForm(event){
  const now=new Date();
  now.setMinutes(0,0,0);
  const defaultStart=agendaAddDays(now,now.getHours()>=23?1:0);
  if(now.getHours()<23)defaultStart.setHours(now.getHours()+1);
  const defaultEnd=new Date(defaultStart.getTime()+2*60*60*1000);
  return `
    <div class="profile-title">${event?'Modifier l’événement':'Nouvel événement'}</div>
    <div class="form-grid agenda-form-grid">
      <label class="form-field agenda-title-field">
        <span>Titre</span>
        <input id="agendaTitle" value="${agendaEsc(event?.title||'')}" placeholder="Cours vampires, intervention à Blancherive...">
      </label>
      <label class="form-field">
        <span>Type</span>
        <select id="agendaType">
          ${AGENDA_TYPES.map(type=>`<option value="${agendaEsc(type)}" ${(event?.type||'Événement')===type?'selected':''}>${agendaEsc(type)}</option>`).join('')}
        </select>
      </label>
      <label class="form-field">
        <span>Statut</span>
        <select id="agendaStatus">
          ${AGENDA_STATUS.map(status=>`<option value="${agendaEsc(status)}" ${(event?.status||'Prévu')===status?'selected':''}>${agendaEsc(status)}</option>`).join('')}
        </select>
      </label>
      <label class="form-field">
        <span>Début</span>
        <input id="agendaStartsAt" type="datetime-local" value="${agendaEsc(agendaInputValue(event?.starts_at||defaultStart))}">
      </label>
      <label class="form-field">
        <span>Fin</span>
        <input id="agendaEndsAt" type="datetime-local" value="${agendaEsc(agendaInputValue(event?.ends_at||defaultEnd))}">
      </label>
      <label class="form-field">
        <span>Lieu</span>
        <input id="agendaLocation" value="${agendaEsc(event?.location||'')}" placeholder="Fort Aube, Blancherive...">
      </label>
      <label class="form-field agenda-description-field">
        <span>Descriptif</span>
        <textarea id="agendaDescription" rows="8" placeholder="Objectif, déroulé, consignes, prérequis...">${agendaEsc(event?.description||'')}</textarea>
      </label>
    </div>
    <div class="agenda-actions">
      <button type="button" class="btn-del" onclick="cancelAgendaEdit()">Annuler</button>
      <button type="button" class="btn-submit" onclick="saveAgendaEvent()">Enregistrer</button>
    </div>`;
}

function setAgendaView(view){
  agendaState.view=view;
  renderAgenda();
}

function moveAgendaRange(direction){
  const current=new Date(agendaState.cursor);
  if(agendaState.view==='day')agendaState.cursor=agendaAddDays(current,direction);
  else if(agendaState.view==='week')agendaState.cursor=agendaAddDays(current,direction*7);
  else agendaState.cursor=new Date(current.getFullYear(),current.getMonth()+direction,1);
  renderAgenda();
}

function goAgendaToday(){
  agendaState.cursor=new Date();
  renderAgenda();
}

function filterAgenda(){
  renderAgendaStats();
  renderAgendaCalendar();
}

function selectAgendaEvent(id){
  agendaState.selectedId=id;
  agendaState.editing=false;
  renderAgendaCalendar();
  renderAgendaDetail();
}

function openAgendaCreate(){
  if(!canEditSection('agenda'))return;
  agendaState.selectedId=null;
  agendaState.editing=true;
  renderAgendaCalendar();
  renderAgendaDetail();
}

function editAgendaEvent(){
  if(!canEditSection('agenda')||!agendaSelectedEvent())return;
  agendaState.editing=true;
  renderAgendaDetail();
}

function cancelAgendaEdit(){
  agendaState.editing=false;
  renderAgendaDetail();
}

async function saveAgendaEvent(){
  if(!canEditSection('agenda'))return;
  const selected=agendaSelectedEvent();
  const title=(document.getElementById('agendaTitle')?.value||'').trim();
  const startsAt=agendaIsoFromInput('agendaStartsAt');
  const endsAt=agendaIsoFromInput('agendaEndsAt');
  if(!title){toast('Titre requis.');return;}
  if(!startsAt||!endsAt){toast('Dates invalides.');return;}
  if(new Date(endsAt)<new Date(startsAt)){toast('La fin doit être après le début.');return;}

  const organizer=agendaOrganizer();
  const payload={
    title,
    type:document.getElementById('agendaType')?.value||'Événement',
    status:document.getElementById('agendaStatus')?.value||'Prévu',
    starts_at:startsAt,
    ends_at:endsAt,
    location:(document.getElementById('agendaLocation')?.value||'').trim()||null,
    description:(document.getElementById('agendaDescription')?.value||'').trim()||null,
    updated_at:new Date().toISOString(),
  };
  if(!selected){
    payload.organizer_user_id=session.user.id;
    payload.organizer_name=organizer.name;
    payload.organizer_grade=organizer.grade||null;
  }

  try{
    let savedId=selected?.id;
    if(selected){
      const { error } = await window.GrimoireSupabase
        .from('mk_agenda_events')
        .update(payload)
        .eq('id',selected.id);
      if(error)throw error;
    }else{
      const { data, error } = await window.GrimoireSupabase
        .from('mk_agenda_events')
        .insert(payload)
        .select('id,title,description,location,type,status,starts_at,ends_at,organizer_name,organizer_grade')
        .single();
      if(error)throw error;
      savedId=data?.id||null;
      if(data)await notifyDiscordAgenda(data);
    }
    agendaState.selectedId=savedId;
    agendaState.cursor=new Date(startsAt);
    agendaState.editing=false;
    agendaState.loaded=false;
    await loadAgenda();
    toast('Événement enregistré.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de l’enregistrement de l’événement.');
  }
}

async function deleteAgendaEvent(){
  if(!canEditSection('agenda'))return;
  const event=agendaSelectedEvent();
  if(!event)return;
  if(!confirm(`Supprimer l’événement "${event.title}" ?`))return;
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_agenda_events')
      .delete()
      .eq('id',event.id);
    if(error)throw error;
    agendaState.selectedId=null;
    agendaState.editing=false;
    agendaState.loaded=false;
    await loadAgenda();
    toast('Événement supprimé.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de la suppression de l’événement.');
  }
}
