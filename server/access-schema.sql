-- Additive upgrade. Existing course payloads and learning revisions are not modified.
-- All privileged functions are SECURITY INVOKER and service-role only.
create table public.zb_release_snapshots (
  release_key text primary key,
  content jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.zb_release_snapshots enable row level security;
revoke all on public.zb_release_snapshots from public,anon,authenticated;
grant all on public.zb_release_snapshots to service_role;
insert into public.zb_release_snapshots(release_key,content)
select 'accounts_entitlements_v1',jsonb_build_object(
 'courses',(select jsonb_agg(to_jsonb(c) order by id) from public.zb_courses c),
 'functions',(select jsonb_agg(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('zb_command','zb_setup_claim','zb_setup_finish')))
on conflict do nothing;
alter table public.zb_profiles add column if not exists device_approval_required boolean not null default true;
alter table public.zb_profiles add column if not exists signup_source text not null default 'managed'
  check (signup_source in ('managed','self_signup'));

create table public.zb_course_access (
  course_id integer primary key references public.zb_courses(id),
  mode text not null default 'login_free' check(mode in ('public_free','login_free','paid')),
  preview_sections text[] not null default '{}',
  updated_by uuid references public.zb_profiles(id),
  updated_at timestamptz not null default now()
);
create table public.zb_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 1 and 160),
  description text not null default '' check(length(description)<=1200),
  scope jsonb not null,
  price_minor bigint check(price_minor between 1 and 100000000),
  currency text not null default 'CNY' check(currency in ('CNY','GBP','USD','EUR')),
  validity_days integer check(validity_days between 1 and 36500),
  active boolean not null default false,
  revision integer not null default 1,
  created_by uuid references public.zb_profiles(id),
  updated_by uuid references public.zb_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not active or price_minor is not null)
);
create table public.zb_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zb_profiles(id),
  product_id uuid not null references public.zb_products(id),
  request_key uuid not null,
  product_name text not null,
  scope jsonb not null,
  price_minor bigint not null check(price_minor>0),
  currency text not null check(currency in ('CNY','GBP','USD','EUR')),
  validity_days integer,
  status text not null default 'pending' check(status in ('pending','paid','cancelled','closed','refunded')),
  payment_provider text,
  payment_reference text,
  confirmed_by uuid references public.zb_profiles(id),
  confirmed_at timestamptz,
  confirmation_note text,
  refunded_by uuid references public.zb_profiles(id),
  refunded_at timestamptz,
  refund_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_key),
  check((status not in ('paid','refunded')) or (confirmed_at is not null and confirmed_by is not null))
);
create unique index zb_orders_one_pending on public.zb_orders(user_id,product_id) where status='pending';
create unique index zb_orders_receipt_once on public.zb_orders(payment_provider,payment_reference)
  where payment_reference is not null;
create index zb_orders_user_created on public.zb_orders(user_id,created_at desc);
create table public.zb_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zb_profiles(id),
  source text not null check(source in ('purchase','internal')),
  order_id uuid unique references public.zb_orders(id),
  scope jsonb not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.zb_profiles(id),
  updated_by uuid references public.zb_profiles(id),
  note text not null default '' check(length(note)<=1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expires_at is null or expires_at>starts_at),
  check((source='purchase' and order_id is not null) or (source='internal' and order_id is null))
);
create index zb_entitlements_user_active on public.zb_entitlements(user_id,expires_at) where revoked_at is null;
create table public.zb_payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  order_id uuid not null references public.zb_orders(id),
  event_type text not null check(event_type in ('payment_confirmed','refunded')),
  actor uuid not null references public.zb_profiles(id),
  created_at timestamptz not null default now(),
  unique(provider,event_id)
);
alter table public.zb_course_access enable row level security;
alter table public.zb_products enable row level security;
alter table public.zb_orders enable row level security;
alter table public.zb_entitlements enable row level security;
alter table public.zb_payment_events enable row level security;
revoke all on public.zb_course_access,public.zb_products,public.zb_orders,public.zb_entitlements,public.zb_payment_events from public,anon,authenticated;
grant all on public.zb_course_access,public.zb_products,public.zb_orders,public.zb_entitlements,public.zb_payment_events to service_role;
grant usage,select on sequence public.zb_payment_events_id_seq to service_role;
grant select(email_confirmed_at,raw_user_meta_data) on auth.users to service_role;

