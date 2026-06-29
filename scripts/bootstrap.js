// ══════════════════════════════════════════════════════════════════════
//  EXPOSITION CONTRÔLÉE — fonctions nécessaires aux onclick HTML.
// ══════════════════════════════════════════════════════════════════════
(function exposePublic(){
  const pub = {
    entrerGrimoire,
    switchSection, showProfilePage, toggleForm, sortTable, filterRows,
    garSwitchTab,
    doLogin, doLogout,
    addCitoyen, saveCitoyen:addCitoyen, delCitoyen, editCitoyen, cycleStatut, updateStatutCitoyen:cycleStatut,
    addGarde, saveGarde:addGarde, delGarde, editGarde, toggleAbsenceGarde, forceStopPresence,
    openGardeSuivi, closeGardeSuivi, loadGardeSuivi, addGardeSuiviEntry, updateSuiviKind,
    addCommerce, saveCommerce:addCommerce, delCommerce, editCommerce,
    saveRelation, loadDiplomatie,
    addCour, saveCour:addCour, delCour, editCour,
    addOrdreFab, saveOrdreFab:addOrdreFab, delOrdreFab, incrementOrdreFab, setOrdreFabAvancement, updateAvancement:incrementOrdreFab,
    addRecette, saveRecette:addRecette, delRecette,
    addInvItem, saveInventaire:addInvItem, editInvItem, delInvItem, updateQty, setQty, ajusterQuantite:updateQty,
    invSwitchTab, invSetCat, invToggleEmpty,
    revertInvEntry, undoInvChange:revertInvEntry,
    addLoi, saveLoi:addLoi, delLoi,
    loadMissives, setMissiveTab, filterMissives, selectMissive, sendMissive,
    loadPatrouilles, createPatrouille, closePatrouille, selectPresentPatrouilleGuards,
    initCarte, loadCarte, carteSetFilter, carteToggleSidebar, carteToggleCreatePanel,
    carteStartPlacement, carteSavePin, carteDeleteSelectedPin, carteSelectPin,
    carteStartZoneDrawing, carteCancelZoneDrawing, carteFinishZoneDrawing,
    carteSaveZone, carteDeleteSelectedZone, carteSelectZone, carteSetLayer,
    carteApplyRiskColor, carteToggleReportPicker, carteRenderReportPicker,
    carteAddReportToSelection, carteRemoveReportFromSelection,
    carteToggleOverlay, carteZoomIn, carteZoomOut, carteResetView,
    startPresence, stopPresence,
    saveNoteModal, saveNote:saveNoteModal, openNoteModal, closeNoteModal,
    showTab, toggleFiche, toggleRap, toggleAdd, toggleRelForm, removeRel,
    renderTab, goToFiche, saveFiche, deleteFiche, openEditFiche, saveEditFiche,
    saveRapport, openEditRapport, saveEditRapport, deleteRapport, addRelation, deleteRelation,
    addRapportLien, deleteRapportLien, deleteRapportRapport,
    goToRapport, rensOpenMapReportPicker, rensSetMapReportType, rensSpawnMapReport, rensSpawnMapFiche,
    rensStartMapLink, rensCancelMapLink, rensSetMapLinkColor, rensDeleteSelectedMapItem,
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
