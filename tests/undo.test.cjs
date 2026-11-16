const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/sync-core.js');
const task=(id='a')=>({id,name:'Original',product:'P',start:0,end:1,position:0,assignments:[{id:'sa',pct:50},{id:'my',pct:40}]});
const entities=t=>core.toEntities({tasks:t?[t]:[],trash:[],productColors:{}});
function reverse(map,changes){for(const c of changes)core.applyOperation(map,c);return core.toPlan(map);}
test('Five independent actions are kept; another user has a separate stack',()=>{
 const mine=new core.UndoHistory(),maria=new core.UndoHistory();let t=task();
 for(let i=1;i<=6;i++){const next={...t,name:'Name '+i};mine.record(entities(t),entities(next));t=next;}
 assert.equal(mine.entries.length,5);assert.equal(maria.entries.length,0);
 assert.equal(mine.entries[0].changes[0].patches[0].value,'Name 1');
});
test('Typing and a continuous slider edit coalesce without swallowing remote edits',()=>{
 const history=new core.UndoHistory();let t=task();
 for(const name of ['N','Ne','New']){const next={...t,name};history.record(entities(t),entities(next),'name:a');t=next;}
 assert.equal(history.entries.length,1);assert.equal(history.peek().changes[0].checks[0].value,'New');
 assert.equal(reverse(entities(t),history.peek().changes).tasks[0].name,'Original');
 const remote={...t,name:'Maria edit'},next={...t,name:'My next edit'};
 history.record(entities(remote),entities(next),'name:a');assert.equal(history.entries.length,2);
 assert.equal(history.peek().changes[0].patches[0].value,'Maria edit');
});
test('Undo touches only edited fields and individual assignments',()=>{
 const before=task(),after={...before,start:4,end:5,assignments:[{id:'sa',pct:90}]};
 const changes=core.undoChanges(entities(before),entities(after));
 const current=entities({...after,name:'Maria title',product:'Maria product'});
 const result=reverse(current,changes).tasks[0];assert.equal(result.name,'Maria title');assert.equal(result.product,'Maria product');
 assert.equal(result.start,0);assert.equal(result.end,1);assert.deepEqual(result.assignments,before.assignments);
 assert.ok(changes[0].checks.every(c=>!['name','product'].includes(c.path[0])));
});
test('Create, delete and restore have complete lifecycle guards',()=>{
 const t=task(),active=entities(t),deleted=core.toEntities({tasks:[],trash:[{task:t,index:0}]});
 const create=core.undoChanges(new Map(),active);assert.equal(create[0].action,'delete');assert.deepEqual(create[0].expected_payload,active.get('t:a').payload);
 assert.equal(reverse(new Map(active),create).tasks.length,0);
 const deletion=core.undoChanges(active,deleted);assert.equal(deletion[0].action,'restore');assert.equal(reverse(new Map(deleted),deletion).tasks[0].id,'a');
 assert.equal(core.undoChanges(deleted,active)[0].action,'delete');
});
test('Ending an input interaction separates two edits of the same field',()=>{
 const h=new core.UndoHistory(),t=task(),a={...t,name:'A'},b={...t,name:'B'};
 h.record(entities(t),entities(a),'name');h.end();h.record(entities(a),entities(b),'name');assert.equal(h.entries.length,2);
});
