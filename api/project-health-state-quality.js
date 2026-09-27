const PROD='https://state-api-6waw.onrender.com';
const STAGING='https://state-api-staging.onrender.com';

module.exports=async function handler(req,res){
  const env=String(req.query?.env||'production').toLowerCase();
  const base=env==='staging'?STAGING:PROD;
  try{
    const response=await fetch(base+'/api/admin/quality-analytics',{headers:{'Accept':'application/json'}});
    const text=await response.text();
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(!response.ok){
      res.status(response.status).send(text||JSON.stringify({detail:'State quality API request failed'}));
      return;
    }
    res.status(200).send(text);
  }catch(error){
    res.status(502).json({detail:'State quality API unavailable'});
  }
};