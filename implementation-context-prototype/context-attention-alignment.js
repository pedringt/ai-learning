(() => {
  const id='state-attention-alignment';
  if(document.getElementById(id)) return;
  const s=document.createElement('style');
  s.id=id;
  s.textContent=`
    /* Keep Workspace attention content anchored to the left edge of each row. */
    .workspace-attention .attention-item{
      width:100%!important;
      max-width:none!important;
      margin-left:0!important;
      margin-right:0!important;
      padding-left:18px!important;
      padding-right:18px!important;
      grid-template-columns:52px minmax(0,1fr) auto 22px!important;
      column-gap:14px!important;
      justify-content:stretch!important;
      justify-items:stretch!important;
    }
    .workspace-attention .attention-item .attention-icon{
      grid-column:1!important;
      justify-self:start!important;
      margin:0!important;
    }
    .workspace-attention .attention-item .attention-item-copy{
      grid-column:2!important;
      justify-self:stretch!important;
      align-self:center!important;
      width:100%!important;
      max-width:none!important;
      margin:0!important;
      padding:0!important;
      text-align:left!important;
    }
    .workspace-attention .attention-item .attention-kind{
      grid-column:3!important;
      justify-self:end!important;
      margin-left:14px!important;
    }
    .workspace-attention .attention-item .attention-arrow{
      grid-column:4!important;
      justify-self:end!important;
    }
    @media(max-width:760px){
      .workspace-attention .attention-item{
        padding-left:14px!important;
        padding-right:14px!important;
        grid-template-columns:44px minmax(0,1fr) auto!important;
        column-gap:11px!important;
      }
    }
  `;
  document.head.appendChild(s);
})();
