const PROD='https://state-api-6waw.onrender.com';
const STAGING='https://state-api-staging.onrender.com';

module.exports=async function handler(req,res){
  const env=String(req.query?.env||'production').toLowerCase();
  const base=env==='staging'?STAGING:PROD;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch(base+'/api/admin/quality-analytics',{headers:{'Accept':'application/json'},signal:controller.signal});
    const text=await response.text();
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(!response.ok){
      res.status(response.status).send(text||JSON.stringify({detail:'State quality API request failed'}));
      return;
    }
    res.status(200).send(text);
  }catch(error){
    const timedOut=error?.name==='AbortError';
    res.status(timedOut?504:502).json({detail:timedOut?'State quality API is still waking up':'State quality API unavailable'});
  }finally{
    clearTimeout(timer);
  }
};
