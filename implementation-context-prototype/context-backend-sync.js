(() => {
  const norm = s => String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const todayISO = () => { const d=new Date(); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const OPEN_ITEMS_VIEW = window.STATE_OPEN_ITEMS_VIEW;

  const askTopicTerms={
    'feature-access':['feature access','plan access','entitlement','entitlements','grandfathered','plan matrix'],
    'automation':['automation','automate','automatically','autonomy','autonomous','auto send','auto-send','send replies','send responses'],
    'security':['security','human review','review boundary','unsafe','high risk','high-risk','read only','read-only','account changing','account-changing'],
    'success-metrics':['evaluation','evaluate','metrics','success metric','threshold','quality'],
    'data':['data','retention','deletion','logging','customer data','account changing','account-changing','write action','write actions','read only','read-only'],
    'vendor':['vendor','maya','retention','sub processor','sub-processor'],
    'operations':['training','enablement','implementation','rollout','feedback'],
    'scope':['pilot scope','scope','tier 1','tier1'],
    'workflow':['workflow','human review','draft','rep review'],
    'knowledge':['knowledge','grounding','source','sources','documentation','slack']
  };
  function askTopics(q){
    return Object.entries(askTopicTerms).filter(([,terms])=>terms.some(t=>q.includes(t))).map(([topic])=>topic);
  }

  const demoEvidenceDates={
    'demo-review-access-evidence':'2026-08-27T16:10:00',
    'demo-review-launch-evidence':'2026-08-28T09:30:00',
    'demo-review-escalation-evidence':'2026-08-28T13:45:00',
    'demo-review-retention-evidence':'2026-08-29T10:20:00'
  };
  function evidenceDisplayTimestamp(e){return e?.source_type==='demo_seed'&&demoEvidenceDates[e.id]?demoEvidenceDates[e.id]:e?.submitted_at;}

  function reviewTypeTitle(type){
    if(type==='state_at_risk') return 'Current State may be at risk';
    if(type==='missing_understanding') return 'More understanding is needed';
    if(type==='open_question') return 'Question to track';
    return 'Review needed';
  }

  function proposedText(proposals){
    if(!proposals?.length) return 'Review the evidence and decide whether Current State should change.';
    return proposals.map(p=>p.operation==='retire' ? `Retire current understanding${p.state_item_id?` (${p.state_item_id})`:''}` : p.proposed_statement).join(' • ');
  }

  function mapApiReview(r, fallbackEvidence=''){
    const proposals=(r.proposals||[]).filter(p=>!p.status || p.status==='pending');
    const affected=r.affected_state_items||[];
    const current=r.review_type==='open_question'
      ? 'Current State will stay unchanged. This Review is about tracking an unknown.'
      : affected.length
      ? affected.map(x=>x.statement).join(' • ')
      : proposals.some(p=>p.operation==='create')
        ? 'No matching Current State item exists yet.'
        : 'No Current State change has been applied yet.';
    const unresolved=r.review_type==='proposed_update'
      ? 'Nothing beyond this proposed change is established by the evidence.'
      : r.decision_question;
    const rationale=proposals.map(p=>p.rationale).filter(Boolean).join(' ');
    return {
      id:r.id,
      backendReviewId:r.id,
      evidenceId:r.evidence_id,
      topics:affected.map(x=>x.topic).filter(Boolean),
      status:'pending',
      title:reviewTypeTitle(r.review_type),
      summary:r.decision_question,
      proposed:proposedText(proposals),
      questionToCreate:r.question_to_create||null,
      unresolved,
      current,
      evidence:r.evidence_content||fallbackEvidence,
      evidenceSourceType:r.evidence_source_type||'',
      // Only an explicit backend resolves_question_ids counts as a resolving
      // link -- a review is never inferred to resolve a question just
      // because its evidence happened to come from answering one (that used
      // to fall back to a caller-supplied questionId here; removed 2026-09-07
      // after a live-testing review found it could show "Answer found ·
      // Awaiting review" even when the backend returned no such relationship
      // at all). "Answer found · Awaiting review" must only appear when the
      // backend actually says so.
      resolvesQuestionIds:[...(r.resolves_question_ids||[])],
      resolvesQuestionId:(r.resolves_question_ids||[])[0],
      establishes:rationale||r.why_consequential,
      doesNot:r.review_type==='proposed_update'
        ? 'The proposed change does not become Current State until you accept it.'
        : 'The evidence does not automatically resolve the uncertainty or change Current State.',
      whyConsequential:r.why_consequential,
      reviewType:r.review_type,
      proposals,
      affectedStateItems:affected,
      // Structural pointer only -- software never decides that a
      // differently-typed open Review touching the same State item/Question
      // is "the same decision" as this one (see review_service.py's
      // _related_open_review_refs). Surfaced so a reviewer looking at one
      // Review can see a related one exists, added 2026-09-13 after a
      // staging finding where new evidence created a second open Review on
      // the same topic with no way to notice the first one from either.
      relatedOpenReviews:(r.related_open_reviews||[]).map(x=>({id:x.id,reviewType:x.review_type,decisionQuestion:x.decision_question})),
    };
  }

  // toFront defaults to true for the live "I just submitted evidence and it
  // produced a Review" call sites, where showing the newest review first is
  // the right UX. Bulk hydration passes toFront:false -- appending in the
  // order the loop encounters them (the backend's own consequentiality
  // order, see list_reviews) -- because calling this per-review with the
  // default unshift inside a hydration loop silently reverses that order:
  // Workspace's attention list then disagreed with Ask about what mattered
  // most, since Ask fetches reviews fresh and never goes through this
  // reversal. Found via live QA 2026-09-07.
  function upsertBackendReview(reviews,review,{toFront=true}={}){
    const existingIndex=reviews.findIndex(x=>x.id===review.id);
    if(existingIndex>=0){
      reviews[existingIndex]={...reviews[existingIndex],...review};
      return reviews[existingIndex];
    }
    if(toFront) reviews.unshift(review); else reviews.push(review);
    return review;
  }

  function replaceBackendOpenReviews(reviews,rawReviews){
    const openIds=new Set((rawReviews||[]).map(r=>r.id));
    return reviews.filter(r=>!r.backendReviewId || openIds.has(r.backendReviewId));
  }

  /* ----------------------------------------------------------------------
     Backend mapping and sync

     Translates API payloads into the client's shape and reconciles them with
     local state. Nothing here decides anything; it only mirrors the server.
     ------------------------------------------------------------------- */
  function inferProjectArea(item){
    const text=norm(`${item.topic||''} ${item.statement||''}`);
    if(/security|risk|data|privacy|human review|sensitive|claim|read only|readonly|account change|refund|ownership change|autonomy|vip/.test(text)) return 'safety';
    if(/evaluation|metric|launch|rollout|timeline|phase|pilot date|threshold/.test(text)) return 'evaluation';
    return 'product';
  }

  function titleForStateItem(item){
    if(item.topic && item.topic!=='uncategorized') return item.topic;
    const first=String(item.statement||'').split(/[.!?]/)[0].trim();
    return first.length && first.length<=64 ? first : 'Reviewed understanding';
  }

  function formatBackendDate(value){
    if(!value)return '';
    const d=new Date(value); if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  function sourceLabel(source){
    if((source||'').startsWith('question_response:'))return 'Question response';
    if(source==='working_note')return 'Working note';
    if(source==='demo_history'||source==='demo_seed')return 'Project note';
    if(source==='manual_note')return 'Project update';
    return String(source||'Note').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
  // topicName is looked up from state.data.knowledge (may be a retired item
  // by the time this renders, but syncApiState marks items retired rather
  // than deleting them, so the topic label survives). A generic fallback
  // headline like "Current understanding updated" told a scanning user
  // nothing about what actually changed -- every entry looked the same.
  // Found via live QA 2026-09-07.
  function historyType(item,topicName){
    const verb=item.transition_type==='created'?'established':item.transition_type==='retired'?'retired':'updated';
    return topicName?`${topicName} ${verb}`:`Current understanding ${verb}`;
  }
  function syncApiHistory(knowledge,notes,items){
    // Internal record ids (k-rollout, q-retention, ...) must never reach
    // user-facing History copy -- reuses the same stripping OPEN_ITEMS_VIEW
    // already applies to review text, rather than a third duplicate regex.
    const clean=value=>OPEN_ITEMS_VIEW?.cleanReviewCopy?OPEN_ITEMS_VIEW.cleanReviewCopy(value):String(value||'');
    const backend=(items||[]).map(h=>{
      const topicName=knowledge.find(k=>k.id===h.state_item_id)?.title;
      return {
        ...h, id:h.id, backendManaged:true, knowledgeId:h.state_item_id,
        date:formatBackendDate(h.changed_at), dateISO:h.changed_at, type:historyType(h,topicName),
        before:clean(h.old_statement)||'Not previously established', after:clean(h.new_statement),
        reason:clean(h.decision_question||h.proposal_rationale)||'Reviewed project evidence',
        decision:'Human accepted this change', evidenceItems:h.evidence_items||[]
      };
    });
    const byEvidence=new Map();
    for(const h of backend){
      for(const e of (h.evidenceItems||h.evidence_items||[])){
        const links=byEvidence.get(e.id)||[]; links.push(h); byEvidence.set(e.id,links);
      }
    }
    for(const n of notes){
      if(!n.evidenceId)continue;
      const links=byEvidence.get(n.evidenceId)||[];
      n.historyIds=links.map(h=>h.id);
      n.historyKnowledgeIds=[...new Set(links.map(h=>h.knowledgeId).filter(Boolean))];
      if(links.length && n.status==='reviewed')n.status='accepted';
    }
    return backend;
  }
  function syncApiEvidence(items,openReviews,resolvedReviews,notes){
    const collect=(reviews)=>{
      const map=new Map();
      for(const r of (reviews||[]))for(const e of (r.evidence_items||[])){const rows=map.get(e.id)||[];rows.push(r);map.set(e.id,rows);}
      return map;
    };
    const openByEvidence=collect(openReviews);
    const resolvedByEvidence=collect(resolvedReviews);
    const backendNotes=(items||[]).map(e=>{
      const open=openByEvidence.get(e.id)||[], resolved=resolvedByEvidence.get(e.id)||[];
      const reviewStatusKnown=Array.isArray(openReviews)&&Array.isArray(resolvedReviews);
      // 'reviewed' means a human actually looked at a Review for this
      // evidence (resolved.length>0), whether or not it changed Current
      // State. That's distinct from 'no_review_needed': the model judged
      // the evidence non-consequential and no Review was ever created, so
      // no human was ever involved. Collapsing these into one status/label
      // (as this used to) reads as "a human reviewed and approved this"
      // for evidence nobody ever reviewed -- exactly the interpret/
      // authorize distinction State's authority model exists to preserve.
      const status=e.processing_status==='failed'?'failed'
        :!reviewStatusKnown?'unknown'
        :open.length?'pending'
        :resolved.some(r=>r.resolution==='updated')?'accepted'
        :resolved.length?'reviewed'
        :e.processing_status==='processed'?'no_review_needed'
        :'working';
      const displayTime=evidenceDisplayTimestamp(e);
      return {id:`api-note-${e.id}`,title:sourceLabel(e.source_type),text:e.content,source:sourceLabel(e.source_type),date:formatBackendDate(displayTime),dateISO:displayTime,submittedISO:displayTime,topics:[],status,reviewId:open[0]?.id||null,reviewIds:open.map(r=>r.id),resolvedReviewIds:resolved.map(r=>r.id),historyIds:[],historyKnowledgeIds:[],evidenceId:e.id,backendManaged:true};
    });
    const local=notes.filter(n=>!n.backendManaged && !n.evidenceId);
    return [...backendNotes,...local];
  }

  function syncApiState(knowledge,items){
    const incoming=items||[];
    const activeIds=new Set(incoming.map(item=>item.id));
    // A non-empty backend State response is authoritative. Fixture knowledge is
    // an offline/demo fallback only; never merge absent fixture facts into a
    // live backend Current State, because that creates two competing truths.
    for(const k of knowledge){
      if(!activeIds.has(k.id)) k.state='retired';
    }
    for(const item of incoming){
      let k=knowledge.find(x=>x.id===item.id);
      if(k){
        k.statement=item.statement;
        k.state='current';
        k.backendManaged=true;
        k.lastConfirmed=formatBackendDate(item.updated_at||item.created_at);
        k.lastConfirmedISO=item.updated_at||item.created_at||todayISO();
      }else{
        knowledge.push({
          id:item.id,
          projectArea:inferProjectArea(item),
          title:titleForStateItem(item),
          topics:item.topic&&item.topic!=='uncategorized'?[norm(item.topic).replace(/\s+/g,'-')]:[],
          statement:item.statement,
          support:[],
          state:'current',
          lastConfirmed:formatBackendDate(item.updated_at||item.created_at),
          lastConfirmedISO:item.updated_at||item.created_at||todayISO(),
          backendManaged:true
        });
      }
    }
  }

  function questionTextKey(value){ return norm(value); }

  function remapQuestionReferences(reviews,oldId,newId){
    if(!oldId || !newId || oldId===newId)return;
    for(const review of reviews){
      if(review.resolvesQuestionId===oldId) review.resolvesQuestionId=newId;
      if(Array.isArray(review.resolvesQuestionIds)) review.resolvesQuestionIds=review.resolvesQuestionIds.map(id=>id===oldId?newId:id);
    }
  }

  function syncApiQuestions(questions,items,reviews){
    const previous=[...questions];
    const backend=(items||[]).map(q=>{
      const fixture=previous.find(x=>!x.backendManaged && questionTextKey(x.text)===questionTextKey(q.text));
      if(fixture) remapQuestionReferences(reviews,fixture.id,q.id);
      return {
        id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,
        origin:q.origin||fixture?.origin||'Added from Workspace',
        created:fixture?.created||formatBackendDate(q.created_at),createdISO:fixture?.createdISO||q.created_at,
        topics:fixture?.topics?.length?fixture.topics:askTopics(norm(q.text)),backendManaged:true
      };
    });
    return backend;
  }

  function syncApiDrafts(notes,items){
    const drafts=(items||[]).map(d=>({id:`draft-${d.id}`,draftId:d.id,title:d.title,text:d.content,source:'Working note',date:formatBackendDate(d.updated_at||d.created_at),dateISO:d.updated_at||d.created_at,topics:[],status:'working',backendDraft:true}));
    const others=notes.filter(n=>!n.backendDraft);
    return [...drafts,...others];
  }

  window.STATE_BACKEND_SYNC = Object.freeze({
    askTopics, askTopicTerms, evidenceDisplayTimestamp,
    mapApiReview, upsertBackendReview, replaceBackendOpenReviews,
    inferProjectArea, titleForStateItem, formatBackendDate, sourceLabel, historyType,
    syncApiHistory, syncApiEvidence, syncApiState,
    questionTextKey, remapQuestionReferences, syncApiQuestions, syncApiDrafts,
  });
})();
