const groups=[['PO','Product Owner'],['Тимлид','Тимлид'],['UX','Дизайн'],['Арт','Арт'],['LX','Методисты'],['FE','Фронтенд'],['BE','Бэкенд'],['QA','Тестирование'],['ML','Machine Learning']];
const team=[['sa','Сергей','Агапов','PO'],['ak','Алина','Козловцева','Тимлид'],['my','Мария','Юферова','UX'],['aa','Александра','Альбицкая','Арт'],['dg','Диляра','Голубятникова','Арт'],['fb','Федора','Бобкова','LX'],['ad','Алена','Должкова','LX'],['as','Анастасия','Скворцова','FE'],['al','Алексей','Литвинов','FE'],['ek','Евгений','Колосков','QA'],['sg','Сабина','Грачева','QA'],['au','Андрей','Устинов','ML']].map(([id,first,last,role],i)=>({id,first,last,role,color:['#e9eddc','#eee4df','#e2e9ee','#ece4ee','#f1e7d9','#e3ece7'][i%6]}));
const $=id=>document.getElementById(id);
const year=2027;
const visibleSprints=12;
const key='rhythm-plan-2027-v2';
let hadLocalPlan=false,hadCloudCache=false,hasPreCloudBackup=false;
try{hadLocalPlan=!!(localStorage.getItem(key)||localStorage.getItem('rhythm-task-v1'));hadCloudCache=!!localStorage.getItem('rhythm-cloud-'+TRACKER_CLOUD.boardId)}catch{}
const initial={id:'TASK-001',name:'Обновление личного кабинета',product:'Личный кабинет',start:0,end:1,assignments:[{id:'ek',pct:50},{id:'my',pct:90},{id:'aa',pct:30}]};
function validTask(t){return t&&typeof t.name==='string'&&typeof t.product==='string'&&Number.isInteger(t.start)&&Number.isInteger(t.end)&&t.start>=0&&t.end>=t.start&&t.end<24&&Array.isArray(t.assignments)}
function cleanTask(t){const seen=new Set();return {...t,id:typeof t.id==='string'&&t.id?t.id:crypto.randomUUID(),year,assignments:t.assignments.filter(a=>a&&team.some(p=>p.id===a.id)&&Number.isFinite(a.pct)&&a.pct>=0&&a.pct<=100&&!seen.has(a.id)&&seen.add(a.id))}}
let tasks=[],trash=[],activeTaskId=null;
let productColors=new Map(),hiddenProducts=new Set();
let productFilterSignature='';
try{
  const saved=JSON.parse(localStorage.getItem(key));
  if(saved&&Array.isArray(saved.tasks)){
    const ids=new Set();tasks=saved.tasks.filter(validTask).map(cleanTask).filter(t=>!ids.has(t.id)&&ids.add(t.id));
    trash=Array.isArray(saved.trash)?saved.trash.filter(x=>validTask(x.task)).map(x=>({...x,task:cleanTask(x.task)})):[];
    activeTaskId=saved.activeTaskId;
    if(saved.productColors&&typeof saved.productColors==='object')productColors=new Map(Object.entries(saved.productColors).filter(([k,v])=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)));
    if(Array.isArray(saved.hiddenProducts))hiddenProducts=new Set(saved.hiddenProducts.filter(p=>typeof p==='string'));
  }else{const legacy=JSON.parse(localStorage.getItem('rhythm-task-v1'));tasks=[cleanTask(validTask(legacy)?{...legacy,id:'TASK-001'}:structuredClone(initial))]}
}catch{tasks=[cleanTask(structuredClone(initial))]}
if(!tasks.some(t=>t.id===activeTaskId))activeTaskId=tasks[0]?.id??null;
let localPlanBeforeCloud={tasks:structuredClone(tasks),trash:[],productColors:Object.fromEntries(productColors)};
try{
  const backup=JSON.parse(localStorage.getItem('rhythm-pre-cloud-backup-2027'));
  if(backup&&Array.isArray(backup.tasks)){localPlanBeforeCloud=backup;hasPreCloudBackup=true;}
  else if(hadLocalPlan&&!hadCloudCache&&localPlanBeforeCloud.tasks.length){localStorage.setItem('rhythm-pre-cloud-backup-2027',JSON.stringify(localPlanBeforeCloud));hasPreCloudBackup=true;}
}catch{}
let cloud=null,cloudApplying=false,cloudDeferred=false;
let base=0,selected=0;
function currentTask(){return tasks.find(t=>t.id===activeTaskId)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function person(id){return team.find(p=>p.id===id)}
function av(p){return `<div class="avatar" style="background:${p.color}">${p.first[0]}${p.last[0]}</div>`}
const months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const short=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
function sprintText(i){return `${i%2?'16–'+new Date(year,Math.floor(i/2)+1,0).getDate():'1–15'} ${short[Math.floor(i/2)]} · С${i+1}`}
function persist(){
  try{localStorage.setItem(key,JSON.stringify({year,tasks,trash,activeTaskId,productColors:Object.fromEntries(productColors),hiddenProducts:[...hiddenProducts]}))}catch{}
  if(cloud&&!cloudApplying)cloud.capture({tasks,trash,productColors:Object.fromEntries(productColors)});
}
function save(){persist();renderDerived()}
function loadTone(pct){
  if(pct>100){const t=Math.min(1,(pct-100)/50);return `--load-bg:hsl(6 78% ${96-t*10}%);--load-border:hsl(6 54% ${87-t*13}%);--load-fill:hsl(6 65% ${65-t*13}%);--load-text:#a64035`;}
  const t=Math.max(0,Math.min(1,(pct-70)/30));
  return `--load-bg:hsl(44 ${Math.round(t*95)}% ${100-t*10}%);--load-border:hsl(44 ${Math.round(t*65)}% ${92-t*14}%);--load-fill:hsl(44 ${Math.round(12+t*65)}% ${73-t*18}%);--load-text:${t>0.3?'#8b681b':'#53604f'}`;
}

function productKey(t){return t.product.trim()}
function productColor(name){
  if(!productColors.has(name)){
    const palette=['#739653','#638bb8','#a578b4','#c79846','#57a49a','#c57e80','#8d8fab'];
    productColors.set(name,palette[productColors.size%palette.length]);
  }
  return productColors.get(name);
}
function visibleTask(t){return !hiddenProducts.has(productKey(t))}
function renderProductFilters(){
  const names=[...new Set(tasks.map(productKey))];
  const signature=JSON.stringify(names.map(name=>[name,hiddenProducts.has(name)]));
  if(signature===productFilterSignature){
    for(const input of $('productFilters').querySelectorAll('[data-product-color]')){
      const color=productColor(input.dataset.productColor);
      if(document.activeElement!==input)input.value=color;
      input.closest('.product-filter').style.setProperty('--product-color',color);
    }
    return;
  }
  productFilterSignature=signature;
  $('productFilters').innerHTML=names.map(name=>`<div class="product-filter ${hiddenProducts.has(name)?'is-off':''}" style="--product-color:${productColor(name)}"><input type="color" class="product-color" data-product-color="${esc(name)}" value="${productColor(name)}" aria-label="Цвет продукта ${esc(name||'Без продукта')}" title="Цвет: ${esc(name||'Без продукта')}"><button class="product-toggle" data-product-toggle="${esc(name)}" aria-pressed="${!hiddenProducts.has(name)}" title="${esc(name||'Без продукта')}">${esc(name||'Без продукта')}</button></div>`).join('');
}
function ensureVisibleSelection(){
  if(!tasks.some(t=>t.id===activeTaskId&&visibleTask(t)))activeTaskId=tasks.find(visibleTask)?.id??null;
}
$('productFilters').addEventListener('click',e=>{
  const button=e.target.closest('[data-product-toggle]');if(!button)return;
  const name=button.dataset.productToggle;
  if(hiddenProducts.has(name))hiddenProducts.delete(name);else hiddenProducts.add(name);
  ensureVisibleSelection();$('personPicker').hidden=true;renderAllocations();persist();
});
$('productFilters').addEventListener('input',e=>{
  if(!e.target.matches('[data-product-color]')||!/^#[0-9a-f]{6}$/i.test(e.target.value))return;
  productColors.set(e.target.dataset.productColor,e.target.value);
  e.target.closest('.product-filter').style.setProperty('--product-color',e.target.value);
  renderDerived();persist();
});

function calculateSprintLoads(taskList,members){
  const loads=Array.from({length:24},()=>({totals:Object.fromEntries(members.map(p=>[p.id,0]))}));
  for(const task of taskList){
    for(let i=task.start;i<=task.end;i++)for(const a of task.assignments){
      if(Object.hasOwn(loads[i].totals,a.id))loads[i].totals[a.id]+=a.pct;
    }
  }
  return loads.map(load=>({...load,average:members.length?Object.values(load.totals).reduce((sum,pct)=>sum+pct,0)/members.length:0,overloaded:members.filter(p=>load.totals[p.id]>100)}));
}
function renderSprintIndicators(loads){
  for(const cell of $('sprints').children){
    const i=Number(cell.dataset.sprint),load=loads[i],over=load.overloaded.length>0;
    const meter=cell.querySelector('.sprint-load');
    meter.setAttribute('aria-valuenow',String(Math.min(100,Math.round(load.average))));
    meter.setAttribute('aria-valuetext',`Средняя загрузка команды ${Math.round(load.average)}%`);
    meter.style.cssText=loadTone(load.average);
    cell.querySelector('.sprint-load-fill').style.width=`${Math.min(100,load.average)}%`;
    cell.querySelector('.sprint-overload').hidden=!over;
    cell.title=`Спринт ${i+1}${over?' · Перегружены: '+load.overloaded.map(p=>p.first+' '+p.last).join(', '):''}`;
  }
}
function renderSummary(loads){
  const totals=loads[selected].totals;
  $('average').innerHTML=`${Math.round(Object.values(totals).reduce((n,p)=>n+p,0)/team.length)}<small>%</small>`;
  $('teamCount').textContent=`${team.length} человек`;
  $('people').innerHTML=groups.map(([role,label])=>{const members=team.filter(p=>p.role===role);if(!members.length)return '';return `<section class="competency-group" aria-label="${label}"><div class="competency-label" title="${label}">${role}<span>${members.length}</span></div><div class="competency-people">${members.map(p=>{const pct=totals[p.id];return `<div class="person-card ${pct>100?'over':pct>=80?'full':''}" data-member="${p.id}" style="${loadTone(pct)}" title="${p.last} ${p.first} · ${p.role} · ${pct}%"><span class="load-value">${pct}%</span><b>${p.first}</b><small>${p.last}</small><div class="load-meter"><i style="width:${Math.min(100,pct)}%"></i></div></div>`}).join('')}</div></section>`}).join('');
}
function renderTimeline(){
  $('prev').disabled=base===0;$('next').disabled=base===24-visibleSprints;
  $('period').textContent=`${months[base/2]} — ${months[base/2+5].toLowerCase()} ${year}`;
  $('months').innerHTML=Array.from({length:6},(_,i)=>`<div>${months[base/2+i]}</div>`).join('');
  $('sprints').innerHTML=Array.from({length:visibleSprints},(_,j)=>{const i=base+j;return `<div class="sprint-cell ${selected===i?'selected':''}" data-sprint="${i}"><b title="Спринт ${i+1}">С${i+1}</b><small>${sprintText(i).split(' ·')[0]}</small><span class="sprint-overload" hidden role="img" aria-label="Есть участники с загрузкой больше 100%"></span><div class="sprint-load" role="progressbar" aria-label="Загрузка команды" aria-valuemin="0" aria-valuemax="100"><i class="sprint-load-fill"></i></div></div>`}).join('');
  $('summarySprint').innerHTML=Array.from({length:24},(_,i)=>`<option value="${i}">${sprintText(i)}</option>`).join('');$('summarySprint').value=selected;
  renderRows();renderDerived();
}
function renderRows(){
  $('taskRows').innerHTML=tasks.map(t=>`<div class="task-row ${t.id===activeTaskId?'is-active':''}" data-task-id="${esc(t.id)}"><div class="task-info"><button class="task-reorder" aria-label="Изменить порядок задачи ${esc(t.name||'Без названия')}" title="Перетащить в пределах продукта · Alt + ↑/↓">⠿</button><input class="task-name" data-field="name" aria-label="Название задачи" maxlength="120" value="${esc(t.name)}"><div class="product-line"><span class="product-dot"></span><input data-field="product" aria-label="Продукт" placeholder="Продукт" maxlength="80" value="${esc(t.product)}"><span class="unassigned-label" hidden>Не назначено</span></div><button class="delete-task" data-delete aria-label="Удалить задачу ${esc(t.name||'Без названия')}" title="Удалить задачу">×</button></div><div class="track"><div class="grid">${Array.from({length:visibleSprints},(_,j)=>`<div class="${base+j===selected?'selected':''}"></div>`).join('')}</div><div class="task-bar" tabindex="0" role="slider" aria-label="Положение задачи ${esc(t.name||'Без названия')}"><div class="resize-handle left" data-edge="left"></div><div class="bar-content"><span class="bar-symbol">▤</span><strong class="bar-name"></strong><span class="bar-unassigned" hidden title="Исполнитель не назначен" aria-label="Исполнитель не назначен">!</span><span class="bar-duration"></span></div><div class="resize-handle right" data-edge="right"></div></div><div class="empty-plan" hidden>В другом периоде</div></div></div>`).join('');
  $('emptyTasks').hidden=tasks.length>0;
  $('taskCount').textContent=String(tasks.length);
  $('undoDelete').disabled=trash.length===0;
}
function renderDerived(){
  const sprintLoads=calculateSprintLoads(tasks,team);
  renderProductFilters();renderSummary(sprintLoads);renderSprintIndicators(sprintLoads);
  const visibleCount=tasks.filter(visibleTask).length;
  $('taskCount').textContent=visibleCount===tasks.length?String(tasks.length):`${visibleCount}/${tasks.length}`;
  $('emptyTasks').hidden=tasks.length>0;

  for(const row of $('taskRows').children){
    const t=tasks.find(t=>t.id===row.dataset.taskId);if(!t)continue;
    row.hidden=!visibleTask(t);row.style.setProperty('--product-color',productColor(productKey(t)));
    row.classList.toggle('is-active',t.id===activeTaskId);
    const unassigned=t.assignments.length===0;
    row.classList.toggle('is-unassigned',unassigned);
    row.querySelector('.unassigned-label').hidden=!unassigned;
    row.querySelector('.bar-unassigned').hidden=!unassigned;
    const bar=row.querySelector('.task-bar'),from=Math.max(t.start,base),to=Math.min(t.end,base+visibleSprints-1);
    bar.hidden=from>to;row.querySelector('.empty-plan').hidden=from<=to;
    bar.style.left=`calc(${(from-base)/visibleSprints*100}% + 5px)`;bar.style.width=`calc(${(to-from+1)/visibleSprints*100}% - 10px)`;
    bar.querySelector('.bar-name').textContent=t.name||'Без названия';bar.querySelector('.bar-duration').textContent=`${t.end-t.start+1} спр.`;
    bar.setAttribute('aria-label',`Положение задачи ${t.name||'Без названия'}${unassigned?' — исполнитель не назначен':''}`);
    bar.title=unassigned?'Исполнитель не назначен':'';
    bar.setAttribute('aria-valuemin','1');bar.setAttribute('aria-valuemax','24');bar.setAttribute('aria-valuenow',t.start+1);bar.setAttribute('aria-valuetext',`Спринты ${t.start+1}–${t.end+1}`);
    row.querySelector('[data-delete]').setAttribute('aria-label',`Удалить задачу ${t.name||'Без названия'}`);
  }
  $('selectedTaskName').textContent=currentTask()?.name||'Без названия';
  document.querySelector('.detail-panel').hidden=!currentTask();
}
function renderAllocations(){
  const state=currentTask();
  $('allocations').dataset.taskId=activeTaskId||'';
  $('allocations').innerHTML=state?groups.map(([role,label])=>{const assigned=state.assignments.filter(a=>person(a.id).role===role);if(!assigned.length)return '';return `<section class="allocation-group" aria-label="${label}"><div class="allocation-group-label">${role}</div>${assigned.map(a=>{const p=person(a.id);return `<div class="allocation-row" data-person="${a.id}"><div class="allocation-person">${av(p)}<div>${p.first} ${p.last}</div></div><div class="allocation-input"><input type="range" min="0" max="100" step="5" value="${a.pct}" data-kind="range" aria-label="Загрузка ${p.first}"><div class="percent-box"><input type="number" min="0" max="100" value="${a.pct}" data-kind="number" aria-label="Процент загрузки ${p.first}"><span>%</span></div></div><button class="remove-person" data-remove="${a.id}" aria-label="Убрать ${p.first}">×</button></div>`}).join('')}</section>`}).join(''):'';
  renderDerived();
}
function selectTask(id){if(activeTaskId===id)return;activeTaskId=id;$('personPicker').hidden=true;renderAllocations();persist()}
function addTask(){
  const task={id:crypto.randomUUID(),year,position:Math.max(0,...tasks.map(t=>t.position||0))+1024,name:'Новая задача',product:'',start:selected,end:selected,assignments:[]};
  hiddenProducts.delete('');tasks.push(task);activeTaskId=task.id;renderRows();renderAllocations();persist();
  const row=$('taskRows').lastElementChild;row.scrollIntoView({block:'nearest',inline:'nearest'});const input=row.querySelector('.task-name');input.focus();input.select();
}
function deleteTask(id){
  const index=tasks.findIndex(t=>t.id===id);if(index<0)return;
  trash.push({task:tasks[index],index});tasks.splice(index,1);
  if(activeTaskId===id)activeTaskId=tasks[Math.min(index,tasks.length-1)]?.id??null;ensureVisibleSelection();
  $('personPicker').hidden=true;renderRows();renderAllocations();persist();
}
function undoDelete(){
  const entry=trash.pop();if(!entry)return;
  hiddenProducts.delete(productKey(entry.task));tasks.splice(Math.min(entry.index,tasks.length),0,entry.task);activeTaskId=entry.task.id;
  renderRows();renderAllocations();persist();
}
$('addTask').onclick=addTask;$('emptyTasks').onclick=addTask;$('undoDelete').onclick=undoDelete;
$('taskRows').addEventListener('click',e=>{const row=e.target.closest('[data-task-id]');if(!row)return;if(e.target.closest('[data-delete]')){deleteTask(row.dataset.taskId);return;}selectTask(row.dataset.taskId)});
$('taskRows').addEventListener('focusin',e=>{const row=e.target.closest('[data-task-id]');if(row)selectTask(row.dataset.taskId)});
$('taskRows').addEventListener('input',e=>{const field=e.target.dataset.field;if(!field)return;const t=tasks.find(t=>t.id===e.target.closest('[data-task-id]').dataset.taskId);t[field]=e.target.value;save()});
$('allocations').addEventListener('input',e=>{if(!e.target.dataset.kind)return;const state=currentTask();if(!state)return;const row=e.target.closest('[data-person]'),a=state.assignments.find(a=>a.id===row.dataset.person);a.pct=Math.max(0,Math.min(100,Number(e.target.value)||0));for(const input of row.querySelectorAll('input'))if(input!==e.target)input.value=a.pct;save()});
$('allocations').addEventListener('change',e=>{if(e.target.dataset.kind)e.target.value=currentTask().assignments.find(a=>a.id===e.target.closest('[data-person]').dataset.person).pct});
$('allocations').onclick=e=>{const btn=e.target.closest('[data-remove]');if(btn){const state=currentTask();state.assignments=state.assignments.filter(a=>a.id!==btn.dataset.remove);renderAllocations();save()}};
function options(){
  const state=currentTask();if(!state)return;
  const q=$('personSearch').value.toLowerCase(),people=team.filter(p=>!state.assignments.some(a=>a.id===p.id)&&`${p.first} ${p.last} ${p.role}`.toLowerCase().includes(q));
  $('personOptions').innerHTML=groups.map(([role,label])=>{const members=people.filter(p=>p.role===role);if(!members.length)return '';return `<div class="picker-group-label" title="${label}">${role}</div>${members.map(p=>`<button data-add="${p.id}">${esc(p.first)} ${esc(p.last)}</button>`).join('')}`}).join('')||'<p style="padding:12px">Участники не найдены</p>';
}
$('addPerson').onclick=()=>{if(!currentTask())return;$('personPicker').hidden=!$('personPicker').hidden;options();if(!$('personPicker').hidden)$('personSearch').focus()};
$('personSearch').oninput=options;
$('personOptions').onclick=e=>{const id=e.target.closest('[data-add]')?.dataset.add,state=currentTask();if(id&&state&&!state.assignments.some(a=>a.id===id)){state.assignments.push({id,pct:50});$('personPicker').hidden=true;renderAllocations();save()}};
document.addEventListener('click',e=>{if(!e.target.closest('.add-person'))$('personPicker').hidden=true});document.addEventListener('keydown',e=>{if(e.key==='Escape')$('personPicker').hidden=true});
$('summarySprint').onchange=e=>{selected=+e.target.value;base=Math.floor(selected/visibleSprints)*visibleSprints;renderTimeline()};
$('sprints').onclick=e=>{const cell=e.target.closest('[data-sprint]');if(cell){selected=+cell.dataset.sprint;renderTimeline()}};
function navigate(delta){base=Math.max(0,Math.min(24-visibleSprints,base+delta));selected=base;renderTimeline()}
$('prev').onclick=()=>navigate(-visibleSprints);$('next').onclick=()=>navigate(visibleSprints);$('today').onclick=()=>{base=0;selected=0;renderTimeline()};
let drag=null,rowDrag=null;
function moveTaskWithinProduct(sourceId,targetId,after){
  const next=TrackerSyncCore.reorderProductTasks(tasks,sourceId,targetId,after);
  if(next===tasks)return;
  tasks=next;renderRows();renderAllocations();persist();
}
function clearRowDrop(){
  for(const info of $('taskRows').querySelectorAll('.drop-before,.drop-after'))info.classList.remove('drop-before','drop-after');
}
function updateRowDrop(){
  if(!rowDrag?.started)return;
  clearRowDrop();rowDrag.targetId=null;
  const info=document.elementFromPoint(rowDrag.x,rowDrag.y)?.closest('.task-info');
  const row=info?.closest('[data-task-id]'),target=tasks.find(t=>t.id===row?.dataset.taskId);
  const source=tasks.find(t=>t.id===rowDrag.id);
  const allowed=target&&source&&target.id!==source.id&&productKey(target)===productKey(source);
  rowDrag.ghost.classList.toggle('is-blocked',!allowed);
  if(!allowed)return;
  const rect=info.getBoundingClientRect();rowDrag.targetId=target.id;rowDrag.after=rowDrag.y>rect.top+rect.height/2;
  info.classList.add(rowDrag.after?'drop-after':'drop-before');
}
function scrollRowDrag(){
  if(!rowDrag?.started)return;
  const scroller=document.querySelector('.timeline-scroll'),rect=scroller.getBoundingClientRect();
  if(rowDrag.x>=rect.left&&rowDrag.x<=rect.right&&rowDrag.y>=rect.top&&rowDrag.y<=rect.bottom){
    const top=rect.top+document.querySelector('.timeline-head').offsetHeight+document.querySelector('.sprint-head').offsetHeight+24;
    const speed=rowDrag.y<top?-Math.min(14,(top-rowDrag.y)/3):rowDrag.y>rect.bottom-28?Math.min(14,(rowDrag.y-rect.bottom+28)/3):0;
    if(speed){scroller.scrollTop+=speed;updateRowDrop();}
  }
  rowDrag.frame=requestAnimationFrame(scrollRowDrag);
}
function finishRowDrag(commit=false){
  if(!rowDrag)return;
  const state=rowDrag;rowDrag=null;
  cancelAnimationFrame(state.frame);state.ghost?.remove();clearRowDrop();
  document.body.classList.remove('reordering-task');
  $('taskRows').querySelector('.is-reordering')?.classList.remove('is-reordering');
  if($('taskRows').hasPointerCapture(state.pointerId))$('taskRows').releasePointerCapture(state.pointerId);
  if(commit&&state.started&&state.targetId)moveTaskWithinProduct(state.id,state.targetId,state.after);
  if(commit&&!state.started&&state.input){state.input.focus();}
  if(state.started){const grip=[...$('taskRows').children].find(r=>r.dataset.taskId===state.id)?.querySelector('.task-reorder');grip?.focus({preventScroll:true});}
  if(cloudDeferred){cloudDeferred=false;cloud?.refresh().catch(()=>{});}
}
$('taskRows').addEventListener('pointerdown',e=>{
  const info=e.target.closest('.task-info');
  if(!info||e.button!==0||e.target.closest('[data-delete],[data-field="product"]'))return;
  // A focused title keeps normal text editing and selection.
  const input=e.target.closest('.task-name');if(input&&document.activeElement===input)return;
  const row=info.closest('[data-task-id]');selectTask(row.dataset.taskId);
  rowDrag={id:row.dataset.taskId,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,input,started:false};
  $('taskRows').setPointerCapture(e.pointerId);e.preventDefault();
});
$('taskRows').addEventListener('pointermove',e=>{
  if(!rowDrag||rowDrag.pointerId!==e.pointerId)return;
  rowDrag.x=e.clientX;rowDrag.y=e.clientY;
  if(!rowDrag.started&&Math.hypot(e.clientX-rowDrag.startX,e.clientY-rowDrag.startY)<5)return;
  e.preventDefault();
  if(!rowDrag.started){
    rowDrag.started=true;document.body.classList.add('reordering-task');
    [...$('taskRows').children].find(r=>r.dataset.taskId===rowDrag.id)?.classList.add('is-reordering');
    rowDrag.ghost=document.createElement('div');rowDrag.ghost.className='task-drag-preview';
    rowDrag.ghost.textContent=tasks.find(t=>t.id===rowDrag.id)?.name||'Без названия';
    document.body.append(rowDrag.ghost);scrollRowDrag();
  }
  rowDrag.ghost.style.left=`${e.clientX+14}px`;rowDrag.ghost.style.top=`${e.clientY+12}px`;updateRowDrop();
});
$('taskRows').addEventListener('pointerup',()=>finishRowDrag(true));
$('taskRows').addEventListener('pointercancel',()=>finishRowDrag());
$('taskRows').addEventListener('lostpointercapture',()=>finishRowDrag());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&rowDrag){e.preventDefault();finishRowDrag();}});
$('taskRows').addEventListener('keydown',e=>{
  if(!e.target.closest('.task-reorder')||!e.altKey||e.ctrlKey||e.metaKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();
  const source=tasks.find(t=>t.id===e.target.closest('[data-task-id]').dataset.taskId);
  const siblings=tasks.filter(t=>productKey(t)===productKey(source)),index=siblings.indexOf(source),target=siblings[index+(e.key==='ArrowUp'?-1:1)];
  if(target){moveTaskWithinProduct(source.id,target.id,e.key==='ArrowDown');[...$('taskRows').children].find(r=>r.dataset.taskId===source.id)?.querySelector('.task-reorder').focus({preventScroll:true});}
});
$('taskRows').addEventListener('pointerdown',e=>{
  const bar=e.target.closest('.task-bar');if(!bar||e.button!==0)return;
  const t=tasks.find(t=>t.id===bar.closest('[data-task-id]').dataset.taskId);selectTask(t.id);
  drag={id:t.id,x:e.clientX,start:t.start,end:t.end,edge:e.target.closest('[data-edge]')?.dataset.edge,width:bar.closest('.track').getBoundingClientRect().width};bar.focus();bar.setPointerCapture(e.pointerId);e.preventDefault();
});
$('taskRows').addEventListener('pointermove',e=>{
  if(!drag)return;const t=tasks.find(t=>t.id===drag.id);if(!t)return;const delta=Math.round((e.clientX-drag.x)/(drag.width/visibleSprints));
  if(drag.edge==='left')t.start=Math.max(0,Math.min(drag.end,drag.start+delta));else if(drag.edge==='right')t.end=Math.max(drag.start,Math.min(23,drag.end+delta));else{const d=Math.max(-drag.start,Math.min(23-drag.end,delta));t.start=drag.start+d;t.end=drag.end+d}renderDerived();
});
function finishDrag(){if(drag){drag=null;save();if(cloudDeferred){cloudDeferred=false;cloud?.refresh().catch(()=>{})}}}
$('taskRows').addEventListener('pointerup',finishDrag);$('taskRows').addEventListener('pointercancel',finishDrag);
$('taskRows').addEventListener('keydown',e=>{if(!e.target.closest('.task-bar')||e.altKey||e.ctrlKey||e.metaKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const t=tasks.find(t=>t.id===e.target.closest('[data-task-id]').dataset.taskId),d=e.key==='ArrowLeft'?-1:1;if(t.start+d>=0&&t.end+d<24){t.start+=d;t.end+=d;save()}});
ensureVisibleSelection();renderTimeline();renderAllocations();persist();

const zoom={x:100,y:100};
try{const stored=JSON.parse(localStorage.getItem('rhythm-zoom-v1'));if(stored){if(Number.isFinite(stored.x))zoom.x=Math.max(50,Math.min(300,stored.x));if(Number.isFinite(stored.y))zoom.y=Math.max(75,Math.min(250,stored.y));}}catch{}
const sheet=document.querySelector('.timeline'),sheetScroll=document.querySelector('.timeline-scroll');
function applyZoom(persist=true){
  const oldWidth=sheet.offsetWidth;
  const center=(sheetScroll.scrollLeft+sheetScroll.clientWidth/2)/oldWidth;
  const width=240+Math.max(480,sheetScroll.clientWidth-240)*zoom.x/100;
  sheet.style.width=`${width}px`;
  sheet.style.setProperty('--row-height',`${Math.round(32*zoom.y/100)}px`);
  sheet.classList.toggle('extra-dense',zoom.y<90);
  sheetScroll.scrollLeft=Math.max(0,center*width-sheetScroll.clientWidth/2);
  $('zoomX').value=zoom.x;$('zoomY').value=zoom.y;
  $('zoomXValue').textContent=`${zoom.x}%`;$('zoomYValue').textContent=`${zoom.y}%`;
  if(persist)try{localStorage.setItem('rhythm-zoom-v1',JSON.stringify(zoom))}catch{}
}
$('zoomX').addEventListener('input',e=>{zoom.x=+e.target.value;applyZoom()});
$('zoomY').addEventListener('input',e=>{zoom.y=+e.target.value;applyZoom()});
function resetZoom(){zoom.x=100;zoom.y=100;applyZoom();sheetScroll.scrollLeft=0;}
$('resetZoom').addEventListener('click',resetZoom);
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Digit0','Numpad0'].includes(e.code))return;
  e.preventDefault();
  if(e.code==='Digit0'||e.code==='Numpad0'){resetZoom();return;}
  if(e.code==='ArrowLeft')zoom.x=Math.max(50,zoom.x-10);
  if(e.code==='ArrowRight')zoom.x=Math.min(300,zoom.x+10);
  if(e.code==='ArrowUp')zoom.y=Math.min(250,zoom.y+5);
  if(e.code==='ArrowDown')zoom.y=Math.max(75,zoom.y-5);
  applyZoom();
});
new ResizeObserver(()=>applyZoom(false)).observe(sheetScroll);
applyZoom(false);

