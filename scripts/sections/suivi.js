// ══════════════════════════════════════════════════════════════════════
//  SUIVI DES GARDES
// ══════════════════════════════════════════════════════════════════════
const suiviState={
  garde:null,
  entries:[],
  authors:{},
  lois:[],
  presences:[],
  summary:null,
};

const SUIVI_KIND_LABELS={
  warn:'Avertissement',
  positive:'Note positive',
  note:'Observation',
};

const SUIVI_KIND_CLASS={
  warn:'warn',
  positive:'positive',
  note:'note',
};

function suiviEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function suiviGradeLevel(grade){
  const normalized=String(grade||'').trim();
  if(normalized==="Commandeur de l'Aube"||normalized==="Sénéchal de l'Aube")return 4;
  if(normalized==="Exécuteur de la Garde")return 3;
  if(normalized==="Traqueur de la Garde")return 2;
  if([
    'Patrouilleur de la Garde',
    'Aspirant de la Garde',
    'Artisan de la Garde',
    'Confrère de la Garde',
    'Mage de la Garde',
    'Barde de la Garde',
  ].includes(normalized))return 1;
  return 0;
}

function canOpenGardeSuivi(garde){
  if(!session||!garde?.user_id)return false;
  if(session.isSuperadmin)return true;
  const currentLevel=suiviGradeLevel(session.garde?.grade||session.grade);
  const targetLevel=suiviGradeLevel(garde.grade);
  return currentLevel>0&&targetLevel>0&&currentLevel>targetLevel;
}

function suiviGardeName(garde){
  return [garde?.prenom,garde?.nom].filter(Boolean).join(' ')||'—';
}

function suiviDate(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
}

function suiviDuration(seconds){
  if(typeof presenceDuration==='function')return presenceDuration(seconds);
  const total=Math.max(0,Math.floor(Number(seconds)||0));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  return hours>0?`${hours} h ${String(minutes).padStart(2,'0')}`:`${minutes} min`;
}

function suiviSecondsBetween(startValue,endValue){
  if(typeof presenceSecondsBetween==='function')return presenceSecondsBetween(startValue,endValue);
  const start=new Date(startValue);
  const end=endValue?new Date(endValue):new Date();
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 0;
  return Math.max(0,Math.floor((end-start)/1000));
}

function suiviKindLabel(kind){
  return SUIVI_KIND_LABELS[kind]||SUIVI_KIND_LABELS.note;
}

function suiviLawForEntry(entry){
  return suiviState.lois.find(loi=>String(loi.id)===String(entry.loi_id))||null;
}

function suiviAuthorLabel(entry){
  const author=suiviState.authors[String(entry.author_user_id)]||null;
  if(!author)return 'Auteur inconnu';
  return `${suiviGardeName(author)} — ${author.grade||'Grade inconnu'}`;
}

async function openGardeSuivi(id){
  const garde=gardeRows.find(row=>row.id===id);
  if(!garde||!canOpenGardeSuivi(garde)){toast('Accès au suivi refusé.');return;}
  suiviState.garde=garde;
  suiviState.entries=[];
  suiviState.authors={};
  suiviState.presences=[];
  suiviState.summary=null;
  renderGardeSuivi();
  const overlay=document.getElementById('suivi-modal-overlay');
  if(overlay)overlay.style.display='flex';
  await loadGardeSuivi();
}

function closeGardeSuivi(){
  const overlay=document.getElementById('suivi-modal-overlay');
  if(overlay)overlay.style.display='none';
  suiviState.garde=null;
}

