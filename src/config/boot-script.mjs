// The first page a visitor opens (or reloads) plays the same arrival as moving between pages:
// skeleton cards, then the cards fade in (owner request, 2026-10-17). That has to start before
// the first paint, so it is a tiny inline script in <head> (src/pages/_document.tsx), allowed
// by its hash in the CSP (security-headers.mjs) — script-src stays free of 'unsafe-inline'.
//
// It is self-contained on purpose: if the app's JavaScript never loads, its own timers still
// show the page. Without JavaScript nothing runs, and the page is simply there. Motion off,
// reading mode and the admin get no animation, as in src/ui/page-effects.tsx.

/** How long the skeleton shows on a first load (the page is already there: keep it short). */
export const FIRST_LOAD_MS = 500;
/** How long the arrival (cards fading in one after another) runs before the page is left alone. */
export const ARRIVE_MS = 1200;

export const BOOT_SCRIPT =
  '(function(){try{' +
  "var d=document.documentElement;if(location.pathname.indexOf('/admin')===0)return;" +
  "var s={};try{s=JSON.parse(localStorage.getItem('cs-prefs'))||{}}catch(e){}" +
  "var m=typeof s.motion==='boolean'?s.motion:!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);" +
  'if(!m||s.reading===true)return;' +
  "d.setAttribute('data-motion','on');d.setAttribute('data-transition','loading');" +
  'var t=window.__csArrival=[];' +
  "t.push(setTimeout(function(){d.setAttribute('data-transition','in');" +
  `t.push(setTimeout(function(){d.removeAttribute('data-transition')},${ARRIVE_MS}))},${FIRST_LOAD_MS}))` +
  '}catch(e){}})();';
