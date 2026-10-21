/* Phone page picker: replaces the native <select> menu with one in the site's style.
   The <select> stays in the page, hidden, and remains the source of truth: picking an item sets
   its value and fires "change", so index.html's router and site-shell.js keep working unchanged,
   and without JavaScript the native menu still shows. */
(()=>{
  const valueProp=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');

  const enhance=select=>{
    if(select.dataset.enhanced)return;
    select.dataset.enhanced='true';

    const wrap=document.createElement('div');
    wrap.className='mnav';
    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='mnav-trigger';
    trigger.setAttribute('aria-haspopup','true');
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'Choose page');
    const label=document.createElement('span');
    label.className='mnav-label';
    trigger.appendChild(label);

    const panel=document.createElement('div');
    panel.className='mnav-panel';
    panel.id=select.id+'Menu';
    panel.hidden=true;
    trigger.setAttribute('aria-controls',panel.id);

    const items=[...select.options].map(option=>{
      const item=document.createElement('button');
      item.type='button';
      item.className='mnav-item';
      item.textContent=option.textContent;
      item.addEventListener('click',()=>{
        close(false);
        if(select.value!==option.value){
          select.value=option.value;
          select.dispatchEvent(new Event('change',{bubbles:true}));
        }
      });
      panel.appendChild(item);
      return item;
    });

    const sync=()=>{
      const i=select.selectedIndex;
      label.textContent=select.options[i]?.textContent||'';
      items.forEach((item,n)=>n===i?item.setAttribute('aria-current','page'):item.removeAttribute('aria-current'));
    };
    // The routers set select.value directly (no event), so watch the setter to keep the label current.
    Object.defineProperty(select,'value',{
      configurable:true,
      get(){return valueProp.get.call(this);},
      set(v){valueProp.set.call(this,v);sync();}
    });

    const open=()=>{
      panel.hidden=false;
      wrap.classList.add('open');
      trigger.setAttribute('aria-expanded','true');
      (items[select.selectedIndex]||items[0])?.focus();
    };
    const close=(refocus=true)=>{
      if(panel.hidden)return;
      panel.hidden=true;
      wrap.classList.remove('open');
      trigger.setAttribute('aria-expanded','false');
      if(refocus)trigger.focus();
    };

    trigger.addEventListener('click',()=>panel.hidden?open():close());
    trigger.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();}
    });
    panel.addEventListener('keydown',e=>{
      const i=items.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();
        const step=e.key==='ArrowDown'?1:-1;
        items[(i+step+items.length)%items.length].focus();
      }else if(e.key==='Home'||e.key==='End'){
        e.preventDefault();
        items[e.key==='Home'?0:items.length-1].focus();
      }else if(e.key==='Tab'){
        close(false);
      }
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close(false);});

    wrap.append(trigger,panel);
    select.after(wrap);
    sync();
  };

  document.querySelectorAll('#mobileNav,#v922MobileNav').forEach(enhance);
})();
