(function(){
 const {sanitize}=TrackerRichText,results=[];
 function test(name,run){try{run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
 function assert(value,message){if(!value)throw Error(message);}
 test('Canonical styling is stable across repeated save/render',()=>{
  const a=sanitize('<h3>Title</h3><p data-text-style="note"><span style="color:#b54737;background-color:#fff0b3"><i>Note</i></span></p><ul><li>A<ul><li>B</li></ul></li></ul>');
  assert(a===sanitize(a),'not idempotent');assert(a.includes('data-text-style="note"'),'note missing');assert(a.includes('<i>'),'italic missing');
 });
 test('Legacy titles, sections and metadata receive standard styles',()=>{
  const a=sanitize('<b>Initiative</b><b>☑️</b><p><b>Фичи</b></p><ul><li>Feature</li></ul><p><b>Источник:</b> reference</p>');
  assert(a.includes('<h3>')&&a.includes('<h4>')&&a.includes('data-text-style="note"'),'legacy lost');assert(a===sanitize(a),'legacy unstable');
 });
 test('Bold fragments remain inline, not headings',()=>assert(sanitize('<b>bold</b>')==='<b>bold</b>','bold became heading'));
 test('Fonts and sizes are discarded; colors map to the palette',()=>{
  const a=sanitize('<h1 style="font-size:99px;font-family:ComicSans">Title</h1><p class="random" style="font-size:45px;color:#ff0000">Text</p>');
  assert(a.includes('<h3>Title</h3>'),'heading lost');assert(!/font-size|font-family|class=|#ff0000/.test(a),'foreign style survived');assert(a.includes('color:'),'color lost');
 });
 test('Unsafe HTML and links cannot survive; links, emoji and strike do',()=>{
  const a=sanitize('<script>alert(1)</script><img src=x onerror=alert(1)><p onclick="alert(1)"><a href="javascript:alert(1)">bad</a><a href="https://example.com">link</a> ☑️ <s>old</s></p>');
  assert(!/script|onerror|onclick|<img/.test(a),'unsafe HTML');assert(a.includes('rel="noopener noreferrer"')&&a.includes('☑️')&&a.includes('<s>old</s>'),'safe content missing');
 });
 document.getElementById('testResults').textContent=JSON.stringify(results,null,2);
 document.title=results.every(r=>r.pass)?'PASS rich text rules':'FAIL rich text rules';
})();
