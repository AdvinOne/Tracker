const test=require('node:test'),assert=require('node:assert/strict');
const {toEntities,toPlan,diffEntities,applyOperation,undoChanges}=require('../dist/sync-core.js');
const task=()=>({id:'a',name:'Task',product:'School',start:0,end:2,assignments:[],description:'<h3>Description</h3>',result:'<p>Outcome</p>'});
test('Task info roundtrips and survives rename, product change, move and delete/restore',()=>{
 const t=task(),p=toPlan(toEntities({tasks:[t]}));assert.equal(p.tasks[0].description,t.description);assert.equal(p.tasks[0].result,t.result);
 const changed={...t,name:'Renamed',product:'Other',start:3,end:5};
 const entities=toEntities({tasks:[],trash:[{task:changed,index:0}]});const deleted=toPlan(entities).trash[0].task;
 assert.equal(deleted.description,t.description);assert.equal(deleted.result,t.result);
 const restored=toPlan(toEntities({tasks:[deleted]})).tasks[0];assert.equal(restored.product,'Other');assert.equal(restored.description,t.description);
});
test('Task text, dates and collaborator result merge independently; older clients preserve text',()=>{
 const t=task(),before=toEntities({tasks:[t]}),shared=structuredClone(before);
 for(const next of [{...t,description:'New description'},{...t,result:'Their result'},{...t,start:1,end:3}])for(const op of diffEntities(before,toEntities({tasks:[next]})))applyOperation(shared,op);
 const legacy={...t};delete legacy.description;delete legacy.result;legacy.name='Legacy rename';
 for(const op of diffEntities(before,toEntities({tasks:[legacy]})))applyOperation(shared,op);
 const payload=shared.get('t:a').payload;assert.equal(payload.description,'New description');assert.equal(payload.result,'Their result');assert.equal(payload.start,1);assert.equal(payload.name,'Legacy rename');
});
test('First task text edit can be undone without reverting other task fields',()=>{
 const t=task();delete t.description;delete t.result;const before=toEntities({tasks:[t]}),after=toEntities({tasks:[{...t,description:'New'}]});
 const changes=undoChanges(before,after);assert.deepEqual(changes[0].patches,[{path:['description'],remove:true}]);applyOperation(after,changes[0]);assert.equal(after.get('t:a').payload.description,undefined);assert.equal(after.get('t:a').payload.name,t.name);
});