let assigneesCollapsed=false;
try{assigneesCollapsed=localStorage.getItem('rhythm-assignees-collapsed')==='true'}catch{}
function renderAssigneeCollapse(){
  $('assigneesBody').hidden=assigneesCollapsed;
  $('toggleAssignees').setAttribute('aria-expanded',String(!assigneesCollapsed));
  document.querySelector('.detail-panel').classList.toggle('is-collapsed',assigneesCollapsed);
  if(assigneesCollapsed)$('personPicker').hidden=true;
}
document.querySelector('.detail-heading').addEventListener('click',()=>{
  assigneesCollapsed=!assigneesCollapsed;renderAssigneeCollapse();
  try{localStorage.setItem('rhythm-assignees-collapsed',String(assigneesCollapsed))}catch{}
});
renderAssigneeCollapse();

let taskColumnPinned=true;
try{taskColumnPinned=localStorage.getItem('rhythm-task-column-pinned')!=='false'}catch{}
function renderColumnPin(){
  sheet.classList.toggle('is-column-pinned',taskColumnPinned);
  $('pinTaskColumn').setAttribute('aria-pressed',String(taskColumnPinned));
  const label=taskColumnPinned?'Открепить колонку задач':'Закрепить колонку задач';
  $('pinTaskColumn').setAttribute('aria-label',label);$('pinTaskColumn').title=label;
  $('pinTaskColumn').querySelector('.lock-shackle').setAttribute('d',taskColumnPinned?'M5 7V5a3 3 0 0 1 6 0v2':'M5 7V5a3 3 0 0 1 6 0');
}
$('pinTaskColumn').addEventListener('click',()=>{
  taskColumnPinned=!taskColumnPinned;renderColumnPin();
  try{localStorage.setItem('rhythm-task-column-pinned',String(taskColumnPinned))}catch{}
});
renderColumnPin();

