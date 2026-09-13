
/* v93 shared shell behavior for standalone artifact pages */
(()=>{
  const root=document.documentElement;
  const body=document.body;
  const btn=document.getElementById('v922ThemeToggle');
  const mobile=document.getElementById('v922MobileNav');
  const isDark=()=>body.classList.contains('v88-dark');

  /* Keep the portfolio anonymous for now while still positioning the work as
     applied AI product work rather than only a learning exercise. */
  if(document.title.includes('AI Learning Portfolio')) document.title=document.title.replace('AI Learning Portfolio','Applied AI Product Portfolio');
  document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]').forEach(meta=>{
    if((meta.content||'').includes('AI Learning Portfolio')) meta.content=meta.content.replace('AI Learning Portfolio','Applied AI Product Portfolio');
  });
  document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]').forEach(meta=>{
    if((meta.content||'').toLowerCase().includes('ai learning portfolio')) meta.content=meta.content.replace(/ai learning portfolio/ig,'applied AI product portfolio');
  });
  const homeHero=document.querySelector('[data-page="home"] .hero');
  if(homeHero&&!homeHero.querySelector('.professional-context')){
    const context=document.createElement('p');
    context.className='professional-context';
    context.textContent='QA and project management background, now focused on applied AI product work.';
    homeHero.insertBefore(context,homeHero.firstChild);
  }

  /* Applied Work should show the State family as a coherent set: flagship
     product plus supporting validation and feasibility studies. Reuse the
     existing supporting grid so this stays visually consistent with the page. */
  const portfolioPage=document.querySelector('[data-page="portfolio"]');
  if(portfolioPage){
    const supportingGrid=portfolioPage.querySelector('.applied-secondary-grid');
    if(supportingGrid){
      // index.html's own card already carries the correct href/title/copy as
      // of 2026-09-13 -- this used to rewrite a stale state-ai-search-learning.html
      // href and its text at runtime; kept only as the insertion anchor below.
      const oldCostCard=supportingGrid.querySelector('a[href="state-architecture-cost.html"]');
      if(!supportingGrid.querySelector('a[href="state-testing-debugging.html"]')){
        const testing=document.createElement('a');
        testing.className='card nav-card applied-secondary';
        testing.href='state-testing-debugging.html';
        testing.innerHTML='<span class="tag">State · Validation</span><h3>Testing & Debugging State</h3><p class="card-intro">How I used hands-on testing, AI-assisted automated coverage, and failure investigation to distinguish model, retrieval, implementation, and product-design problems instead of treating every bad AI result as a prompt problem.</p>';
        supportingGrid.insertBefore(testing,oldCostCard||supportingGrid.firstChild);
      }
    }
  }

  /* Keep the validation story precise about the user's actual background:
     hands-on QA was primarily manual; broader testing familiarity came from
     working closely with software teams in project management. */
  const validationHeading=document.querySelector('.flagship-case .section .kicker')&&[...document.querySelectorAll('.flagship-case .section')].find(section=>section.querySelector('.kicker')?.textContent.trim()==='How I validated it');
  if(validationHeading){
    const h2=validationHeading.querySelector('h2');
    const intro=h2?.nextElementSibling;
    if(h2) h2.textContent='My background in QA and project management shaped how I validated State.';
    if(intro?.tagName==='P') intro.textContent='Most of my hands-on QA experience was manual, but working closely with software teams as a project manager gave me familiarity with the broader testing approaches a production product needs. I used AI to help implement more comprehensive coverage, including automated testing I would not have been able to build myself, while I focused on hands-on testing, investigating failures, and deciding whether the product was actually behaving correctly.';
  }

  /* Small shared presentation layer for the final pre-freeze polish. */
  if(!document.querySelector('link[data-final-freeze-polish]')){
    const polish=document.createElement('link');
    polish.rel='stylesheet';
    polish.href=location.protocol==='file:'?'../final-freeze-polish.css':'/final-freeze-polish.css';
    polish.dataset.finalFreezePolish='true';
    document.head.appendChild(polish);
  }

  /* Small high-signal fixes shared by the portfolio shell and State. */
  if(!document.getElementById('portfolio-signal-and-mobile-fixes')){
    const fixes=document.createElement('style');
    fixes.id='portfolio-signal-and-mobile-fixes';
    fixes.textContent=`
      .professional-context{
        margin:0 0 14px!important;
        color:var(--muted)!important;
        font-size:13px!important;
        font-weight:750!important;
        letter-spacing:.02em!important;
      }
      .settings-channel-heading{
        margin-top:18px!important;
        padding-top:16px!important;
        border-top:1px solid var(--line,#e5e5ea)!important;
      }
      .settings-channel-heading strong{display:block;font-size:13px!important;margin-bottom:3px!important;}
      .settings-channel-heading span{display:block;color:var(--muted,#666)!important;font-size:12.5px!important;line-height:1.45!important;}
      .settings-slack .slack-preview{margin-top:8px!important;}
      .settings-slack .slack-preview-row [data-settings-action="toggle-channel"]{white-space:nowrap!important;}

      /* Final State visual refinement. Ask remains persistent but is quieter
         at rest so page-specific work keeps visual priority. */
      .ask-state-launcher{
        right:22px!important;
        bottom:22px!important;
        padding:9px 13px!important;
        font-size:12.5px!important;
        font-weight:750!important;
        box-shadow:0 7px 20px rgba(0,0,0,.12)!important;
        opacity:.52!important;
      }
      .ask-state-launcher:hover,.ask-state-launcher:focus-visible{opacity:.92!important;}

      /* Notes controls read as one toolbar instead of separate filter/search
         islands. The existing controls and behavior stay unchanged. */
      .notes-page .notes-toolbar--stacked{
        grid-template-columns:minmax(0,1fr) minmax(220px,320px)!important;
        gap:10px!important;
        padding:9px!important;
        border:1px solid var(--line)!important;
        border-radius:11px!important;
        background:var(--surface2)!important;
      }
      .notes-page .notes-filter-row{gap:7px!important;min-width:0!important;}
      .notes-page .notes-search{background:var(--surface)!important;}
      .notes-page .notes-status-filter{margin-left:2px!important;padding-left:9px!important;}

      /* Settings is configuration, not a reading canvas. Constrain it to a
         comfortable scan width and keep its heading/description together. */
      .settings-page{max-width:780px!important;margin-left:0!important;margin-right:auto!important;}
      .settings-page>.page-head{display:block!important;}
      .settings-page>.page-head h2{margin-bottom:6px!important;}
      .settings-page>.page-head p{max-width:620px!important;margin:0!important;}
      .settings-page .settings-section{max-width:780px!important;}

      /* Selected navigation must remain unmistakable when another item is
         hovered. Hover is intentionally quieter than the active treatment. */
      .sidebar-nav [data-view]:not(.active):hover,
      .sidebar-nav .nav-parent-toggle:not(.active):hover{
        background:color-mix(in srgb,var(--surface2) 68%,transparent)!important;
        color:var(--ink)!important;
      }
      .sidebar-nav [data-view].active{
        background:var(--accent-soft)!important;
        color:var(--accent)!important;
        font-weight:800!important;
      }

      @media(max-width:760px){
        .ask-state-launcher{
          right:14px!important;bottom:14px!important;width:44px!important;height:44px!important;
          padding:0!important;border-radius:50%!important;font-size:0!important;opacity:.58!important;
        }
        .ask-state-launcher::before{font-size:17px!important;}
        .notes-page .notes-toolbar--stacked{grid-template-columns:1fr!important;padding:8px!important;}
        .notes-page .notes-filter-row{flex-wrap:wrap!important;}
        .notes-page .notes-status-filter{margin-left:0!important;padding-left:0!important;border-left:0!important;}
        .settings-page{max-width:none!important;}
      }
      @media(max-width:640px){
        .notes-page .note-index-status{
          display:inline-flex!important;
          align-items:center!important;
          width:auto!important;
          max-width:100%!important;
          min-height:0!important;
          padding:4px 8px!important;
          line-height:1.2!important;
          white-space:normal!important;
          justify-self:start!important;
        }
      }
    `;
    document.head.appendChild(fixes);
  }

  /* Mobile Learning Guide hardening. Keep expanded stage content inside the
     card bounds instead of letting old negative-offset polish clip it. */
  if(!document.getElementById('learning-mobile-bounds-fix')){
    const learningMobileFix=document.createElement('style');
    learningMobileFix.id='learning-mobile-bounds-fix';
    learningMobileFix.textContent=`
      @media(max-width:640px){
        [data-page="learn"] .learning-stage .stage-body{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;}
        [data-page="learn"] .learning-stage .stage-body > *,[data-page="learn"] .learning-stage .stage-group,[data-page="learn"] .learning-stage .learning-item{min-width:0!important;max-width:100%!important;box-sizing:border-box!important;}
        [data-page="learn"] .learning-stage .stage-group.practice{margin-left:0!important;margin-right:0!important;width:auto!important;max-width:100%!important;}
        [data-page="learn"] .learning-stage .resource-row{min-width:0!important;max-width:100%!important;}
        [data-page="learn"] .learning-stage .resource-link{max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important;}
        [data-page="learn"] .learning-stage .learning-item,[data-page="learn"] .learning-stage .learning-item p,[data-page="learn"] .learning-stage .stage-group.practice p{overflow-wrap:break-word!important;}
      }
    `;
    document.head.appendChild(learningMobileFix);
  }

  const applyIcon=()=>{
    if(!btn)return;
    const dark=isDark();
    btn.textContent=dark?'☀':'☾';
    btn.setAttribute('aria-pressed',dark?'true':'false');
    btn.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
    btn.title=dark?'Switch to light mode':'Switch to dark mode';
  };
  const savedTheme=localStorage.getItem('ai-cs-theme');
  const systemDark=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  if(savedTheme==='dark'||(!savedTheme&&systemDark)) body.classList.add('v88-dark');
  applyIcon();
  if(btn) btn.addEventListener('click',()=>{body.classList.toggle('v88-dark');localStorage.setItem('ai-cs-theme',isDark()?'dark':'light');applyIcon();});
  if(mobile) mobile.addEventListener('change',()=>{ location.href=mobile.value; });
  document.addEventListener('click',e=>{document.querySelectorAll('.secondary-menu[open]').forEach(d=>{if(!d.contains(e.target))d.removeAttribute('open');});});

  const normalizeAuthorityCopy=()=>{
    document.querySelectorAll('.demo-flow-principle').forEach(node=>{if(node.textContent.trim()==='AI interprets → software enforces → people decide') node.textContent='AI interprets → software enforces → people authorize';});
  };

  const polishSlackSettings=()=>{
    const section=document.getElementById('settings-slack');
    if(!section)return;
    const preview=section.querySelector('.slack-preview');
    if(preview&&!section.querySelector('.settings-channel-heading')){
      const heading=document.createElement('div');heading.className='settings-channel-heading';heading.innerHTML='<strong>Approved channels</strong><span>Choose which channel conversations State can use as Evidence.</span>';preview.parentNode.insertBefore(heading,preview);
    }
    section.querySelectorAll('[data-settings-action="toggle-channel"]').forEach(control=>{
      const enabled=control.dataset.enabled==='1';const label=enabled?'Disable channel':'Enable channel';if(control.textContent!==label) control.textContent=label;
      const row=control.closest('.slack-preview-row');const channel=row?.querySelector('strong')?.textContent?.trim();const aria=channel?`${enabled?'Disable':'Enable'} ${channel}`:'';if(aria&&control.getAttribute('aria-label')!==aria) control.setAttribute('aria-label',aria);
    });
  };

  let askPageY=0;let askScrollLocked=false;
  const askDrawerIsOpen=()=>{const drawer=document.getElementById('askStateDrawer');if(!drawer||drawer.hidden||drawer.getAttribute('aria-hidden')==='true') return false;const style=window.getComputedStyle(drawer);return style.display!=='none'&&style.visibility!=='hidden';};
  const lockAskBackground=()=>{if(askScrollLocked)return;askPageY=window.scrollY||window.pageYOffset||0;body.style.position='fixed';body.style.top=`-${askPageY}px`;body.style.left='0';body.style.right='0';body.style.width='100%';body.style.overflow='hidden';askScrollLocked=true;};
  const unlockAskBackground=()=>{if(!askScrollLocked)return;body.style.position='';body.style.top='';body.style.left='';body.style.right='';body.style.width='';body.style.overflow='';askScrollLocked=false;window.scrollTo(0,askPageY);};
  const syncAskBackground=()=>{askDrawerIsOpen()?lockAskBackground():unlockAskBackground();};
  const stateUiObserver=new MutationObserver(()=>{syncAskBackground();polishSlackSettings();normalizeAuthorityCopy();});
  stateUiObserver.observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style']});
  syncAskBackground();polishSlackSettings();normalizeAuthorityCopy();

  const polishAskLauncher=()=>{const launcher=document.querySelector('.ask-state-launcher');if(!launcher)return false;if(!launcher.dataset.sparkleLabel){const label=launcher.textContent.trim().replace(/^✦\s*/, '') || 'Ask State';launcher.textContent=`✦ ${label}`;launcher.dataset.sparkleLabel='true';}return true;};
  if(!polishAskLauncher()){const observer=new MutationObserver(()=>{if(polishAskLauncher())observer.disconnect();});observer.observe(body,{childList:true,subtree:true});window.setTimeout(()=>observer.disconnect(),10000);}
})();
