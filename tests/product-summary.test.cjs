const test=require('node:test'),assert=require('node:assert/strict');
const {summarizeProducts}=require('../dist/sync-core.js');
test('Product summary spans earliest start to latest end, including gaps, separately per product',()=>{
 const tasks=[{id:'a',product:'School',start:2,end:3},{id:'b',product:'Other',start:0,end:23},{id:'c',product:' School ',start:8,end:10},{id:'d',product:'School',start:1,end:1}];
 const before=structuredClone(tasks);
 assert.deepEqual(summarizeProducts(tasks),[{product:'School',start:1,end:10,firstTaskId:'a'},{product:'Other',start:0,end:23,firstTaskId:'b'}]);
 assert.deepEqual(tasks,before);
 tasks[2].end=15;assert.equal(summarizeProducts(tasks)[0].end,15);
 tasks.splice(2,1);assert.equal(summarizeProducts(tasks)[0].end,3);
});
test('Empty plans, unnamed products, and prototype-like product names are safe',()=>{
 assert.deepEqual(summarizeProducts([]),[]);
 assert.deepEqual(summarizeProducts([{id:'a',product:' ',start:0,end:0},{id:'b',product:'',start:1,end:1},{id:'c',product:'__proto__',start:12,end:23}]),[{product:'',start:0,end:1,firstTaskId:'a'},{product:'__proto__',start:12,end:23,firstTaskId:'c'}]);
});