-- Preserve the existing access mode: login free, with no anonymous body or new price.
insert into public.zb_course_access(course_id) select id from public.zb_courses on conflict do nothing;
insert into public.zb_settings(key,value) values
 ('account_delivery','{"email_ready":false,"online_payments":false}'::jsonb)
 on conflict do nothing;

create function public.zb_series(p_id integer) returns text
language sql stable security invoker set search_path='' as $$
 select coalesce(payload->>'series','foundations') from public.zb_courses where id=p_id
$$;
create function public.zb_scope_normalize(p_scope jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t text:=p_scope->>'type'; ids integer[]; series text[]; future boolean; snapshot integer[];
begin
 if jsonb_typeof(p_scope)<>'object' or t is null or t not in ('course','series','bundle','all')
   or jsonb_typeof(p_scope->'include_future')<>'boolean' then raise exception 'INVALID_SCOPE'; end if;
 if jsonb_typeof(coalesce(p_scope->'course_ids','[]'))<>'array'
   or jsonb_typeof(coalesce(p_scope->'series_ids','[]'))<>'array' then raise exception 'INVALID_SCOPE'; end if;
 select coalesce(array_agg(distinct value::integer),'{}') into ids
   from jsonb_array_elements_text(coalesce(p_scope->'course_ids','[]'));
 select coalesce(array_agg(distinct value),'{}') into series
   from jsonb_array_elements_text(coalesce(p_scope->'series_ids','[]'));
 future:=(p_scope->>'include_future')::boolean;
 if cardinality(ids)>500 or cardinality(series)>20
   or exists(select 1 from unnest(ids) x where not exists(select 1 from public.zb_courses where id=x and published))
   or exists(select 1 from unnest(series) x where x not in ('foundations','personal-wealth','global-macro'))
   or (t='course' and (cardinality(ids)<>1 or cardinality(series)<>0 or future))
   or (t='series' and (cardinality(series)<>1 or cardinality(ids)<>0))
   or (t='bundle' and cardinality(ids)+cardinality(series)=0)
   or (t='all' and cardinality(ids)+cardinality(series)<>0) then raise exception 'INVALID_SCOPE'; end if;
 select coalesce(array_agg(id order by id),'{}') into snapshot from public.zb_courses
 where published and (t='all' or id=any(ids) or public.zb_series(id)=any(series));
 if cardinality(snapshot)=0 then raise exception 'INVALID_SCOPE'; end if;
 return jsonb_build_object('type',t,'course_ids',ids,'series_ids',series,'include_future',future,'snapshot_ids',snapshot);
end $$;
create function public.zb_scope_contains(p_scope jsonb,p_course integer) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(
 (p_scope->'snapshot_ids' @> to_jsonb(array[p_course]))
 or ((p_scope->>'include_future')::boolean and
   (p_scope->>'type'='all' or p_scope->'course_ids' @> to_jsonb(array[p_course])
    or p_scope->'series_ids' @> to_jsonb(array[public.zb_series(p_course)]))),false)
$$;
create function public.zb_has_entitlement(p_user uuid,p_course integer) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.zb_entitlements e where e.user_id=p_user
 and e.revoked_at is null and e.starts_at<=now() and (e.expires_at is null or e.expires_at>now())
 and public.zb_scope_contains(e.scope,p_course)
 and (e.source='internal' or exists(select 1 from public.zb_orders o where o.id=e.order_id and o.user_id=p_user and o.status='paid')))
$$;
create function public.zb_can_learn(p_user uuid,p_course integer) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.zb_courses c left join public.zb_course_access a on a.course_id=c.id
 where c.id=p_course and c.published and
 (a.mode='public_free' or (p_user is not null and exists(select 1 from public.zb_profiles p
 where p.id=p_user and p.status='active' and
 (p.role='admin' or coalesce(a.mode,'login_free')='login_free' or public.zb_has_entitlement(p_user,p_course))))))
