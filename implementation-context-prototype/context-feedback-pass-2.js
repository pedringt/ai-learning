(() => {
  const svg = {
    sparkle:'<svg viewBox="0 0 24 24"><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>',
    calendar:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
    checkdoc:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="m9 14 2 2 4-5"/></svg>',
    question:'<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8 8 0 1 1 21 12z"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-.9.5-1.5 1-1.5 2M12 16h.01"/></svg>',
    doc:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    trend:'<svg viewBox="0 0 24 24"><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></svg>',
    note:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6"/></svg>',
    slack:'<svg viewBox="0 0 24 24"><path d="M9 3a2 2 0 0 1 2 2v4H9a2 2 0 1 1 0-4V3zM21 9a2 2 0 0 1-2 2h-4V9a2 2 0 1 1 4 0h2zM15 21a2 2 0 0 1-2-2v-4h2a2 2 0 1 1 0 4v2zM3 15a2 2 0 0 1 2-2h4v2a2 2 0 1 1-4 0H3z"/></svg>'
  };
  function styles(){
    if(document.getElementById('state-feedback-pass-2')) return;
    const s=document.createElement('style'); s.id='state-feedback-pass-2'; s.textContent=`
      /* compact desktop navigation */
      .sidebar-nav{display:flex!important;flex-direction:column!important;gap:4px!important}
      .sidebar-nav .nav-item{min-height:48px!important;padding:10px 16px!important;margin:0!important;border-radius:12px!important;gap:12px!important}
      .sidebar-nav .nav-item .nav-icon{width:24px!important;height:24px!important}
      .sidebar-nav .nav-item .nav-icon svg{width:24px!important;height:24px!important}
      .app-sidebar{position:sticky!important;top:0!important;height:calc(100vh - var(--topbar-height,0px))!important;min-height:0!important;padding-bottom:112px!important;align-self:start!important}
      .app-sidebar>.demo-help-button.state-help-card{position:absolute!important;left:18px!important;right:18px!important;bottom:18px!important}
      /* attention rows: icon/text anchored left, action anchored right */
      .attention-item{display:grid!important;grid-template-columns:54px minmax(0,1fr) auto 22px!important;column-gap:14px!important;padding:16px 22px!important;align-items:center!important}
      .attention-item .attention-icon{grid-column:1!important;justify-self:start!important}
      .attention-item-copy{grid-column:2!important;justify-self:start!important;width:auto!important;max-width:100%!important;margin:0!important;text-align:left!important}
      .attention-item-copy>*{text-align:left!important;margin-left:0!important;margin-right:0!important}
      .attention-kind{grid-column:3!important;justify-self:end!important}.attention-arrow{grid-column:4!important;justify-self:end!important}
      /* Ask header and coherent icon system */
      body:not(.v88-dark) .ask-state-drawer-head{background:#f1f6ff!important;border-bottom:1px solid #dce7f5!important}
      .ask-title-row{padding-left:42px!important}.ask-title-row::before{content:''!important;width:28px;height:28px;left:2px!important;top:0!important;background:none!important}
      .ask-title-row>.ask-polish-title-icon{position:absolute;left:0;top:0;width:29px;height:29px;color:#1769e8}
      .ask-polish-title-icon svg,.ask-polish-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .ask-state-starters button{display:grid!important;grid-template-columns:24px minmax(0,1fr)!important;gap:14px!important;align-items:center!important;padding:10px 8px!important;text-align:left!important}
      .ask-state-starters button::before{display:none!important}.ask-polish-icon{width:21px;height:21px;color:#31598f;display:grid;place-items:center}
      .ask-quick-actions-polish button{display:grid!important;grid-template-columns:26px minmax(0,1fr)!important;gap:14px!important;align-items:center!important;padding:11px 14px!important}
      .ask-quick-actions-polish button b{display:none!important}.ask-quick-actions-polish .ask-polish-icon{width:22px;height:22px;color:#1769e8}
      /* Notes: dense activity/feed list */
      .notes-page .note-results{border-top:1px solid #e1e8f1!important}
      .notes-page article.simple-note.note-index-row{position:relative!important;display:grid!important;grid-template-columns:38px minmax(0,1fr) auto!important;column-gap:14px!important;row-gap:0!important;padding:16px 12px!important;margin:0!important;border:0!important;border-bottom:1px solid #e1e8f1!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;min-height:0!important}
      .notes-page article.simple-note.note-index-row::before{display:none!important}
      .note-feed-icon{grid-column:1;grid-row:1 / span 3;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:#f0ebff;color:#7657e8;margin-top:1px}
      .note-feed-icon.is-project{background:#eaf2ff;color:#1769e8}.note-feed-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .notes-page .note-index-main{grid-column:2!important;min-width:0!important}
      .notes-page .note-index-main h3{display:inline!important;margin:0!important;font-size:14px!important;line-height:1.35!important}
      .notes-page .note-date{grid-column:2!important;grid-row:1!important;display:inline!important;position:static!important;margin:0 0 0 8px!important;font-size:11.5px!important;color:#7b879a!important}
      .notes-page .note-date::before{content:'· ';}
      .notes-page .note-source{display:none!important}
      .notes-page .note-index-main p{margin:7px 0 0!important;font-size:13px!important;line-height:1.45!important;color:#5f6c83!important;max-width:920px!important}
      .notes-page .note-expand-label{display:inline-block!important;margin-top:7px!important;font-size:11.5px!important;color:#31598f!important;font-weight:700!important}
      .notes-page .note-index-status{grid-column:3!important;grid-row:1 / span 3!important;align-self:start!important;justify-self:end!important;margin-left:16px!important}
      /* History: color through local accents, not side rails */
      .history-page .history-entry{border-left:0!important;background:transparent!important;padding:18px 0!important;border-radius:0!important;border-bottom:1px solid #e1e8f1!important}
      .history-page .history-entry::before{display:none!important}
      .history-page .history-entry-date{color:#738198!important;font-size:11.5px!important;font-weight:700!important}
      .history-page .history-reason{display:inline-flex!important;align-items:center!important;color:#31598f!important;font-size:11.5px!important}
      .history-page .history-entry h3{font-size:16px!important;margin:5px 0 10px!important}
      .history-page .history-change{gap:10px!important}.history-page .history-change>p{border-radius:10px!important;padding:12px 14px!important}
      body:not(.v88-dark) .history-page .history-change>p:first-child{background:#f7f8fb!important;border-color:#e0e6ee!important}
      body:not(.v88-dark) .history-page .history-change>p:last-child{background:#eef9f3!important;border-color:#cfe9dc!important}
      /* workspace card links use one pattern */
      .workspace-status-card{position:relative!important}.workspace-status-card .state-fact-preview>.text-button{position:absolute!important;top:22px!important;right:22px!important;margin:0!important;font-size:12px!important;font-weight:700!important}
      .workspace-status-card .state-fact-preview{padding-top:2px!important}.workspace-status-card .state-fact-preview p{padding-right:130px!important}
      @media(max-width:760px){.app-sidebar{position:static!important;height:auto!important;padding-bottom:0!important}.attention-item{grid-template-columns:44px minmax(0,1fr) auto!important}.workspace-status-card .state-fact-preview>.text-button{position:static!important;margin-top:12px!important}.workspace-status-card .state-fact-preview p{padding-right:0!important}}
    `; document.head.appendChild(s);
  }
  function askIcons(){
    const title=document.querySelector('.ask-title-row');
    if(title&&!title.querySelector('.ask-polish-title-icon')){const i=document.createElement('span');i.className='ask-polish-title-icon';i.innerHTML=svg.sparkle;title.prepend(i)}
    const starterIcons=[svg.sparkle,svg.calendar,svg.checkdoc,svg.question];
    document.querySelectorAll('.ask-state-starters button').forEach((b,n)=>{if(n>3||b.querySelector('.ask-polish-icon'))return;const i=document.createElement('span');i.className='ask-polish-icon';i.innerHTML=starterIcons[n]||svg.question;b.prepend(i)});
    const quick=[svg.doc,svg.question,svg.trend];
    document.querySelectorAll('.ask-quick-actions-polish button').forEach((b,n)=>{if(b.querySelector('.ask-polish-icon'))return;const i=document.createElement('span');i.className='ask-polish-icon';i.innerHTML=quick[n]||svg.doc;b.prepend(i)});
  }
  function noteFeed(){
    document.querySelectorAll('.notes-page article.simple-note.note-index-row').forEach(row=>{
      if(row.querySelector(':scope > .note-feed-icon'))return;
      const main=row.querySelector('.note-index-main'), date=row.querySelector(':scope > .note-date'); if(!main)return;
      const source=(main.querySelector('.note-source')?.textContent||main.querySelector('h3')?.textContent||'').trim();
      const i=document.createElement('span');i.className='note-feed-icon'+(/project note/i.test(source)?' is-project':'');i.innerHTML=/slack/i.test(source)?svg.slack:svg.note;row.prepend(i);
      if(date&&main.querySelector('h3')) main.querySelector('h3').after(date);
    });
  }
  function run(){styles();askIcons();noteFeed()}
  let q=false;const schedule=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;run()})};new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();