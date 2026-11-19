const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(html){
 const dom=new JSDOM('<span id="saveState">Saved</span>',{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.TextEncoder=TextEncoder;w.document.queryCommandState=()=>false;w.document.execCommand=cmd=>{calls.push(cmd);return true;};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync('dist/product-info.js','utf8'));
 const info=new w.ProductInfo({read:()=>({description:html}),write(){},end(){}});info.open('test');info.setEditing(true);
 const editor=info.editors[0];
 const caret=(node,offset=0,end)=>{const range=w.document.createRange();range.setStart(node,offset);if(end)range.setEnd(node,end);else range.collapse(true);const s=w.getSelection();s.removeAllRanges();s.addRange(range);};
 const key=(key,extra={})=>{const e=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});editor.dispatchEvent(e);return e.defaultPrevented;};
 return {dom,w,editor,caret,key,calls};
}
test('Tab and Shift+Tab dispatch native indent/outdent only inside an editing field',()=>{
 const t=setup('<p>Text</p>');try{t.caret(t.editor.querySelector('p').firstChild,2);assert.equal(t.key('Tab'),true);assert.equal(t.key('Tab',{shiftKey:true}),true);assert.deepEqual(t.calls,['indent','outdent']);assert.equal(t.key('Tab',{ctrlKey:true}),false);assert.equal(t.key('Tab',{isComposing:true}),false);}finally{t.dom.window.close();}
});
test('Backspace at a list start outdents, but within text or a selection retains native deletion',()=>{
 const t=setup('<ul><li>Parent<ul><li><b>Child</b></li></ul></li></ul>');try{
 const text=t.editor.querySelector('li li b').firstChild;t.caret(text,0);assert.equal(t.key('Backspace'),true);assert.deepEqual(t.calls,['outdent']);
 t.caret(text,2);assert.equal(t.key('Backspace'),false);t.caret(text,0,3);assert.equal(t.key('Backspace'),false);t.caret(text,0);assert.equal(t.key('Backspace',{metaKey:true}),false);assert.equal(t.calls.length,1);
 }finally{t.dom.window.close();}
});
test('Indented plain text outdents at its start, while plain paragraphs keep normal Backspace',()=>{
 const t=setup('<blockquote><blockquote>Indented</blockquote></blockquote><p>Plain</p>');try{
 t.caret(t.editor.querySelector('blockquote blockquote').firstChild,0);assert.equal(t.key('Backspace'),true);assert.deepEqual(t.calls,['outdent']);
 t.caret(t.editor.querySelector('p').firstChild,0);assert.equal(t.key('Backspace'),false);
 }finally{t.dom.window.close();}
});
test('Nested paragraph indentation survives normalization without arbitrary margins or note conversion',()=>{
 const t=setup('');try{
 const sanitize=t.w.TrackerRichText.sanitize;
 const html=sanitize('<blockquote style="margin-left:99px"><blockquote><p>Text</p></blockquote></blockquote>');
 assert.equal(html,'<blockquote><blockquote><p>Text</p></blockquote></blockquote>');assert.equal(sanitize(html),html);
 }finally{t.dom.window.close();}
});