$$;
create function public.zb_course_view(p_course integer,p_user uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c public.zb_courses; a public.zb_course_access; full_access boolean; data jsonb;
begin
 select * into c from public.zb_courses where id=p_course and published;
 if not found then raise exception 'COURSE_NOT_FOUND'; end if;
 select * into a from public.zb_course_access where course_id=p_course;
 full_access:=public.zb_can_learn(p_user,p_course);
 if full_access then data:=c.payload;
 else
   data:=jsonb_build_object('id',c.id,'title',c.title,'subtitle',c.payload->'subtitle','series',coalesce(c.payload->>'series','foundations'),
     'lesson',coalesce((c.payload->>'lesson')::integer,c.id),'category',c.payload->'category','description',c.payload->'description',
     'minutes',c.payload->'minutes','keywords',c.payload->'keywords','calculator',c.payload->'calculator',
     'sections',(select coalesce(jsonb_agg(case when s->>'id'=any(coalesce(a.preview_sections,'{}')) then s else
       jsonb_build_object('id',s->'id','title',s->'title','body','','formula','','meaning','') end),'[]') from jsonb_array_elements(c.payload->'sections') s),
     'cases','[]'::jsonb,'quiz','[]'::jsonb,'downloads','[]'::jsonb);
 end if;
 -- Anonymous readers get public explanations, not server-graded questions or file bytes.
 if p_user is null then data:=data||jsonb_build_object('quiz','[]'::jsonb,'downloads','[]'::jsonb); end if;
 return data||jsonb_build_object('revision',c.revision,'locked',not full_access,
   'section_count',jsonb_array_length(c.payload->'sections'),'question_count',jsonb_array_length(c.payload->'quiz'),
   'access',jsonb_build_object('mode',coalesce(a.mode,'login_free'),'full',full_access,'preview_sections',coalesce(a.preview_sections,'{}')));
end $$;
create function public.zb_public_catalog() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('courses',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'title',c.title,'series',public.zb_series(c.id),'lesson',coalesce((c.payload->>'lesson')::integer,c.id),
   'description',c.payload->'description','mode',coalesce(a.mode,'login_free'),'preview_sections',coalesce(a.preview_sections,'{}')) order by c.id),'[]')
   from public.zb_courses c left join public.zb_course_access a on a.course_id=c.id where c.published),
   'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'scope',public.zb_scope_normalize(scope),
     'price_minor',price_minor,'currency',currency,'validity_days',validity_days,'revision',revision) order by created_at),'[]')
     from public.zb_products where active and price_minor is not null),
   'email_ready',coalesce((select (value->>'email_ready')::boolean from public.zb_settings where key='account_delivery'),false),
   'online_payments',false)
$$;

