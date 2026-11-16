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
