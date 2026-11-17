-- All test changes are rolled back, including operation IDs.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.tracker_members where member_code='sa'),true);
set local role authenticated;
do $$
declare board uuid:='4f3bd94f-4f60-4756-b865-c9af7ef82e6e'; doc jsonb; changes jsonb;
begin
 perform public.tracker_mutate(board,'p:product-info-test','product',gen_random_uuid(),'patch','[{"path":["description"],"value":"<b>Description</b>"},{"path":["result"],"value":"<ol><li>Outcome</li></ol>"}]');
 perform public.tracker_mutate(board,'p:product-info-test','product',gen_random_uuid(),'patch','[{"path":["color"],"value":"#123456"}]');
 select payload into doc from public.tracker_entities where board_id=board and id='p:product-info-test';
 if doc->>'description'<>'<b>Description</b>' or doc->>'result'<>'<ol><li>Outcome</li></ol>' then raise exception 'TEST_FAILED: old client overwrote metadata'; end if;
 changes=jsonb_build_array(jsonb_build_object('id','p:product-info-test','kind','product','expected_deleted',false,'checks','[{"path":["description"],"value":"<b>Description</b>"}]'::jsonb,'action','patch','patches','[{"path":["description"],"remove":true}]'::jsonb,'operation',gen_random_uuid()));
 perform public.tracker_undo(board,gen_random_uuid(),changes);
 select payload into doc from public.tracker_entities where board_id=board and id='p:product-info-test';
 if doc ? 'description' or doc->>'color'<>'#123456' or doc->>'result'<>'<ol><li>Outcome</li></ol>' then raise exception 'TEST_FAILED: undo clobbered other fields'; end if;
 begin
  perform public.tracker_mutate(board,'p:product-info-test','product',gen_random_uuid(),'patch','[{"path":["result"],"value":42}]');
  raise exception 'TEST_FAILED: invalid type accepted';
 exception when raise_exception then if sqlerrm<>'Invalid product text' then raise; end if; end;
 begin
  perform public.tracker_mutate(board,'p:product-info-test','product',gen_random_uuid(),'patch',jsonb_build_array(jsonb_build_object('path',array['description'],'value',repeat('x',24001))));
  raise exception 'TEST_FAILED: oversized text accepted';
 exception when raise_exception then if sqlerrm<>'Invalid product text' then raise; end if; end;
 if has_function_privilege('anon','public.tracker_mutate(uuid,text,text,uuid,text,jsonb)','execute') then raise exception 'TEST_FAILED: anonymous mutation'; end if;
end $$;
select 'PASS: shared metadata, legacy clients, undo, validation, authenticated access' as verification;
rollback;
