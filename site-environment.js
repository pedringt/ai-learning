(function(){
  'use strict';

  function portfolioEnvironment(hostname){
    var host=String(hostname||'').toLowerCase();
    if(host==='www.contextswitch.tech'||host==='contextswitch.tech') return 'production';
    return 'non-production';
  }

  function stateAppUrl(hostname){
    return portfolioEnvironment(hostname)==='production'
      ? 'https://state.contextswitch.tech/'
      : '/implementation-context-prototype/';
  }

  function applyEnvironmentLinks(root){
    var doc=root&&root.document?root.document:root;
    if(!doc||!doc.querySelectorAll)return;
    var hostname=(root&&root.location&&root.location.hostname)||(doc.location&&doc.location.hostname)||'';
    var url=stateAppUrl(hostname);
    doc.querySelectorAll('[data-state-app-link]').forEach(function(link){
      link.setAttribute('href',url);
    });
  }

  if(typeof module==='object'&&module.exports){
    module.exports={portfolioEnvironment,stateAppUrl,applyEnvironmentLinks};
  }

  if(typeof window!=='undefined'&&window.document){
    if(window.document.readyState==='loading'){
      window.document.addEventListener('DOMContentLoaded',function(){applyEnvironmentLinks(window);},{once:true});
    }else{
      applyEnvironmentLinks(window);
    }
  }
})();
