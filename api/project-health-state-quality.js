const PROD='https://state-api-6waw.onrender.com';
const STAGING='https://state-api-staging.onrender.com';

const RUN_FIELDS=[
  'suite','run_kind','build','provider','model_identifier','total','errors',
  'high_severity_failures','precision','recall','false_positives','false_negatives',
  'interpretation_accuracy','ask_grounding','uncertainty_accuracy','open_item_accuracy',
  'authority_accuracy','overall_pass_rate','created_at'
];

function safeFailureDetail(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) return null;
  const result={};
  for(const field of ['scenario_id','category','severity','expected','observed']){
    const item=value[field];
    if(item===null||typeof item==='string') result[field]=item;
  }
  result.failed_checks=Array.isArray(value.failed_checks)
    ?value.failed_checks.filter(item=>typeof item==='string').slice(0,8).map(item=>item.slice(0,80))
    :[];
  return result.scenario_id?result:null;
}

function safeRun(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) return null;
  const result={};
  for(const field of RUN_FIELDS){
    const item=value[field];
    if(item===null||['string','number','boolean'].includes(typeof item)) result[field]=item;
  }
  result.failure_details=Array.isArray(value.failure_details)
    ?value.failure_details.slice(0,16).map(safeFailureDetail).filter(Boolean)
    :[];
  return result;
}

function safeMetric(value){
  if(value===null||value===undefined||value==='') return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function sanitizeQualityAnalytics(payload){
  const live=payload?.live_review_quality||{};
  const controlled=payload?.controlled_evals||{};
  return {
    live_review_quality:{
      resolved_reviews:safeMetric(live.resolved_reviews),
      accepted_as_proposed_rate:safeMetric(live.accepted_as_proposed_rate),
      material_edit_rate:safeMetric(live.material_edit_rate)
    },
    controlled_evals:{
      latest_review_interpretation:safeRun(controlled.latest_review_interpretation),
      latest_ask_quality:safeRun(controlled.latest_ask_quality),
      recent:Array.isArray(controlled.recent)?controlled.recent.slice(0,12).map(safeRun).filter(Boolean):[]
    },
    privacy:{content_included:false}
  };
}

module.exports=async function handler(req,res){
  const env=String(req.query?.env||'production').toLowerCase();
  const base=env==='staging'?STAGING:PROD;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch(base+'/api/admin/quality-analytics',{headers:{'Accept':'application/json'},signal:controller.signal});
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(!response.ok){
      res.status(response.status).json({detail:'State quality API request failed'});
      return;
    }
    const payload=await response.json().catch(()=>null);
    res.status(200).json(sanitizeQualityAnalytics(payload));
  }catch(error){
    const timedOut=error?.name==='AbortError';
    res.status(timedOut?504:502).json({detail:timedOut?'State quality API is still waking up':'State quality API unavailable'});
  }finally{
    clearTimeout(timer);
  }
};
module.exports._test={safeFailureDetail,safeRun,safeMetric,sanitizeQualityAnalytics};
