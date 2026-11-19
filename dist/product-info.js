(function(root){
  const fields=[['description','Описание'],['result','Результат']];
  const palette={text:{default:'#2c3828',muted:'#78816f',red:'#b54737',amber:'#986515',green:'#397451',blue:'#4f749b',purple:'#80609a'},highlight:{none:'',yellow:'#fff0b3',green:'#dcefd8',blue:'#dceafa',pink:'#f5dfe8'}};
  const allowed=new Set(['P','DIV','BR','B','STRONG','I','EM','S','STRIKE','DEL','UL','OL','LI','A','H3','H4','SPAN','BLOCKQUOTE']);
  const discard=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','FORM','INPUT','BUTTON','TEXTAREA','SELECT']);
  function safeLink(value){
    try{const url=new URL(value.trim());return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
  }
  function rgb(value){
    const probe=document.createElement('span');probe.style.color=value;
    const color=probe.style.color,parts=color.match(/\d+(?:\.\d+)?/g);
    return parts&&parts.length>=3&&(!parts[3]||Number(parts[3])!==0)?parts.slice(0,3).map(Number):null;
  }
  function paletteColor(value,kind){
    const color=rgb(value);if(!color)return '';
    if(kind==='highlight'&&color.every(c=>c>245))return '';
    const values=Object.values(palette[kind]).filter(Boolean);
    return values.reduce((best,v)=>{const distance=rgb(v).reduce((n,c,i)=>n+(c-color[i])**2,0);return distance<best.distance?{value:v,distance}:best;},{value:'',distance:Infinity}).value;
  }
  // Only the documented styles and palette survive paste, rendering and saving.
  function sanitize(html){
    const source=new DOMParser().parseFromString(String(html),'text/html'),out=document.createElement('div');
    function copy(node,parent){
      if(node.nodeType===3){parent.append(document.createTextNode(node.data));return;}
      if(node.nodeType!==1||discard.has(node.tagName))return;
      let tag=node.tagName;
      if(/^H[1-3]$/.test(tag))tag='H3';else if(/^H[4-6]$/.test(tag))tag='H4';
      if(tag==='FONT')tag='SPAN';
      let target=parent;
      if(allowed.has(tag)){
        const href=tag==='A'?safeLink(node.getAttribute('href')||''):null;
        if(tag!=='A'||href){
          target=document.createElement(tag.toLowerCase());
          if(href){target.href=href;target.target='_blank';target.rel='noopener noreferrer';}
          if(['P','DIV'].includes(tag)&&['note','body'].includes(node.getAttribute('data-text-style')))target.dataset.textStyle=node.getAttribute('data-text-style');
          parent.append(target);
        }
      }
      const color=paletteColor(node.style.color||node.getAttribute('color')||'','text');
      const background=paletteColor(node.style.backgroundColor,'highlight');
      if(color||background){
        const span=tag==='SPAN'&&target!==parent?target:document.createElement('span');if(color)span.style.color=color;if(background)span.style.backgroundColor=background;if(span!==target)target.append(span);target=span;
      }
      if(node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600){const b=document.createElement('b');target.append(b);target=b;}
      if(node.style.fontStyle==='italic'){const i=document.createElement('i');target.append(i);target=i;}
      if(node.style.textDecoration.includes('line-through')){const strike=document.createElement('s');target.append(strike);target=strike;}
      for(const child of node.childNodes)copy(child,target);
    }
    for(const node of source.body.childNodes)copy(node,out);
    for(const span of [...out.querySelectorAll('span')])if(!span.hasAttribute('style'))span.replaceWith(...span.childNodes);
    // Interpret the simple legacy structure without rewriting stored descriptions.
    const legacy=[...source.body.children].some(n=>['B','STRONG'].includes(n.tagName))&&[...source.body.querySelectorAll('p')].some(p=>/^(Фичи|Предпосылки|Уверенность|Источник)/.test(p.textContent.trim()));
    if(legacy){
    for(const p of [...out.querySelectorAll('p')]){
      const text=p.textContent.trim();
      if(['Фичи','Проблема','Решение'].includes(text)&&p.querySelector('b,strong')){const h=document.createElement('h4');h.append(...p.childNodes);p.replaceWith(h);}
      else if(!p.hasAttribute('data-text-style')&&/^(Предпосылки|Уверенность|Источник|Трудоёмкость)/.test(text)&&p.querySelector('b,strong'))p.dataset.textStyle='note';
    }
    for(const node of [...out.children])if(node.parentElement===out&&['B','STRONG'].includes(node.tagName)){
      const h=document.createElement('h3');node.before(h);h.append(node);
      while(h.nextSibling&&(h.nextSibling.nodeType===3&&!h.nextSibling.textContent.trim()||['B','STRONG'].includes(h.nextSibling.nodeName)))h.append(h.nextSibling);
    }
    }
    if(!out.textContent.trim()&&!out.querySelector('li'))return '';
    return out.innerHTML;
  }
  class ProductInfo{
    constructor(options){
      this.options=options;this.editing=false;this.product=null;this.range=null;this.editor=null;this.last=new Map();
      const dialog=document.createElement('dialog');this.dialog=dialog;dialog.className='product-info-dialog';
      dialog.setAttribute('aria-labelledby','productInfoTitle');
      dialog.setAttribute('closedby','closerequest');
      dialog.innerHTML=`<header class="product-info-heading"><h2 id="productInfoTitle"></h2><button type="button" class="product-info-edit" aria-pressed="false">Редактировать</button><button type="button" class="product-info-close" aria-label="Закрыть">×</button></header>
        ${fields.map(([key,label])=>`<section class="product-info-field"><h3 id="info-${key}-label">${label}</h3><div class="rich-toolbar" role="toolbar" aria-label="Форматирование: ${label}"><select data-text-style aria-label="Стиль текста"><option value="p">Обычный текст</option><option value="h3">Заголовок инициативы</option><option value="h4">Подзаголовок</option><option value="note">Примечание</option></select><button type="button" data-command="bold" aria-label="Жирный" title="Жирный · Ctrl/⌘+B"><b>B</b></button><button type="button" data-command="italic" aria-label="Курсив" title="Курсив · Ctrl/⌘+I"><i>I</i></button><button type="button" data-command="strikeThrough" aria-label="Зачёркивание" title="Зачёркивание"><s>S</s></button><select data-text-color aria-label="Цвет текста"><option value="">Цвет текста</option>${Object.entries(palette.text).map(([key,color])=>`<option value="${color}" style="color:${color}">${({default:'Основной',muted:'Серый',red:'Красный',amber:'Охра',green:'Зелёный',blue:'Синий',purple:'Фиолетовый'})[key]}</option>`).join('')}</select><select data-text-highlight aria-label="Цвет выделения фона"><option value="">Фон текста</option>${Object.entries(palette.highlight).map(([key,color])=>`<option value="${color||'transparent'}">${({none:'Без выделения',yellow:'Жёлтый',green:'Зелёный',blue:'Голубой',pink:'Розовый'})[key]}</option>`).join('')}</select><button type="button" data-command="link" aria-label="Вставить ссылку" title="Ссылка · Ctrl/⌘+K">↗</button><button type="button" data-command="insertOrderedList" aria-label="Нумерованный список" title="Нумерованный список">1.</button><button type="button" data-command="insertUnorderedList" aria-label="Маркированный список" title="Маркированный список">•</button><button type="button" data-command="clear" aria-label="Очистить оформление" title="Очистить оформление">T×</button></div><div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="info-${key}-label" data-info-field="${key}" spellcheck="true"></div></section>`).join('')}
        <form class="product-link-form" hidden><label for="productLinkUrl">Ссылка</label><input id="productLinkUrl" type="url" placeholder="https://" required><button type="submit">Применить</button><button type="button" data-link-remove>Убрать</button><button type="button" data-link-cancel aria-label="Отмена ссылки">×</button><span class="product-link-error" role="alert"></span></form><footer class="product-info-footer"><span class="product-info-status" role="status"></span><span class="product-info-error" role="alert"></span></footer>`;
      document.body.append(dialog);
      this.editors=[...dialog.querySelectorAll('.rich-editor')];this.linkForm=dialog.querySelector('form');this.linkInput=dialog.querySelector('#productLinkUrl');
      dialog.querySelector('.product-info-close').onclick=()=>this.close();
      dialog.querySelector('.product-info-edit').onclick=()=>this.setEditing(!this.editing);
      dialog.addEventListener('cancel',()=>{this.hideLink();this.options.end();});
      dialog.addEventListener('close',()=>{this.options.end();this.product=null;this.trigger?.focus();});
      for(const editor of this.editors){
        editor.addEventListener('input',e=>{if(!e.isComposing)this.save(editor);});
        editor.addEventListener('compositionend',()=>this.save(editor));
        editor.addEventListener('focus',()=>{this.editor=editor;});
        editor.addEventListener('blur',()=>{this.options.end();});
        editor.addEventListener('keydown',e=>{
          if(!this.editing)return;
          if(this.handleIndentKey(editor,e))return;
          if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();this.remember();this.showLink(editor);}
        });
        editor.addEventListener('paste',e=>{if(!this.editing)return;e.preventDefault();const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain');editor.focus();if(html)document.execCommand('insertHTML',false,sanitize(html));else document.execCommand('insertText',false,text);this.save(editor);});
        editor.addEventListener('drop',e=>e.preventDefault());
        editor.addEventListener('click',e=>{if(!this.editing)return;const a=e.target.closest('a');if(!a)return;e.preventDefault();const href=safeLink(a.getAttribute('href')||'');if(href&&(e.ctrlKey||e.metaKey))root.open(href,'_blank','noopener,noreferrer');});
      }
      dialog.querySelectorAll('[data-command]').forEach(button=>{
        button.addEventListener('mousedown',e=>e.preventDefault());
        button.addEventListener('click',()=>{
          const editor=button.closest('section').querySelector('.rich-editor');
          if(button.dataset.command==='link'){this.showLink(editor);return;}
          this.restore(editor);if(button.dataset.command==='clear'){document.execCommand('removeFormat',false);this.applyTextStyle(editor,'p');}else document.execCommand(button.dataset.command,false);this.save(editor);this.remember();
        });
      });
      dialog.querySelectorAll('.rich-toolbar select').forEach(select=>{
        select.addEventListener('pointerdown',()=>this.remember());
        select.addEventListener('change',()=>{
          const editor=select.closest('section').querySelector('.rich-editor');this.restore(editor);
          if(select.hasAttribute('data-text-style'))this.applyTextStyle(editor,select.value);
          else if(select.value)document.execCommand(select.hasAttribute('data-text-color')?'foreColor':'hiliteColor',false,select.value);
          this.save(editor);this.remember();
          if(!select.hasAttribute('data-text-style'))select.value='';
        });
      });
      document.addEventListener('selectionchange',()=>{if(dialog.open)this.remember();});
      this.linkForm.onsubmit=e=>{e.preventDefault();const href=safeLink(this.linkInput.value);if(!href){dialog.querySelector('.product-link-error').textContent='Укажите ссылку с https://, http:// или mailto:';return;}this.restore(this.editor);const selection=getSelection();if(selection.isCollapsed){const a=document.createElement('a');a.href=href;a.textContent=href;a.target='_blank';a.rel='noopener noreferrer';document.execCommand('insertHTML',false,a.outerHTML);}else document.execCommand('createLink',false,href);this.save(this.editor);this.hideLink();};
      this.linkForm.querySelector('[data-link-remove]').onclick=()=>{this.restore(this.editor);document.execCommand('unlink',false);this.save(this.editor);this.hideLink();};
      this.linkForm.querySelector('[data-link-cancel]').onclick=()=>{this.hideLink();this.restore(this.editor);};
    }
    handleIndentKey(editor,event){
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
      const selection=getSelection();
      if(!selection.rangeCount)return false;
      const range=selection.getRangeAt(0);
      if(!editor.contains(range.startContainer)||!editor.contains(range.endContainer))return false;
      let command=null;
      if(event.key==='Tab')command=event.shiftKey?'outdent':'indent';
      else if(event.key==='Backspace'&&!event.shiftKey&&range.collapsed){
        const element=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
        const item=element.closest('li');
        const indented=element.closest('blockquote');
        if(item||indented){
          const paragraph=element.closest('p,div,h3,h4');
          const block=item||(paragraph&&paragraph!==editor&&indented.contains(paragraph)?paragraph:indented);
          if(block!==editor&&editor.contains(block)){
            const prefix=range.cloneRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);
            if(prefix.toString().replace(/\u200b/g,'').length===0)command='outdent';
          }
        }
      }
      if(!command)return false;
      event.preventDefault();event.stopPropagation();this.options.end();
      document.execCommand(command,false);this.save(editor);this.remember();this.options.end();
      return true;
    }
    applyTextStyle(editor,value){
      document.execCommand('formatBlock',false,value==='note'?'p':value);
      const selection=getSelection();
      for(const block of editor.querySelectorAll('p,div,h3,h4'))if(selection.rangeCount&&selection.getRangeAt(0).intersectsNode(block)){
        if(value==='note'||value==='p')block.dataset.textStyle=value==='note'?'note':'body';else block.removeAttribute('data-text-style');
      }
    }
    remember(){
      if(!this.editing)return;
      const s=getSelection();if(!s.rangeCount)return;
      const editor=this.editors.find(e=>e.contains(s.anchorNode)&&e.contains(s.focusNode));
      if(!editor)return;this.editor=editor;this.range=s.getRangeAt(0).cloneRange();
      const toolbar=editor.previousElementSibling;
      const block=(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement)?.closest('p,div,h3,h4');
      toolbar.querySelector('[data-text-style]').value=block?.dataset.textStyle==='note'?'note':['H3','H4'].includes(block?.tagName)?block.tagName.toLowerCase():'p';
      for(const button of toolbar.querySelectorAll('[data-command]'))if(!['link','clear'].includes(button.dataset.command))button.setAttribute('aria-pressed',String(document.queryCommandState(button.dataset.command)));
    }
    restore(editor){editor.focus();if(this.range&&editor.contains(this.range.commonAncestorContainer)){const s=getSelection();s.removeAllRanges();s.addRange(this.range);}}
    showLink(editor){this.restore(editor);this.remember();this.linkForm.hidden=false;const s=getSelection(),a=s.anchorNode?.parentElement?.closest('a');this.linkInput.value=a&&editor.contains(a)?a.getAttribute('href'):'';this.linkForm.querySelector('.product-link-error').textContent='';this.linkInput.focus();}
    hideLink(){this.linkForm.hidden=true;}
    save(editor){
      if(this.product===null||!this.editing)return;
      const value=sanitize(editor.innerHTML),field=editor.dataset.infoField;
      if(new TextEncoder().encode(JSON.stringify(value)).length>24000){this.dialog.querySelector('.product-info-error').textContent='Поле слишком длинное — сократите текст.';editor.innerHTML=this.last.get(field)||'';return;}
      this.dialog.querySelector('.product-info-error').textContent='';
      this.last.set(field,value);this.options.write(this.product,field,value,this.kind);
    }
    refresh(){
      if(this.product===null)return;
      const details=this.options.read(this.product,this.kind);
      for(const editor of this.editors){
        if(this.editing&&(editor===document.activeElement||(!this.linkForm.hidden&&editor===this.editor)))continue;
        const value=sanitize(details[editor.dataset.infoField]||'');
        if(editor.innerHTML!==value)editor.innerHTML=value;
        this.last.set(editor.dataset.infoField,value);
      }
    }
    setEditing(editing){
      this.options.end();this.hideLink();this.range=null;
      this.editing=editing;this.dialog.classList.toggle('is-view',!editing);
      const button=this.dialog.querySelector('.product-info-edit');
      button.textContent=editing?'Готово':'Редактировать';
      button.setAttribute('aria-pressed',String(editing));
      this.dialog.querySelector('.product-info-footer').hidden=!editing;
      for(const editor of this.editors){
        editor.setAttribute('contenteditable',String(editing));
        editor.setAttribute('role',editing?'textbox':'region');
        if(editing)editor.setAttribute('aria-multiline','true');else editor.removeAttribute('aria-multiline');
        editor.previousElementSibling.hidden=!editing;
      }
      this.refresh();
      if(editing)this.editors[0].focus();
    }
    open(name,trigger,context={}){
      this.options.end();this.product=name;this.kind=context.kind||'product';this.trigger=trigger;this.range=null;this.hideLink();
      this.dialog.querySelector('h2').textContent=context.title??(name||'Без продукта');this.dialog.querySelector('.product-info-error').textContent='';
      this.setEditing(false);this.status(document.getElementById('saveState').textContent);this.dialog.showModal();
    }
    status(value){this.dialog.querySelector('.product-info-status').textContent=value;}
    close(){this.hideLink();this.dialog.close();}
  }
  root.ProductInfo=ProductInfo;root.TrackerRichText={sanitize,safeLink,palette};
})(globalThis);
