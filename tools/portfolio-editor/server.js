#!/usr/bin/env node
'use strict';
// Local portfolio editor (#617). Serves the portfolio from the editor's own
// clone on 127.0.0.1 and adds an editing layer to the pages. Nothing here is
// deployed: tools/portfolio-editor is in .vercelignore.
//
//   node tools/portfolio-editor/server.js [--content DIR] [--base staging]
//        [--port 4317] [--remote URL] [--no-publish]

const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const {spawnSync}=require('child_process');
const html=require('./lib/html'),g=require('./lib/git');

function args(argv){
  const o={content:path.join(os.homedir(),'code','portfolio-content'),base:'staging',port:4317,
    remote:'https://github.com/pedringt/ai-learning.git',publish:true};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--no-publish')o.publish=false;
    else if(a.startsWith('--'))o[a.slice(2)]=argv[++i];
  }
  o.port=Number(o.port);
  return o;
}

const STAGING_URL='https://ai-learning-git-staging-cairn10.vercel.app/';
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.pdf':'application/pdf','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
const ASSETS=path.join(__dirname,'public');

// The portfolio's own checks, plus the editor marker test (it matches the
// same glob once merged).
function runChecks(dir){
  const suiteDir=path.join(dir,'implementation-context-prototype');
  const suites=fs.existsSync(suiteDir)?fs.readdirSync(suiteDir).filter(f=>/^state-portfolio-.*-tests\.js$/.test(f)).sort():[];
  if(!suites.length)return {ok:false,output:'No portfolio checks were found.'};
  let output='';
  for(const f of suites){
    const r=spawnSync(process.execPath,[f],{cwd:suiteDir,encoding:'utf8',timeout:120000});
    output+=`==> ${f}\n${r.stdout}${r.stderr}`;
    if(r.status!==0)return {ok:false,output};
  }
  return {ok:true,output};
}

