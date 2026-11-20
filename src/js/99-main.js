/* boot */
function boot() {
  initProgress(); initNav(); initReveal(); initParallax(); initSpotlight(); initCA(); initDemo(); initMarket();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
