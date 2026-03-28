// Service worker OptiRemplir
// Rôle minimal : maintenir l'extension active et relayer si besoin

chrome.runtime.onInstalled.addListener(() => {
  console.log('OptiRemplir installé');
});
