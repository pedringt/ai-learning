// Settings → Re-check reminders (DEC-026; Paige, Nov 16): the on/off control is a toggle switch built on the native
// checkbox (role="switch"), the copy names Current State items, and turning it on or off saves the same values as
// before. No network, no model calls.
const assert=require('assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const dir=__dirname;

const listeners={};
const elements={};
const document={
  getElementById:id=>elements[id]||null,
  querySelector:()=>null,
  querySelectorAll:()=>[],
  addEventListener:(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn);},
};
const saved=[];
const window={STATE_API:{setProjectRecheckDays:async days=>{saved.push(days);return {state:[],recheck_days:days};}}};
const context={window,document,console,setTimeout,CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;}};
document.dispatchEvent=()=>{};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-settings.js'),'utf8'),context);
const VIEW=window.STATE_SETTINGS_VIEW;

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(e){fail++;console.error('✗',name,'\n ',e.message);}}
const section=r=>VIEW.recheckSectionMarkup({loading:false,failed:false,days:null,overrides:[],...r});

(async()=>{
  await check('the copy names Current State items',()=>{
    const html=section({days:60});
    assert.match(html,/<p>Flag Current State items nobody has confirmed in <select id="settingsRecheckDays"[^>]*>.*<\/select> days\.<\/p>/s);
    assert.ok(!/Flag items nobody/.test(html),'old copy gone');
  });

  await check('the control is a toggle switch on a native checkbox with role="switch" and a visible On/Off label',()=>{
    const html=section({days:60});
    assert.match(html,/<label class="settings-switch"><input type="checkbox" class="settings-switch-input" id="settingsRecheckEnabled" role="switch" aria-label="Re-check reminders" checked><span class="settings-switch-track" aria-hidden="true"><\/span><span class="settings-switch-state">On<\/span><\/label>/);
    // The native checked state is what assistive tech reads; a hand-set aria-checked could go stale before re-render.
    assert.ok(!/aria-checked/.test(html));
  });

  await check('off: unchecked, labelled Off, interval select disabled',()=>{
    const html=section({days:null});
    assert.match(html,/id="settingsRecheckEnabled" role="switch" aria-label="Re-check reminders"><span class="settings-switch-track"/);
    assert.match(html,/<span class="settings-switch-state">Off<\/span>/);
    assert.match(html,/<select id="settingsRecheckDays" aria-label="Re-check interval" disabled>/);
  });

  await check('the switch CSS hides the checkbox but keeps it focusable, and draws on/off and focus from it',()=>{
    const css=fs.readFileSync(path.join(dir,'state-app.css'),'utf8');
    const rule=sel=>{const i=css.indexOf(sel+'{');assert.ok(i>=0,`missing ${sel}`);return css.slice(i,css.indexOf('}',i));};
    assert.match(rule('.settings-switch-input'),/opacity:0/);
    assert.ok(!/display:none|visibility:hidden/.test(rule('.settings-switch-input')),'must stay focusable');
    rule('.settings-switch-input:checked+.settings-switch-track');
    rule('.settings-switch-input:checked+.settings-switch-track::after');
    assert.match(rule('.settings-switch-input:focus-visible+.settings-switch-track'),/outline:2px solid/);
  });

  await check('turning it on or off saves the same values as before',async()=>{
    const fire=target=>listeners.change.forEach(fn=>fn({target}));
    elements.settingsRecheckDays={value:'90'};
    fire({id:'settingsRecheckEnabled',checked:true});
    elements.settingsRecheckDays={value:''};
    fire({id:'settingsRecheckEnabled',checked:true});
    fire({id:'settingsRecheckEnabled',checked:false});
    elements.settingsRecheckEnabled={checked:true};
    fire({id:'settingsRecheckDays',value:'30'});
    await new Promise(r=>setTimeout(r,0));
    assert.deepEqual(saved,[90,60,null,30]);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
