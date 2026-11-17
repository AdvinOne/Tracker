const test=require('node:test'),assert=require('node:assert/strict');
const {taskRange,moveTaskDates,toEntities,UndoHistory,applyOperation}=require('../dist/sync-core.js');
const sample=()=>[
 {id:'a',name:'A',product:'School',start:1,end:3,assignments:[{id:'my',pct:40}]},
 {id:'b',name:'B',product:'School',start:5,end:5,assignments:[]},
 {id:'c',name:'C',product:'Other',start:10,end:13,assignments:[]}
];
test('Shift range works in both directions and with missing anchors',()=>{
 const tasks=sample();assert.deepEqual(taskRange(tasks,'a','c'),['a','b','c']);assert.deepEqual(taskRange(tasks,'c','a'),['a','b','c']);assert.deepEqual(taskRange(tasks,'missing','b'),['b']);assert.deepEqual(taskRange(tasks,'a','missing'),[]);
});
test('A group keeps duration and gaps, including nonadjacent tasks in different products',()=>{
 const tasks=sample(),before=structuredClone(tasks);const moved=moveTaskDates(tasks,[tasks[0],tasks[2]],2);
 assert.deepEqual(moved.map(t=>[t.start,t.end]),[[3,5],[5,5],[12,15]]);assert.deepEqual(tasks,before);assert.equal(moved[1],tasks[1]);assert.deepEqual(moved[0].assignments,tasks[0].assignments);
});
test('Year bounds clamp the entire group using the same delta',()=>{
 const tasks=sample();assert.deepEqual(moveTaskDates(tasks,tasks,99).map(t=>[t.start,t.end]),[[11,13],[15,15],[20,23]]);assert.deepEqual(moveTaskDates(tasks,tasks,-99).map(t=>[t.start,t.end]),[[0,2],[4,4],[9,12]]);
});
test('Drag uses original dates at every step and can cancel without touching other edits',()=>{
 const tasks=sample(),origins=tasks.slice(0,2).map(({id,start,end})=>({id,start,end}));
 let moved=moveTaskDates(tasks,origins,1);moved=moveTaskDates(moved,origins,2);assert.equal(moved[0].start,3);
 moved[2]={...moved[2],name:'Remote title'};const restored=moveTaskDates(moved,origins,0);assert.equal(restored[0].start,1);assert.equal(restored[1].start,5);assert.equal(restored[2].name,'Remote title');
 assert.deepEqual(moveTaskDates([],origins,4),[]);
});
test('One group move creates one undo entry that restores every task',()=>{
 const tasks=sample(),after=moveTaskDates(tasks,tasks,2),history=new UndoHistory(5);const entities=toEntities({tasks});const next=toEntities({tasks:after});history.record(entities,next);
 assert.equal(history.entries.length,1);assert.equal(history.peek().changes.length,3);
 for(const op of history.peek().changes)applyOperation(next,op);
 assert.deepEqual([...next.values()].map(t=>[t.payload.start,t.payload.end]),tasks.map(t=>[t.start,t.end]));
});
