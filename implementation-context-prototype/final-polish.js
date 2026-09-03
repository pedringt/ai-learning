(() => {
  const STYLE_ID = 'state-final-ask-polish';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ask-answer-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ask-answer-actions .ask-copy-answer,
      .ask-answer-actions .ask-new-session{
        margin:0!important;
        min-height:40px!important;
        padding:9px 13px!important;
        border:1px solid var(--line)!important;
        border-radius:8px!important;
        background:var(--surface)!important;
        color:var(--ink)!important;
        font-weight:700!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        line-height:1.2!important;
      }
      .ask-answer-actions .ask-copy-answer:hover,
      .ask-answer-actions .ask-new-session:hover{
        border-color:#b7adce!important;
        background:var(--surface2)!important;
        color:var(--ink)!important;
      }
      .ask-live-answer .ask-answer-item{
        border-bottom:0!important;
        padding:10px 0!important;
      }
      .ask-live-answer .ask-answer-item>div{
        flex:1 1 100%!important;
        width:100%!important;
      }
      .ask-live-answer .ask-answer-item + .ask-answer-item{
        border-top:1px solid color-mix(in srgb,var(--line) 62%,transparent)!important;
        margin-top:8px!important;
        padding-top:18px!important;
      }
      .ask-live-answer .ask-item-detail{
        display:block!important;
        width:100%!important;
        flex-basis:100%!important;
        margin-top:2px!important;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeAskActions(){
    document.querySelectorAll('[data-action="copy-result"]').forEach(button => {
      if(button.textContent !== 'Copy') button.textContent = 'Copy';
    });
    document.querySelectorAll('[data-action="new-ask"]').forEach(button => {
      if(button.textContent !== 'New ask') button.textContent = 'New ask';
    });
  }

  installStyles();
  normalizeAskActions();

  const root = document.getElementById('viewRoot') || document.body;
  new MutationObserver(normalizeAskActions).observe(root, {childList:true, subtree:true});
})();