-- This dispatcher runs only after zb_command has verified identity, session, account and device.
create function public.zb_commerce(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.zb_profiles; product public.zb_products; o public.zb_orders; e public.zb_entitlements;
 scope_n jsonb; target_id uuid; course_n integer; until_n timestamptz; receipt text; note_n text;
 r jsonb; id_n uuid; expected_n integer; count_n integer; mode_n text; previews text[];
begin
 select * into p from public.zb_profiles where id=p_actor and status='active';
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_action='my_account' then
   return jsonb_build_object('orders',(select coalesce(jsonb_agg(to_jsonb(x)-'user_id'-'request_key'-'confirmation_note'-'refund_note'-'confirmed_by'-'refunded_by' order by created_at desc),'[]') from public.zb_orders x where user_id=p_actor),
     'entitlements',(select coalesce(jsonb_agg((to_jsonb(x)-'user_id'-'note'-'created_by'-'updated_by')||jsonb_build_object('currently_valid',x.revoked_at is null and x.starts_at<=now() and (x.expires_at is null or x.expires_at>now()) and (x.source='internal' or exists(select 1 from public.zb_orders own_order where own_order.id=x.order_id and own_order.user_id=p_actor and own_order.status='paid'))) order by created_at desc),'[]') from public.zb_entitlements x where user_id=p_actor),
     'access',(select coalesce(jsonb_agg(jsonb_build_object('course_id',id,'full',public.zb_can_learn(p_actor,id),'mode',coalesce((select mode from public.zb_course_access where course_id=c.id),'login_free')) order by id),'[]') from public.zb_courses c where published),
     'online_payments',false);
 end if;
 if p_action='order_create' then
   perform pg_advisory_xact_lock(hashtextextended('order:'||p_actor::text,0));
   select * into o from public.zb_orders where user_id=p_actor and request_key=(p_data->>'request_key')::uuid;
   if found then return jsonb_build_object('order',to_jsonb(o)-'user_id'-'request_key'-'confirmation_note'-'refund_note','reused',true,'online_payments',false); end if;
   select * into product from public.zb_products where id=(p_data->>'product_id')::uuid and active and price_minor is not null for share;
   if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
   if product.revision<>(p_data->>'product_revision')::integer then raise exception 'PRODUCT_UPDATED'; end if;
   select * into o from public.zb_orders where user_id=p_actor and product_id=product.id and status='pending';
   if found then return jsonb_build_object('order',to_jsonb(o)-'user_id'-'request_key'-'confirmation_note'-'refund_note','reused',true,'online_payments',false); end if;
   select count(*) into count_n from public.zb_orders where user_id=p_actor and created_at>now()-interval '1 hour';
   if count_n>=10 then raise exception 'ORDER_RATE_LIMIT'; end if;
   -- Resolve current published IDs at order creation. Later product edits cannot expand this order.
   scope_n:=public.zb_scope_normalize(product.scope);
   insert into public.zb_orders(user_id,product_id,request_key,product_name,scope,price_minor,currency,validity_days)
     values(p_actor,product.id,(p_data->>'request_key')::uuid,product.name,scope_n,product.price_minor,product.currency,product.validity_days) returning * into o;
   insert into public.zb_audit(actor,action,target,detail) values(p_actor,'order_created',o.id::text,jsonb_build_object('product_id',product.id,'price_minor',o.price_minor,'currency',o.currency));
   return jsonb_build_object('order',to_jsonb(o)-'user_id'-'request_key'-'confirmation_note'-'refund_note','online_payments',false);
 end if;
 if p_action='order_cancel' then
   select * into o from public.zb_orders where id=(p_data->>'order_id')::uuid and user_id=p_actor for update;
   if not found then raise exception 'ORDER_NOT_FOUND'; end if;
   if o.status='cancelled' then return jsonb_build_object('ok',true); end if;
   if o.status<>'pending' then raise exception 'ORDER_STATE'; end if;
   update public.zb_orders set status='cancelled',updated_at=now() where id=o.id;
   insert into public.zb_audit(actor,action,target) values(p_actor,'order_cancelled',o.id::text);
   return jsonb_build_object('ok',true);
 end if;
 if p.role<>'admin' then raise exception 'ADMIN_REQUIRED'; end if;
 if p_action='commerce_dashboard' then
   return jsonb_build_object('products',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.zb_products x),
     'orders',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from (select * from public.zb_orders order by created_at desc limit 200) x),
     'entitlements',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from (select * from public.zb_entitlements order by created_at desc limit 500) x),
     'course_access',(select coalesce(jsonb_agg(to_jsonb(x) order by course_id),'[]') from public.zb_course_access x),
     'email_ready',coalesce((select (value->>'email_ready')::boolean from public.zb_settings where key='account_delivery'),false),
     'online_payments',false,'order_limit',200,'entitlement_limit',500);
 end if;
 if p_action='user_lookup' then
   select id into target_id from public.zb_profiles where lower(email)=lower(trim(p_data->>'email'));
   if target_id is null then raise exception 'USER_NOT_FOUND'; end if;
   return jsonb_build_object('profile',(select to_jsonb(x) from public.zb_profiles x where id=target_id),
     'orders',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.zb_orders x where user_id=target_id),
     'entitlements',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.zb_entitlements x where user_id=target_id),
     'access',(select coalesce(jsonb_agg(jsonb_build_object('course_id',id,'title',title,'full',public.zb_can_learn(target_id,id)) order by id),'[]') from public.zb_courses where published));
 end if;
 if p_action='product_save' then
   scope_n:=public.zb_scope_normalize(p_data->'scope');
   id_n:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
   select * into product from public.zb_products where id=id_n for update;
   if found and product.revision<>(p_data->>'expected_revision')::integer then raise exception 'PRODUCT_UPDATED'; end if;
   if not found and (p_data->>'expected_revision')::integer<>0 then raise exception 'PRODUCT_UPDATED'; end if;
   insert into public.zb_products(id,name,description,scope,price_minor,currency,validity_days,active,revision,created_by,updated_by)
   values(id_n,trim(p_data->>'name'),coalesce(p_data->>'description',''),scope_n,(p_data->>'price_minor')::bigint,p_data->>'currency',
     (p_data->>'validity_days')::integer,(p_data->>'active')::boolean,coalesce(product.revision,0)+1,p_actor,p_actor)
   on conflict(id) do update set name=excluded.name,description=excluded.description,scope=excluded.scope,
     price_minor=excluded.price_minor,currency=excluded.currency,validity_days=excluded.validity_days,active=excluded.active,
     revision=excluded.revision,updated_by=p_actor,updated_at=now();
   insert into public.zb_audit(actor,action,target,detail) values(p_actor,'product_saved',id_n::text,
     jsonb_build_object('before',case when product.id is null then null else to_jsonb(product)-'created_by'-'updated_by' end,
       'after',p_data-'note'));
   return jsonb_build_object('ok',true,'id',id_n);
 end if;
 if p_action='course_access_save' then
   course_n:=(p_data->>'course_id')::integer; mode_n:=p_data->>'mode';
   if mode_n not in ('public_free','login_free','paid') or not exists(select 1 from public.zb_courses where id=course_n and published) then raise exception 'INVALID_ACCESS'; end if;
   select coalesce(array_agg(value),'{}') into previews from jsonb_array_elements_text(p_data->'preview_sections');
   if exists(select 1 from unnest(previews) x where not exists(select 1 from public.zb_courses c,jsonb_array_elements(c.payload->'sections') s where c.id=course_n and s->>'id'=x)) then raise exception 'INVALID_PREVIEW'; end if;
   select to_jsonb(x) into r from public.zb_course_access x where course_id=course_n for update;
   insert into public.zb_course_access(course_id,mode,preview_sections,updated_by) values(course_n,mode_n,previews,p_actor)
     on conflict(course_id) do update set mode=excluded.mode,preview_sections=excluded.preview_sections,updated_by=p_actor,updated_at=now();
   insert into public.zb_audit(actor,action,target,detail) values(p_actor,'course_access_changed',course_n::text,jsonb_build_object('before',r,'after',p_data));
   return jsonb_build_object('ok',true);
 end if;
 if p_action='grant_create' then
   target_id:=(p_data->>'user_id')::uuid;
   if not exists(select 1 from public.zb_profiles where id=target_id) then raise exception 'USER_NOT_FOUND'; end if;
   scope_n:=public.zb_scope_normalize(p_data->'scope'); until_n:=(p_data->>'expires_at')::timestamptz;
   if until_n is not null and until_n<=now() then raise exception 'INVALID_EXPIRY'; end if;
   id_n:=(p_data->>'request_key')::uuid;
   select * into e from public.zb_entitlements where id=id_n;
   if found then
     if e.source<>'internal' or e.user_id<>target_id or e.created_by<>p_actor then raise exception 'INVALID_GRANT'; end if;
     return jsonb_build_object('ok',true,'id',e.id,'reused',true);
   end if;
   insert into public.zb_entitlements(id,user_id,source,scope,expires_at,created_by,updated_by,note)
     values(id_n,target_id,'internal',scope_n,until_n,p_actor,p_actor,coalesce(p_data->>'note',''));
   insert into public.zb_audit(actor,action,target,detail) values(p_actor,'internal_grant_created',id_n::text,jsonb_build_object('user_id',target_id,'scope',scope_n,'expires_at',until_n,'note',p_data->>'note'));
   return jsonb_build_object('ok',true,'id',id_n);
 end if;
 if p_action in ('grant_extend','grant_revoke') then
   select * into e from public.zb_entitlements where id=(p_data->>'entitlement_id')::uuid for update;
   if not found or e.source<>'internal' then raise exception 'INVALID_GRANT'; end if;
   if p_action='grant_revoke' and e.revoked_at is not null then return jsonb_build_object('ok',true); end if;
   if p_action='grant_extend' then
     until_n:=(p_data->>'expires_at')::timestamptz;
     if e.revoked_at is not null or e.expires_at is null or (until_n is not null and until_n<=greatest(now(),e.expires_at)) then raise exception 'INVALID_EXPIRY'; end if;
     update public.zb_entitlements set expires_at=until_n,updated_at=now(),updated_by=p_actor where id=e.id;
   else update public.zb_entitlements set revoked_at=now(),updated_at=now(),updated_by=p_actor where id=e.id; end if;
   insert into public.zb_audit(actor,action,target,detail) values(p_actor,p_action,e.id::text,jsonb_build_object('before',to_jsonb(e),'expires_at',until_n,'note',p_data->>'note'));
   return jsonb_build_object('ok',true);
 end if;
 if p_action in ('order_confirm','order_close','order_refund') then
   select * into o from public.zb_orders where id=(p_data->>'order_id')::uuid for update;
   if not found then raise exception 'ORDER_NOT_FOUND'; end if;
   note_n:=trim(coalesce(p_data->>'note','')); receipt:=trim(coalesce(p_data->>'reference',''));
   if length(note_n)<3 or length(note_n)>1000 then raise exception 'CONFIRMATION_REQUIRED'; end if;
   if p_action='order_confirm' then
     if length(receipt)<3 or length(receipt)>160 then raise exception 'CONFIRMATION_REQUIRED'; end if;
     if o.status='paid' and o.payment_reference=receipt then return jsonb_build_object('ok',true,'reused',true); end if;
     if o.status<>'pending' then raise exception 'ORDER_STATE'; end if;
     -- Atomic receipt + order + one entitlement. No client payment status is trusted.
     insert into public.zb_payment_events(provider,event_id,order_id,event_type,actor) values('manual',receipt,o.id,'payment_confirmed',p_actor);
     update public.zb_orders set status='paid',payment_provider='manual',payment_reference=receipt,confirmed_by=p_actor,confirmed_at=now(),confirmation_note=note_n,updated_at=now() where id=o.id;
     insert into public.zb_entitlements(user_id,source,order_id,scope,expires_at,created_by,updated_by)
       values(o.user_id,'purchase',o.id,o.scope,case when o.validity_days is null then null else now()+o.validity_days*interval '1 day' end,p_actor,p_actor);
   elsif p_action='order_refund' then
     if o.status='refunded' then return jsonb_build_object('ok',true,'reused',true); end if;
     if o.status<>'paid' then raise exception 'ORDER_STATE'; end if;
     insert into public.zb_payment_events(provider,event_id,order_id,event_type,actor) values('manual','refund:'||o.id::text,o.id,'refunded',p_actor);
     update public.zb_orders set status='refunded',refunded_by=p_actor,refunded_at=now(),refund_note=note_n,updated_at=now() where id=o.id;
     update public.zb_entitlements set revoked_at=now(),updated_at=now(),updated_by=p_actor where order_id=o.id and source='purchase' and revoked_at is null;
   else
     if o.status='closed' then return jsonb_build_object('ok',true); end if;
     if o.status<>'pending' then raise exception 'ORDER_STATE'; end if;
     update public.zb_orders set status='closed',updated_at=now() where id=o.id;
   end if;
   insert into public.zb_audit(actor,action,target,detail) values(p_actor,p_action,o.id::text,jsonb_build_object('before_status',o.status,'reference',receipt,'note',note_n));
   return jsonb_build_object('ok',true);
 end if;
 if p_action='email_delivery_update' then
   if jsonb_typeof(p_data->'ready')<>'boolean' then raise exception 'INVALID_CONFIG'; end if;
   update public.zb_settings set value=jsonb_build_object('email_ready',(p_data->>'ready')::boolean,'online_payments',false) where key='account_delivery';
   insert into public.zb_audit(actor,action,detail) values(p_actor,'email_delivery_updated',p_data);
   return jsonb_build_object('ok',true);
 end if;
 raise exception 'UNKNOWN_ACTION';
end $$;

-- Never grant browser roles RPC/table access. The authenticated Edge API is the sole gateway.
revoke all on function public.zb_series(integer),public.zb_scope_normalize(jsonb),public.zb_scope_contains(jsonb,integer),
 public.zb_has_entitlement(uuid,integer),public.zb_can_learn(uuid,integer),public.zb_course_view(integer,uuid),
 public.zb_public_catalog(),public.zb_commerce(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.zb_series(integer),public.zb_scope_normalize(jsonb),public.zb_scope_contains(jsonb,integer),
 public.zb_has_entitlement(uuid,integer),public.zb_can_learn(uuid,integer),public.zb_course_view(integer,uuid),
 public.zb_public_catalog(),public.zb_commerce(uuid,text,jsonb) to service_role;