function pageLabel(file,name){
  if(name==='index.html')return 'Homepage';
  const t=(file.match(/<title>([^<]*)<\/title>/)||[])[1]||'';
  return t.split(/\s[·|]\s/)[0].trim();
}
const plain=s=>s.replace(/<[^>]*>/g,'').replace(/&[a-z#0-9]+;/gi,m=>({'&amp;':'&','&rsquo;':'’','&lsquo;':'‘','&ldquo;':'“','&rdquo;':'”','&nbsp;':' '}[m]||'')).replace(/\s+/g,' ').trim();

function createServer(opts){
  const dir=path.resolve(opts.content);
  const state={sync:null};
  const resync=fetch=>(state.sync=g.sync({dir,base:opts.base,fetch}));

  function status(){
    let drafts=[];
    try{drafts=g.drafts({dir,base:opts.base})}catch{}
    return {base:opts.base,publishEnabled:opts.publish,stagingUrl:STAGING_URL,drafts,
      sync:state.sync,blocked:!!(state.sync&&!state.sync.ok)};
  }

  const handlers={
    'GET /status':()=>status(),
    'GET /history':()=>({history:g.history({dir,base:opts.base})}),
    'POST /sync':()=>{resync(true);return status()},
    'POST /save':({file,id,html:body})=>{
      if(!Object.hasOwn(html.PAGES,file))return {error:'This page isn’t editable.'};
      if(state.sync&&!state.sync.ok)return {error:state.sync.message};
      const p=path.join(dir,file),src=fs.readFileSync(p,'utf8');
      const r=html.replaceBlock(src,String(id||''),body);
      if(r.error)return {error:r.error};
      if(!r.changed)return {ok:true,changed:false,html:r.html,...status()};
      fs.writeFileSync(p,r.src);
      const snippet=plain(r.html).slice(0,60);
      g.commit(dir,[file],`Content: ${pageLabel(src,file)||file} – “${snippet}${plain(r.html).length>60?'…':''}”`);
      return {ok:true,changed:true,html:r.html,...status()};
    },
    'POST /restore':({sha})=>{
      const r=g.restore({dir,base:opts.base,sha:String(sha||'')});
      return r.ok?{ok:true,...status()}:{error:r.message};
    },
    'POST /publish':()=>{
      if(!opts.publish)return {error:'Publishing is turned off for this trial.'};
      const r=g.publish({dir,base:opts.base,runChecks});
      if(!r.ok){if(r.conflict||r.dirty)state.sync=r;return {error:r.message,output:r.output}}
      state.sync={ok:true};
      return {ok:true,published:r.published,...status()};
    },
    'POST /quit':()=>{setTimeout(()=>process.exit(0),100);return {ok:true}},
    'GET /ping':()=>({ok:true})
  };

  function send(res,code,type,body){
    res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(body);
  }
  const json=(res,code,obj)=>send(res,code,'application/json',JSON.stringify(obj));

  // Only this machine's own pages may call the API (blocks other websites and
  // DNS-rebinding tricks from driving it).
  function trusted(req){
    const hostOk=[`127.0.0.1:${opts.port}`,`localhost:${opts.port}`].includes(req.headers.host);
    const origin=req.headers.origin;
    return hostOk&&(!origin||origin===`http://${req.headers.host}`);
  }

  function serveFile(req,res,urlPath){
    let rel=decodeURIComponent(urlPath).replace(/^\/+/,'');
    if(rel===''||rel.endsWith('/'))rel+='index.html';
    if(rel.split('/').some(s=>s.startsWith('.')))return send(res,404,'text/plain','Not found');
    let p=path.join(dir,rel);
    if(!p.startsWith(dir+path.sep))return send(res,404,'text/plain','Not found');
    if(!fs.existsSync(p)&&fs.existsSync(p+'.html'))p+='.html';// Vercel cleanUrls
    if(!fs.existsSync(p)||fs.statSync(p).isDirectory())return send(res,404,'text/plain','Not found');
    const ext=path.extname(p).toLowerCase();
    let body=fs.readFileSync(p);
    if(ext==='.html'){
      const inject='<link rel="stylesheet" href="/__editor/editor.css"><script src="/__editor/editor.js" defer></script>';
      let s=body.toString('utf8');
      const at=s.lastIndexOf('</body>');
      body=at<0?s+inject:s.slice(0,at)+inject+s.slice(at);
    }
    send(res,200,TYPES[ext]||'application/octet-stream',body);
  }

  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local');
    if(!trusted(req))return send(res,403,'text/plain','Forbidden');
    if(url.pathname.startsWith('/__editor/api/')){
      const h=handlers[`${req.method} ${url.pathname.slice('/__editor/api'.length)}`];
      if(!h)return json(res,404,{error:'Unknown request.'});
      if(req.method==='POST'&&!/^application\/json/.test(req.headers['content-type']||''))return json(res,415,{error:'Expected JSON.'});
      let raw='';
      req.on('data',c=>{raw+=c;if(raw.length>1e6)req.destroy()});
      req.on('end',()=>{
        try{
          const out=h(raw?JSON.parse(raw):{});
          json(res,out.error?400:200,out);
        }catch(e){
          console.error(e);
          json(res,500,{error:'Something went wrong in the editor. Ask Claude to check the editor log.'});
        }
      });
      return;
    }
    if(url.pathname.startsWith('/__editor/')){
      const name=path.basename(url.pathname);
      if(!['editor.js','editor.css'].includes(name))return send(res,404,'text/plain','Not found');
      return send(res,200,TYPES[path.extname(name)],fs.readFileSync(path.join(ASSETS,name)));
    }
    serveFile(req,res,url.pathname);
  });
  return {server,dir,resync};
}

if(require.main===module){
  const opts=args(process.argv.slice(2));
  const dir=path.resolve(opts.content);
  console.log(`[${new Date().toISOString()}] portfolio editor: ${dir} (base ${opts.base}${opts.publish?'':', publish off'})`);
  g.ensureClone({dir,remote:opts.remote,base:opts.base});
  const {server,resync}=createServer(opts);
  const s=resync(true);
  if(!s.ok||s.offline)console.log(s.message);
  server.listen(opts.port,'127.0.0.1',()=>console.log(`listening on http://127.0.0.1:${opts.port}/`));
}

module.exports={createServer,runChecks,args};
