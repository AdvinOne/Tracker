const test=require('node:test');const assert=require('node:assert/strict');const core=require('../dist/sync-core.js');
const make=(id='a')=>({id,name:'Задача',product:'Продукт',start:0,end:1,position:0,assignments:[{id:'ek',pct:50},{id:'my',pct:20}]});
const plan=t=>({tasks:[t],trash:[],productColors:{'Продукт':'#638bb8'}});
test('Concurrent edits to different fields and different people are merged',()=>{
 const original=make(),base=core.toEntities(plan(original));
 const a=structuredClone(original);a.name='Новое имя';a.assignments[0].pct=90;
 const b=structuredClone(original);b.product='Другой продукт';b.assignments[1].pct=80;
 const server=new Map(base);for(const op of [...core.diffEntities(base,core.toEntities(plan(a))),...core.diffEntities(base,core.toEntities(plan(b)))])core.applyOperation(server,op);
 const result=core.toPlan(server).tasks[0];assert.equal(result.name,'Новое имя');assert.equal(result.product,'Другой продукт');assert.equal(result.assignments.find(a=>a.id==='ek').pct,90);assert.equal(result.assignments.find(a=>a.id==='my').pct,80);
});
test('Late writes never resurrect deleted tasks, explicit restore does',()=>{
 const base=core.toEntities(plan(make()));core.applyOperation(base,{id:'t:a',kind:'task',action:'delete',patches:[]});
 core.applyOperation(base,{id:'t:a',kind:'task',action:'patch',patches:[{path:['name'],value:'Stale edit'}]});assert.equal(core.toPlan(base).tasks.length,0);assert.equal(core.toPlan(base).trash.length,1);
 core.applyOperation(base,{id:'t:a',kind:'task',action:'restore',patches:[]});assert.equal(core.toPlan(base).tasks[0].name,'Задача');
});
test('Removing an assignee preserves everyone else',()=>{
 const original=make(),base=core.toEntities(plan(original)),after=structuredClone(original);after.assignments.shift();
 for(const op of core.diffEntities(base,core.toEntities(plan(after))))core.applyOperation(base,op);
 assert.deepEqual(core.toPlan(base).tasks[0].assignments,[{id:'my',pct:20}]);
});
test('An empty saved board stays empty; prototype-like product names are safe',()=>{
 assert.equal(core.toPlan(new Map()).tasks.length,0);
 const entities=new Map([['p:__proto__',{id:'p:__proto__',kind:'product',deleted:false,payload:{color:'#638bb8'}}]]);
 const result=core.toPlan(entities);assert.equal(Object.getOwnPropertyDescriptor(result.productColors,'__proto__').value,'#638bb8');
});
test('Reorder only within a product, keeping product groups contiguous and sprint data after sync',()=>{
 const tasks=['a','x','b','y','c'].map((id,i)=>({...make(id),product:['x','y'].includes(id)?'Other':'Продукт',position:i*1024,start:i,end:i+1}));
 const result=core.reorderProductTasks(tasks,'c','a');
 assert.deepEqual(result.map(t=>t.id),['c','a','b','x','y']);
 assert.deepEqual(result.filter(t=>t.product==='Other').map(t=>t.id),['x','y']);
 for(const task of result){const old=tasks.find(t=>t.id===task.id);assert.equal(task.start,old.start);assert.equal(task.end,old.end);assert.deepEqual(task.assignments,old.assignments);}
 const server=core.toEntities({tasks,trash:[],productColors:{}});
 const operations=core.diffEntities(server,core.toEntities({tasks:result,trash:[],productColors:{}}));
 assert.ok(operations.every(op=>op.patches.every(p=>p.path[0]==='position')));
 for(const op of operations)core.applyOperation(server,op);
 assert.deepEqual(core.toPlan(server).tasks.map(t=>t.id),result.map(t=>t.id));
 assert.deepEqual(core.reorderProductTasks(result,'c','b',true).map(t=>t.id),['a','b','c','x','y']);
 assert.equal(core.reorderProductTasks(tasks,'a','x'),tasks);
 assert.equal(core.reorderProductTasks(tasks,'a','a'),tasks);
 assert.equal(core.reorderProductTasks(tasks,'missing','a'),tasks);
});
test('Reordering handles unassigned products and legacy missing or duplicate positions',()=>{
 const tasks=[{...make('a'),product:' '},{...make('x'),product:'Other'},{...make('b'),product:''}];
 const result=core.reorderProductTasks(tasks,'a','b',true);
 assert.deepEqual(core.toPlan(core.toEntities({tasks:result})).tasks.map(t=>t.id),['b','a','x']);
});

test('A late new task joins its earlier product group on load without replacing any task',()=>{
 const tasks=['a','b','x','y','new'].map((id,i)=>({...make(id),product:['x','y'].includes(id)?'Other':'Продукт',position:i*1024}));
 const result=core.toPlan(core.toEntities({tasks})).tasks;
 assert.deepEqual(result.map(t=>t.id),['a','b','new','x','y']);
 assert.equal(new Set(result.map(t=>t.id)).size,5);
 const moved=core.reorderProductTasks(result,'new','a');
 assert.deepEqual(core.toPlan(core.toEntities({tasks:moved})).tasks.map(t=>t.id),['new','a','b','x','y']);
 const changed=tasks.map(t=>t.id==='y'?{...t,product:'Продукт'}:t);
 assert.deepEqual(core.groupProductTasks(changed).map(t=>t.id),['a','b','y','new','x']);
});
