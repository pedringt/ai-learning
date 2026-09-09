(() => {
  const id='state-attention-alignment';
  if(document.getElementById(id)) return;
  const s=document.createElement('style');
  s.id=id;
  s.textContent=`
    /* The review/question icon already lives inside .attention-item-copy as
       .attention-row-icon. Do not reserve a second empty icon grid column. */
    .workspace-attention .attention-item{
      width:100%!important;
      max-width:none!important;
      margin-left:0!important;
      margin-right:0!important;
      padding-left:18px!important;
      padding-right:18px!important;
      grid-template-columns:minmax(0,1fr) auto 22px!important;
      column-gap:14px!important;
      justify-content:stretch!important;
      justify-items:stretch!important;
    }
    .workspace-attention .attention-item .attention-icon{display:none!important}
    .workspace-attention .attention-item .attention-item-copy{
      grid-column:1!important;
      justify-self:stretch!important;
      align-self:center!important;
      width:100%!important;
      max-width:none!important;
      margin:0!important;
      text-align:left!important;
    }
    .workspace-attention .attention-item .attention-kind{
      grid-column:2!important;
      justify-self:end!important;
      margin-left:14px!important;
    }
    .workspace-attention .attention-item .attention-arrow{
      grid-column:3!important;
      justify-self:end!important;
    }
    @media(max-width:760px){
      .workspace-attention .attention-item{
        padding-left:14px!important;
        padding-right:14px!important;
        grid-template-columns:minmax(0,1fr) auto!important;
        column-gap:11px!important;
      }
      .workspace-attention .attention-item .attention-item-copy{grid-column:1!important}
      .workspace-attention .attention-item .attention-kind{grid-column:2!important;margin-left:8px!important}
    }
  `;
  document.head.appendChild(s);

  /* Final small-screen and record-surface cleanup from manual QA. */
  const lastMileId='state-mobile-last-mile-r70';
  const lastMile=document.createElement('style');
  lastMile.id=lastMileId;
  lastMile.textContent=`
    /* Record-heavy pages use one simple rule: framing stays on the quiet page
       background; the records themselves sit on one full-width white surface. */
    html body .open-items-page .open-items-section{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-head{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-body{
      width:100%!important;
      max-width:none!important;
      background:var(--surface,#fff)!important;
      box-shadow:none!important;
    }
    html body .open-items-page .review-card,
    html body .open-items-page .compact-review,
    html body .open-items-page .review-card-toggle,
    html body .open-items-page .review-card-body,
    html body .open-items-page .open-question-list,
    html body .open-items-page details.open-question-item{
      width:100%!important;
      max-width:none!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    html body .open-items-page .review-card-toggle:hover,
    html body .open-items-page .open-question-row:hover{background:#f8fafc!important}

    html body .notes-page .note-results,
    html body .notes-page #notesList{
      width:100%!important;
      max-width:none!important;
      background:var(--surface,#fff)!important;
      box-shadow:none!important;
    }
    html body .notes-page article.simple-note.note-index-row{
      width:100%!important;
      max-width:none!important;
      background:transparent!important;
    }

    html body .history-page .history-list,
    html body .history-page #historyList{
      width:100%!important;
      max-width:none!important;
      box-sizing:border-box!important;
      padding-top:20px!important;
      background:var(--surface,#fff)!important;
      box-shadow:none!important;
    }
    html body .history-page .history-entry,
    html body .history-page .history-entry-body{background:transparent!important}

    /* Settings header reads as one header row rather than two unrelated lines. */
    html body .settings-page>.page-head{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:28px!important;
    }
    html body .settings-page>.page-head>h2{margin:0!important;flex:0 0 auto!important}
    html body .settings-page>.page-head>p{
      margin:0!important;
      max-width:620px!important;
      line-height:1.45!important;
    }

    /* The stage line is orientation only. A chevron implies a click target. */
    html body .overview-stage .workspace-next-arrow{display:none!important}

    /* Other Sources should stop using a two-column mini-dashboard before the
       layout gets narrow enough to make source names and statuses compete. */
    @media(max-width:900px){
      html body .settings-page .settings-source-grid{
        grid-template-columns:minmax(0,1fr)!important;
        gap:0!important;
      }
      html body .settings-page .settings-source-grid .source-row{
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        gap:8px!important;
        min-width:0!important;
      }
      html body .settings-page .settings-source-grid .source-row>div{
        order:1!important;
        width:100%!important;
        min-width:0!important;
      }
      html body .settings-page .settings-source-grid .source-row>.settings-status{
        order:2!important;
        align-self:flex-start!important;
        margin:0 0 0 26px!important;
        width:max-content!important;
        max-width:calc(100% - 26px)!important;
      }
      html body .settings-page .settings-source-grid .source-title,
      html body .settings-page .settings-source-grid .source-description{
        min-width:0!important;
        max-width:100%!important;
      }
    }

    @media(max-width:760px){
      /* Current State's vertical gap came from an older rule that made the
         fact preview flex:1 with justify-content:space-evenly. On a tall card
         that distributes the subtitle and facts through the available height.
         Collapse it back to normal document flow so the subtitle sits directly
         beneath the header. */
      html body .workspace-status-card{
        position:relative!important;
        display:block!important;
      }
      html body .workspace-status-card>.eyebrow{
        display:flex!important;
        align-items:center!important;
        min-height:40px!important;
        margin:0!important;
        line-height:1.15!important;
      }
      html body .workspace-status-card .workspace-status-body{
        display:block!important;
        flex:0 0 auto!important;
        margin-top:0!important;
      }
      html body .workspace-status-card .state-fact-preview{
        display:block!important;
        flex:0 0 auto!important;
        justify-content:flex-start!important;
        padding-top:2px!important;
      }
      html body .workspace-status-card .state-fact-preview p{
        margin:5px 0 12px!important;
        padding-right:0!important;
        line-height:1.4!important;
      }
      html body .workspace-status-card .state-fact-preview ul{margin:0!important}
      html body .workspace-status-card .state-fact-preview li{
        padding-top:9px!important;
        padding-bottom:9px!important;
      }
      html body .workspace-status-card .state-fact-preview>.text-button{
        position:absolute!important;
        top:23px!important;
        right:18px!important;
        margin:0!important;
      }

      /* Center the attention icon against the actual heading block. */
      html body .workspace-attention .workspace-attention-head>div{
        min-height:40px!important;
        padding-left:48px!important;
        display:flex!important;
        flex-direction:column!important;
        justify-content:center!important;
      }
      html body .workspace-attention .attention-head-icon{
        top:50%!important;
        transform:translateY(-50%)!important;
      }
      html body .workspace-attention .workspace-attention-head h3{margin:0!important}

      /* Notes status labels keep their natural size instead of being squeezed
         by the desktop grid's right-hand status column. */
      html body .notes-page .note-index-status{
        display:flex!important;
        flex-wrap:wrap!important;
        justify-self:start!important;
        align-self:start!important;
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
      }
      html body .notes-page .note-index-status .note-status,
      html body .notes-page .note-index-status .note-status-link{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:flex-start!important;
        width:auto!important;
        max-width:100%!important;
        height:auto!important;
        min-height:26px!important;
        padding:5px 9px!important;
        border-radius:999px!important;
        line-height:1.25!important;
        white-space:normal!important;
        overflow-wrap:normal!important;
        word-break:normal!important;
      }

      html body .settings-page>.page-head{display:block!important}
      html body .settings-page>.page-head>p{margin-top:7px!important;max-width:none!important}

      /* Settings rule form should use the same compact control scale as the rest of Settings. */
      html body .settings-page .settings-rule-form>.btn{
        width:auto!important;
        min-width:0!important;
        height:38px!important;
        min-height:38px!important;
        padding:0 12px!important;
        border-radius:8px!important;
        font-size:12px!important;
        line-height:1.2!important;
        align-self:end!important;
      }
    }
  `;
  document.head.appendChild(lastMile);

  let movingLastMile=false;
  const keepLastMileLast=()=>{
    const style=document.getElementById(lastMileId);
    if(!style||style.parentElement!==document.head||document.head.lastElementChild===style||movingLastMile)return;
    movingLastMile=true;
    document.head.appendChild(style);
    queueMicrotask(()=>{movingLastMile=false;});
  };

  /* A blank Ask should never enter a loading state. Native required validation
     blocks both tapping the arrow and pressing Enter before any older submit listener can run. */
  const syncAskBlankGuard=()=>{
    const input=document.getElementById('askStateDrawerInput');
    const form=input?.closest('[data-review-batch-form="ask"]');
    const submit=form?.querySelector('button[type="submit"]');
    if(!input||!form)return;
    input.required=true;
    const blank=!input.value.trim();
    if(submit){
      submit.disabled=blank;
      submit.setAttribute('aria-disabled',blank?'true':'false');
    }
  };

  /* Ask closes over the same screen position as the portfolio mobile menu.
     Shield that menu before pointerup, because an older capture handler hides
     the drawer during pointerup; without the early shield the browser can then
     retarget the synthetic click to the newly exposed menu underneath. */
  let closeShieldTimer=0;
  const shieldMobileNav=()=>{
    if(!window.matchMedia('(max-width:760px)').matches)return;
    document.body.classList.add('state-ask-close-shield');
    clearTimeout(closeShieldTimer);
    closeShieldTimer=setTimeout(()=>document.body.classList.remove('state-ask-close-shield'),500);
  };
  const shieldStyle=document.createElement('style');
  shieldStyle.textContent='@media(max-width:760px){body.state-ask-close-shield .top-actions{pointer-events:none!important}}';
  document.head.appendChild(shieldStyle);

  const closeTarget=event=>event.target?.closest?.('#askStateDrawer [data-review-batch-action="close-ask"]');
  window.addEventListener('pointerdown',event=>{if(closeTarget(event))shieldMobileNav();},true);
  window.addEventListener('touchstart',event=>{if(closeTarget(event))shieldMobileNav();},{capture:true,passive:true});
  document.addEventListener('input',event=>{
    if(event.target?.id==='askStateDrawerInput')syncAskBlankGuard();
  },true);
  document.addEventListener('click',event=>{
    if(closeTarget(event))shieldMobileNav();
  },true);

  const sync=()=>{keepLastMileLast();syncAskBlankGuard();};
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
