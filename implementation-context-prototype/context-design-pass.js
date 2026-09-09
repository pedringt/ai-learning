(() => {
  const svg = {
    book:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22z"/></svg>',
    sparkle:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.4 4.1 4.1 1.4-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>'
  };

  function styles(){
    if(document.getElementById('state-design-pass')) return;
    const s=document.createElement('style'); s.id='state-design-pass'; s.textContent=`
      :root{--state-blue:#1769e8;--state-blue-soft:#eaf2ff;--state-line:#e0e7f1;--state-ink:#101a31;--state-muted:#64718a}
      body:not(.v88-dark) .prototype-productbar{background:#f7faff!important;border-color:#dfe7f2!important;color:#334766!important}
      body:not(.v88-dark) .prototype-productbar .product-mark{color:var(--state-blue)!important}
      body:not(.v88-dark) .prototype-productbar .product-name{color:#12213d!important}
      body:not(.v88-dark) .prototype-productbar .product-tagline{color:#687791!important}
      .sidebar-nav .nav-item{display:grid!important;grid-template-columns:28px minmax(0,1fr) auto!important;column-gap:12px!important;text-align:left!important}
      .sidebar-nav .nav-item>.nav-icon{grid-column:1}.sidebar-nav .nav-item>.nav-label{grid-column:2}.sidebar-nav .nav-item>.nav-count{grid-column:3}
      .project-nav-group>.nav-item{width:100%!important}
      body:not(.v88-dark) .project-subnav button.active,body:not(.v88-dark) .project-subnav button[aria-current="true"]{background:var(--state-blue-soft)!important;color:#145cc4!important}
      body:not(.v88-dark) .project-subnav button:hover{background:#f1f5fb!important}
      .demo-help-button.state-help-card{display:grid!important;grid-template-columns:30px 1fr!important;gap:10px!important;align-items:center!important;text-align:left!important;padding:12px 13px!important;border:1px solid #e2e8f1!important;border-radius:11px!important;background:#f7f9fc!important;color:var(--state-ink)!important;box-shadow:none!important}
      .state-help-icon{width:25px;height:25px;color:#52688f}.state-help-icon svg,.ask-polish-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .state-help-copy{display:flex;flex-direction:column;gap:2px}.state-help-copy strong{font-size:12px}.state-help-copy span{font-size:10.5px;color:#758198;font-weight:500}
      .attention-item{display:grid!important;grid-template-columns:minmax(0,1fr) auto 18px!important;gap:12px!important}.attention-item-copy{grid-column:1!important}.attention-kind{grid-column:2!important;grid-row:1!important;margin:0!important;align-self:center!important}.attention-arrow{grid-column:3!important;grid-row:1!important;align-self:center!important}
      .attention-item-copy .attention-kind{position:absolute!important;left:-9999px!important}
      .recent-update-row{position:relative!important;padding-left:22px!important}.recent-update-row::before{content:'';position:absolute;left:2px;top:17px;width:8px;height:8px;border-radius:50%;background:#2bbd87;box-shadow:0 0 0 4px #e9f8f2}.recent-update-row:nth-child(3n)::before{background:#2f8ff0;box-shadow:0 0 0 4px #eaf2ff}.recent-update-row:nth-child(3n+1)::before{background:#7d8ca8;box-shadow:0 0 0 4px #f0f3f7}
      .workspace-status-card .workspace-status-body{display:grid!important;gap:0!important}.workspace-status-card .workspace-status-item{display:grid!important;grid-template-columns:minmax(120px,.8fr) minmax(130px,1.2fr)!important;align-items:center!important;gap:14px!important;padding:9px 0!important}.workspace-status-card .workspace-status-value{font-size:12px!important}.workspace-status-card .workspace-status-row{display:contents!important}.workspace-status-card .workspace-status-row>span{font-size:11px!important}.workspace-status-card .workspace-status-row .text-button{grid-column:2!important;justify-self:start!important}.workspace-status-card .workspace-status-item:first-child .workspace-status-value::before{content:'Latest update';display:block;font-size:10px;font-weight:600;color:#758198;margin-bottom:2px}.workspace-status-card .workspace-status-item:nth-child(2) .workspace-status-value::before{content:'Project record';display:block;font-size:10px;font-weight:600;color:#758198;margin-bottom:2px}.workspace-status-card .workspace-status-item:nth-child(3) .workspace-status-value::before{content:'Open items';display:block;font-size:10px;font-weight:600;color:#758198;margin-bottom:2px}
      body:not(.v88-dark) .page-head,body:not(.v88-dark) .open-items-section,body:not(.v88-dark) .notes-page article,body:not(.v88-dark) .history-page article,body:not(.v88-dark) .settings-page section,body:not(.v88-dark) .project-page article{border-color:var(--state-line)!important}
      body:not(.v88-dark) .open-item-label,body:not(.v88-dark) .status-pill{border-radius:999px!important}
      body:not(.v88-dark) .primary-button,body:not(.v88-dark) button.primary{background:var(--state-blue)!important;border-color:var(--state-blue)!important}
      body:not(.v88-dark) a,body:not(.v88-dark) .text-button{--accent:var(--state-blue)}
      body:not(.v88-dark) .ask-state-drawer{background:#fbfdff!important}.ask-state-drawer-head{padding:20px 22px 15px!important}.ask-title-row{position:relative;padding-left:38px!important}.ask-title-row::before{content:'';position:absolute;left:0;top:1px;width:25px;height:25px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231769e8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3 1.4 4.1 4.1 1.4-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'/%3E%3C/svg%3E") center/contain no-repeat}.ask-state-drawer-head h2{font-size:22px!important}.ask-state-description{font-size:12px!important;line-height:1.45!important;color:#64718a!important}.ask-state-drawer-controls{padding:18px 22px!important}.ask-state-drawer-form{position:relative!important;display:block!important}.ask-state-drawer-form input{width:100%!important;min-height:96px!important;padding:14px 52px 50px 14px!important;border-radius:10px!important}.ask-state-drawer-form button{position:absolute!important;right:10px!important;bottom:10px!important;width:36px!important;height:36px!important;border-radius:50%!important;padding:0!important;font-size:0!important}.ask-state-drawer-form button::after{content:'→';font-size:20px!important}.ask-state-starters{display:grid!important;grid-template-columns:1fr!important;gap:2px!important;margin-top:18px!important}.ask-state-starters::before{content:'Try asking about:';font-size:11px;color:#71809a;margin-bottom:5px}.ask-state-starters button{border:0!important;background:transparent!important;border-radius:8px!important;padding:8px 9px 8px 34px!important;position:relative!important;font-size:12px!important}.ask-state-starters button::before{content:'✦';position:absolute;left:10px;color:#536b95}.ask-state-starters button:hover{background:#f2f6fc!important}.ask-state-drawer-controls>p:last-child{border-top:1px solid #e5ebf3;margin-top:18px!important;padding-top:15px!important;font-size:11px!important;color:#758198!important}
      @media(max-width:760px){.attention-item{grid-template-columns:minmax(0,1fr) auto!important}.attention-arrow{display:none!important}.workspace-status-card .workspace-status-item{grid-template-columns:1fr!important}.demo-help-button.state-help-card{display:none!important}}
    `; document.head.appendChild(s);
  }

  function nav(){
    const map={overview:'⌂','project-overview':'▤','open-items':'✓','notes':'▤','history':'↶','settings':'⚙'};
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(b=>{
      if(b.querySelector('.nav-label')) return;
      const count=b.querySelector('.nav-count'); const text=[...b.childNodes].find(n=>n.nodeType===3&&n.textContent.trim()); if(!text)return;
      const label=text.textContent.trim(); text.remove();
      const i=document.createElement('span');i.className='nav-icon';i.textContent=map[b.dataset.view]||'•';
      const l=document.createElement('span');l.className='nav-label';l.textContent=label;
      b.prepend(i,l); if(count)b.append(count);
    });
  }
  function help(){const b=document.querySelector('.demo-help-button');if(!b||b.classList.contains('state-help-card'))return;b.classList.add('state-help-card');b.innerHTML=`<span class="state-help-icon">${svg.book}</span><span class="state-help-copy"><strong>Need help?</strong><span>Learn how State works</span></span>`}
  function attention(){document.querySelectorAll('.attention-item').forEach(row=>{if(row.dataset.designPass)return;row.dataset.designPass='1';const old=row.querySelector('.attention-kind');if(!old)return;const pill=old.cloneNode(true);pill.removeAttribute('style');row.appendChild(pill)})}
  function subnav(){document.querySelectorAll('.project-subnav button').forEach(b=>{if(b.classList.contains('active'))b.setAttribute('aria-current','true')})}
  function enhance(){styles();nav();help();attention();subnav()}
  let q=false;const run=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;enhance()})};new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();