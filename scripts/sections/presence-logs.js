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

function presenceLogsHydrateRow(row){
  const garde=presenceLogsGardeForUser(row.user_id);
  const profile=presenceLogsProfileForUser(row.user_id);
  const summary=presenceLogsSummaryForUser(row.user_id);
  const name=presenceLogsGardeName(garde,summary,profile);
  const grade=garde?.grade||summary?.grade||'—';
  const username=profile?.username||summary?.username||'—';
  return {
    ...row,
    garde,
    profile,
    summary,
    name,
    grade,
    username,
    displayName:profile?.display_name||summary?.display_name||username,
    durationSeconds:presenceLogsSeconds(row.started_at,row.ended_at),
  };
}

function presenceLogsStatusRank(row){
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
  if(key==='week_seconds')return Number(row.summary?.week_seconds)||0;
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
    const [presenceResult,summaryResult,gardeResult,profileResult]=await Promise.all([
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
    ]);

    if(presenceResult.error)throw presenceResult.error;
    if(summaryResult.error)throw summaryResult.error;
    if(gardeResult.error)throw gardeResult.error;
    if(profileResult.error)throw profileResult.error;

    presenceLogsState.rows=presenceResult.data||[];
    presenceLogsState.summaries=summaryResult.data||[];
    presenceLogsState.gardes=gardeResult.data||[];
    presenceLogsState.profiles=profileResult.data||[];
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
    const weekSeconds=Number(row.summary?.week_seconds)||0;
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

  return rows;
}

function renderPresenceLogsStats(){
  const users=presenceLogsAllUsers();
  const filtered=presenceLogsFilteredRows();
  const filteredSessions=filtered.filter(row=>!row.empty).length;
  const linked=presenceLogsState.gardes.filter(row=>!!row.user_id).length;
  const active=users.filter(row=>row.summary?.is_active===true).length;
  const inactive=users.filter(row=>(Number(row.summary?.week_seconds)||0)<=0).length;
  const weekTotal=users.reduce((sum,row)=>sum+(Number(row.summary?.week_seconds)||0),0);

  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  setText('presenceLogsLinkedCount',`Gardes liés : ${linked}`);
  setText('presenceLogsActiveCount',`Présents : ${active}`);
  setText('presenceLogsInactiveCount',`Inactifs 7j : ${inactive}`);
  setText('presenceLogsSessionsCount',`Sessions : ${filteredSessions}/${presenceLogsState.rows.length}`);
  setText('presenceLogsWeekTotal',`Total 7j : ${presenceLogsDuration(weekTotal)}`);
}

function renderPresenceLogsTable(){
  const tbody=document.getElementById('presenceLogsBody');
  if(!tbody)return;
  const rows=presenceLogsSortedRows(presenceLogsFilteredRows());

  tbody.innerHTML=rows.map(row=>{
    const summary=row.summary||{};
    if(row.empty){
      return `
        <tr class="presence-log-empty">
          <td class="cell-name">
            ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}
            <strong>${presenceLogsEsc(row.name)}</strong>
            <span>${presenceLogsEsc(row.grade)}</span>
          </td>
          <td>${presenceLogsEsc(row.username)}</td>
          <td><span class="presence-log-status empty">Aucun pointage</span></td>
          <td>—</td>
          <td>—</td>
          <td>0 min</td>
          <td>${presenceLogsDuration(summary.today_seconds||0)}</td>
          <td>${presenceLogsDuration(summary.week_seconds||0)}</td>
          <td>${presenceLogsDuration(summary.total_seconds||0)}</td>
          <td>${summary.last_seen_at?presenceLogsEsc(presenceLogsDate(summary.last_seen_at)):'—'}</td>
        </tr>`;
    }
    const isActive=!row.ended_at;
    return `
      <tr class="${isActive?'presence-log-open':''}">
        <td class="cell-name">
          ${typeof renderPresenceDot==='function'?renderPresenceDot(row.user_id):''}
          <strong>${presenceLogsEsc(row.name)}</strong>
          <span>${presenceLogsEsc(row.grade)}</span>
        </td>
        <td>${presenceLogsEsc(row.username)}</td>
        <td><span class="presence-log-status ${isActive?'active':'closed'}">${isActive?'En cours':'Clôturée'}</span></td>
        <td>${presenceLogsEsc(presenceLogsDate(row.started_at))}</td>
        <td>${row.ended_at?presenceLogsEsc(presenceLogsDate(row.ended_at)):'En cours'}</td>
        <td>${presenceLogsDuration(row.durationSeconds)}</td>
        <td>${presenceLogsDuration(summary.today_seconds||0)}</td>
        <td>${presenceLogsDuration(summary.week_seconds||0)}</td>
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
