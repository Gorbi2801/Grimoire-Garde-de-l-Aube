// ══════════════════════════════════════════════════════════════════════
//  LOGS PRÉSENCES SUPERADMIN
// ══════════════════════════════════════════════════════════════════════
const presenceLogsState={
  loaded:false,
  loading:false,
  rows:[],
  summaries:[],
  gardes:[],
  profiles:[],
  absences:[],
  sortKey:null,
  sortDirection:null,
};

function presenceLogsEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function presenceLogsDate(value){
  if(typeof presenceDate==='function')return presenceDate(value);
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
}

function presenceLogsDuration(seconds){
  if(typeof presenceDuration==='function')return presenceDuration(seconds);
  const total=Math.max(0,Math.floor(Number(seconds)||0));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  return hours?`${hours} h ${String(minutes).padStart(2,'0')}`:`${minutes} min`;
}

function presenceLogsSeconds(startValue,endValue){
  if(typeof presenceSecondsBetween==='function')return presenceSecondsBetween(startValue,endValue);
  const start=new Date(startValue);
  const end=endValue?new Date(endValue):new Date();
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 0;
  return Math.max(0,Math.floor((end-start)/1000));
}

function presenceLogsGardeName(garde,summary,profile){
  const rp=[garde?.prenom, garde?.nom].filter(Boolean).join(' ');
  return rp||summary?.display_name||profile?.display_name||profile?.username||'Compte inconnu';
}

function presenceLogsGardeForUser(userId){
  return presenceLogsState.gardes.find(row=>row.user_id===userId)||null;
}

function presenceLogsProfileForUser(userId){
  return presenceLogsState.profiles.find(row=>row.user_id===userId)||null;
}

function presenceLogsSummaryForUser(userId){
  return presenceLogsState.summaries.find(row=>row.user_id===userId)||null;
}

function presenceLogsActiveAbsenceForUser(userId){
  if(!userId)return null;
  const now=new Date();
  return presenceLogsState.absences.find(row=>{
    if(row.user_id!==userId)return false;
    const start=new Date(row.starts_at);
    const end=new Date(row.ends_at);
    return !Number.isNaN(start.getTime())&&!Number.isNaN(end.getTime())&&start<=now&&end>=now;
  })||null;
}

function presenceLogsPeriodCutoff(period){
  const now=new Date();
  if(period==='today')return new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(period==='week')return new Date(now.getTime()-7*24*60*60*1000);
  if(period==='month')return new Date(now.getTime()-30*24*60*60*1000);
  return null;
}

function presenceLogsRowMatchesPeriod(row,period){
  const cutoff=presenceLogsPeriodCutoff(period);
  if(!cutoff)return true;
  const start=new Date(row.started_at);
  const end=row.ended_at?new Date(row.ended_at):new Date();
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return false;
  return end.getTime()>=cutoff.getTime();
}

// ── Semaine fixe lundi→dimanche (heure de Paris) — local à cet onglet ──
function presenceLogsParisParts(date){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Paris',hourCycle:'h23',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',
  }).formatToParts(date);
  const get=type=>Number(parts.find(part=>part.type===type)?.value);
  return {y:get('year'),m:get('month'),d:get('day'),hh:get('hour'),mm:get('minute'),ss:get('second')};
}

function presenceLogsParisMidnightToUtc(y,m,d){
  const guess=Date.UTC(y,m-1,d,0,0,0);
  const p=presenceLogsParisParts(new Date(guess));
  const parisAsUtc=Date.UTC(p.y,p.m-1,p.d,p.hh,p.mm,p.ss);
  return new Date(guess-(parisAsUtc-guess));
}

function presenceLogsWeekStart(now=new Date()){
  const p=presenceLogsParisParts(now);
  const dow=new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay(); // 0=dim … 6=sam
  const daysSinceMonday=(dow+6)%7;
  const monday=new Date(Date.UTC(p.y,p.m-1,p.d)-daysSinceMonday*86400000);
  return presenceLogsParisMidnightToUtc(monday.getUTCFullYear(),monday.getUTCMonth()+1,monday.getUTCDate());
}

