'use strict';
// HTML helpers for the portfolio editor (#617).
//
// The portfolio is hand-written static HTML with no build step, so the editor
// edits the pages themselves. Editable blocks carry a data-edit="<id>"
// attribute. A save replaces the inner HTML of exactly one block and leaves
// every other byte of the file alone. No dependencies: a small tokenizer is
// enough for these pages.

// Pages in the editor's scope (Paige, Nov 5). The Library view inside
// index.html is deliberately excluded.
const PAGES={
  'index.html':'home',
  'implementation-context.html':'state',
  'tastemake.html':'tastemake',
  'project-health-case-study.html':'project-health',
  'debugging-ai-systems.html':'debugging',
  'legal-ai-governance.html':'legal',
  'meridian.html':'meridian',
  'state-architecture-cost.html':'architecture'
};

const BLOCK_TAGS=new Set(['p','h1','h2','h3','h4','ul','ol','div','dt','dd']);
const LIST_TAGS=new Set(['ul','ol']);
// Inline markup a block may contain. Anything else is unwrapped to its text.
const INLINE_TAGS=new Set(['a','strong','em','b','i','br','span','cite','code','sup','sub','small']);
// Removed together with their content.
const DROP_TAGS=new Set(['script','style','iframe','object','embed','template','svg','math','noscript','textarea','select','button','input','img','video','audio']);

