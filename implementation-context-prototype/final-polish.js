(() => {
  const STYLE_ID = 'state-final-ask-polish';

  function installStyles(){
    let style = document.getElementById(STYLE_ID);
    if(!style){
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
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
      .ask-live-answer .ask-answer-item,
      .ask-live-answer .ask-answer-item:last-child,
      .ask-live-answer .ask-answer-item + .ask-answer-item{
        border:0!important;
        border-top:0!important;
        border-bottom:0!important;
      }
      .ask-live-answer .ask-answer-item{
        padding:8px 0!important;
        margin:0!important;
      }
      .ask-live-answer .ask-answer-item>div{
        flex:1 1 100%!important;
        width:100%!important;
      }
      .ask-live-answer .ask-answer-item + .ask-answer-item{
        margin-top:10px!important;
        padding-top:10px!important;
      }
      .ask-live-answer .ask-item-detail{
        display:block!important;
        width:100%!important;
        flex-basis:100%!important;
        margin-top:3px!important;
        line-height:1.4!important;
      }
    `;
  }

  function normalizeAskUi(){
    document.querySelectorAll('[data-action="copy-result"]').forEach(button => {
      if(button.textContent !== 'Copy') button.textContent = 'Copy';
    });
    document.querySelectorAll('[data-action="new-ask"]').forEach(button => {
      if(button.textContent !== 'New ask') button.textContent = 'New ask';
    });
    // Inline enforcement makes the divider removal immune to older stylesheet
    // specificity/caching. These rows should be separated by whitespace only.
    document.querySelectorAll('.ask-live-answer .ask-answer-item').forEach(item => {
      item.style.setProperty('border', '0', 'important');
      item.style.setProperty('border-top', '0', 'important');
      item.style.setProperty('border-bottom', '0', 'important');
    });
  }

  installStyles();
  normalizeAskUi();

  const root = document.getElementById('viewRoot') || document.body;
  new MutationObserver(normalizeAskUi).observe(root, {childList:true, subtree:true});
})();