function presenceLogsComputeWeekSecondsMap(){
  const startMs=presenceLogsWeekStart().getTime();
  const nowMs=Date.now();
  const map=new Map();
  for(const row of presenceLogsState.rows){
    if(!row.user_id)continue;
    const s=new Date(row.started_at).getTime();
    const e=row.ended_at?new Date(row.ended_at).getTime():nowMs;
    if(Number.isNaN(s)||Number.isNaN(e))continue;
    const from=Math.max(s,startMs);
    const to=Math.min(e,nowMs);
    if(to>from)map.set(row.user_id,(map.get(row.user_id)||0)+Math.floor((to-from)/1000));
  }
  return map;
}

function presenceLogsWeekSecondsForUser(userId){
  return presenceLogsState.weekSecondsMap?.get(userId)||0;
}

function presenceLogsHydrateRow(row){
  const garde=presenceLogsGardeForUser(row.user_id);
  const profile=presenceLogsProfileForUser(row.user_id);
  const summary=presenceLogsSummaryForUser(row.user_id);
  const name=presenceLogsGardeName(garde,summary,profile);
  const grade=garde?.grade||summary?.grade||'—';
  const username=profile?.username||summary?.username||'—';
  const activeAbsence=presenceLogsActiveAbsenceForUser(row.user_id);
  return {
    ...row,
    garde,
    profile,
    summary,
    name,
    grade,
    username,
    displayName:profile?.display_name||summary?.display_name||username,
    activeAbsence,
    durationSeconds:presenceLogsSeconds(row.started_at,row.ended_at),
  };
}

function presenceLogsStatusRank(row){
  if(row.activeAbsence)return -1;
  if(row.empty)return 2;
  if(!row.ended_at)return 0;
  return 1;
}

function presenceLogsSortValue(row,key){
  if(key==='name'||key==='username')return String(row[key]||'').toLowerCase();
  if(key==='status')return presenceLogsStatusRank(row);
  if(key==='started_at'||key==='ended_at'||key==='last_seen_at'){
    const value=key==='last_seen_at'?row.summary?.last_seen_at:row[key];
    const time=value?new Date(value).getTime():NaN;
    return Number.isNaN(time)?null:time;
  }
  if(key==='today_seconds')return Number(row.summary?.today_seconds)||0;
  if(key==='week_seconds')return presenceLogsWeekSecondsForUser(row.user_id);
  if(key==='total_seconds')return Number(row.summary?.total_seconds)||0;
  if(key==='durationSeconds')return Number(row.durationSeconds)||0;
  return String(row[key]||'').toLowerCase();
}

function presenceLogsSortedRows(rows){
  const {sortKey,sortDirection}=presenceLogsState;
  if(!sortKey||!sortDirection)return rows;
  const direction=sortDirection==='asc'?1:-1;
  return rows.map((row,index)=>({row,index})).sort((a,b)=>{
    const av=presenceLogsSortValue(a.row,sortKey);
    const bv=presenceLogsSortValue(b.row,sortKey);
    const aMissing=av===null||av===undefined||av==='';
    const bMissing=bv===null||bv===undefined||bv==='';
    if(aMissing&&bMissing)return a.index-b.index;
    if(aMissing)return 1;
    if(bMissing)return -1;
    let result=0;
    if(typeof av==='number'&&typeof bv==='number')result=av-bv;
    else result=String(av).localeCompare(String(bv),'fr',{numeric:true,sensitivity:'base'});
    return result===0?a.index-b.index:result*direction;
  }).map(item=>item.row);
}

