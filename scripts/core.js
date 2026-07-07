// ══════════════════════════════════════════════════════════════════════
//  COUVERTURE
// ══════════════════════════════════════════════════════════════════════
function entrerGrimoire(){
  const couv = document.getElementById('couverture');
  let done=false;
  const finish=()=>{
    if(done)return;
    done=true;
    couv.style.display = 'none';
    if(session)showAppShell();
    else showAuthGate();
  };
  couv.classList.add('couv-turning');
  couv.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 850);
}
// ══════════════════════════════════════════════════════════════════════
//  AVERTISSEMENT SÉCURITÉ
//  La clé ci-dessous est une clé anon (publique) Supabase.
//  La sécurité réelle repose sur les Row Level Security (RLS) de Supabase.
//  IMPORTANT : appliquer les RLS recommandées dans le README avant déploiement.
//  Ne jamais remplacer cette clé par une clé service_role.
// ══════════════════════════════════════════════════════════════════════
const { sbGet, sbPost, sbPatch, sbDelete } = window.GrimoireSupabaseRest;
// Bannière de sécurité console
console.log('%c⛔ STOP','color:#cc0000;font-size:2.5rem;font-weight:bold;');
console.log('%cCette console est réservée aux développeurs autorisés.\nToute tentative de manipulation des fonctions internes constitue une violation de la charte de la communauté et peut entraîner une exclusion définitive.\nLes fonctions d\'administration ne sont pas accessibles depuis cet environnement.','color:#8B7340;font-size:1rem;font-style:italic;');
const attempts={count:0,until:0};
function locked(){return attempts.until>Date.now();}
function failAttempt(){
  attempts.count++;
  if(attempts.count>=10)attempts.until=Date.now()+30*60000;      // 30 min après 10 échecs
  else if(attempts.count>=7)attempts.until=Date.now()+10*60000;  // 10 min après 7 échecs
  else if(attempts.count>=5)attempts.until=Date.now()+2*60000;   // 2 min après 5 échecs
  else if(attempts.count>=3)attempts.until=Date.now()+15000;     // 15 sec après 3 échecs
}
function resetAttempts(){attempts.count=0;attempts.until=0;}
// ══════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════
let session=null;
let activeSection='agenda';
// ══════════════════════════════════════════════════════════════════════
//  LOADER
// ══════════════════════════════════════════════════════════════════════
function showLoader(m='Chargement...'){document.getElementById('loader-msg').textContent=m;document.getElementById('loader').style.display='flex';}
function hideLoader(){document.getElementById('loader').style.display='none';}
// ══════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════
async function init(){
  showLoader('Chargement du Grimoire...');
  await loadSession({silent:true});
  hideLoader();
}
