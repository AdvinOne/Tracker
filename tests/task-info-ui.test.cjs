const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(cloud=false){
 const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
 w.TRACKER_CLOUD={boardId:'test'};
 if(cloud){w.trackerAuthReady=Promise.resolve();w.SharedTracker=class{constructor(config,change,status){this.change=change;this.status=status;this.ready=true;this.history={peek:()=>null};w.shared=this;}start(){this.status('saved');}capture(plan){this.plan=structuredClone(plan);}endAction(){}};}
w.ResizeObserver=class{observe(){}};w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;w.document.queryCommandState=()=>false;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const tasks=['a','b'].map(id=>({id,name:'Task '+id,product:'School',start:0,end:2,assignments:[]}));
 w.localStorage.setItem('rhythm-plan-2027-v2',JSON.stringify({tasks,trash:[],activeTaskId:'a',productColors:{School:'#739653'},productDetails:{School:{description:'Product description'}}}));
 for(const file of ['sync-core.js','product-info.js','app.js'])w.eval(fs.readFileSync('dist/'+file,'utf8'));
 return {dom,w,d:w.document,plan:()=>JSON.parse(w.localStorage.getItem('rhythm-plan-2027-v2'))};
}
test('Task info opens without dragging/selecting, starts read-only and keeps task/product text separate',()=>{
 const {dom,w,d,plan}=setup();try{
 const button=d.querySelector('[data-task-id="b"] [data-task-info]');
 assert.equal(d.querySelectorAll('[data-task-info]').length,2);
 button.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));button.click();
 const dialog=d.querySelector('dialog'),editor=d.querySelector('[data-info-field="description"]');
 assert.equal(dialog.open,true);assert.equal(d.getElementById('productInfoTitle').textContent,'Task b');assert.equal(editor.getAttribute('contenteditable'),'false');assert.equal(d.getElementById('selectedTaskName').textContent,'Task a');
 d.querySelector('.product-info-edit').click();assert.equal(editor.getAttribute('contenteditable'),'true');
 editor.innerHTML='<h3>Task details ☑️</h3><p>Body</p>';editor.dispatchEvent(new w.Event('input',{bubbles:true}));
 const expected='<h3>Task details ☑️</h3><p>Body</p>';
 assert.equal(plan().tasks.find(t=>t.id==='b').description,expected);assert.equal(plan().tasks.find(t=>t.id==='a').description,undefined);assert.equal(plan().productDetails.School.description,'Product description');
 d.querySelector('.product-info-edit').click();assert.equal(editor.getAttribute('contenteditable'),'false');
 d.querySelector('.product-info-close').click();button.click();assert.equal(editor.innerHTML,expected);assert.equal(editor.getAttribute('contenteditable'),'false');
 d.querySelector('.product-info-close').click();d.querySelector('[data-product-info]').click();assert.equal(editor.textContent,'Product description');
 d.querySelector('.product-info-close').click();d.querySelector('[data-task-id="b"] [data-delete]').click();assert.equal(plan().trash[0].task.description,expected);
 }finally{dom.window.close();}
});

test('Task info reaches shared capture and closes when the task is remotely deleted',async()=>{
 const {dom,w,d}=setup(true);try{
 await Promise.resolve();
 d.querySelector('[data-task-id="b"] [data-task-info]').click();d.querySelector('.product-info-edit').click();
 const editor=d.querySelector('[data-info-field="result"]');editor.innerHTML='<p>Shared result</p>';editor.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(w.shared.plan.tasks.find(t=>t.id==='b').result,'<p>Shared result</p>');assert.equal(w.shared.plan.productDetails.School.description,'Product description');
 w.shared.change({...w.shared.plan,tasks:w.shared.plan.tasks.filter(t=>t.id!=='b')});
 assert.equal(d.querySelector('dialog').open,false);assert.equal(d.querySelectorAll('.task-row').length,1);
 }finally{dom.window.close();}
});
