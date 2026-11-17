-- Shared 2027 board. The final access section below requires team authentication.
create table public.tracker_entities (
  board_id uuid not null,
  id text not null check (length(id) between 1 and 200),
  kind text not null check (kind in ('task','product')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object' and octet_length(payload::text)<65536),
  deleted boolean not null default false,
  version bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(board_id,id)
);
create table public.tracker_operations (
  board_id uuid not null,
  op_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(board_id,op_id)
);
alter table public.tracker_entities enable row level security;
alter table public.tracker_operations enable row level security;
create policy tracker_shared_read on public.tracker_entities for select to anon,authenticated using (board_id='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid);
create policy tracker_shared_insert on public.tracker_entities for insert to anon,authenticated with check (board_id='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid);
create policy tracker_shared_update on public.tracker_entities for update to anon,authenticated using (board_id='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid) with check (board_id='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid);
create policy tracker_op_read on public.tracker_operations for select to anon,authenticated using (board_id='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid);
create policy tracker_op_insert on public.tracker_operations for insert to anon,authenticated with check (board_id='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid);
grant select,insert,update on public.tracker_entities to anon,authenticated;
grant select,insert on public.tracker_operations to anon,authenticated;
create function public.tracker_mutate(p_board uuid,p_id text,p_kind text,p_operation uuid,p_action text,p_patches jsonb)
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
revoke all on function public.tracker_mutate(uuid,text,text,uuid,text,jsonb) from public;
grant execute on function public.tracker_mutate(uuid,text,text,uuid,text,jsonb) to anon,authenticated;
alter publication supabase_realtime add table public.tracker_entities;

-- Final access rules: anonymous access is disabled.
-- Team membership is managed only by the project administrator.
create table if not exists public.tracker_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_code text not null unique,
  board_id uuid not null default '4f3bd94f-4f60-4756-b865-c9af7ef82e6e'::uuid
);
alter table public.tracker_members enable row level security;
revoke all on public.tracker_members from anon,authenticated;
grant select on public.tracker_members to authenticated;
drop policy if exists tracker_member_self on public.tracker_members;
create policy tracker_member_self on public.tracker_members for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists tracker_shared_read on public.tracker_entities;
drop policy if exists tracker_shared_insert on public.tracker_entities;
drop policy if exists tracker_shared_update on public.tracker_entities;
drop policy if exists tracker_op_read on public.tracker_operations;
drop policy if exists tracker_op_insert on public.tracker_operations;
revoke all on public.tracker_entities,public.tracker_operations from anon;
grant select,insert,update on public.tracker_entities to authenticated;
grant select,insert on public.tracker_operations to authenticated;
create policy tracker_shared_read on public.tracker_entities for select to authenticated
 using (board_id in (select board_id from public.tracker_members where user_id=(select auth.uid())));
create policy tracker_shared_insert on public.tracker_entities for insert to authenticated
 with check (board_id in (select board_id from public.tracker_members where user_id=(select auth.uid())));
create policy tracker_shared_update on public.tracker_entities for update to authenticated
 using (board_id in (select board_id from public.tracker_members where user_id=(select auth.uid())))
 with check (board_id in (select board_id from public.tracker_members where user_id=(select auth.uid())));
create policy tracker_op_read on public.tracker_operations for select to authenticated
 using (board_id in (select board_id from public.tracker_members where user_id=(select auth.uid())));
create policy tracker_op_insert on public.tracker_operations for insert to authenticated
 with check (board_id in (select board_id from public.tracker_members where user_id=(select auth.uid())));
revoke all on function public.tracker_mutate(uuid,text,text,uuid,text,jsonb) from public,anon;
grant execute on function public.tracker_mutate(uuid,text,text,uuid,text,jsonb) to authenticated;

-- Conditional per-user undo.
-- Compare and reverse one user action atomically, under the existing member RLS.
create or replace function public.tracker_undo(p_board uuid,p_operation uuid,p_changes jsonb)
returns setof public.tracker_entities language plpgsql security invoker set search_path='' as $$
declare change jsonb; item public.tracker_entities; check_item jsonb; field_path text[];
begin
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 500 then raise exception 'Invalid undo'; end if;
  if not exists(select 1 from public.tracker_members where user_id=(select auth.uid()) and board_id=p_board) then raise exception 'Access denied' using errcode='42501'; end if;
  -- Serialize retries of the same request without allowing a duplicate reversal.
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
  if exists(select 1 from public.tracker_operations where board_id=p_board and op_id=p_operation) then
    return query select * from public.tracker_entities where board_id=p_board and id in (select value->>'id' from jsonb_array_elements(p_changes));return;
  end if;
  -- Lock the complete action first; no partial undo when one field conflicts.
  for change in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    select * into item from public.tracker_entities where board_id=p_board and id=change->>'id' for update;
    if not found or item.kind is distinct from change->>'kind' or item.deleted is distinct from (change->>'expected_deleted')::boolean then raise exception 'UNDO_CONFLICT'; end if;
    if change ? 'expected_payload' and item.payload is distinct from change->'expected_payload' then raise exception 'UNDO_CONFLICT'; end if;
    for check_item in select value from jsonb_array_elements(change->'checks') loop
      field_path=array(select jsonb_array_elements_text(check_item->'path'));
      if coalesce((check_item->>'missing')::boolean,false) then
        if item.payload #> field_path is not null then raise exception 'UNDO_CONFLICT'; end if;
      elsif item.payload #> field_path is distinct from check_item->'value' then raise exception 'UNDO_CONFLICT'; end if;
    end loop;
  end loop;
  insert into public.tracker_operations(board_id,op_id) values(p_board,p_operation);
  for change in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    return query select * from public.tracker_mutate(p_board,change->>'id',change->>'kind',(change->>'operation')::uuid,change->>'action',change->'patches');
  end loop;
end $$;
revoke all on function public.tracker_undo(uuid,uuid,jsonb) from public,anon;
grant execute on function public.tracker_undo(uuid,uuid,jsonb) to authenticated;
