// ══════════════════════════════════════════════════════════════════════
//  SYNCHRONISATION TEMPS RÉEL SUPABASE
// ══════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const realtimeState={
    channel:null,
    timers:new Map(),
    running:new Set(),
    pending:new Set(),
    lastPayload:null,
  };

  const RELOAD_DELAY=450;
  const REFRESHERS={
    citoyens:()=>callIfAvailable('loadCitoyens'),
    garde:()=>callIfAvailable('loadGardes'),
    commerces:()=>callIfAvailable('loadCommerces'),
    diplomatie:()=>callIfAvailable('loadDiplomatie'),
    cour:()=>callIfAvailable('loadCour'),
    inventaire:()=>Promise.all([
      callIfAvailable('loadInventaire'),
      callIfAvailable('loadOrdresFab'),
      callIfAvailable('loadRecettes'),
    ]),
    lois:()=>callIfAvailable('loadLois'),
    presences:()=>callIfAvailable('loadPresences'),
    patrouilles:()=>callIfAvailable('loadPatrouilles'),
    carte:()=>refreshCarte(),
    renseignements:()=>callIfAvailable('rensLoad'),
    missives:()=>callIfAvailable('loadMissives'),
    superadmin:()=>callIfAvailable('loadSuperadmin'),
    'presence-logs':()=>callIfAvailable('loadPresenceLogs'),
    suivi:()=>callIfAvailable('loadGardeSuivi'),
    profile:()=>refreshCurrentSession(),
  };

  const TABLE_REFRESH_MAP={
    mk_citoyens:['citoyens'],
    mk_transactions:['commerces'],
    mk_cour:['cour'],
    mk_diplomatie:['diplomatie'],
    mk_lois:['lois','suivi'],
    mk_inventaire:['inventaire'],
    mk_ordres_fabrication:['inventaire'],
    mk_recettes:['inventaire'],
    mk_profiles:['profile','superadmin','presence-logs'],
    mk_gardes:['profile','garde','patrouilles','superadmin','presence-logs','suivi'],
    mk_presences:['presences','garde','patrouilles','superadmin','presence-logs','suivi'],
    mk_patrouilles:['patrouilles','carte'],
    mk_patrouille_members:['patrouilles'],
    mk_garde_suivi:['suivi'],
    mk_missives:['missives'],
    mk_rens_fiches:['renseignements','carte'],
    mk_rens_rapports:['renseignements','carte'],
    mk_rens_relations:['renseignements'],
    mk_rens_rapport_liens:['renseignements'],
    mk_rens_rapport_rapport:['renseignements'],
    mk_rens_map_nodes:['renseignements'],
    mk_rens_map_links:['renseignements'],
    mk_map_pins:['carte'],
    mk_map_zones:['carte'],
    mk_map_pin_reports:['carte'],
    mk_map_zone_reports:['carte'],
  };

  function callIfAvailable(name){
    const fn=window[name]||globalThis[name];
    return typeof fn==='function'?fn():Promise.resolve();
  }

  function canRefreshSection(section){
    if(section==='profile')return !!session;
    if(section==='superadmin'||section==='presence-logs')return !!session?.isSuperadmin;
    if(section==='suivi')return !!session && typeof suiviState!=='undefined' && !!suiviState.garde;
    if(section==='inventaire')return canAccessSection('inventaire');
    if(section==='renseignements')return canAccessSection('renseignements');
    if(section==='carte')return canAccessSection('carte');
    if(section==='missives')return canAccessSection('missives');
    return canAccessSection(section);
  }

  function refreshCarte(){
    if(typeof carteState!=='undefined')carteState.loaded=false;
    return callIfAvailable('loadCarte');
  }

  async function refreshCurrentSession(){
    const payload=realtimeState.lastPayload;
    const changedUserId=payload?.new?.user_id||payload?.old?.user_id;
    if(changedUserId && session?.user?.id && changedUserId!==session.user.id){
      return Promise.resolve();
    }
    return typeof loadSession==='function'?loadSession({silent:true}):Promise.resolve();
  }

  function scheduleRefresh(section, reason){
    if(!session||!REFRESHERS[section]||!canRefreshSection(section))return;
    clearTimeout(realtimeState.timers.get(section));
    realtimeState.timers.set(section,setTimeout(()=>runRefresh(section,reason),RELOAD_DELAY));
  }

  async function runRefresh(section, reason){
    realtimeState.timers.delete(section);
    if(!session||!REFRESHERS[section]||!canRefreshSection(section))return;
    if(realtimeState.running.has(section)){
      realtimeState.pending.add(section);
      return;
    }

    realtimeState.running.add(section);
    try{
      await REFRESHERS[section]();
      if(window.GrimoireConfig?.debugRealtime){
        console.debug(`[Realtime] ${section} rafraîchi`, reason||'');
      }
    }catch(error){
      console.warn(`[Realtime] Impossible de rafraîchir ${section}.`, error);
    }finally{
      realtimeState.running.delete(section);
      if(realtimeState.pending.delete(section))scheduleRefresh(section,'pending');
    }
  }

  function handleTableChange(table, payload){
    realtimeState.lastPayload=payload;
    const sections=TABLE_REFRESH_MAP[table]||[];
    sections.forEach(section=>scheduleRefresh(section,`${table}:${payload.eventType||payload.event||'*'}`));
  }

  function realtimeTables(){
    const tables=new Set();
    Object.entries(TABLE_REFRESH_MAP).forEach(([table,sections])=>{
      if(sections.some(canRefreshSection))tables.add(table);
    });
    return [...tables];
  }

  function stopRealtime(){
    realtimeState.timers.forEach(timer=>clearTimeout(timer));
    realtimeState.timers.clear();
    realtimeState.running.clear();
    realtimeState.pending.clear();
    realtimeState.lastPayload=null;

    if(realtimeState.channel&&window.GrimoireSupabase){
      window.GrimoireSupabase.removeChannel(realtimeState.channel);
    }
    realtimeState.channel=null;
  }

  function startRealtime(){
    if(!session||!window.GrimoireSupabase)return;
    stopRealtime();

    const tables=realtimeTables();
    if(!tables.length)return;

    const channel=window.GrimoireSupabase.channel(`grimoire-live-${session.user.id}`);
    tables.forEach(table=>{
      channel.on(
        'postgres_changes',
        {event:'*',schema:'public',table},
        payload=>handleTableChange(table,payload)
      );
    });

    channel.subscribe(status=>{
      if(window.GrimoireConfig?.debugRealtime){
        console.debug('[Realtime] statut:',status,'tables:',tables);
      }
    });

    realtimeState.channel=channel;
  }

  window.startRealtime=startRealtime;
  window.stopRealtime=stopRealtime;
  window.GrimoireRealtime=Object.freeze({
    start:startRealtime,
    stop:stopRealtime,
    scheduleRefresh,
    tables:realtimeTables,
  });
})();
