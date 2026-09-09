(() => {
  const icons = {
    overview:'<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/></svg>',
    'project-overview':'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    'open-items':'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    notes:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    history:'<svg viewBox="0 0 24 24"><path d="M4 7V3m0 4h4M4.5 7A9 9 0 1 1 3 15"/><path d="M12 7v5l3 2"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2.3-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2.3 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" transform="translate(2.25 0) scale(.8)"/></svg>'
  };
  function addStyles(){
    if(document.getElementById('state-feedback-pass')) return;
    const s=document.createElement('style'); s.id='state-feedback-pass'; s.textContent=`
      body:not(.v88-dark) .prototype-productbar{background:#edf4ff!important;border-bottom:1px solid #d7e4f5!important}
      .sidebar-nav .nav-item{grid-template-columns:28px minmax(0,1fr) auto!important;gap:14px!important;justify-items:start!important;text-align:left!important;padding:13px 18px!important}
      .sidebar-nav .nav-item .nav-icon{width:24px!important;height:24px!important;display:grid!important;place-items:center!important;color:#58709a!important;font-size:0!important}
      .sidebar-nav .nav-item .nav-icon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .sidebar-nav .nav-item.active .nav-icon,.sidebar-nav .nav-item[aria-current="page"] .nav-icon{color:#1769e8!important}
      .sidebar-nav .nav-label{justify-self:start!important;text-align:left!important}
      .sidebar-nav .nav-count{justify-self:end!important}
      .app-sidebar{position:relative!important;padding-bottom:108px!important}
      .app-sidebar>.demo-help-button.state-help-card{position:absolute!important;left:18px!important;right:18px!important;bottom:18px!important;width:auto!important;margin:0!important}
      .project-switcher>span{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important;transform:translateY(-1px)!important}
      .attention-item{grid-template-columns:54px minmax(0,1fr) auto 22px!important;gap:16px!important;padding:18px 22px!important;min-height:0!important;align-items:center!important}
      .attention-item-copy{grid-column:2!important;justify-self:start!important;width:100%!important;max-width:none!important;text-align:left!important}
      .attention-item-copy>*{text-align:left!important;margin-left:0!important;margin-right:0!important}
      .attention-item .attention-icon{grid-column:1!important;justify-self:start!important}
      .attention-kind{grid-column:3!important}.attention-arrow{grid-column:4!important}
      body:not(.v88-dark) .history-page article{border-left:0!important}
      body:not(.v88-dark) .history-page article::before{border-left-color:#dce7f5!important}
      body:not(.v88-dark) .history-page [class*="timeline"] [class*="dot"],body:not(.v88-dark) .history-page [class*="marker"]{color:#1769e8!important;border-color:#1769e8!important}
      body:not(.v88-dark) .notes-page article{border-left:0!important;border:1px solid #e0e7f1!important;box-shadow:0 1px 2px rgba(24,47,84,.03)!important}
      body:not(.v88-dark) .notes-page article::before{content:'';display:block;position:absolute;inset:0 auto 0 0;width:3px;border-radius:14px 0 0 14px;background:#c7b8ff}
      body:not(.v88-dark) .notes-page article:nth-of-type(even)::before{background:#b7d5ff}
      .notes-page article{position:relative!important}
      .ask-state-drawer-head{padding:20px 26px 16px!important}
      .ask-title-row{padding-left:42px!important}.ask-title-row::before{content:'✦'!important;font-size:29px!important;left:2px!important;top:-4px!important;color:#1769e8!important}
      .ask-state-drawer-head h2{font-size:22px!important}.ask-state-description{font-size:13px!important;max-width:300px!important}
      .ask-state-drawer-controls{padding:20px 26px 24px!important}
      .ask-state-drawer-form input{height:104px!important;min-height:104px!important;padding:16px 58px 52px 16px!important;align-items:flex-start!important}
      .ask-state-drawer-form button{top:auto!important;bottom:12px!important;transform:none!important;width:42px!important;height:42px!important}
      .ask-state-starters{gap:1px!important;margin-top:26px!important}.ask-state-starters::before{content:'Try asking about:'!important;text-transform:none!important;letter-spacing:0!important;font-size:13px!important;font-weight:500!important;color:#65728b!important;margin-bottom:8px!important}
      .ask-state-starters button{background:transparent!important;padding:9px 8px 9px 42px!important;font-size:12.5px!important;border-radius:8px!important}.ask-state-starters button::before{left:10px!important;font-size:17px!important;color:#314f82!important}
      .ask-state-starters button:nth-of-type(1)::before{content:'✣'!important}.ask-state-starters button:nth-of-type(2)::before{content:'▣'!important}.ask-state-starters button:nth-of-type(3)::before{content:'☑'!important}.ask-state-starters button:nth-of-type(4)::before{content:'◯'!important}.ask-state-starters button:nth-of-type(5){display:none!important}
      .ask-quick-actions-polish{border-top:1px solid #e2e9f2;margin-top:22px;padding-top:18px;display:grid;gap:8px}.ask-quick-actions-polish>span{font-size:13px;color:#65728b;margin-bottom:2px}.ask-quick-actions-polish button{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid #dce6f3;border-radius:9px;background:#fff;color:#1e2b43;font:inherit;font-size:12px;text-align:left;cursor:pointer}.ask-quick-actions-polish button b{display:grid;place-items:center;width:25px;height:25px;color:#1769e8;font-size:16px}.ask-quick-actions-polish button:hover{background:#f5f9ff}
      .ask-state-drawer-controls>p:last-child{font-size:10.5px!important;margin-top:16px!important;padding-top:12px!important}
      @media(max-width:760px){.app-sidebar{padding-bottom:0!important}.attention-item{grid-template-columns:44px minmax(0,1fr) auto!important;padding:14px!important;gap:11px!important}}
    `; document.head.appendChild(s);
  }
  function fixNav(){document.querySelectorAll('.sidebar-nav .nav-item').forEach(b=>{const i=b.querySelector(':scope > .nav-icon');if(i&&icons[b.dataset.view]) i.innerHTML=icons[b.dataset.view]})}
  function quickActions(){const c=document.querySelector('.ask-state-drawer-controls');if(!c||c.querySelector('.ask-quick-actions-polish'))return;const starters=c.querySelector('.ask-state-starters');if(!starters)return;const wrap=document.createElement('div');wrap.className='ask-quick-actions-polish';wrap.innerHTML='<span>Quick actions</span><button type="button" data-q="Summarize the current state"><b>▤</b>Summarize this page</button><button type="button" data-q="What are we still unsure about?"><b>?</b>Show open questions</button><button type="button" data-q="What changed recently?"><b>↗</b>Show recent changes</button>';wrap.addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(!b)return;const input=c.querySelector('input,textarea');if(input){input.value=b.dataset.q;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}});starters.after(wrap)}
  function run(){addStyles();fixNav();quickActions()}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})};new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();