// Transfer is explicit: a visitor's stale local cache must never replace a shared plan.
const isLocalHost=['127.0.0.1','localhost'].includes(location.hostname);
const migrationKey='rhythm-imported-'+TRACKER_CLOUD.boardId;
let canMigrate=false;
try{canMigrate=isLocalHost&&hasPreCloudBackup&&localPlanBeforeCloud.tasks.length>0&&localStorage.getItem(migrationKey)!=='true'}catch{}
$('migrateLocalPlan').hidden=!canMigrate;
function syncStatus(status){
  const labels={loading:'● Подключение…',saving:'● Сохраняется…',saved:'● Сохранено в общей базе',offline:'● Нет сети — изменения на устройстве',retrying:'● Нет связи с базой — повторяем'};
  $('saveState').textContent=labels[status]||labels.loading;
  $('saveState').dataset.status=status;
  if(cloud?.ready)document.querySelector('main').inert=false;
}
function applyCloudPlan(plan){
  if(drag||rowDrag){cloudDeferred=true;return false;}
  cloudApplying=true;
  try{
    const oldIds=tasks.filter(visibleTask).map(t=>t.id).join('|');
    tasks=plan.tasks.filter(validTask).map(cleanTask);
    trash=plan.trash.filter(x=>validTask(x.task)).map(x=>({...x,task:cleanTask(x.task)}));
    productColors=new Map(Object.entries(plan.productColors));
    ensureVisibleSelection();
    const newIds=tasks.filter(visibleTask).map(t=>t.id).join('|');
    const hasRows=[...$('taskRows').children].map(r=>r.dataset.taskId).join('|')===tasks.map(t=>t.id).join('|');
    if(!hasRows||oldIds!==newIds)renderRows();
    else for(const row of $('taskRows').children){
      const task=tasks.find(t=>t.id===row.dataset.taskId);
      for(const input of row.querySelectorAll('[data-field]'))if(document.activeElement!==input)input.value=task[input.dataset.field];
    }
    const editingAllocation=$('allocations').contains(document.activeElement);
    if(!editingAllocation)renderAllocations();else renderDerived();
    $('undoDelete').disabled=trash.length===0;
    persist();
  }finally{cloudApplying=false;}
  return true;
}
$('exportPlan').onclick=()=>{
  const plan=canMigrate?localPlanBeforeCloud:{year,tasks,trash,productColors:Object.fromEntries(productColors)};
  const url=URL.createObjectURL(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='tracker-2027-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('migrateLocalPlan').onclick=()=>{
  if(!cloud?.ready)return;
  const merged=new Map(tasks.map(t=>[t.id,t]));
  localPlanBeforeCloud.tasks.forEach((t,index)=>merged.set(t.id,{...t,position:t.position??index*1024}));
  tasks=[...merged.values()];
  for(const [name,color] of Object.entries(localPlanBeforeCloud.productColors))productColors.set(name,color);
  activeTaskId=tasks[0]?.id??null;renderRows();renderAllocations();persist();
  canMigrate=false;$('migrateLocalPlan').hidden=true;
  try{localStorage.setItem(migrationKey,'true')}catch{}
};
if(window.TRACKER_CLOUD&&window.SharedTracker){
  document.querySelector('main').inert=true;
  cloud=new SharedTracker(TRACKER_CLOUD,applyCloudPlan,syncStatus);
  cloud.start();
}else{
  $('saveState').textContent='Общая база не подключена';
}
