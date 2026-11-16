(function(root){
  const config=root.TRACKER_CLOUD;
  const client=root.createSupabaseClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'tracker-auth-'+config.boardId},realtime:{params:{eventsPerSecond:10}}});
  root.trackerClient=client;
  let resolveReady,authorized=false,busy=false;
  root.trackerAuthReady=new Promise(resolve=>{resolveReady=resolve;});
  const $=id=>document.getElementById(id);
  const names=[['sa','Сергей Агапов'],['ak','Алина Козловцева'],['my','Мария Юферова'],['aa','Александра Альбицкая'],['dg','Диляра Голубятникова'],['fb','Федора Бобкова'],['ad','Алена Должкова'],['as','Анастасия Скворцова'],['al','Алексей Литвинов'],['ek','Евгений Колосков'],['sg','Сабина Грачева'],['au','Андрей Устинов']];
  for(const [code,name] of names){const option=document.createElement('option');option.value=code;option.textContent=name;$('loginMember').append(option);}
  function error(message){$('authError').textContent=message;$('authError').hidden=!message;}
  function loading(value){busy=value;$('loginSubmit').disabled=value;$('loginSubmit').textContent=value?'Подключение…':'Войти';$('loginMember').disabled=value;$('loginPassword').disabled=value;}
  function clearPlanCache(){
    for(const key of ['rhythm-plan-2027-v2','rhythm-task-v1','rhythm-pre-cloud-backup-2027','rhythm-cloud-'+config.boardId])try{localStorage.removeItem(key);}catch{}
  }
  async function authorize(session){
    if(!session)return false;
    const {data,error:failure}=await client.from('tracker_members').select('member_code').eq('user_id',session.user.id).eq('board_id',config.boardId).maybeSingle();
    if(failure)throw new Error('Не удалось проверить доступ. Проверьте связь и попробуйте снова.');
    if(!data||!names.some(([code])=>code===data.member_code)){
      await client.auth.signOut({scope:'local'});throw new Error('У этой учётной записи нет доступа к трекеру.');
    }
    authorized=true;$('signedInName').textContent=names.find(([code])=>code===data.member_code)[1];
    $('loginPassword').value='';$('authScreen').hidden=true;document.querySelector('main').hidden=false;resolveReady();return true;
  }
  root.trackerSignOut=async()=>{
    const {error:failure}=await client.auth.signOut({scope:'local'});
    if(failure)throw new Error('Не удалось выйти. Проверьте связь и попробуйте снова.');
    clearPlanCache();location.reload();
  };
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_IN'&&!authorized&&!busy){setTimeout(async()=>{loading(true);try{await authorize(session);}catch(failure){error(failure.message);}finally{loading(false);}},0);}

    if(event==='SIGNED_OUT'&&authorized){authorized=false;document.querySelector('main').hidden=true;$('authScreen').hidden=false;root.dispatchEvent(new Event('tracker-auth-lost'));setTimeout(()=>location.reload(),0);}
  });
  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const code=$('loginMember').value,password=$('loginPassword').value;
    if(!names.some(([id])=>id===code)||!password)return;
    loading(true);error('');
    try{
      const {data,error:failure}=await client.auth.signInWithPassword({email:code+'@tracker.internal',password});
      if(failure){const message=failure.status===429?'Слишком много попыток. Подождите немного.':failure.status===400?'Неверный пароль.':'Не удалось войти. Проверьте связь и попробуйте снова.';throw new Error(message);}
      await authorize(data.session);
    }catch(failure){error(failure.message);$('loginPassword').value='';}
    finally{loading(false);}
  });
  (async()=>{
    loading(true);
    try{const {data,error:failure}=await client.auth.getSession();if(failure)throw failure;await authorize(data.session);}
    catch{error('Не удалось восстановить вход. Войдите снова или обновите страницу.');}
    finally{loading(false);}
  })();
})(globalThis);