const TOKEN=/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR=/([^\s=\/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(raw){
  const out=[];
  for(const m of (raw||'').matchAll(ATTR))out.push([m[1].toLowerCase(),m[2]??m[3]??m[4]??null]);
  return out;
}
function attr(raw,name){const hit=parseAttrs(raw).find(([k])=>k===name);return hit?hit[1]:undefined}

const escText=s=>s.replace(/&(?!#?[a-zA-Z0-9]+;)/g,'&amp;').replace(/</g,'&lt;');
const escAttr=s=>escText(s).replace(/"/g,'&quot;');

// Links may point at web pages, email addresses, or pages on this site.
function safeHref(href){
  const h=(href||'').trim();
  if(!h)return false;
  if(/^(https?:|mailto:)/i.test(h))return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(h)&&!/^\/\//.test(h);
}

function cleanAttrs(name,raw){
  const kept=[];
  for(const [k,v] of parseAttrs(raw)){
    if(v===null)continue;
    if(k==='class'&&/^[\w\s-]*$/.test(v))kept.push([k,v]);
    else if(name==='a'&&k==='href'&&safeHref(v))kept.push([k,v.trim()]);
    else if(name==='a'&&k==='target'&&v==='_blank')kept.push([k,v]);
    else if(name==='a'&&k==='rel'&&v.split(/\s+/).every(t=>['noopener','noreferrer','nofollow'].includes(t)))kept.push([k,v]);
  }
  if(name==='a'&&!kept.some(([k])=>k==='href'))return null;
  return kept.map(([k,v])=>` ${k}="${escAttr(v)}"`).join('');
}

// Reduce edited HTML to the allowlist. mode is 'inline' for paragraphs and
// headings, 'list' for ul/ol (which may also contain li).
function sanitize(html,mode='inline'){
  const allowed=new Set(INLINE_TAGS);
  if(mode==='list')allowed.add('li');
  const stack=[];
  let out='',last=0,drop=null;
  for(const m of html.matchAll(TOKEN)){
    const text=html.slice(last,m.index);
    last=m.index+m[0].length;
    if(!drop)out+=escText(text);
    if(!m[2])continue;// comment
    const closing=m[1]==='/',name=m[2].toLowerCase();
    if(drop){if(closing&&name===drop)drop=null;continue}
    if(DROP_TAGS.has(name)){if(!closing&&!VOID.has(name)&&!/\/\s*$/.test(m[3]))drop=name;continue}
    if(!allowed.has(name))continue;
    if(name==='br'){if(!closing)out+='<br>';continue}
    if(closing){
      const i=stack.lastIndexOf(name);
      if(i<0)continue;
      while(stack.length>i)out+=`</${stack.pop()}>`;
      continue;
    }
    // A span carrying only browser styling is an editing leftover, not page
    // markup (on the homepage headline a plain span means pink).
    if(name==='span'&&attr(m[3],'style')!==undefined&&attr(m[3],'class')===undefined)continue;
    const attrs=cleanAttrs(name,m[3]);
    if(attrs===null)continue;
    out+=`<${name}${attrs}>`;
    stack.push(name);
  }
  if(!drop)out+=escText(html.slice(last));
  while(stack.length)out+=`</${stack.pop()}>`;
  return out;
}

const hasText=html=>/\S/.test(html.replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/ /g,' '));
const modeFor=tag=>LIST_TAGS.has(tag)?'list':'inline';
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Position of the closing tag that matches an element opened at innerStart.
function closeOf(src,tag,innerStart){
  const re=new RegExp(`<(/?)${escRe(tag)}\\b[^>]*>`,'gi');
  re.lastIndex=innerStart;
  let depth=1,m;
  while((m=re.exec(src))){
    if(m[1])depth--;else if(!/\/\s*>$/.test(m[0]))depth++;
    if(depth===0)return {innerEnd:m.index,end:m.index+m[0].length};
  }
  return null;
}

function findBlock(src,id){
  const re=new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\sdata-edit="${escRe(id)}"[^>]*>`,'g');
  const hits=[...src.matchAll(re)];
  if(hits.length!==1)return {error:hits.length?`The block "${id}" appears more than once on this page.`:`The block "${id}" is no longer on this page.`};
  const m=hits[0],tag=m[1].toLowerCase(),innerStart=m.index+m[0].length;
  const close=closeOf(src,tag,innerStart);
  if(!close)return {error:`The block "${id}" is not closed properly in the page source.`};
  return {tag,mode:modeFor(tag),start:m.index,innerStart,innerEnd:close.innerEnd,inner:src.slice(innerStart,close.innerEnd)};
}

// Replace one block's content. Everything outside the block stays identical.
function replaceBlock(src,id,html){
  const block=findBlock(src,id);
  if(block.error)return block;
  const clean=sanitize(String(html),block.mode).trim();
  if(!hasText(clean))return {error:'A block can’t be left empty. Ask Claude if you want to remove it.'};
  if(clean===block.inner.trim())return {changed:false,html:block.inner,block};
  return {changed:true,html:clean,block,src:src.slice(0,block.innerStart)+clean+src.slice(block.innerEnd)};
}

// Every marked block's current content, by id. Used to restore and replay
// drafts block by block (several blocks often share one long source line, so
// line-based git merges would report false conflicts).
function blockMap(src){
  const map=new Map();
  for(const m of src.matchAll(/\sdata-edit="([^"]+)"/g)){
    const b=findBlock(src,m[1]);
    if(!b.error)map.set(m[1],b.inner);
  }
  return map;
}
function setBlock(src,id,inner){
  const b=findBlock(src,id);
  return b.error?null:src.slice(0,b.innerStart)+inner+src.slice(b.innerEnd);
}

// ---------------------------------------------------------------------------
// Which blocks should be editable. Shared by mark.js (adds markers) and the
// marker test (checks none are missing), so agents adding copy get told to
// mark it.

const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
const RAW=new Set(['script','style','textarea','title']);
const P_CLOSERS=new Set(['address','article','aside','blockquote','details','div','dl','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','main','nav','ol','p','pre','section','table','ul']);
const NESTED_BLOCK=/<(p|div|h[1-6]|ul|ol|dl|dt|dd|section|article|header|footer|aside|figure|table|details|blockquote|nav|svg)\b/i;
// Link cards are allowed: in edit mode a click edits instead of navigating.
const EXCLUDED_TAGS=new Set(['svg','nav','figure','table','button','summary','head','form','label','select']);
// The State illustration and typed rail, navigation, contact links, the
// Meridian flow diagram, and the Library are outside the editor's scope.
const EXCLUDED_CLASS=/(^|\s)(topbar|site-breadcrumb|rd-stage|portfolio-contact|learning-stages?|flow-[\w-]+)(\s|$)/;

function excludedBy(el){
  if(EXCLUDED_TAGS.has(el.tag)||el.block)return true;
  const a=Object.fromEntries(el.attrs);
  if(a['aria-hidden']==='true')return true;
  if(a['data-page']==='learn'||a.id==='learn')return true;
  return EXCLUDED_CLASS.test(a.class||'');
}

// Every block-level candidate in the page, with whether it is in scope.
function scanBlocks(src){
  const out=[],stack=[];
  let m;
  const re=new RegExp(TOKEN.source,'g');
  while((m=re.exec(src))){
    if(!m[2])continue;
    const closing=m[1]==='/',tag=m[2].toLowerCase();
    if(closing){
      const i=stack.map(e=>e.tag).lastIndexOf(tag);
      if(i>=0)stack.length=i;
      continue;
    }
    if(P_CLOSERS.has(tag)){
      const i=stack.map(e=>e.tag).lastIndexOf('p');
      if(i>=0&&!stack.slice(i+1).some(e=>P_CLOSERS.has(e.tag)))stack.length=i;
    }
    if(tag==='li'){
      const i=stack.map(e=>e.tag).lastIndexOf('li');
      const list=Math.max(stack.map(e=>e.tag).lastIndexOf('ul'),stack.map(e=>e.tag).lastIndexOf('ol'));
      if(i>list)stack.length=i;
    }
    const el={tag,attrs:parseAttrs(m[3]),start:m.index,openEnd:m.index+m[0].length,raw:m[3]};
    // A div, or a list whose items hold headings and paragraphs, is a layout
    // container: its children are the editable blocks, not the container.
    const close=BLOCK_TAGS.has(tag)&&!RAW.has(tag)?closeOf(src,tag,el.openEnd):null;
    const inner=close?src.slice(el.openEnd,close.innerEnd):'';
    // A row of buttons is navigation, not copy.
    const linksOnly=close&&!hasText(inner.replace(/<a\b[\s\S]*?<\/a>/gi,''));
    if(close&&!NESTED_BLOCK.test(inner)&&!linksOnly){
      el.block=true;
      out.push({
        tag,start:el.start,openEnd:el.openEnd,inner,
        id:attr(m[3],'data-edit'),
        skip:attr(m[3],'data-edit-skip')!==undefined,
        inScope:!stack.some(excludedBy),
        safe:hasText(inner)&&sanitize(inner,modeFor(tag))===inner.replace(/<br\s*\/>/gi,'<br>')
      });
    }
    if(RAW.has(tag)){
      const end=src.toLowerCase().indexOf(`</${tag}`,el.openEnd);
      re.lastIndex=end<0?src.length:end;
      continue;
    }
    if(VOID.has(tag)||/\/\s*$/.test(m[3]))continue;
    stack.push(el);
  }
  return out;
}

// Problems the marker test reports for one page.
function auditPage(src){
  const blocks=scanBlocks(src),ids=blocks.filter(b=>b.id).map(b=>b.id);
  return {
    marked:ids.length,
    duplicates:[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))],
    missing:blocks.filter(b=>b.inScope&&!b.id&&!b.skip),
    outOfScope:blocks.filter(b=>b.id&&!b.inScope),
    unsafe:blocks.filter(b=>b.id&&!b.safe),
    strayMarkers:(src.match(/\sdata-edit="/g)||[]).length-ids.length
  };
}

module.exports={PAGES,sanitize,safeHref,findBlock,replaceBlock,blockMap,setBlock,scanBlocks,auditPage,hasText};
