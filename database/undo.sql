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
