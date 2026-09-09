(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const todayISO = () => { const d=new Date(); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const isoValue = item => item?.dateISO || item?.createdISO || '';
  const sortDateDesc = (a,b) => isoValue(b).localeCompare(isoValue(a));

  function noteMatchesFilter(n,f){
    if(f==='all') return true;
    if(f==='pending') return n.status==='pending';
    if(f==='reviewed') return n.status==='accepted'||n.status==='reviewed'||n.status==='no_review_needed';
    return n.status==='working'||n.status==='draft'||!!n.backendDraft; // editable draft only
  }

  function localCalendarKey(value){
    if(!value)return null;
    const raw=String(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=new Date(raw);
    if(Number.isNaN(d.getTime()))return null;
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function calendarDayNumber(value){
    const key=localCalendarKey(value);
    if(!key)return null;
    const [year,month,day]=key.split('-').map(Number);
    return Math.floor(Date.UTC(year,month-1,day)/86400000);
  }
  function noteMatchesDate(n,filter){
    if(filter==='all')return true;
    const noteDay=calendarDayNumber(n.dateISO||n.submittedISO);
    const todayDay=calendarDayNumber(todayISO());
    if(noteDay===null||todayDay===null)return false;
    const age=todayDay-noteDay;
    if(age<0)return false;
    if(filter==='today')return age===0;
    if(filter==='7')return age<=6;
    if(filter==='30')return age<=29;
    return true;
  }

  function filteredNotes(notes,ui){
    const activeFilter=ui.notesFilter||'all';
    const dateFilter=ui.notesDateFilter||'all';
    const search=norm(ui.notesSearch||'');
    return notes.filter(n=>
      noteMatchesFilter(n,activeFilter) &&
      noteMatchesDate(n,dateFilter) &&
      (!search||norm(`${n.title} ${n.text} ${n.source}`).includes(search))
    ).sort(sortDateDesc);
  }

  function notesFilterSummary(notes,totalCount,ui){
    const dateLabels={all:'All time',today:'Today','7':'Last 7 days','30':'Last 30 days'};
    const statusLabels={all:'All statuses',draft:'Draft',pending:'In review',reviewed:'Reviewed'};
    const notesSearch=ui.notesSearch||'';
    const parts=[dateLabels[ui.notesDateFilter||'all'],statusLabels[ui.notesFilter||'all']];
    if(notesSearch.trim()) parts.push(`“${notesSearch.trim()}”`);
    const active=(ui.notesDateFilter||'all')!=='all'||(ui.notesFilter||'all')!=='all'||!!notesSearch.trim();
    return `<div class="notes-filter-summary" id="notesFilterSummary" aria-live="polite"><span>Showing <strong>${notes.length}</strong> of ${totalCount} notes · ${parts.map(esc).join(' · ')}</span>${active?'<button class="text-button" data-action="clear-note-filters">Clear filters</button>':''}</div>`;
  }

  function noteStatusLabel(n){
    if(n.status==='pending') return 'In review';
    if(n.status==='accepted') return (n.historyIds||[]).length ? 'Changed Current State' : 'Reviewed';
    if(n.status==='reviewed') return 'Reviewed, no State change';
    if(n.status==='no_review_needed') return 'No review needed';
    if(n.status==='unknown') return 'Status unavailable';
    if(n.status==='failed') return 'Analysis failed';
    return 'Draft';
  }

  function noteStatusControl(n,statusClass){
    if(n.status==='pending' && (n.reviewIds||[]).length){
      const count=n.reviewIds.length;
      return `<button type="button" class="text-button note-review-link" data-action="open-note-reviews" data-note-id="${n.id}" aria-label="Open ${count===1?'the Review':`${count} Reviews`} for this note">Review proposed update${count>1?` · ${count}`:''} →</button>`;
    }
    const status=`<span class="note-status note-status--${statusClass}">${noteStatusLabel(n)}</span>`;
    if(n.status==='accepted' && (n.historyIds||[]).length){
      return `${status}<button type="button" class="text-button note-history-link" data-action="open-note-history" data-note-id="${n.id}" aria-label="View accepted History from this note">View change →</button>`;
    }
    return status;
  }

  function isEditableDraft(n){
    if(n.backendManaged) return false;
    return !['pending','accepted','reviewed','no_review_needed','unknown'].includes(n.status);
  }

  function simpleNote(n,expandedNotes,editingNoteId){
    const expanded=expandedNotes.has(n.id);
    const target=120+((n.id.charCodeAt(2)||7)*17)%111;
    const preview=n.text.length>target?n.text.slice(0,Math.max(80,target-3)).replace(/\s+\S*$/,'')+'…':n.text;
    const editing=editingNoteId===n.id;
    const editable=isEditableDraft(n);
    const statusClass=n.status==='pending'?'pending':(n.status==='accepted'||n.status==='reviewed')?'reviewed':n.status==='no_review_needed'?'no-review-needed':n.status==='failed'?'failed':n.status==='unknown'?'unknown':'draft';
    const statusBadge=noteStatusControl(n,statusClass);
    const reviewAction=n.status==='failed'&&n.evidenceId
      ? `<button class="text-button" data-action="retry-analysis" data-evidence-id="${n.evidenceId}">Retry analysis</button>`
      : !editable
        ? ''
        : `<button class="text-button" data-action="send-note-review" data-note-id="${n.id}">Submit for review</button>`;
    const body=editing
      ? `<div class="note-inline-editor"><input class="dialog-input" id="editNoteTitle-${n.id}" value="${esc(n.title)}" aria-label="Note title"><textarea id="editNoteText-${n.id}" rows="8" aria-label="Note text">${esc(n.text)}</textarea><div class="inline-actions"><button class="btn primary" data-action="save-note-edit" data-note-id="${n.id}">Save changes</button><button class="btn secondary" data-action="cancel-note-edit" data-note-id="${n.id}">Cancel</button></div></div>`
      : expanded
        ? `<p class="note-full-text">${esc(n.text)}</p>${!editable?'<p class="note-immutable-hint"><strong>Submitted note</strong> · Preserved as project evidence and not editable.</p>':''}<div class="inline-actions note-actions">${editable?`<button class="text-button" data-action="edit-note" data-note-id="${n.id}">Edit</button>`:''}${reviewAction}<button class="text-button" data-action="copy-note" data-note-id="${n.id}">Copy</button></div>`
        : `<p>${esc(preview)}</p><span class="note-expand-label">Open note →</span>`;
    return `<article class="simple-note note-index-row ${expanded?'is-expanded':''}" data-action="toggle-note" data-note-id="${n.id}" tabindex="0"><span class="note-date">${esc(n.date)}</span><div class="note-index-main"><h3>${esc(n.title)}</h3><span class="note-source">${esc(n.source)}</span>${body}</div><div class="note-index-status">${statusBadge}</div></article>`;
  }

  function draftNoteRow(n){
    const target=120+((n.id.charCodeAt(2)||7)*17)%111;
    const preview=n.text.length>target?n.text.slice(0,Math.max(80,target-3)).replace(/\s+\S*$/,'')+'…':n.text;
    return `<article class="simple-note note-index-row is-expanded" data-note-id="${n.id}"><span class="note-date">${esc(n.date)}</span><div class="note-index-main"><h3>${esc(n.title)}</h3><span class="note-source">${esc(n.source)}</span><p>${esc(preview)}</p><div class="inline-actions note-actions"><button class="text-button" data-action="send-note-review" data-note-id="${n.id}">Submit for review</button></div></div><div class="note-index-status"><span class="note-status note-status--draft">Draft</span></div></article>`;
  }

  function render(notes,ui){
    const composer=ui.noteComposerOpen?`<section class="note-composer"><input id="newNoteTitle" class="dialog-input" placeholder="Note title" aria-label="Note title"><textarea id="newNoteText" rows="8" aria-label="New note text" placeholder="Write anything you want to keep with the project. Saving a note does not change project state."></textarea><div class="inline-actions"><button class="btn primary" data-action="save-new-note">Save note</button><button class="btn secondary" data-action="cancel-new-note">Cancel</button></div></section>`:'';
    const activeFilter=ui.notesFilter||'all';
    const filters=`<label class="notes-status-filter"><span>Status</span><select id="notesStatusFilter" aria-label="Filter notes by status"><option value="all"${activeFilter==='all'?' selected':''}>All</option><option value="draft"${activeFilter==='draft'?' selected':''}>Draft</option><option value="pending"${activeFilter==='pending'?' selected':''}>In review</option><option value="reviewed"${activeFilter==='reviewed'?' selected':''}>Reviewed</option></select></label>`;
    const dateFilter=ui.notesDateFilter||'all';
    const dateChip=(f,label)=>`<button class="filter${dateFilter===f?' active':''}" data-date-filter="${f}" aria-pressed="${dateFilter===f?'true':'false'}">${label}</button>`;
    const dateFilters=`<div class="filters notes-date-filters" aria-label="Filter notes by date">${dateChip('all','All time')}${dateChip('today','Today')}${dateChip('7','7 days')}${dateChip('30','30 days')}</div>`;
    const notesLoading=[ui.evidenceStatus,ui.draftsStatus].some(status=>status!=='loaded'&&status!=='error');
    const visibleNotes=notesLoading?[]:filteredNotes(notes,ui);
    const liveWarning=ui.evidenceStatus==='error'||ui.draftsStatus==='error'?`<div class="collection-warning"><strong>Some live Notes data is unavailable.</strong><span>${ui.evidenceStatus==='error'?'Saved Evidence could not be loaded. ':''}${ui.draftsStatus==='error'?'Saved drafts could not be loaded.':''}</span><button class="text-button" data-action="retry-hydration">Try again</button></div>`:'';
    return `<section class="page collection-page notes-page"><div class="page-head"><div><span class="eyebrow">Project memory</span><h2>Notes</h2><p class="notes-product-purpose">Keep working notes and browse information State has received. Use Review, Current State, and History for downstream detail.</p><p class="notes-disclosure">Northstar's seed data mixes notes adapted from my real discovery/product work with simulated project notes created to exercise retrieval, review, and maintained-context workflows.</p></div><button class="btn primary notes-add" data-action="new-note">+ New note</button></div>${liveWarning}${composer}${notesLoading?'<p class="workspace-section-hint" role="status">Loading Notes…</p>':`<div class="notes-toolbar notes-toolbar--stacked"><div class="notes-filter-row">${dateFilters}${filters}<span class="notes-result-count" aria-hidden="true">${visibleNotes.length} ${visibleNotes.length===1?'note':'notes'}</span></div><input class="notes-search" id="notesSearch" type="search" placeholder="Search all notes" aria-label="Search notes" value="${esc(ui.notesSearch||'')}">${notesFilterSummary(visibleNotes,notes.length,ui)}</div><div class="note-results simple-notes" id="notesList">${visibleNotes.length?visibleNotes.map(n=>simpleNote(n,ui.expandedNotes,ui.editingNoteId)).join(''):'<div class="empty-state"><h3>Nothing here.</h3><p>No notes match these filters.</p></div>`}</section>`;
  }

  window.STATE_NOTES_VIEW = Object.freeze({render,filteredNotes,notesFilterSummary,simpleNote,draftNoteRow});
})();