async function loadGardeSuivi(){
  if(!suiviState.garde)return;
  const msg=document.getElementById('suiviMsg');
  if(msg)msg.textContent='Chargement...';
  const userId=suiviState.garde.user_id;
  try{
    const [entriesResult,loisResult,presencesResult,summaryResult]=await Promise.all([
      window.GrimoireSupabase
        .from('mk_garde_suivi')
        .select('id,garde_id,author_user_id,kind,loi_id,title,body,created_at')
        .eq('garde_id',suiviState.garde.id)
        .order('created_at',{ascending:false})
        .limit(80),
      window.GrimoireSupabase
        .from('mk_lois')
        .select('id,titre,peine,sanction')
        .order('peine',{ascending:true}),
      userId?window.GrimoireSupabase
        .from('mk_presences')
        .select('id,user_id,started_at,ended_at,created_at')
        .eq('user_id',userId)
        .order('started_at',{ascending:false})
        .limit(30):Promise.resolve({data:[],error:null}),
      userId?window.GrimoireSupabase
        .from('mk_presence_summary')
        .select('user_id,is_active,active_since,last_seen_at,total_seconds,today_seconds,week_seconds')
        .eq('user_id',userId)
        .maybeSingle():Promise.resolve({data:null,error:null}),
    ]);

    if(entriesResult.error)throw entriesResult.error;
    if(loisResult.error)console.warn('Impossible de charger le Codex du suivi.', loisResult.error);
    if(presencesResult.error)console.warn('Impossible de charger les présences du suivi.', presencesResult.error);
    if(summaryResult.error)console.warn('Impossible de charger le résumé de présence du suivi.', summaryResult.error);

    suiviState.entries=entriesResult.data||[];
    suiviState.authors=await loadGardeSuiviAuthors(suiviState.entries);
    suiviState.lois=loisResult.error?[]:(loisResult.data||[]);
    suiviState.presences=presencesResult.error?[]:(presencesResult.data||[]);
    suiviState.summary=summaryResult.error?null:(summaryResult.data||null);
    renderGardeSuivi();
    if(msg)msg.textContent='';
  }catch(error){
    console.error(error);
    if(msg)msg.textContent='Impossible de charger le suivi.';
    toast('Erreur de chargement du suivi.');
  }
}

async function loadGardeSuiviAuthors(entries){
  const ids=[...new Set((entries||[]).map(entry=>entry.author_user_id).filter(Boolean).map(String))];
  if(!ids.length)return {};

  const authors={};
  gardeRows.forEach(garde=>{
    if(garde.user_id&&ids.includes(String(garde.user_id))){
      authors[String(garde.user_id)]={prenom:garde.prenom,nom:garde.nom,grade:garde.grade};
    }
  });

  const missing=ids.filter(id=>!authors[id]);
  if(!missing.length)return authors;

  const { data, error } = await window.GrimoireSupabase
    .from('mk_gardes')
    .select('user_id,prenom,nom,grade')
    .in('user_id',missing);

  if(error){
    console.warn('Impossible de charger les auteurs du suivi.', error);
    return authors;
  }

  (data||[]).forEach(garde=>{
    if(garde.user_id){
      authors[String(garde.user_id)]={prenom:garde.prenom,nom:garde.nom,grade:garde.grade};
    }
  });
  return authors;
}

