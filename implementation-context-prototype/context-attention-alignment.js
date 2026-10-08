(() => {
  const PASS='r82-final-balance';

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

  // The stage chip's own colors are in state-app.css now (#450). A "Late discovery" pill inside it
  // can only be matched by its text, so that part stays here.
  function normalizeStage(scope=document){
    scope.querySelectorAll?.('.overview-stage *').forEach(el=>{
      if(!/^late discovery$/i.test(el.textContent?.trim()||'')) return;
      important(el,'background','#e8edff');important(el,'background-color','#e8edff');important(el,'color','#4f5f8e');important(el,'border-color','#d9def2');important(el,'box-shadow','none');
    });
  }


  function sync(){
    if(document.documentElement.dataset.stateMobilePass!==PASS) document.documentElement.dataset.stateMobilePass=PASS;
    
    normalizeStage(document);
  }

  let queued=false;
  function schedule(){if(queued) return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();