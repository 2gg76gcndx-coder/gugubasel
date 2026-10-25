/* Same-URL language selection and browser-local pinned items. No remote service. */
(function () {
  'use strict';
  const dictionary = Object.fromEntries(Object.entries(window.GUGU_DE || {}).map(([k,v])=>[k.normalize('NFKC').replace(/\s+/g,' ').trim(),v]));
  const compactDictionary=Object.fromEntries(Object.entries(dictionary).map(([k,v])=>[k.replace(/\s/g,''),v]));
  const languageKey = 'gugu.language.v1', pinsKey = 'gugu.pins.v1';
  const originals = new WeakMap(), blockOriginals = new WeakMap(), attributeOriginals = new WeakMap();
  const catalog = new Map();
  let language = 'en', pins = new Set(), storageAvailable = true;
  const normal = text => text.replace(/\s+/g, ' ').trim();
  function translated(text) {
    const key = normal(text).normalize('NFKC');
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) return text.replace(text.trim(), dictionary[key]);
    if (key.startsWith('/ ') && dictionary[key.slice(2)]) return '/ '+dictionary[key.slice(2)];
    if (/^\d+% OFF$/.test(key)) return text.replace('OFF', 'RABATT');
    if (/^View .+ at provider$/.test(key)) return key.replace(/^View (.+) at provider$/, '$1 beim Anbieter ansehen');
    if (/^Number \d+$/.test(key)) return key.replace('Number', 'Nummer');
    if (/^\d+ destinations$/.test(key)) return key.replace('destinations', 'Ausflugsziele');
    if (/^\d+ curated ideas for families: discover /.test(key)) return key.replace(/^(\d+) curated ideas for families: discover .*$/, '$1 ausgewählte Tipps für Familien – mit praktischen Infos, Bildern und offiziellen Links.');
    return text;
  }
  function readStorage(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (_) { storageAvailable = false; return fallback; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { storageAvailable = false; }
  }
  function applyLanguage(root) {
    root.querySelectorAll('.autumn-detail-line,[data-food-de],[data-evergreen-de]').forEach(el => {
      // An outer translated block owns its descendants.
      const parent = el.parentElement.closest('.autumn-detail-line,[data-food-de],[data-evergreen-de]');
      if (parent && root.contains(parent)) return;
      if (!blockOriginals.has(el)) blockOriginals.set(el, { html: el.innerHTML, text: normal(el.textContent) });
      const saved = blockOriginals.get(el);
      const german = el.dataset.foodDe || el.dataset.evergreenDe || dictionary[saved.text] || compactDictionary[saved.text.normalize('NFKC').replace(/\s/g,'')];
      if (!german) return;
      if (language === 'de') {
        if (el.dataset.guguTranslated !== 'de') { el.textContent = german; el.dataset.guguTranslated = 'de'; }
      } else if (el.dataset.guguTranslated === 'de') {
        el.innerHTML = saved.html; delete el.dataset.guguTranslated;
      }
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim() || node.parentElement.closest('script,style,svg,[data-gugu-translated="de"],.gugu-lang')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (!originals.has(node)) originals.set(node, node.textContent);
      const english = originals.get(node);
      node.textContent = language === 'de' ? translated(english) : english;
    }
    root.querySelectorAll('[aria-label],[title],[alt]').forEach(el => {
      if (!attributeOriginals.has(el)) attributeOriginals.set(el, Object.fromEntries(['aria-label','title','alt'].filter(a=>el.hasAttribute(a)).map(a=>[a,el.getAttribute(a)])));
      Object.entries(attributeOriginals.get(el)).forEach(([attr, english]) => el.setAttribute(attr, language === 'de' ? translated(english) : english));
    });
  }
  function setLanguage(next, persist) {
    language = next === 'de' ? 'de' : 'en';
    document.documentElement.lang = language;
    applyLanguage(document.body);
    document.querySelectorAll('[data-site-language]').forEach(button => {
      const active = button.dataset.siteLanguage === language;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('label[for=tab-guides] .tab-text').forEach(el=>{el.innerHTML=language==='de'?'Familien<br>ratgeber':'Family<br>Guides';});
    if (persist) writeStorage(languageKey, language);
    syncButtons();
  }
  function titleElement(el) {
    if (el.tagName === 'DETAILS') {
      const summary = el.querySelector(':scope > summary');
      return summary && (summary.querySelector('.guide-link-label,.guide-chapter-title,.brunch-title-wrap') || summary);
    }
    return el.querySelector('.event-name a,.deal-name,.autumn-name-link') || el;
  }
  function cleanClone(el) {
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.pin-button,.autumn-entry-index,.autumn-index-new,.evergreen-new,.rainy-new-pill,.plan-count-pill,.guide-caret,.guide-shines').forEach(x=>x.remove());
    [clone, ...clone.querySelectorAll('*')].forEach(x => {
      x.removeAttribute('id'); x.removeAttribute('data-pin-key');
      [...x.attributes].forEach(a=>{if(a.name.startsWith('on'))x.removeAttribute(a.name);});
    });
    return clone;
  }
  function setupPins() {
    document.querySelectorAll('[data-pin-key]').forEach(el => {
      const key = el.dataset.pinKey;
      const title = titleElement(el);
      const label = cleanClone(title);
      const meta = el.tagName==='DETAILS' ? Object.assign(document.createElement('span'),{textContent:'Family Guides'}) : cleanClone(el.querySelector('.event-meta,.price-stack,.autumn-details-cell'));
      const image = el.querySelector('img');
      if (!catalog.has(key)) catalog.set(key, { el, label, meta, image: image ? image.getAttribute('src') : null, photo:el.style.getPropertyValue('--photo-front'), kind:el.dataset.pinKind });
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'pin-button'; button.dataset.pinRef = key;
      button.innerHTML = '<span aria-hidden="true">📌</span>';
      const host = el.tagName === 'DETAILS' ? el.querySelector(':scope > summary') : el;
      host.classList.add('pin-host'); host.appendChild(button);
    });
  }
  function syncButtons() {
    document.querySelectorAll('[data-pin-ref]').forEach(button => {
      const active = pins.has(button.dataset.pinRef);
      button.classList.toggle('is-pinned', active); button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', (language === 'de' ? (active?'Nicht mehr merken':'Merken') : (active?'Unpin item':'Pin item')));
      button.title = button.getAttribute('aria-label');
    });
    document.querySelectorAll('.pin-count').forEach(el=>{el.textContent=String(pins.size);});
  }
  function renderPins() {
    const list = document.getElementById('pins-list');
    if (!list) return;
    list.replaceChildren();
    pins.forEach(key => {
      const item = catalog.get(key);
      if (!item) return;
      const card = document.createElement('article'); card.className='pinned-preview';
      const photo = document.createElement('div'); photo.className='pinned-photo';
      if(item.image){const img=document.createElement('img');img.src=item.image;img.alt='';img.loading='lazy';photo.appendChild(img);}
      else if(item.photo)photo.style.backgroundImage=item.photo;
      else photo.textContent=item.kind==='event'?'🎟️':item.kind==='product'?'🛍️':'📖';
      const copy=document.createElement('div');copy.className='pinned-copy';
      const open=document.createElement('button');open.type='button';open.className='pinned-open';open.dataset.openPin=key;
      const label=item.label.cloneNode(true);
      // A preview uses one accessible button, without nested provider links.
      label.querySelectorAll('a').forEach(a=>a.replaceWith(...a.childNodes));
      if(label.tagName==='A'){const text=document.createElement('span');text.append(...label.childNodes);open.appendChild(text);}else open.appendChild(label);
      copy.appendChild(open);
      if(item.meta){const meta=document.createElement('div');meta.className='pinned-meta';meta.appendChild(item.meta.cloneNode(true));copy.appendChild(meta);}
      const remove=document.createElement('button');remove.type='button';remove.className='pin-button';remove.dataset.pinRef=key;remove.innerHTML='<span aria-hidden="true">📌</span>';
      card.append(photo,copy,remove);list.appendChild(card);
    });
    const empty=document.getElementById('pins-empty');if(empty)empty.hidden=list.children.length>0;
    applyLanguage(list);syncButtons();
  }
  async function reveal(key) {
    const item=catalog.get(key);if(!item)return;
    const el=item.el,panel=el.closest('.panel'),day=el.closest('.day-panel');
    let radio;
    if(panel?.id==='events-panel')radio=document.getElementById(day?.id==='sun-panel'?'tab-weekend-sun':'tab-weekend-sat');
    else if(panel?.id==='deals-panel')radio=document.getElementById(el.closest('#family-deals-content')?'tab-deals-family':'tab-deals-kids');
    else if(panel?.id==='guides-panel')radio=document.getElementById('tab-guides');
    if(radio){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}
    if(day){const input=document.getElementById(day.id==='sun-panel'?'day-sun':'day-sat');if(input)input.checked=true;}
    const ancestors=[];let ancestor=el;
    while(ancestor){if(ancestor.tagName==='DETAILS')ancestors.unshift(ancestor);ancestor=ancestor.parentElement;}
    // Open outer chapters first; their existing toggle handler closes child chapters.
    // Wait for each toggle before opening its child so the saved item stays visible.
    for (const details of ancestors) {
      if (details.open) continue;
      await new Promise(resolve=>{
        const done=event=>{if(event && event.target!==details)return;details.removeEventListener('toggle',done);resolve();};
        details.addEventListener('toggle',done);details.open=true;setTimeout(done,80);
      });
    }
    requestAnimationFrame(()=>{el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.add('pin-highlight');setTimeout(()=>el.classList.remove('pin-highlight'),2000);});
  }
  function init() {
    try { const saved=JSON.parse(readStorage(pinsKey,'[]'));if(Array.isArray(saved))pins=new Set(saved.filter(x=>typeof x==='string'&&x.startsWith('pin-'))); } catch (_) { pins=new Set(); }
    setupPins();
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-site-language]');
      if(button){event.preventDefault();setLanguage(button.dataset.siteLanguage,true);return;}
      const pin=event.target.closest('[data-pin-ref]');
      if(pin){event.preventDefault();event.stopPropagation();const key=pin.dataset.pinRef;pins.has(key)?pins.delete(key):pins.add(key);writeStorage(pinsKey,JSON.stringify([...pins]));renderPins();syncButtons();
        const status=document.getElementById('pins-status');if(status){status.textContent=storageAvailable?(language==='de'?'Auswahl aktualisiert.':'Pinned items updated.'):(language==='de'?'Für diesen Besuch gespeichert.':'Saved for this visit.');}return;}
      const open=event.target.closest('[data-open-pin]');if(open){event.preventDefault();reveal(open.dataset.openPin);}
    });
    const status=document.createElement('p');status.id='pins-status';status.className='sr-only';status.setAttribute('role','status');document.body.appendChild(status);
    renderPins();setLanguage(readStorage(languageKey,'en'),false);
    const query=new URLSearchParams(location.search);
    if(query.get('tab')==='pinned'){const tab=document.getElementById('tab-pinned');if(tab)tab.checked=true;}
    if(query.get('pin'))reveal(query.get('pin'));
    window.addEventListener('storage',event=>{if(event.key===pinsKey){try{const saved=JSON.parse(event.newValue||'[]');if(Array.isArray(saved))pins=new Set(saved.filter(x=>typeof x==='string'&&x.startsWith('pin-')));}catch(_){}renderPins();syncButtons();}if(event.key===languageKey)setLanguage(event.newValue,false);});
    window.GuguSite={setLanguage,getLanguage:()=>language,getPins:()=>[...pins]};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
