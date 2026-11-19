/* AI Professional Edge renderer (Nov 18 QA): the markdown functions the page used to run only in the browser, shared
   with tools/render_professional_edge.js, which writes the rendered content into ai-professional-edge.html so the
   page's text is in its HTML (crawlers, link previews, no-JavaScript readers). content/ai-professional-edge.md stays
   the source (#263). */
(function (root) {
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const LEAD_LABELS=['Ask:','Key term:','Why:','Useful for:','Product habit:']; const slug=s=>s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 function inline(text){let out=esc(text);out=out.replace(/\*\*([^*]+)\*\*/g,(_,t)=>`<strong>${t}</strong>`);out=out.replace(/\*([^*]+)\*/g,(_,t)=>`<em>${t}</em>`);out=out.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,t,href)=>`<a href="${esc(href)}" rel="noopener" target="_blank">${t}</a>`);for(const label of LEAD_LABELS)out=out.split(`<strong>${label}</strong>`).join(`<strong class="edge-lead">${label}</strong>`);return out}
 function parseMeta(raw){return Object.fromEntries(raw.split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const at=part.indexOf('=');return at===-1?[part,'']:[part.slice(0,at).trim(),part.slice(at+1).trim()]}))}
 function prepareMarkdown(src){
  const lines=src.replace(/\r\n/g,'\n').split('\n');let i=0,pending=null,reviewDate=null;const out=[];
  while(i<lines.length){
   const line=lines[i],review=/^<!--\s*edge-review:\s*(\d{4}-\d{2}-\d{2})\s*-->\s*$/.exec(line),meta=/^<!--\s*edge-meta:\s*([^>]*)-->\s*$/.exec(line);
   if(review){reviewDate=review[1];i++;continue}
   if(meta){pending=parseMeta(meta[1]);i++;continue}
   const heading=/^(#{2,3})\s+/.exec(line);
   if(heading){
    const level=heading[1].length,status=(pending&&pending.status||'active').toLowerCase();pending=null;
    if(status!=='active'){
     i++;
     while(i<lines.length){
      if(/^<!--\s*edge-(?:review|meta):/.test(lines[i])){i++;continue}
      const next=/^(#{2,3})\s+/.exec(lines[i]);
      if(next&&next[1].length<=level)break;
      i++;
     }
     continue
    }
   }
   out.push(line);i++;
  }
  return {markdown:out.join('\n'),reviewDate};
 }
 function formatReviewDate(value){const d=new Date(`${value}T12:00:00Z`);return Number.isNaN(d.getTime())?null:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(d)}
 function renderMarkdown(src){const lines=src.replace(/\r\n/g,'\n').split('\n');let html='',i=0,paragraph=[];const flush=()=>{if(paragraph.length){const text=paragraph.join(' ');const callout=LEAD_LABELS.some(label=>text.startsWith(`**${label}**`));html+=`<p${callout?' class="edge-callout"':''}>${inline(text)}</p>`;paragraph=[]}};while(i<lines.length){const line=lines[i],heading=/^(#{1,3})\s+(.*)$/.exec(line);if(line.trim()===''){flush();i++;continue}if(line.trim()==='---'){flush();html+='<hr>';i++;continue}if(heading){flush();const level=heading[1].length;const id=level===2?` id="${slug(heading[2])}"`:'';html+=`<h${level}${id}>${inline(heading[2])}</h${level}>`;i++;continue}if(/^\d+\.\s+/.test(line)){flush();html+='<ol>';while(i<lines.length&&/^\d+\.\s+/.test(lines[i])){html+=`<li>${inline(lines[i].replace(/^\d+\.\s+/,''))}</li>`;i++}html+='</ol>';continue}if(/^[-*]\s+/.test(line)){flush();html+='<ul>';while(i<lines.length&&/^[-*]\s+/.test(lines[i])){html+=`<li>${inline(lines[i].replace(/^[-*]\s+/,''))}</li>`;i++}html+='</ul>';continue}paragraph.push(line.trim());i++}flush();return html}
/* Nov 18 QA: the Working Vocabulary list ("**Term:** meaning") renders as a two-column glossary table. */
 const GLOSSARY_ID = 'working-vocabulary';
 function glossaryTable(body) {
  const re = new RegExp(`(<h2 id="${GLOSSARY_ID}">[^<]*</h2>)<ul>([\\s\\S]*?)</ul>`);
  return body.replace(re, (whole, heading, items) => {
   const rows = [...items.matchAll(/<li><strong>([\s\S]*?):<\/strong>\s*([\s\S]*?)<\/li>/g)];
   if (!rows.length) return whole;
   return heading + '<table class="edge-glossary"><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody>' +
    rows.map(r => `<tr><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('') + '</tbody></table>';
  });
 }
 const HEADER = /^#\s+[^\n]*\n(?:(?!\n##)[\s\S])*?\n\s*---[ \t]*\n/;
 function renderDocument(text) {
  const prepared = prepareMarkdown(text);
  const reviewLabel = prepared.reviewDate && formatReviewDate(prepared.reviewDate);
  const body = glossaryTable(renderMarkdown(prepared.markdown.replace(HEADER, '').trim()));
  const jump = [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(m => `<a href="#${m[1]}">${m[2].replace(/<[^>]+>/g, '')}</a>`).join('');
  return { body, jump, reviewLabel };
 }
 const api = { renderDocument, renderMarkdown, prepareMarkdown, formatReviewDate };
 if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EdgeRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
