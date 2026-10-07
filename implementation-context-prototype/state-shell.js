(function(){const h=location.hostname;if(h==='state.authenticignorance.site'){location.replace('https://state.contextswitch.tech'+location.pathname+location.search+location.hash);}})();

/* State's own shell behavior.
 * Copied from the portfolio's site-shell.js so the State app no longer depends on the portfolio deployment (#228).
 * The portfolio traffic-analytics loader was removed: State visits must not be counted in portfolio analytics.
 * Portfolio-page patches below are no-ops inside State; trimming them is a separate cleanup. */
(()=>{
  const root=document.documentElement;
  const body=document.body;
  const mobile=document.getElementById('v922MobileNav');

  /* Keep portfolio branding consistent across standalone pages. */
  document.title=document.title
    .replace('AI Learning Portfolio','Context Switch')
    .replace('Applied AI Product Portfolio','Context Switch');
  document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]').forEach(meta=>{
    meta.content=(meta.content||'')
      .replace('AI Learning Portfolio','Context Switch')
      .replace('Applied AI Product Portfolio','Context Switch');
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
      if(!supportingGrid.querySelector('a[href="state-managed-agent-tracing.html"]')){
        const tracing=document.createElement('a');
        tracing.className='card nav-card applied-secondary';
        tracing.href='state-managed-agent-tracing.html';
        tracing.innerHTML='<span class="tag">Agent tracing &amp; authority</span><h3>Debugging a Read-Only Agent</h3><p class="card-intro">A controlled State Question Investigator exercise where tracing showed that the agent found the right evidence but overstated what it established, leading to a targeted authority fix and exact-case retest.</p>';
        const testingCard=supportingGrid.querySelector('a[href="state-testing-debugging.html"]');
        if(testingCard?.nextSibling) supportingGrid.insertBefore(tracing,testingCard.nextSibling); else supportingGrid.appendChild(tracing);
      }
    }
  }

  /* Surface the controlled Managed Agents exercise beside the existing
     reliability and observability references instead of inventing a new
     learning-resource treatment. */
  const learningPage=document.querySelector('[data-page="learn"]');
  if(learningPage&&!learningPage.querySelector('a[href="cheat-sheets/Claude_Managed_Agents_Tracing_Cheat_Sheet.pdf"]')){
    const observability=learningPage.querySelector('a[href="cheat-sheets/State_Learning_Cheat_Sheet_05_Production_Reliability_and_Observability.pdf"]');
    const resourceRow=observability?.closest('.resource-row');
    if(resourceRow){
      const tracingResource=document.createElement('a');
      tracingResource.className='resource-link';
      tracingResource.href='cheat-sheets/Claude_Managed_Agents_Tracing_Cheat_Sheet.pdf';
      tracingResource.target='_blank';
      tracingResource.rel='noopener noreferrer';
      tracingResource.textContent='Managed agents + tracing';
      resourceRow.appendChild(tracingResource);
    }
  }

  /* Keep the eval cheat sheet with the Learning Guide's Quality, Risk &
     Governance material. Reuse the existing resource-row/link classes so it
     behaves like the rest of the learning library on desktop and mobile. */
  if(learningPage&&!learningPage.querySelector('a[href="cheat-sheets/AI_Product_Evals_Cheat_Sheet.pdf"]')){
    const qualityStage=learningPage.querySelector('#quality-evals');
    const practice=qualityStage?.querySelector('.stage-group.practice');
    let resourceRow=qualityStage?.querySelector('.resource-row');
    if(!resourceRow&&practice){
      resourceRow=document.createElement('div');
      resourceRow.className='resource-row';
      practice.insertAdjacentElement('afterend',resourceRow);
    }
    if(resourceRow){
      const evalResource=document.createElement('a');
      evalResource.className='resource-link';
      evalResource.href='cheat-sheets/AI_Product_Evals_Cheat_Sheet.pdf';
      evalResource.target='_blank';
      evalResource.rel='noopener noreferrer';
      evalResource.textContent='AI Product Evals Cheat Sheet';
      resourceRow.appendChild(evalResource);
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

  /* final-freeze-polish.css and this file's two style blocks now load statically from state-app.css (#450). */

  // State is light-only (#229). Its styling is written for light mode and its theme toggle is
  // hidden, so following the browser's dark-mode preference (or a theme saved on this origin by
  // the portfolio) only flipped a handful of rules to dark and left the app half-dark.
  // Never add the dark class.
  body.classList.remove('v88-dark');
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