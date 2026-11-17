-- Optional rich text on product entities. Existing team access rules are preserved.
create or replace function public.tracker_mutate(p_board uuid,p_id text,p_kind text,p_operation uuid,p_action text,p_patches jsonb)
returns setof public.tracker_entities language plpgsql security invoker set search_path = '' as $$
declare
  item public.tracker_entities;
  patch jsonb;
  path text[];
  doc jsonb;
  affected int;
  member record;
begin
  if p_kind not in ('task','product') or p_action not in ('patch','delete','restore') or jsonb_typeof(p_patches)<>'array' or jsonb_array_length(p_patches)>40 then raise exception 'Invalid operation'; end if;
  insert into public.tracker_operations(board_id,op_id) values(p_board,p_operation) on conflict do nothing;
  get diagnostics affected = row_count;
  if affected=0 then return query select * from public.tracker_entities where board_id=p_board and id=p_id; return; end if;
  insert into public.tracker_entities(board_id,id,kind,payload) values(p_board,p_id,p_kind,
    case when p_kind='task' then '{"name":"Новая задача","product":"","start":0,"end":0,"assignments":{},"position":0}'::jsonb else '{"color":"#739653"}'::jsonb end) on conflict do nothing;
  select * into strict item from public.tracker_entities where board_id=p_board and id=p_id for update;
  if item.kind<>p_kind then raise exception 'Entity kind mismatch'; end if;
  -- A stale edit may never resurrect a task deleted by a different collaborator.
  if item.deleted and p_action='patch' then return next item; return; end if;
  doc=item.payload;
  for patch in select value from jsonb_array_elements(p_patches) loop
    path=array(select jsonb_array_elements_text(patch->'path'));
    if p_kind='task' then
      if not ((cardinality(path)=1 and path[1] in ('name','product','start','end','position')) or (cardinality(path)=2 and path[1]='assignments' and path[2] in ('sa','ak','my','aa','dg','fb','ad','as','al','ek','sg','au'))) then raise exception 'Invalid field'; end if;
    elsif cardinality(path)<>1 or path[1] not in ('color','description','result') then raise exception 'Invalid product field'; end if;
    if coalesce((patch->>'remove')::boolean,false) then
      if not ((p_kind='task' and cardinality(path)=2 and path[1]='assignments') or (p_kind='product' and cardinality(path)=1 and path[1] in ('description','result'))) then raise exception 'Required field cannot be removed'; end if;
      doc=doc #- path;
    else doc=jsonb_set(doc,path,patch->'value',true); end if;
  end loop;
  if p_kind='task' then
    if jsonb_typeof(doc->'name') is distinct from 'string' or length(doc->>'name')>120 or jsonb_typeof(doc->'product') is distinct from 'string' or length(doc->>'product')>80 or jsonb_typeof(doc->'start') is distinct from 'number' or jsonb_typeof(doc->'end') is distinct from 'number' or (doc->>'start')::int not between 0 and 23 or (doc->>'end')::int not between (doc->>'start')::int and 23 or jsonb_typeof(doc->'assignments') is distinct from 'object' then raise exception 'Invalid task'; end if;
    for member in select key,value from jsonb_each(doc->'assignments') loop
      if jsonb_typeof(member.value)<>'number' or (member.value::text)::numeric not between 0 and 100 then raise exception 'Invalid allocation'; end if;
    end loop;
  elsif jsonb_typeof(doc->'color') is distinct from 'string' or (doc->>'color') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid color'; end if;
  if p_kind='product' then
    for member in select key,value from jsonb_each(doc) where key in ('description','result') loop
      if jsonb_typeof(member.value)<>'string' or octet_length(doc->>member.key)>24000 then raise exception 'Invalid product text'; end if;
    end loop;
  end if;
  update public.tracker_entities set payload=doc,deleted=case when p_action='delete' then true when p_action='restore' then false else deleted end,version=version+1,updated_at=clock_timestamp() where board_id=p_board and id=p_id returning * into item;
  return next item;
end $$;
