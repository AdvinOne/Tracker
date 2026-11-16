-- Run against a configured board. Every test record is rolled back.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.tracker_members where member_code='sa'),true);
set local role authenticated;
do $$
declare
 board uuid:='4f3bd94f-4f60-4756-b865-c9af7ef82e6e';
 changes jsonb; batch_id uuid:=gen_random_uuid(); first_version bigint; next_version bigint;
begin
 perform public.tracker_mutate(board,'t:undo-test-a','task',gen_random_uuid(),'patch','[{"path":["name"],"value":"My edit"}]');
 perform public.tracker_mutate(board,'t:undo-test-b','task',gen_random_uuid(),'patch','[{"path":["name"],"value":"Another edit"}]');
 changes=jsonb_build_array(
  jsonb_build_object('id','t:undo-test-a','kind','task','expected_deleted',false,'checks','[{"path":["name"],"value":"My edit"}]'::jsonb,'action','patch','patches','[{"path":["name"],"value":"Original"}]'::jsonb,'operation',gen_random_uuid()),
  jsonb_build_object('id','t:undo-test-b','kind','task','expected_deleted',false,'checks','[{"path":["name"],"value":"My old edit"}]'::jsonb,'action','patch','patches','[{"path":["name"],"value":"Original"}]'::jsonb,'operation',gen_random_uuid())
 );
 begin
  perform public.tracker_undo(board,batch_id,changes);
  raise exception 'TEST_FAILED: conflicting action accepted';
 exception when raise_exception then
  if sqlerrm<>'UNDO_CONFLICT' then raise; end if;
 end;
 if (select payload->>'name' from public.tracker_entities where board_id=board and id='t:undo-test-a')<>'My edit' then raise exception 'TEST_FAILED: partial undo'; end if;
 -- A different field changed by a collaborator is preserved.
 perform public.tracker_mutate(board,'t:undo-test-a','task',gen_random_uuid(),'patch','[{"path":["product"],"value":"Collaborator product"}]');
 changes=jsonb_build_array(changes->0);
 perform public.tracker_undo(board,batch_id,changes);
 if (select payload->>'name' from public.tracker_entities where board_id=board and id='t:undo-test-a')<>'Original' then raise exception 'TEST_FAILED: name not restored'; end if;
 if (select payload->>'product' from public.tracker_entities where board_id=board and id='t:undo-test-a')<>'Collaborator product' then raise exception 'TEST_FAILED: collaborator data overwritten'; end if;
 select version into first_version from public.tracker_entities where board_id=board and id='t:undo-test-a';
 perform public.tracker_undo(board,batch_id,changes);
 select version into next_version from public.tracker_entities where board_id=board and id='t:undo-test-a';
 if first_version<>next_version then raise exception 'TEST_FAILED: retry applied twice'; end if;
 if has_function_privilege('anon','public.tracker_undo(uuid,uuid,jsonb)','execute') then raise exception 'TEST_FAILED: anonymous undo permitted'; end if;
end $$;
select 'PASS: atomic conflict, independent fields, idempotent retry, authenticated-only access' as verification;
rollback;
