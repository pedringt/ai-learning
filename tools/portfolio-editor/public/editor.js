// Portfolio editor, in-page layer (#617). Loaded only by the local editor
// server; never deployed. Blocks marked data-edit become editable on click.
(()=>{
  'use strict';
  const API='/__editor/api';
  const LIST=new Set(['UL','OL']);
  let enabled=true,active=null,original='',savedRange=null,status=null;

  const file=(()=>{
    const p=decodeURIComponent(location.pathname).replace(/^\/+/,'');
    if(!p||p.endsWith('/'))return 'index.html';
    return p.endsWith('.html')?p:`${p}.html`;
  })();

  async function call(method,route,body){
    try{
      const r=await fetch(API+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
      return await r.json();
    }catch{return {error:'The editor isn’t running. Open it again from the Dock.'}}
  }

  const el=(tag,props={},...kids)=>{
    const n=Object.assign(document.createElement(tag),props);
    for(const k of kids)n.append(k);
    return n;
  };
  const button=(label,onClick,extra={})=>el('button',{type:'button',textContent:label,onclick:onClick,...extra});

  // ---- Panel ---------------------------------------------------------------
  const msg=el('p',{className:'pe-msg',role:'status'});
  const count=el('p',{className:'pe-count'});
  const publishBtn=button('Publish…',openPublish,{className:'pe-primary'});
  const toggleBtn=button('Editing: on',()=>setEnabled(!enabled));
  const panel=el('aside',{className:'pe-ui pe-panel','aria-label':'Portfolio editor'},
    el('p',{className:'pe-title',textContent:'Portfolio editor'}),count,
    el('div',{className:'pe-row'},publishBtn,button('History',openHistory),toggleBtn),
    msg,
    el('div',{className:'pe-row pe-row-quiet'},button('Close editor',quit,{className:'pe-link'})));

  function say(text,tone=''){msg.textContent=text||'';msg.dataset.tone=tone}

  function render(){
    if(!status)return;
    const n=status.drafts.length;
    count.textContent=n?`${n} unpublished draft${n===1?'':'s'}`:'No unpublished drafts';
    publishBtn.disabled=!n||!status.publishEnabled||status.blocked;
    publishBtn.title=status.publishEnabled?'':'Publishing is turned off for this trial.';
    if(status.blocked){setEnabled(false);toggleBtn.disabled=true;say(status.sync.message,'error')}
    else if(status.sync&&status.sync.offline)say(status.sync.message,'warn');
  }

  async function refresh(){
    const s=await call('GET','/status');
    if(s.error)return say(s.error,'error');
    status=s;render();
  }

  function setEnabled(on){
    if(!on&&active&&!finish(false))return;
    enabled=on;
    document.body.classList.toggle('pe-on',on);
    toggleBtn.textContent=`Editing: ${on?'on':'off'}`;
    if(!on)say('Editing is off. Links work normally.');
    else say('');
  }

  // ---- Toolbar -------------------------------------------------------------
  const keep=e=>e.preventDefault();// keep the text selection when clicking toolbar buttons
  const tool=(label,title,fn)=>button(label,fn,{title,'aria-label':title,onmousedown:keep});
  const toolbar=el('div',{className:'pe-ui pe-toolbar',role:'toolbar','aria-label':'Text formatting'},
    tool('B','Bold',()=>exec('bold')),
    tool('I','Italic',()=>exec('italic')),
    tool('Link','Add or change a link',addLink),
    tool('Unlink','Remove link',()=>exec('unlink')),
    el('span',{className:'pe-sep'}),
    button('Save draft',save,{className:'pe-primary',onmousedown:keep}),
    button('Cancel',()=>finish(true),{onmousedown:keep}));
  toolbar.hidden=true;

  function exec(cmd,value){document.execCommand(cmd,false,value);active&&active.focus()}

  function place(){
    if(!active)return;
    const r=active.getBoundingClientRect(),h=toolbar.offsetHeight||40;
    const top=r.top-h-8<8?r.bottom+8:r.top-h-8;
    toolbar.style.top=`${Math.max(8,Math.min(top,innerHeight-h-8))}px`;
    toolbar.style.left=`${Math.max(8,Math.min(r.left,innerWidth-toolbar.offsetWidth-8))}px`;
  }

  function addLink(){
    const sel=getSelection();
    if(!sel.rangeCount||sel.isCollapsed||!active.contains(sel.anchorNode)){say('Select the words you want to link first.','warn');return}
    savedRange=sel.getRangeAt(0).cloneRange();
    const existing=sel.anchorNode.parentElement&&sel.anchorNode.parentElement.closest('a');
    const url=(prompt('Link address (https://… or a page on this site, like tastemake.html):',existing?existing.getAttribute('href'):'https://')||'').trim();
    sel.removeAllRanges();sel.addRange(savedRange);
    if(!url||url==='https://')return;
    if(/^[a-z][a-z0-9+.-]*:/i.test(url)&&!/^(https?:|mailto:)/i.test(url)){say('Links must start with https://, mailto:, or be a page on this site.','error');return}
    exec('createLink',url);
    if(/^https?:/i.test(url))for(const a of active.querySelectorAll('a')){
      if(a.getAttribute('href')===url&&!a.target){a.target='_blank';a.rel='noopener noreferrer'}
    }
  }

  // ---- Editing a block -----------------------------------------------------
  function start(block){
    active=block;original=block.innerHTML;
    block.contentEditable='true';
    block.spellcheck=true;
    block.classList.add('pe-active');
    toolbar.hidden=false;place();
    block.focus();
    say(LIST.has(block.tagName)?'Editing a list. Press Return for a new item.':'Editing. Save draft when you’re done, or press Esc to cancel.');
  }

  // Returns false if the user chose to keep editing.
  function finish(discard){
    if(!active)return true;
    if(!discard&&active.innerHTML!==original&&!confirm('Discard your unsaved edit to this block?'))return false;
    if(discard||active.innerHTML!==original)active.innerHTML=original;
    active.removeAttribute('contenteditable');
    active.classList.remove('pe-active');
    active=null;toolbar.hidden=true;
    say('');
    return true;
  }

  async function save(){
    if(!active)return;
    const block=active,html=block.innerHTML;
    if(html===original){finish(true);say('No changes to save.');return}
    say('Saving…');
    const r=await call('POST','/save',{file,id:block.dataset.edit,html});
    if(r.error){say(r.error,'error');return}
    original=r.html;block.innerHTML=r.html;// show exactly what was written to the page
    finish(true);
    status={...status,...r};render();
    say(r.changed?'Draft saved.':'No changes to save.','ok');
  }

  document.addEventListener('click',e=>{
    if(!enabled||e.target.closest('.pe-ui'))return;
    if(active&&active.contains(e.target)){if(e.target.closest('a'))e.preventDefault();return}
    const block=e.target.closest('[data-edit]');
    if(!block)return;
    e.preventDefault();e.stopPropagation();
    if(active&&!finish(false))return;
    start(block);
  },true);

  document.addEventListener('keydown',e=>{
    if(!active||!active.contains(e.target))return;
    if(e.key==='Escape'){e.preventDefault();finish(true)}
    else if(e.key==='s'&&(e.metaKey||e.ctrlKey)){e.preventDefault();save()}
    else if(e.key==='Enter'&&!LIST.has(active.tagName)){e.preventDefault();say('Each block is one paragraph or heading. Ask Claude to add a new one.','warn')}
  },true);

  // Paste as plain text so outside formatting can't sneak in.
  document.addEventListener('paste',e=>{
    if(!active||!active.contains(e.target))return;
    e.preventDefault();
    const text=(e.clipboardData.getData('text/plain')||'').replace(/\s*\n\s*/g,' ');
    document.execCommand('insertText',false,text);
  },true);

  addEventListener('scroll',place,{passive:true});
  addEventListener('resize',place);
  addEventListener('beforeunload',e=>{if(active&&active.innerHTML!==original){e.preventDefault();e.returnValue=''}});

  // ---- Dialogs -------------------------------------------------------------
  const dialog=el('dialog',{className:'pe-ui pe-dialog'});
  function show(title,body,actions){
    dialog.replaceChildren(el('h2',{textContent:title}),body,el('div',{className:'pe-row pe-row-end'},...actions));
    if(!dialog.open)dialog.showModal();
  }
  const close=()=>dialog.close();
  const when=d=>new Date(d).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

  function openPublish(){
    if(!status||!status.drafts.length)return;
    const list=el('ul',{className:'pe-list'},...status.drafts.map(d=>el('li',{textContent:d.subject.replace(/^(Content|Restore): /,'')})));
    const note=el('p',{},'Publishing sends these drafts to staging so you can check them at ',
      el('a',{href:status.stagingUrl,target:'_blank',rel:'noopener noreferrer',textContent:'the staging site'}),
      '. Nothing goes public until you approve the staging → main pull request, as usual.');
    show('Publish to staging?',el('div',{},list,note),[button('Cancel',close),button('Publish to staging',doPublish,{className:'pe-primary'})]);
  }

  async function doPublish(){
    show('Publishing…',el('p',{textContent:'Running the site checks and sending your drafts to staging. This can take a minute.'}),[]);
    const r=await call('POST','/publish');
    if(r.error){
      const body=el('div',{},el('p',{textContent:r.error}));
      if(r.output)body.append(el('pre',{className:'pe-output',textContent:r.output.slice(-4000)}));
      show('Not published',body,[button('Close',close)]);
      return refresh();
    }
    status=r;render();
    show('Published to staging',el('p',{},`${r.published} draft${r.published===1?'':'s'} sent. Staging usually updates within a couple of minutes: `,
      el('a',{href:r.stagingUrl,target:'_blank',rel:'noopener noreferrer',textContent:'open staging'}),'.'),[button('Done',close,{className:'pe-primary'})]);
  }

  async function openHistory(){
    const r=await call('GET','/history');
    if(r.error)return say(r.error,'error');
    const rows=r.history.map(c=>el('li',{},
      el('div',{},el('strong',{textContent:c.subject.replace(/^(Content|Restore): /,'')}),
        el('span',{className:'pe-meta',textContent:`${when(c.date)} · ${c.published?'published':'draft'}${c.subject.startsWith('Restore:')?' · undo':''}`})),
      button('Restore',()=>doRestore(c))));
    show('History',rows.length?el('ul',{className:'pe-list pe-history'},...rows):el('p',{textContent:'No edits yet.'}),[button('Close',close)]);
  }

  async function doRestore(c){
    if(!confirm(`Undo this change?\n\n${c.subject.replace(/^(Content|Restore): /,'')}\n\nThe undo is saved as a new draft.`))return;
    const r=await call('POST','/restore',{sha:c.sha});
    if(r.error){show('Couldn’t restore',el('p',{textContent:r.error}),[button('Close',close)]);return}
    close();location.reload();
  }

  async function quit(){
    if(active&&!finish(false))return;
    if(status&&status.drafts.length&&!confirm('Close the editor? Your drafts stay saved, and you can publish them next time.'))return;
    await call('POST','/quit');
    document.body.classList.remove('pe-on');
    panel.replaceChildren(el('p',{className:'pe-title',textContent:'Editor closed'}),el('p',{className:'pe-msg',textContent:'You can close this tab.'}));
  }

  document.body.append(panel,toolbar,dialog);
  document.body.classList.add('pe-on');
  const blocks=document.querySelectorAll('[data-edit]').length;
  if(!blocks)say('Nothing on this page is editable.');
  refresh();
})();
