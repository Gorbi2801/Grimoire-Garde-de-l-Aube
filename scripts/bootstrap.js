// ══════════════════════════════════════════════════════════════════════
//  EXPOSITION CONTRÔLÉE — fonctions nécessaires aux onclick HTML.
//  Les droits réels seront renforcés côté Supabase/RLS dans l'étape sécurité.
// ══════════════════════════════════════════════════════════════════════
(function exposePublic(){
  const pub = {
    entrerGrimoire,
    switchSection, showProfilePage, toggleForm, sortTable, filterRows,
    garSwitchTab,
    doLogin, doLogout,
    addCitoyen, saveCitoyen:addCitoyen, delCitoyen, editCitoyen, cycleStatut, updateStatutCitoyen:cycleStatut,
    addGarde, saveGarde:addGarde, delGarde, editGarde,
    openGardeSuivi, closeGardeSuivi, loadGardeSuivi, addGardeSuiviEntry, updateSuiviKind,
    addCommerce, saveCommerce:addCommerce, delCommerce, editCommerce,
    saveRelation, loadDiplomatie,
    addCour, saveCour:addCour, delCour, editCour,
    addOrdreFab, saveOrdreFab:addOrdreFab, delOrdreFab, incrementOrdreFab, setOrdreFabAvancement, updateAvancement:incrementOrdreFab,
    addRecette, saveRecette:addRecette, delRecette,
    addInvItem, saveInventaire:addInvItem, editInvItem, delInvItem, updateQty, setQty, ajusterQuantite:updateQty,
    revertInvEntry, undoInvChange:revertInvEntry,
    addLoi, saveLoi:addLoi, delLoi,
    loadMissives, setMissiveTab, filterMissives, selectMissive, sendMissive,
    loadPatrouilles, createPatrouille, closePatrouille, selectPresentPatrouilleGuards,
    saveNoteModal, saveNote:saveNoteModal, openNoteModal, closeNoteModal,
    showTab, toggleFiche, toggleRap, toggleAdd, toggleRelForm, removeRel,
    renderTab, goToFiche, saveFiche, deleteFiche, openEditFiche,
    saveRapport, deleteRapport, addRelation, deleteRelation,
    rensSearch, rensFilter,
    loadSuperadmin, filterSuperadminGardes, selectSuperadminGarde, selectSuperadminProfile,
    linkSelectedSuperadminProfile, unlinkSelectedSuperadminGarde,
    saveSelectedSuperadminProfile, deleteSelectedSuperadminGarde,
    createSuperadminAccount, deleteSelectedSuperadminAccount,
    escH, escJs, esc, showMsg, toast,
  };
  Object.entries(pub).forEach(([k,v])=>{ if(typeof v==='function') window[k]=v; });
})();

init();
