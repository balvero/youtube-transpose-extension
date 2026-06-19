// YouTube Transpose — Service Worker
// Minimal service worker; handles install event only.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[YouTube Transpose] Extension installed');
  }
});