function renderGardeSuivi(){
  const garde=suiviState.garde;
  if(!garde)return;
  const title=document.getElementById('suiviTitle');
  const details=document.getElementById('suiviDetails');
  const stats=document.getElementById('suiviPresenceStats');
  const lois=document.getElementById('suiviLoi');
  const history=document.getElementById('suiviHistoryBody');
  const entries=document.getElementById('suiviEntries');

  if(title)title.textContent=`Suivi — ${suiviGardeName(garde)}`;
  if(details){
    details.innerHTML=[
      ['Garde',suiviGardeName(garde)],
      ['Grade',garde.grade||'—'],
      ['Race',garde.race||'—'],
      ['Spécialité',garde.specialite||'Soldat'],
      ['Recrutement',garde.date_recrutement?new Date(garde.date_recrutement).toLocaleDateString('fr-FR'):'—'],
      ['Recruté par',garde.recruteur||'—'],
    ].map(([label,value])=>`<dt>${suiviEsc(label)}</dt><dd>${suiviEsc(value)}</dd>`).join('');
  }

  if(stats){
    const summary=suiviState.summary||{};
    const active=summary.is_active===true;
    stats.innerHTML=[
      ['Statut',`${active?'Présent':'Off'}${summary.last_seen_at&&!active?` depuis ${suiviDate(summary.last_seen_at)}`:''}`],
      ['Aujourd\'hui',suiviDuration(summary.today_seconds||0)],
      ['7 jours',suiviDuration(summary.week_seconds||0)],
      ['Total',suiviDuration(summary.total_seconds||0)],
    ].map(([label,value])=>`
      <div class="suivi-stat">
        <strong>${suiviEsc(value)}</strong>
        <span>${suiviEsc(label)}</span>
      </div>
    `).join('');
  }

  if(lois){
    lois.innerHTML='<option value="">Aucun article du Codex</option>'+suiviState.lois.map(loi=>`
      <option value="${suiviEsc(loi.id)}">${suiviEsc(loi.peine?`${loi.peine} — ${loi.titre}`:loi.titre)}</option>
    `).join('');
  }

  if(history){
    history.innerHTML=suiviState.presences.map(row=>`
      <tr>
        <td>${suiviEsc(suiviDate(row.started_at))}</td>
        <td>${row.ended_at?suiviEsc(suiviDate(row.ended_at)):'En cours'}</td>
        <td>${suiviEsc(suiviDuration(suiviSecondsBetween(row.started_at,row.ended_at)))}</td>
      </tr>
    `).join('');
    if(!suiviState.presences.length){
      history.innerHTML='<tr><td colspan="3" class="sa-empty">Aucune présence consultable.</td></tr>';
    }
  }

  if(entries){
    entries.innerHTML=suiviState.entries.map(entry=>{
      const loi=suiviLawForEntry(entry);
      const kindClass=SUIVI_KIND_CLASS[entry.kind]||'note';
      return `
        <article class="suivi-entry ${kindClass}">
          <div class="suivi-entry-head">
            <span class="suivi-entry-kind">${suiviEsc(suiviKindLabel(entry.kind))}</span>
            <span class="suivi-entry-meta">
              <span>${suiviEsc(suiviDate(entry.created_at))}</span>
              <span>${suiviEsc(suiviAuthorLabel(entry))}</span>
            </span>
          </div>
          <h4>${suiviEsc(entry.title||suiviKindLabel(entry.kind))}</h4>
          ${loi?`<p class="suivi-law">${suiviEsc(loi.peine||'Codex')} — ${suiviEsc(loi.titre||'Article')}</p>`:''}
          <p>${suiviEsc(entry.body||'—')}</p>
        </article>
      `;
    }).join('');
    if(!suiviState.entries.length){
      entries.innerHTML='<p class="sa-muted">Aucune note de suivi.</p>';
    }
  }

  updateSuiviKind();
}

function updateSuiviKind(){
  const kind=document.getElementById('suiviKind')?.value||'note';
  const loi=document.getElementById('suiviLoi');
  if(loi)loi.disabled=kind!=='warn';
}

async function addGardeSuiviEntry(){
  const garde=suiviState.garde;
  if(!garde||!canOpenGardeSuivi(garde)){toast('Accès au suivi refusé.');return;}
  const kind=document.getElementById('suiviKind')?.value||'note';
  const loiId=document.getElementById('suiviLoi')?.value||null;
  const title=(document.getElementById('suiviEntryTitle')?.value||'').trim();
  const body=(document.getElementById('suiviEntryBody')?.value||'').trim();
  if(!body){toast('Contenu requis.');return;}
  try{
    const { error } = await window.GrimoireSupabase
      .from('mk_garde_suivi')
      .insert({
        garde_id:garde.id,
        author_user_id:session.user.id,
        kind,
        loi_id:kind==='warn'?loiId:null,
        title:title||suiviKindLabel(kind),
        body,
      });
    if(error)throw error;
    document.getElementById('suiviEntryTitle').value='';
    document.getElementById('suiviEntryBody').value='';
    const loi=document.getElementById('suiviLoi');
    if(loi)loi.value='';
    await loadGardeSuivi();
    toast('Suivi ajouté.');
  }catch(error){
    console.error(error);
    toast('Erreur lors de l\'ajout du suivi.');
  }
}
