(function(){const h=location.hostname;if(h==='state.authenticignorance.site'){location.replace('https://state.contextswitch.tech'+location.pathname+location.search+location.hash);}})();

/* State's own shell behavior.
 * Copied from the portfolio's site-shell.js so the State app no longer depends on the portfolio deployment (#228).
 * The portfolio traffic-analytics loader was removed: State visits must not be counted in portfolio analytics.
 * The portfolio-page patches (title/hero/Applied Work/validation rewrites, mobile nav, secondary menu) matched
 * nothing in State and were removed in the Nov 5 cleanup. */
(()=>{
  const body=document.body;

  /* final-freeze-polish.css and this file's two style blocks now load statically from state-app.css (#450). */

  // State is light-only (#229). Its styling is written for light mode and its theme toggle is
  // hidden, so following the browser's dark-mode preference (or a theme saved on this origin by
  // the portfolio) only flipped a handful of rules to dark and left the app half-dark.
  // Never add the dark class.
  body.classList.remove('v88-dark');
})();