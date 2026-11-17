const test=require('node:test'),assert=require('node:assert/strict');
const {toEntities,toPlan,diffEntities,applyOperation,undoChanges}=require('../dist/sync-core.js');
const plan=(details)=>({tasks:[],productColors:{School:'#739653'},productDetails:details});
test('Product text survives roundtrip, including prototype-like names',()=>{
  const details=JSON.parse('{"School":{"description":"<b>Plan</b>","result":"<ol><li>Done</li></ol>"},"__proto__":{"description":"Safe"}}');
  assert.deepEqual(toPlan(toEntities(plan(details))).productDetails,details);
});
test('Concurrent product fields merge and older color-only clients preserve text',()=>{
  const original=toEntities(plan({School:{description:'Initial',result:'Old'}}));
  const a=toEntities(plan({School:{description:'Changed',result:'Old'}}));
  const b=toEntities(plan({School:{description:'Initial',result:'Outcome'}}));
  const entities=structuredClone(original);
  for(const op of [...diffEntities(original,a),...diffEntities(original,b)])applyOperation(entities,op);
  const legacy=toEntities({tasks:[],productColors:{School:'#123456'}});
  for(const op of diffEntities(original,legacy))applyOperation(entities,op);
  assert.deepEqual(entities.get('p:School').payload,{color:'#123456',description:'Changed',result:'Outcome'});
});
test('Undo first metadata edit removes optional field without reverting collaborator result',()=>{
  const before=toEntities(plan({})),after=toEntities(plan({School:{description:'First'}}));
  const changes=undoChanges(before,after);
  assert.deepEqual(changes[0].patches,[{path:['description'],remove:true}]);
  applyOperation(after,{id:'p:School',kind:'product',action:'patch',patches:[{path:['result'],value:'Their outcome'}]});
  applyOperation(after,changes[0]);
  assert.deepEqual(after.get('p:School').payload,{color:'#739653',result:'Their outcome'});
});
