(() => {
  const svg={book:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22z"/></svg>'};
function nav(){const map={overview:'⌂','project-overview':'▤','open-items':'✓','notes':'▤','history':'↶','settings':'⚙'};document.querySelectorAll('.sidebar-nav .nav-item').forEach(b=>{const labels=b.querySelectorAll(':scope > .nav-label');labels.forEach((x,i)=>{if(i)x.remove()});const icons=b.querySelectorAll(':scope > .nav-icon');icons.forEach((x,i)=>{if(i)x.remove()});if(b.querySelector(':scope > .nav-label'))return;const count=b.querySelector(':scope > .nav-count');const text=[...b.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(!text)return;const label=text.textContent.trim();text.remove();const i=document.createElement('span');i.className='nav-icon';i.textContent=map[b.dataset.view]||'•';const l=document.createElement('span');l.className='nav-label';l.textContent=label;b.prepend(i,l);if(count)b.append(count)})}
function help(){const b=document.querySelector('.demo-help-button');if(!b||b.classList.contains('state-help-card'))return;b.classList.add('state-help-card');b.innerHTML=`<span class="state-help-icon">${svg.book}</span><span class="state-help-copy"><strong>Need help?</strong><span>Learn how State works</span></span>`}
function attention(){document.querySelectorAll('.attention-item').forEach(row=>{const pills=[...row.children].filter(x=>x.classList&&x.classList.contains('attention-kind'));pills.slice(1).forEach(x=>x.remove());if(pills.length)return;const old=row.querySelector('.attention-item-copy .attention-kind');if(old){const pill=old.cloneNode(true);row.appendChild(pill)}})}
function subnav(){document.querySelectorAll('.project-subnav button').forEach(b=>{if(b.classList.contains('active'))b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')})}
// QA follow-up (2026-09-14): factPreview() scraped ".project-page p/li" for
// sample facts, but .project-page only exists while the Current State route
// is actually mounted -- never true on the Workspace page this decorates,
// since the SPA replaces #viewRoot's whole content per view. candidates was
// therefore always empty, and every project, always, fell through to the
// hardcoded `defaults` -- three Northstar-specific sentences baked into
// this file -- confirmed live: Juniper's Workspace dashboard showed
// Northstar's "Rollout begins with a bounded internal pilot..." text
// verbatim. This never worked as "preview real facts" for any project; it
// only ever showed those three fixed sentences, which happened to read as
// plausible content for Northstar specifically. removeFactCounts() hid the
// correct, already-accurate "N established facts" summary specifically to
// make room for this broken replacement -- both removed together restores
// that correct summary as the card's actual content.
function enhance(){nav();help();attention();subnav()}
let q=false;const run=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;enhance()})};new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();