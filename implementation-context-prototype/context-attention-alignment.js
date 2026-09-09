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
    .workspace-attention .attention-item .attention-icon{
      display:none!important;
    }
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

  /* Final small-screen cleanup collected from the last manual mobile pass.
     Keep this layer last because several older feedback files intentionally
     use !important while the prototype is being polished. */
  const lastMileId='state-mobile-last-mile-r68';
  const lastMile=document.createElement('style');
  lastMile.id=lastMileId;
  lastMile.textContent=`
    /* Open Items should read as one flat queue, not white cards on a tinted page. */
    html body .open-items-page .review-card,
    html body .open-items-page .compact-review,
    html body .open-items-page .review-card-toggle,
    html body .open-items-page .review-card-body{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .review-card-toggle:hover{background:#f8fafc!important}

    /* The stage line is orientation only. A chevron implies a click target. */
    html body .overview-stage .workspace-next-arrow{display:none!important}

    @media(max-width:760px){
      /* Current State card: make icon, title and supporting copy one compact header. */
      html body .workspace-status-card>.eyebrow{
        display:flex!important;
        align-items:center!important;
        min-height:40px!important;
        padding-left:52px!important;
        margin:0 0 5px!important;
        line-height:1.15!important;
      }
      html body .workspace-status-card>.eyebrow .section-icon{
        top:50%!important;
        transform:translateY(-50%)!important;
      }
      html body .workspace-status-card .workspace-status-body{margin-top:0!important}
      html body .workspace-status-card .workspace-status-item:first-child{padding-top:7px!important}
      html body .workspace-status-card .workspace-status-row{min-width:0!important}
      html body .workspace-status-card .workspace-status-row span{display:block!important;min-width:0!important;overflow-wrap:anywhere!important}

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

      /* Notes status labels need their own natural line height instead of being
         compressed by the row/grid rules used for desktop. */
      html body .notes-page .note-index-status{
        justify-self:start!important;
        align-self:start!important;
        min-width:0!important;
        max-width:100%!important;
      }
      html body .notes-page .note-index-status .note-status{
        display:inline-flex!important;
        align-items:center!important;
        width:auto!important;
        max-width:100%!important;
        height:auto!important;
        min-height:24px!important;
        padding:4px 8px!important;
        border-radius:999px!important;
        line-height:1.25!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
      }

      /* Settings rule form should use the same compact control scale as the
         rest of Settings, rather than a full-height CTA. */
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
     blocks both tapping the arrow and pressing Enter before any older submit
     listener can run. */
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

  /* On touch devices the Ask close control occupies the same screen position
     as the portfolio menu underneath. Keep a very short transparent shield in
     place after close so the release/synthetic click cannot hit that menu. */
  const installCloseShield=()=>{
    if(!window.matchMedia('(max-width:760px)').matches)return;
    document.getElementById('stateAskCloseShield')?.remove();
    const shield=document.createElement('div');
    shield.id='stateAskCloseShield';
    shield.setAttribute('aria-hidden','true');
    Object.assign(shield.style,{position:'fixed',inset:'0',zIndex:'2147483600',background:'transparent',pointerEvents:'auto'});
    const swallow=event=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();};
    ['pointerdown','pointerup','touchstart','touchend','click'].forEach(type=>shield.addEventListener(type,swallow,{capture:true,passive:false}));
    document.body.appendChild(shield);
    setTimeout(()=>shield.remove(),360);
  };

  document.addEventListener('input',event=>{
    if(event.target?.id==='askStateDrawerInput')syncAskBlankGuard();
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest?.('#askStateDrawer [data-review-batch-action="close-ask"]'))installCloseShield();
  },true);

  const sync=()=>{keepLastMileLast();syncAskBlankGuard();};
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
