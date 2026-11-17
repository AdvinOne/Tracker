(function(root){
  const fields=[['description','Описание'],['result','Результат']];
  const allowed=new Set(['P','DIV','BR','B','STRONG','UL','OL','LI','A']);
  const discard=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','FORM','INPUT','BUTTON','TEXTAREA','SELECT']);
  function safeLink(value){
    try{const url=new URL(value.trim());return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
  }
  // Rebuild a tiny formatting vocabulary; no source attributes or active content survive.
  function sanitize(html){
    const source=new DOMParser().parseFromString(String(html),'text/html'),out=document.createElement('div');
    function copy(node,parent){
      if(node.nodeType===3){parent.append(document.createTextNode(node.data));return;}
      if(node.nodeType!==1||discard.has(node.tagName))return;
      let target=parent;
      if(allowed.has(node.tagName)){
        const href=node.tagName==='A'?safeLink(node.getAttribute('href')||''):null;
        if(node.tagName!=='A'||href){
          target=document.createElement(node.tagName.toLowerCase());
          if(href){target.href=href;target.target='_blank';target.rel='noopener noreferrer';}
          parent.append(target);
        }
      }
      for(const child of node.childNodes)copy(child,target);
    }
    for(const node of source.body.childNodes)copy(node,out);
    if(!out.textContent.trim()&&!out.querySelector('li'))return '';
    return out.innerHTML;
  }
  class ProductInfo{
    constructor(options){
      this.options=options;this.product=null;this.range=null;this.editor=null;this.last=new Map();
      const dialog=document.createElement('dialog');this.dialog=dialog;dialog.className='product-info-dialog';
      dialog.setAttribute('aria-labelledby','productInfoTitle');
      dialog.innerHTML=`<header class="product-info-heading"><h2 id="productInfoTitle"></h2><button type="button" class="product-info-close" aria-label="Закрыть">×</button></header>
        ${fields.map(([key,label])=>`<section class="product-info-field"><h3 id="info-${key}-label">${label}</h3><div class="rich-toolbar" role="toolbar" aria-label="Форматирование: ${label}"><button type="button" data-command="bold" aria-label="Жирный" title="Жирный · Ctrl/⌘+B"><b>B</b></button><button type="button" data-command="link" aria-label="Вставить ссылку" title="Ссылка · Ctrl/⌘+K">↗</button><button type="button" data-command="insertOrderedList" aria-label="Нумерованный список" title="Нумерованный список">1.</button><button type="button" data-command="insertUnorderedList" aria-label="Маркированный список" title="Маркированный список">•</button></div><div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="info-${key}-label" data-info-field="${key}" spellcheck="true"></div></section>`).join('')}
        <form class="product-link-form" hidden><label for="productLinkUrl">Ссылка</label><input id="productLinkUrl" type="url" placeholder="https://" required><button type="submit">Применить</button><button type="button" data-link-remove>Убрать</button><button type="button" data-link-cancel aria-label="Отмена ссылки">×</button><span class="product-link-error" role="alert"></span></form><footer class="product-info-footer"><span class="product-info-status" role="status"></span><span class="product-info-error" role="alert"></span></footer>`;
      document.body.append(dialog);
      this.editors=[...dialog.querySelectorAll('.rich-editor')];this.linkForm=dialog.querySelector('form');this.linkInput=dialog.querySelector('#productLinkUrl');
      dialog.querySelector('.product-info-close').onclick=()=>this.close();
      dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.close();}});
      dialog.addEventListener('cancel',()=>{this.hideLink();this.options.end();});
      dialog.addEventListener('close',()=>{this.options.end();this.product=null;this.trigger?.focus();});
      for(const editor of this.editors){
        editor.addEventListener('input',e=>{if(!e.isComposing)this.save(editor);});
        editor.addEventListener('compositionend',()=>this.save(editor));
        editor.addEventListener('focus',()=>{this.editor=editor;});
        editor.addEventListener('blur',()=>{this.options.end();});
        editor.addEventListener('keydown',e=>{
          if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();this.remember();this.showLink(editor);}
        });
        editor.addEventListener('paste',e=>{e.preventDefault();const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain');editor.focus();if(html)document.execCommand('insertHTML',false,sanitize(html));else document.execCommand('insertText',false,text);this.save(editor);});
        editor.addEventListener('drop',e=>e.preventDefault());
        editor.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();const href=safeLink(a.getAttribute('href')||'');if(href&&(e.ctrlKey||e.metaKey))root.open(href,'_blank','noopener,noreferrer');});
      }
      dialog.querySelectorAll('[data-command]').forEach(button=>{
        button.addEventListener('mousedown',e=>e.preventDefault());
        button.addEventListener('click',()=>{
          const editor=button.closest('section').querySelector('.rich-editor');
          if(button.dataset.command==='link'){this.showLink(editor);return;}
          this.restore(editor);document.execCommand(button.dataset.command,false);this.save(editor);this.remember();
        });
      });
      document.addEventListener('selectionchange',()=>{if(dialog.open)this.remember();});
      this.linkForm.onsubmit=e=>{e.preventDefault();const href=safeLink(this.linkInput.value);if(!href){dialog.querySelector('.product-link-error').textContent='Укажите ссылку с https://, http:// или mailto:';return;}this.restore(this.editor);const selection=getSelection();if(selection.isCollapsed){const a=document.createElement('a');a.href=href;a.textContent=href;a.target='_blank';a.rel='noopener noreferrer';document.execCommand('insertHTML',false,a.outerHTML);}else document.execCommand('createLink',false,href);this.save(this.editor);this.hideLink();};
      this.linkForm.querySelector('[data-link-remove]').onclick=()=>{this.restore(this.editor);document.execCommand('unlink',false);this.save(this.editor);this.hideLink();};
      this.linkForm.querySelector('[data-link-cancel]').onclick=()=>{this.hideLink();this.restore(this.editor);};
    }
    remember(){
      const s=getSelection();if(!s.rangeCount)return;
      const editor=this.editors.find(e=>e.contains(s.anchorNode)&&e.contains(s.focusNode));
      if(!editor)return;this.editor=editor;this.range=s.getRangeAt(0).cloneRange();
      const toolbar=editor.previousElementSibling;
      for(const button of toolbar.querySelectorAll('[data-command]'))if(button.dataset.command!=='link')button.setAttribute('aria-pressed',String(document.queryCommandState(button.dataset.command)));
    }
    restore(editor){editor.focus();if(this.range&&editor.contains(this.range.commonAncestorContainer)){const s=getSelection();s.removeAllRanges();s.addRange(this.range);}}
    showLink(editor){this.restore(editor);this.remember();this.linkForm.hidden=false;const s=getSelection(),a=s.anchorNode?.parentElement?.closest('a');this.linkInput.value=a&&editor.contains(a)?a.getAttribute('href'):'';this.linkForm.querySelector('.product-link-error').textContent='';this.linkInput.focus();}
    hideLink(){this.linkForm.hidden=true;}
    save(editor){
      if(this.product===null)return;
      const value=sanitize(editor.innerHTML),field=editor.dataset.infoField;
      if(new TextEncoder().encode(JSON.stringify(value)).length>24000){this.dialog.querySelector('.product-info-error').textContent='Поле слишком длинное — сократите текст.';editor.innerHTML=this.last.get(field)||'';return;}
      this.dialog.querySelector('.product-info-error').textContent='';
      this.last.set(field,value);this.options.write(this.product,field,value);
    }
    refresh(){
      if(this.product===null)return;
      const details=this.options.read(this.product);
      for(const editor of this.editors){
        if(editor===document.activeElement||(!this.linkForm.hidden&&editor===this.editor))continue;
        const value=sanitize(details[editor.dataset.infoField]||'');
        if(editor.innerHTML!==value)editor.innerHTML=value;
        this.last.set(editor.dataset.infoField,value);
      }
    }
    open(name,trigger){
      this.options.end();this.product=name;this.trigger=trigger;this.range=null;this.hideLink();
      this.dialog.querySelector('h2').textContent=name||'Без продукта';this.dialog.querySelector('.product-info-error').textContent='';
      this.refresh();this.status(document.getElementById('saveState').textContent);this.dialog.showModal();
    }
    status(value){this.dialog.querySelector('.product-info-status').textContent=value;}
    close(){this.hideLink();this.dialog.close();}
  }
  root.ProductInfo=ProductInfo;root.TrackerRichText={sanitize,safeLink};
})(globalThis);
