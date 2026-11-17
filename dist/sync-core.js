(function(root){
  function toEntities(plan){
    const result=new Map();
    function taskEntity(task,index,deleted){
      return {id:'t:'+task.id,kind:'task',deleted,payload:{name:task.name,product:task.product,start:task.start,end:task.end,position:task.position??index*1024,assignments:Object.fromEntries(task.assignments.map(a=>[a.id,a.pct]))}};
    }
    (plan.trash||[]).forEach((entry,index)=>result.set('t:'+entry.task.id,taskEntity(entry.task,entry.index??index,true)));
    plan.tasks.forEach((task,index)=>result.set('t:'+task.id,taskEntity(task,index,false)));
    for(const name of new Set([...Object.keys(plan.productColors||{}),...Object.keys(plan.productDetails||{})])){
      const payload={color:Object.hasOwn(plan.productColors||{},name)?plan.productColors[name]:'#739653'};
      const details=Object.hasOwn(plan.productDetails||{},name)?plan.productDetails[name]:{};
      for(const field of ['description','result'])if(typeof details?.[field]==='string')payload[field]=details[field];
      result.set('p:'+name,{id:'p:'+name,kind:'product',deleted:false,payload});
    }
    return result;
  }
  function diffEntities(before,after){
    const operations=[];
    for(const [id,item] of after){
      const old=before.get(id),patches=[];
      for(const [field,value] of Object.entries(item.payload)){
        if(field==='assignments'){
          const previous=old?.payload.assignments||{};
          for(const member of new Set([...Object.keys(previous),...Object.keys(value)])){
            if(previous[member]!==value[member])patches.push(member in value?{path:['assignments',member],value:value[member]}:{path:['assignments',member],remove:true});
          }
        }else if(JSON.stringify(old?.payload[field])!==JSON.stringify(value))patches.push({path:[field],value});
      }
      const action=item.deleted?'delete':old?.deleted?'restore':'patch';
      if(!old||patches.length||old.deleted!==item.deleted)operations.push({id,kind:item.kind,action,patches});
    }
    return operations;
  }
  function applyOperation(entities,op){
    const old=entities.get(op.id);
    if(old?.deleted&&op.action==='patch')return entities;
    const item=structuredClone(old||{id:op.id,kind:op.kind,deleted:false,payload:op.kind==='task'?{name:'Новая задача',product:'',start:0,end:0,position:0,assignments:{}}:{color:'#739653'}});
    for(const patch of op.patches){
      const target=patch.path.length===2?(item.payload[patch.path[0]]??={}):item.payload;
      const field=patch.path.at(-1);
      if(patch.remove)delete target[field];else target[field]=structuredClone(patch.value);
    }
    if(op.action==='delete')item.deleted=true;
    if(op.action==='restore')item.deleted=false;
    entities.set(item.id,item);return entities;
  }
  function toPlan(entities){
    const tasks=[],trash=[],productColors={},productDetails={};
    for(const entity of entities.values()){
      if(entity.kind==='product'){
        if(!entity.deleted){
          const name=entity.id.slice(2),details={};
          if(/^#[0-9a-f]{6}$/i.test(entity.payload.color))Object.defineProperty(productColors,name,{value:entity.payload.color,enumerable:true,configurable:true});
          for(const field of ['description','result'])if(typeof entity.payload[field]==='string')details[field]=entity.payload[field];
          if(Object.keys(details).length)Object.defineProperty(productDetails,name,{value:details,enumerable:true,configurable:true});
        }
        continue;
      }
      const p=entity.payload;
      if(typeof p.name!=='string'||typeof p.product!=='string'||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<p.start||p.end>23||!p.assignments||typeof p.assignments!=='object')continue;
      const task={id:entity.id.slice(2),year:2027,name:p.name,product:p.product,start:p.start,end:p.end,position:p.position||0,assignments:Object.entries(p.assignments).filter(([id,pct])=>Number.isFinite(pct)&&pct>=0&&pct<=100).map(([id,pct])=>({id,pct}))};
      if(entity.deleted)trash.push({task,index:0,deletedAt:entity.updated_at||''});else tasks.push(task);
    }
    tasks.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
    trash.sort((a,b)=>a.deletedAt.localeCompare(b.deletedAt));
    return {tasks:groupProductTasks(tasks),trash,productColors,productDetails};
  }
  function groupProductTasks(tasks){
    const products=new Map();
    for(const task of tasks){const key=task.product.trim();if(!products.has(key))products.set(key,[]);products.get(key).push(task);}
    return [...products.values()].flat();
  }
  function reorderProductTasks(tasks,sourceId,targetId,after=false){
    const source=tasks.find(t=>t.id===sourceId),target=tasks.find(t=>t.id===targetId);
    if(!source||!target||source===target||source.product.trim()!==target.product.trim())return tasks;
    const grouped=groupProductTasks(tasks),reordered=grouped.filter(t=>t.id!==sourceId);
    reordered.splice(reordered.findIndex(t=>t.id===targetId)+(after?1:0),0,source);
    if(reordered.every((t,i)=>t===tasks[i]))return tasks;
    // Persist the entire contiguous order so a refresh cannot split product groups.
    return reordered.map((t,i)=>t.position===i*1024?t:{...t,position:i*1024});
  }
  function summarizeProducts(tasks){
    const products=new Map();
    for(const task of tasks){
      const product=task.product.trim(),summary=products.get(product);
      if(summary){summary.start=Math.min(summary.start,task.start);summary.end=Math.max(summary.end,task.end);}
      else products.set(product,{product,start:task.start,end:task.end,firstTaskId:task.id});
    }
    return [...products.values()];
  }
  function taskRange(tasks,anchorId,targetId){
    const a=tasks.findIndex(t=>t.id===anchorId),b=tasks.findIndex(t=>t.id===targetId);
    return b<0?[]:a<0?[targetId]:tasks.slice(Math.min(a,b),Math.max(a,b)+1).map(t=>t.id);
  }
  function moveTaskDates(tasks,origins,delta){
    const live=new Set(tasks.map(t=>t.id)),selected=origins.filter(t=>live.has(t.id));
    if(!selected.length)return tasks;
    const d=Math.max(-Math.min(...selected.map(t=>t.start)),Math.min(23-Math.max(...selected.map(t=>t.end)),Math.round(delta)));
    const dates=new Map(selected.map(t=>[t.id,{start:t.start+d,end:t.end+d}]));
    return tasks.map(t=>{const next=dates.get(t.id);return next&&(t.start!==next.start||t.end!==next.end)?{...t,...next}:t;});
  }
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function pathValue(entity,path){return path.reduce((value,key)=>value?.[key],entity?.payload);}
  function undoChanges(before,after){
    return diffEntities(before,after).map(op=>{
      const old=before.get(op.id),next=after.get(op.id),lifecycle=!old||old.deleted!==next.deleted;
      const inverse=op.patches.map(p=>{const value=pathValue(old,p.path);return value===undefined?{path:p.path,remove:true}:{path:p.path,value};});
      return {id:op.id,kind:op.kind,expected_deleted:next.deleted,
        ...(lifecycle?{expected_payload:structuredClone(next.payload)}:{}),
        checks:lifecycle?[]:op.patches.map(p=>{const value=pathValue(next,p.path);return value===undefined?{path:p.path,missing:true}:{path:p.path,value};}),
        action:!old?'delete':old.deleted?'delete':next.deleted?'restore':'patch',patches:!old?[]:inverse};
    });
  }
  class UndoHistory {
    constructor(limit=5){this.limit=limit;this.entries=[];this.key=null;}
    end(){this.key=null;}
    record(before,after,key=null){
      const changes=undoChanges(before,after);if(!changes.length)return;
      const last=this.entries.at(-1);
      const canMerge=key&&key===this.key&&last&&!last.operation&&changes.every(change=>{
        const previous=last.changes.find(c=>c.id===change.id);
        return !change.expected_payload&&(!previous||(!previous.expected_payload&&previous.checks.every(check=>{
          const value=pathValue(before.get(change.id),check.path);return check.missing?value===undefined:equal(value,check.value);
        })));
      });
      if(canMerge){
        for(const change of changes){
          const previous=last.changes.find(c=>c.id===change.id);
          if(!previous){last.changes.push(change);continue;}
          for(let i=0;i<change.checks.length;i++){
            const check=change.checks[i],index=previous.checks.findIndex(c=>equal(c.path,check.path));
            if(index<0){previous.checks.push(check);previous.patches.push(change.patches[i]);}else previous.checks[index]=check;
          }
        }
      }else{this.entries.push({changes});if(this.entries.length>this.limit)this.entries.shift();}
      this.key=key;
    }
    peek(){return this.entries.at(-1);}
    pop(){this.key=null;return this.entries.pop();}
  }
  const api={toEntities,diffEntities,applyOperation,toPlan,groupProductTasks,reorderProductTasks,UndoHistory,undoChanges,summarizeProducts,taskRange,moveTaskDates};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TrackerSyncCore=api;
})(globalThis);
