(function(root){
  const core=root.TrackerSyncCore;
  class SharedTracker {
    constructor(config,onChange,onStatus){
      this.config=config;this.onChange=onChange;this.onStatus=onStatus;
      this.client=root.createSupabaseClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:10}}});
      this.storageKey='rhythm-cloud-'+config.boardId;
      this.entities=new Map();this.pending=[];this.ready=false;this.flushing=false;this.failure=0;this.refreshing=null;this.lastSuccess=0;
      try{const saved=JSON.parse(localStorage.getItem(this.storageKey));if(saved){this.entities=new Map(saved.entities||[]);this.pending=saved.pending||[]}}catch{}
      this.localView=this.overlay();
    }
    overlay(){const map=new Map([...this.entities].map(([id,e])=>[id,structuredClone(e)]));for(const op of this.pending)core.applyOperation(map,op);return map;}
    cache(){try{localStorage.setItem(this.storageKey,JSON.stringify({entities:[...this.entities],pending:this.pending}))}catch{}}
    emit(){const next=this.overlay();if(this.onChange(core.toPlan(next))!==false)this.localView=next;this.cache();}
    status(){this.onStatus(!navigator.onLine?'offline':this.failure?'retrying':this.pending.length?'saving':'saved');}
    capture(plan){
      if(!this.ready)return;
      const next=core.toEntities(plan),ops=core.diffEntities(this.localView,next);
      if(!ops.length){this.status();return;}
      for(const op of ops){op.operation=crypto.randomUUID();this.pending.push(op);}
      this.localView=next;this.cache();this.status();clearTimeout(this.flushTimer);this.flushTimer=setTimeout(()=>this.flush(),220);
    }
    async flush(){
      if(this.flushing||!this.ready)return;this.flushing=true;
      try{
        while(this.pending.length){
          const op=this.pending[0];this.onStatus('saving');
          const {data,error}=await this.client.rpc('tracker_mutate',{p_board:this.config.boardId,p_id:op.id,p_kind:op.kind,p_operation:op.operation,p_action:op.action,p_patches:op.patches});
          if(error)throw error;
          for(const entity of data||[]){const previous=this.entities.get(entity.id);if(!previous||entity.version>=previous.version)this.entities.set(entity.id,entity);}
          this.pending.shift();this.failure=0;this.lastSuccess=Date.now();this.cache();
        }
        this.emit();this.status();
      }catch(error){this.failure++;this.onStatus(navigator.onLine?'retrying':'offline');clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.flush(),Math.min(30000,1000*2**Math.min(this.failure,5)));}
      finally{this.flushing=false;}
    }
    async refresh(){
      if(this.refreshing)return this.refreshing;
      this.refreshing=(async()=>{
        const {data,error}=await this.client.from('tracker_entities').select('*').eq('board_id',this.config.boardId);
        if(error)throw error;
        const next=new Map((data||[]).map(e=>[e.id,e]));for(const [id,row] of this.entities){if(!next.has(id)||row.version>next.get(id).version)next.set(id,row);}this.entities=next;this.ready=true;this.lastSuccess=Date.now();this.failure=0;this.emit();this.status();
      })();
      try{await this.refreshing}catch(error){this.failure++;this.onStatus('retrying');throw error}finally{this.refreshing=null}
    }
    async start(){
      this.onStatus('loading');
      this.channel=this.client.channel('tracker-'+this.config.boardId).on('postgres_changes',{event:'*',schema:'public',table:'tracker_entities',filter:'board_id=eq.'+this.config.boardId},payload=>{
        const row=payload.new;if(!row?.id)return;
        const previous=this.entities.get(row.id);
        if(previous&&previous.version>=row.version)return;
        this.entities.set(row.id,row);this.emit();this.status();
      }).subscribe(status=>{if(status==='SUBSCRIBED')this.refresh().then(()=>this.flush()).catch(()=>{});});
      try{await this.refresh();await this.flush()}catch{}
      this.poll=setInterval(()=>{if(document.visibilityState==='visible')this.refresh().then(()=>this.flush()).catch(()=>{})},5000);
      window.addEventListener('online',()=>this.refresh().then(()=>this.flush()).catch(()=>{}));
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.refresh().then(()=>this.flush()).catch(()=>{})});
      window.addEventListener('pagehide',()=>this.cache());
      window.addEventListener('beforeunload',e=>{if(this.pending.length){e.preventDefault();e.returnValue=''}});
    }
  }
  root.SharedTracker=SharedTracker;
})(globalThis);
