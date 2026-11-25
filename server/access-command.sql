CREATE OR REPLACE FUNCTION public.zb_command(p_actor uuid, p_session uuid, p_device text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.zb_profiles; d public.zb_devices; l public.zb_learning;
  c public.zb_courses; oldc public.zb_courses; t public.zb_profiles; td public.zb_devices;
  answers jsonb; q jsonb; score_n integer:=0; total_n integer:=0; attempts_n integer;
  r jsonb; v_body jsonb; result jsonb; target_id uuid; aid uuid; course_id_n integer;
  new_status text; max_n integer; id_text text; count_n integer; rev_n integer;
begin
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session and s.user_id=p_actor and u.deleted_at is null and u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now())) then raise exception 'SESSION_EXPIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into p from public.zb_profiles where id=p_actor;
  if not found then
    insert into public.zb_profiles(id,email,display_name,role,status,device_approval_required,signup_source) select id,email,left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'学习者'),80),'student','active',false,'self_signup' from auth.users where id=p_actor and email_confirmed_at is not null and deleted_at is null;
    select * into p from public.zb_profiles where id=p_actor;
  end if;
  select * into d from public.zb_devices where user_id=p_actor and key_hash=p_device;
  if p_action='session_check' then return jsonb_build_object('ok',true); end if;
  if p_action='status' then
    if d.id is null then
      select count(*) into count_n from public.zb_devices where user_id=p_actor and status='active';
      new_status:=case when (p.role='admin' or not p.device_approval_required) and p.status='active' and count_n<p.max_devices then 'active' else 'pending' end;
      insert into public.zb_devices(user_id,key_hash,session_id,label,status)
        values(p_actor,p_device,p_session,left(coalesce(p_data->>'label','浏览器'),180),new_status) returning * into d;
      insert into public.zb_audit(actor,action,target,detail) values(p_actor,'device_registered',d.id::text,jsonb_build_object('status',new_status));
    else
      update public.zb_devices set session_id=p_session,last_seen_at=now() where id=d.id returning * into d;
    end if;
    update public.zb_profiles set last_seen_at=now() where id=p_actor;
    return jsonb_build_object('profile',to_jsonb(p),'device',to_jsonb(d)-'key_hash'-'session_id',
      'devices',(select coalesce(jsonb_agg(to_jsonb(x)-'key_hash'-'session_id'),'[]') from public.zb_devices x where user_id=p_actor));
  end if;
  if p.status<>'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if d.id is null or d.status<>'active' or d.session_id<>p_session then raise exception 'DEVICE_RESTRICTED'; end if;
  update public.zb_devices set last_seen_at=now() where id=d.id;
  update public.zb_profiles set last_seen_at=now() where id=p_actor;
  if p_action in ('my_account','order_create','order_cancel','commerce_dashboard','user_lookup','product_save','course_access_save','grant_create','grant_extend','grant_revoke','order_confirm','order_close','order_refund','email_delivery_update') then return public.zb_commerce(p_actor,p_action,p_data); end if;
  if p_action='course_download' then
    course_id_n:=(p_data->>'course_id')::integer;
    if not public.zb_can_learn(p_actor,course_id_n) then raise exception 'COURSE_ACCESS_REQUIRED'; end if;
    if not exists(select 1 from public.zb_courses course_row,jsonb_array_elements(coalesce(course_row.payload->'downloads','[]')) x where course_row.id=course_id_n and course_row.published and x->>'id'='workbook') then raise exception 'COURSE_NOT_FOUND'; end if;
    select value into result from public.zb_settings where key='course_workbook_'||course_id_n::text;
    if result is null then raise exception 'FILE_NOT_AVAILABLE'; end if;
    return result;
  end if;
  if p_action='courses' then
    return jsonb_build_object('courses',(select coalesce(jsonb_agg(public.zb_course_view(id,p_actor) order by id),'[]') from public.zb_courses where published),
      'sources',coalesce((select value from public.zb_settings where key='sources'),'[]'));
  end if;
  insert into public.zb_learning(user_id) values(p_actor) on conflict do nothing;
  select * into l from public.zb_learning where user_id=p_actor for update;
  if p_action='state_get' then return jsonb_build_object('state',l.body,'revision',l.revision); end if;
  if p_action='state_save' then
    if (p_data->>'revision')::integer<>l.revision then return jsonb_build_object('conflict',true,'state',l.body,'revision',l.revision); end if;
    v_body:=p_data->'state';
    -- Score, best and attempts come from server-graded attempts, never from imported client data.
    for c in select * from public.zb_courses where published and public.zb_can_learn(p_actor,id) loop
      id_text:=c.id::text; r:=coalesce(v_body->'courses'->id_text,'{}');
      if (l.body->'courses'->id_text->>'courseRevision')::integer=c.revision then
        r:=r||jsonb_build_object('score',coalesce(l.body->'courses'->id_text->'score','0'),
          'best',coalesce(l.body->'courses'->id_text->'best','0'),'attempts',coalesce(l.body->'courses'->id_text->'attempts','0'),
          'lastAnswers',coalesce(l.body->'courses'->id_text->'lastAnswers','{}'),
          'submitted',case when coalesce((r->>'submitted')::boolean,false)=false then 'false'::jsonb else coalesce(l.body->'courses'->id_text->'submitted','false') end,
          'courseRevision',c.revision);
      else
        r:=r||jsonb_build_object('score',0,'best',0,'attempts',0,'lastAnswers','{}'::jsonb,'submitted',false,'courseRevision',c.revision);
      end if;
      v_body:=jsonb_set(v_body,array['courses',id_text],r,true);
    end loop;
    update public.zb_learning set body=v_body,revision=revision+1,updated_at=now() where user_id=p_actor returning * into l;
    return jsonb_build_object('state',l.body,'revision',l.revision);
  end if;
  if p_action='quiz_submit' then
    if not public.zb_can_learn(p_actor,(p_data->>'course_id')::integer) then raise exception 'COURSE_ACCESS_REQUIRED'; end if;
    aid:=(p_data->>'attempt_id')::uuid;
    if exists(select 1 from public.zb_attempts where id=aid and user_id<>p_actor) then raise exception 'INVALID_ATTEMPT'; end if;
    if exists(select 1 from public.zb_attempts where id=aid and user_id=p_actor) then return jsonb_build_object('state',l.body,'revision',l.revision); end if;
    course_id_n:=(p_data->>'course_id')::integer;
    select * into c from public.zb_courses where id=course_id_n and published;
    if not found then raise exception 'COURSE_NOT_FOUND'; end if;
    if (p_data->>'course_revision')::integer<>c.revision then raise exception 'COURSE_UPDATED'; end if;
    answers:=p_data->'answers';
    for q in select * from jsonb_array_elements(c.payload->'quiz') loop
      total_n:=total_n+1;
      if not (answers ? (q->>'id')) or jsonb_typeof(answers->(q->>'id'))<>'number' or
        (answers->>(q->>'id'))::numeric<>trunc((answers->>(q->>'id'))::numeric) or
        (answers->>(q->>'id'))::integer<0 or (answers->>(q->>'id'))::integer>=jsonb_array_length(q->'options') then raise exception 'QUIZ_INCOMPLETE'; end if;
      if (answers->>(q->>'id'))::integer=(q->>'correct')::integer then score_n:=score_n+1; end if;
    end loop;
    insert into public.zb_attempts(id,user_id,course_id,course_revision,answers,score,total) values(aid,p_actor,c.id,c.revision,answers,score_n,total_n);
    select count(*),max(score) into attempts_n,count_n from public.zb_attempts where user_id=p_actor and course_id=c.id and course_revision=c.revision;
    id_text:=c.id::text;
    r:=coalesce(l.body->'courses'->id_text,'{}')||jsonb_build_object('answers',answers,'lastAnswers',answers,'submitted',true,'score',score_n,'best',count_n,'attempts',attempts_n,'courseRevision',c.revision);
    v_body:=jsonb_set(l.body,array['courses',id_text],r,true);
    update public.zb_learning set body=v_body,revision=revision+1,updated_at=now() where user_id=p_actor returning * into l;
    return jsonb_build_object('state',l.body,'revision',l.revision);
  end if;
  if p_action='access_check' then
    if p_data ? 'course_id' and not public.zb_can_learn(p_actor,(p_data->>'course_id')::integer) then raise exception 'COURSE_ACCESS_REQUIRED'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if p.role<>'admin' then raise exception 'ADMIN_REQUIRED'; end if;
  if p_action='admin_check' then return jsonb_build_object('ok',true); end if;
  if p_action='admin_dashboard' then
    return jsonb_build_object('profiles',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from public.zb_profiles x),
      'devices',(select coalesce(jsonb_agg(to_jsonb(x)-'key_hash'-'session_id' order by x.created_at desc),'[]') from public.zb_devices x),
      'learning',(select coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'courses',x.body->'courses','updated_at',x.updated_at)),'[]') from public.zb_learning x),
      'courses',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.zb_courses x),
      'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select actor,action,target,detail,created_at from public.zb_audit order by created_at desc limit 100) x));
  end if;
  if p_action='profile_update' then
    target_id:=(p_data->>'user_id')::uuid;
    select * into t from public.zb_profiles where id=target_id for update;
    if not found then raise exception 'USER_NOT_FOUND'; end if;
    if target_id=p_actor and p_data->>'status'<>'active' then raise exception 'KEEP_OWN_ACCESS'; end if;
    new_status:=p_data->>'status'; max_n:=(p_data->>'max_devices')::integer;
    if new_status not in ('active','pending','blocked') or max_n not between 1 and 10 then raise exception 'INVALID_PROFILE'; end if;
    select count(*) into count_n from public.zb_devices where user_id=target_id and status='active';
    if count_n>max_n then raise exception 'REVOKE_EXTRA_DEVICES'; end if;
    update public.zb_profiles set status=new_status,max_devices=max_n where id=target_id;
    insert into public.zb_audit(actor,action,target,detail) values(p_actor,'profile_updated',target_id::text,jsonb_build_object('status',new_status,'max_devices',max_n));
    return jsonb_build_object('ok',true);
  end if;
  if p_action='device_update' then
    target_id:=(p_data->>'device_id')::uuid;
    select * into td from public.zb_devices where id=target_id;
    if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
    if td.user_id<>p_actor then perform pg_advisory_xact_lock(hashtextextended(td.user_id::text,0)); end if;
    select * into t from public.zb_profiles where id=td.user_id;
    new_status:=p_data->>'status';
    if new_status not in ('active','revoked') then raise exception 'INVALID_DEVICE'; end if;
    if td.id=d.id and new_status='revoked' then raise exception 'KEEP_OWN_ACCESS'; end if;
    select count(*) into count_n from public.zb_devices where user_id=td.user_id and status='active' and id<>td.id;
    if new_status='active' and count_n>=t.max_devices then raise exception 'DEVICE_LIMIT'; end if;
    update public.zb_devices set status=new_status where id=td.id;
    insert into public.zb_audit(actor,action,target,detail) values(p_actor,'device_updated',td.id::text,jsonb_build_object('status',new_status));
    return jsonb_build_object('ok',true);
  end if;
  if p_action='student_created' then
    target_id:=(p_data->>'user_id')::uuid;
    if exists(select 1 from public.zb_profiles where id=target_id) then raise exception 'USER_EXISTS'; end if;
    insert into public.zb_profiles(id,email,display_name,status,max_devices)
      select id,email,left(p_data->>'display_name',80),'active',(p_data->>'max_devices')::integer from auth.users where id=target_id;
    insert into public.zb_audit(actor,action,target) values(p_actor,'student_created',target_id::text);
    return jsonb_build_object('ok',true);
  end if;
  if p_action='course_save' then
    perform pg_advisory_xact_lock(57390143);
    course_id_n:=(p_data->'course'->>'id')::integer;
    select * into oldc from public.zb_courses where id=course_id_n for update;
    if found and oldc.revision<>(p_data->>'expected_revision')::integer then raise exception 'COURSE_UPDATED'; end if;
    if not found and coalesce((p_data->>'expected_revision')::integer,0)<>0 then raise exception 'COURSE_UPDATED'; end if;
    rev_n:=coalesce(oldc.revision,0)+1;
    insert into public.zb_courses(id,title,payload,revision,published)
      values(course_id_n,p_data->'course'->>'title',p_data->'course',rev_n,(p_data->>'published')::boolean)
      on conflict(id) do update set title=excluded.title,payload=excluded.payload,revision=excluded.revision,published=excluded.published,updated_at=now();
    insert into public.zb_course_versions(course_id,revision,payload,actor) values(course_id_n,rev_n,p_data->'course',p_actor);
    insert into public.zb_audit(actor,action,target,detail) values(p_actor,'course_saved',course_id_n::text,jsonb_build_object('revision',rev_n,'published',p_data->'published'));
    return jsonb_build_object('ok',true,'revision',rev_n);
  end if;
  raise exception 'UNKNOWN_ACTION';
end $function$
;
revoke all on function public.zb_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zb_command(uuid,uuid,text,text,jsonb) to service_role;