function presenceLogsAllUsers(){
  const ids=new Set(presenceLogsState.gardes.map(row=>row.user_id).filter(Boolean));
  return [...ids].map(userId=>{
    const garde=presenceLogsGardeForUser(userId);
    const profile=presenceLogsProfileForUser(userId);
    const summary=presenceLogsSummaryForUser(userId);
    return {userId,garde,profile,summary,name:presenceLogsGardeName(garde,summary,profile),grade:garde?.grade||summary?.grade||'—'};
  });
}

async function loadPresenceLogs(){
  if(!session?.isSuperadmin)return;
  const msg=document.getElementById('presenceLogsMsg');
  presenceLogsState.loading=true;
  if(msg)msg.textContent='Chargement des logs de présence...';

  try{
    const [presenceResult,summaryResult,gardeResult,profileResult,absenceResult]=await Promise.all([
      window.GrimoireSupabase
        .from('mk_presences')
        .select('id,user_id,started_at,ended_at,created_at')
        .order('started_at',{ascending:false})
        .limit(3000),
      window.GrimoireSupabase
        .from('mk_presence_summary')
        .select('user_id,username,display_name,prenom,nom,grade,is_active,active_since,last_seen_at,total_seconds,today_seconds,week_seconds')
        .order('display_name',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_gardes')
        .select('id,user_id,prenom,nom,grade,specialite')
        .not('user_id','is',null)
        .order('nom',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_profiles')
        .select('user_id,username,display_name,is_superadmin')
        .order('username',{ascending:true}),
      window.GrimoireSupabase
        .from('mk_absences')
        .select('id,user_id,starts_at,ends_at,reason_hrp,reason_rp')
        .order('starts_at',{ascending:false}),
    ]);

    if(presenceResult.error)throw presenceResult.error;
    if(summaryResult.error)throw summaryResult.error;
    if(gardeResult.error)throw gardeResult.error;
    if(profileResult.error)throw profileResult.error;
    if(absenceResult.error)throw absenceResult.error;

    presenceLogsState.rows=presenceResult.data||[];
    presenceLogsState.summaries=summaryResult.data||[];
    presenceLogsState.gardes=gardeResult.data||[];
    presenceLogsState.profiles=profileResult.data||[];
    presenceLogsState.absences=absenceResult.data||[];
    presenceLogsState.loaded=true;
    renderPresenceLogs();
    if(msg)msg.textContent='';
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger les logs. Vérifie les policies RLS de mk_presences, mk_presence_summary, mk_gardes et mk_profiles pour les superadmins.';
    toast('Erreur de chargement des logs de présence.');
  }finally{
    presenceLogsState.loading=false;
  }
}

function renderPresenceLogs(){
  presenceLogsState.weekSecondsMap=presenceLogsComputeWeekSecondsMap();
  renderPresenceLogsGradeFilter();
  renderPresenceLogsStats();
  renderPresenceLogsTable();
  renderPresenceLogsSortState();
}

function renderPresenceLogsGradeFilter(){
  const select=document.getElementById('presenceLogsGrade');
  if(!select)return;
  const current=select.value||'all';
  const grades=[...new Set(presenceLogsAllUsers().map(row=>row.grade).filter(grade=>grade&&grade!=='—'))].sort((a,b)=>a.localeCompare(b,'fr'));
  select.innerHTML='<option value="all">Tous les grades</option>'+grades.map(grade=>`<option value="${presenceLogsEsc(grade)}">${presenceLogsEsc(grade)}</option>`).join('');
  select.value=grades.includes(current)?current:'all';
}

function presenceLogsFilteredRows(){
  const query=(document.getElementById('presenceLogsSearch')?.value||'').trim().toLowerCase();
  const status=document.getElementById('presenceLogsStatus')?.value||'all';
  const period=document.getElementById('presenceLogsPeriod')?.value||'all';
  const grade=document.getElementById('presenceLogsGrade')?.value||'all';
  const activity=document.getElementById('presenceLogsActivity')?.value||'all';

  const matchUser=(row)=>{
    const haystack=[row.name,row.grade,row.username,row.displayName,row.garde?.specialite].filter(Boolean).join(' ').toLowerCase();
    const matchSearch=!query||haystack.includes(query);
    const matchGrade=grade==='all'||row.grade===grade;
    const weekSeconds=presenceLogsWeekSecondsForUser(row.user_id);
    const matchActivity=activity==='all'||(activity==='active-week'?weekSeconds>0:weekSeconds<=0);
    return matchSearch&&matchGrade&&matchActivity;
  };

  const rows=presenceLogsState.rows.map(presenceLogsHydrateRow).filter(row=>{
    const matchSearchGradeActivity=matchUser(row);
    const matchStatus=status==='all'||(status==='active'?!row.ended_at:!!row.ended_at);
    const matchPeriod=presenceLogsRowMatchesPeriod(row,period);
    return matchSearchGradeActivity&&matchStatus&&matchPeriod;
  });

  if(status!=='active'){
    const shownUsers=new Set(rows.map(row=>row.user_id));
    const shouldShowEmpty=activity==='inactive-week'||query||period!=='all';
    if(shouldShowEmpty){
      const emptyRows=presenceLogsAllUsers()
        .filter(user=>!shownUsers.has(user.userId))
        .map(user=>{
          const profile=user.profile;
          const summary=user.summary;
          return {
            id:`empty-${user.userId}`,
            user_id:user.userId,
            started_at:null,
            ended_at:null,
            created_at:null,
            garde:user.garde,
            profile,
            summary,
            name:user.name,
            grade:user.grade,
            username:profile?.username||summary?.username||'—',
            displayName:profile?.display_name||summary?.display_name||profile?.username||'—',
            durationSeconds:0,
            empty:true,
          };
        })
        .filter(matchUser);
      rows.push(...emptyRows);
    }
  }

  // Dédupliquer — une seule ligne par garde : la session la plus récente
  const byUser = new Map();
  rows.forEach(row=>{
    const existing = byUser.get(row.user_id);
    if(!existing){ byUser.set(row.user_id, row); return; }
    // Priorité aux sessions actives, puis à la plus récente
    if(row.empty && !existing.empty) return;
    if(!row.empty && existing.empty){ byUser.set(row.user_id, row); return; }
    const da = new Date(existing.started_at||existing.created_at||0).getTime();
    const db = new Date(row.started_at||row.created_at||0).getTime();
    if(db > da) byUser.set(row.user_id, row);
  });
  return [...byUser.values()];
}

function renderPresenceLogsStats(){
  const users=presenceLogsAllUsers();
  const filtered=presenceLogsFilteredRows();
    const filteredSessions=filtered.filter(row=>!row.empty).length;
    const linked=presenceLogsState.gardes.filter(row=>!!row.user_id).length;
    const active=users.filter(row=>row.summary?.is_active===true).length;
    const absent=users.filter(row=>presenceLogsActiveAbsenceForUser(row.userId)).length;
    const inactive=users.filter(row=>presenceLogsWeekSecondsForUser(row.userId)<=0).length;
  const weekTotal=users.reduce((sum,row)=>sum+presenceLogsWeekSecondsForUser(row.userId),0);

  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  setText('presenceLogsLinkedCount',`Gardes liés : ${linked}`);
  setText('presenceLogsActiveCount',`Présents : ${active}`);
  setText('presenceLogsAbsentCount',`Absents : ${absent}`);
  setText('presenceLogsInactiveCount',`Inactifs 7j : ${inactive}`);
  const filteredGardes = [...new Set(filtered.map(r=>r.user_id).filter(Boolean))].length;
  setText('presenceLogsSessionsCount',`Gardes : ${filteredGardes}/${linked}`);
  setText('presenceLogsWeekTotal',`Total 7j : ${presenceLogsDuration(weekTotal)}`);
}

function renderPresenceLogsTable(){
  const tbody=document.getElementById('presenceLogsBody');
  if(!tbody)return;
  const rows=presenceLogsSortedRows(presenceLogsFilteredRows());

  tbody.innerHTML=rows.map(row=>{
    const summary=row.summary||{};
    if(row.empty){
      const absence=presenceLogsActiveAbsenceForUser(row.user_id);
      return `
        <tr class="presence-log-empty">
          <td class="cell-name">
            ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}
            <strong>${presenceLogsEsc(row.name)}</strong>
            <span>${presenceLogsEsc(row.grade)}</span>
          </td>
          <td>${presenceLogsEsc(row.username)}</td>
          <td>
            <span class="presence-log-status ${absence?'closed':'empty'}">${absence?'Absent':'Aucun pointage'}</span>
            ${absence?`<br><span class="sa-muted">jusqu'au ${presenceLogsEsc(presenceLogsDate(absence.ends_at))}</span>`:''}
          </td>
          <td>—</td>
          <td>—</td>
          <td>0 min</td>
          <td>${presenceLogsDuration(summary.today_seconds||0)}</td>
          <td>${presenceLogsDuration(presenceLogsWeekSecondsForUser(row.user_id))}</td>
          <td>${presenceLogsDuration(summary.total_seconds||0)}</td>
          <td>${summary.last_seen_at?presenceLogsEsc(presenceLogsDate(summary.last_seen_at)):'—'}</td>
        </tr>`;
    }
    const isActive=!row.ended_at;
    const absence=row.activeAbsence;
    return `
      <tr class="${isActive?'presence-log-open':''}">
        <td class="cell-name">
          ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}
          <strong>${presenceLogsEsc(row.name)}</strong>
          <span>${presenceLogsEsc(row.grade)}</span>
        </td>
        <td>${presenceLogsEsc(row.username)}</td>
        <td>
          <span class="presence-log-status ${absence?'closed':isActive?'active':'closed'}">${absence?'Absent':isActive?'En cours':'Clôturée'}</span>
          ${absence?`<br><span class="sa-muted">jusqu'au ${presenceLogsEsc(presenceLogsDate(absence.ends_at))}</span>`:''}
        </td>
        <td>${presenceLogsEsc(presenceLogsDate(row.started_at))}</td>
        <td>${row.ended_at?presenceLogsEsc(presenceLogsDate(row.ended_at)):'En cours'}</td>
        <td>${presenceLogsDuration(row.durationSeconds)}</td>
        <td>${presenceLogsDuration(summary.today_seconds||0)}</td>
        <td>${presenceLogsDuration(presenceLogsWeekSecondsForUser(row.user_id))}</td>
        <td>${presenceLogsDuration(summary.total_seconds||0)}</td>
        <td>${summary.last_seen_at?presenceLogsEsc(presenceLogsDate(summary.last_seen_at)):'—'}</td>
      </tr>`;
  }).join('');

  if(!rows.length){
    tbody.innerHTML='<tr><td colspan="10" class="sa-empty">Aucun log ne correspond aux filtres.</td></tr>';
  }
}

function filterPresenceLogs(){
  renderPresenceLogsStats();
  renderPresenceLogsTable();
  renderPresenceLogsSortState();
}

function renderPresenceLogsSortState(){
  document.querySelectorAll('[data-presence-sort]').forEach(button=>{
    const key=button.getAttribute('data-presence-sort');
    const active=key===presenceLogsState.sortKey&&presenceLogsState.sortDirection;
    button.classList.toggle('asc',active==='asc');
    button.classList.toggle('desc',active==='desc');
    button.setAttribute('aria-sort',active==='asc'?'ascending':active==='desc'?'descending':'none');
  });
}

function sortPresenceLogs(key){
  if(presenceLogsState.sortKey!==key){
    presenceLogsState.sortKey=key;
    presenceLogsState.sortDirection='asc';
  }else if(presenceLogsState.sortDirection==='asc'){
    presenceLogsState.sortDirection='desc';
  }else{
    presenceLogsState.sortKey=null;
    presenceLogsState.sortDirection=null;
  }
  renderPresenceLogsTable();
  renderPresenceLogsSortState();
}
