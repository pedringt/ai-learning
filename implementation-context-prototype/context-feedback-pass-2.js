(() => {
  const svg = {
    sparkle:'<svg viewBox="0 0 24 24"><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>',
    calendar:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
    checkdoc:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="m9 14 2 2 4-5"/></svg>',
    question:'<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8 8 0 1 1 21 12z"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-.9.5-1.5 1-1.5 2M12 16h.01"/></svg>',
    doc:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    trend:'<svg viewBox="0 0 24 24"><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></svg>',
    note:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6"/></svg>',
    slack:'<svg viewBox="0 0 24 24"><path d="M9 3a2 2 0 0 1 2 2v4H9a2 2 0 1 1 0-4V3zM21 9a2 2 0 0 1-2 2h-4V9a2 2 0 1 1 4 0h2zM15 21a2 2 0 0 1-2-2v-4h2a2 2 0 1 1 0 4v2zM3 15a2 2 0 0 1 2-2h4v2a2 2 0 1 1-4 0H3z"/></svg>'
  };
  function askIcons(){
    const title=document.querySelector('.ask-title-row');
    if(title&&!title.querySelector('.ask-polish-title-icon')){const i=document.createElement('span');i.className='ask-polish-title-icon';i.innerHTML=svg.sparkle;title.prepend(i)}
    const starterIcons=[svg.sparkle,svg.calendar,svg.checkdoc,svg.question];
    document.querySelectorAll('.ask-state-starters button').forEach((b,n)=>{if(n>3||b.querySelector('.ask-polish-icon'))return;const i=document.createElement('span');i.className='ask-polish-icon';i.innerHTML=starterIcons[n]||svg.question;b.prepend(i)});
    const quick=[svg.doc,svg.question,svg.trend];
    document.querySelectorAll('.ask-quick-actions-polish button').forEach((b,n)=>{if(b.querySelector('.ask-polish-icon'))return;const i=document.createElement('span');i.className='ask-polish-icon';i.innerHTML=quick[n]||svg.doc;b.prepend(i)});
  }
  function noteFeed(){
    document.querySelectorAll('.notes-page article.simple-note.note-index-row').forEach(row=>{
      if(row.querySelector(':scope > .note-feed-icon'))return;
      const main=row.querySelector('.note-index-main'), date=row.querySelector(':scope > .note-date'); if(!main)return;
      const source=(main.querySelector('.note-source')?.textContent||main.querySelector('h3')?.textContent||'').trim();
      const i=document.createElement('span');i.className='note-feed-icon'+(/project note/i.test(source)?' is-project':'');i.innerHTML=/slack/i.test(source)?svg.slack:svg.note;row.prepend(i);
      if(date&&main.querySelector('h3')) main.querySelector('h3').after(date);
    });
  }
  function run(){askIcons();noteFeed()}
  let q=false;const schedule=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;run()})};new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();