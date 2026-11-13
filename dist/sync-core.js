(function(root){
  function toEntities(plan){
    const result=new Map();
    function taskEntity(task,index,deleted){
      return {id:'t:'+task.id,kind:'task',deleted,payload:{name:task.name,product:task.product,start:task.start,end:task.end,position:task.position??index*1024,assignments:Object.fromEntries(task.assignments.map(a=>[a.id,a.pct]))}};
    }
    (plan.trash||[]).forEach((entry,index)=>result.set('t:'+entry.task.id,taskEntity(entry.task,entry.index??index,true)));
    plan.tasks.forEach((task,index)=>result.set('t:'+task.id,taskEntity(task,index,false)));
    for(const [name,color] of Object.entries(plan.productColors||{}))result.set('p:'+name,{id:'p:'+name,kind:'product',deleted:false,payload:{color}});
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
    const tasks=[],trash=[],productColors={};
    for(const entity of entities.values()){
      if(entity.kind==='product'){if(!entity.deleted&&/^#[0-9a-f]{6}$/i.test(entity.payload.color))Object.defineProperty(productColors,entity.id.slice(2),{value:entity.payload.color,enumerable:true,configurable:true});continue;}
      const p=entity.payload;
      if(typeof p.name!=='string'||typeof p.product!=='string'||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<p.start||p.end>23||!p.assignments||typeof p.assignments!=='object')continue;
      const task={id:entity.id.slice(2),year:2027,name:p.name,product:p.product,start:p.start,end:p.end,position:p.position||0,assignments:Object.entries(p.assignments).filter(([id,pct])=>Number.isFinite(pct)&&pct>=0&&pct<=100).map(([id,pct])=>({id,pct}))};
      if(entity.deleted)trash.push({task,index:0,deletedAt:entity.updated_at||''});else tasks.push(task);
    }
    tasks.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
    trash.sort((a,b)=>a.deletedAt.localeCompare(b.deletedAt));
    return {tasks,trash,productColors};
  }
  // Keep other products in their slots, including when products are interleaved.
  function reorderProductTasks(tasks,sourceId,targetId,after=false){
    const source=tasks.find(t=>t.id===sourceId),target=tasks.find(t=>t.id===targetId);
    if(!source||!target||source===target||source.product.trim()!==target.product.trim())return tasks;
    const product=source.product.trim(),siblings=tasks.filter(t=>t.product.trim()===product);
    const reordered=siblings.filter(t=>t.id!==sourceId);
    reordered.splice(reordered.findIndex(t=>t.id===targetId)+(after?1:0),0,source);
    if(reordered.every((t,i)=>t===siblings[i]))return tasks;
    const orderedPositions=tasks.every((t,i)=>Number.isFinite(t.position)&&(!i||t.position>tasks[i-1].position));
    let siblingIndex=0;
    return tasks.map((t,i)=>{
      const next=t.product.trim()===product?reordered[siblingIndex++]:t;
      const position=orderedPositions?t.position:i*1024;
      return next===t&&next.position===position?t:{...next,position};
    });
  }
  const api={toEntities,diffEntities,applyOperation,toPlan,reorderProductTasks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TrackerSyncCore=api;
})(globalThis);
