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
