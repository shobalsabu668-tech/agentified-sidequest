// Hides the hero for the first paint so fx.js can play its intro without a flash.
// Shows everything again if the effects never start (a blocked script, an old browser).
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.add("fx");
  setTimeout(() => { if (!window.__fxStarted) root.classList.remove("fx"); }, 3500);
})();
