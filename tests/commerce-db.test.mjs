import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

async function main(){
// Isolated in-memory PostgreSQL only. No production URL, real mail or payment provider.
const db=new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,deleted_at timestamptz,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);");
for(const path of ['schema.sql','access-schema.sql','access-command.sql'])await db.exec(await readFile(new URL('../server/'+path,import.meta.url),'utf8'));
const actors={};let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
async function actor(name,role='student',managed=false){
 const id=crypto.randomUUID(),sid=crypto.randomUUID(),device=crypto.randomUUID().replaceAll('-','').repeat(2);
 await db.query("insert into auth.users values($1,$2,null,now(),$3)",[id,name+'@example.invalid',JSON.stringify({display_name:'测试学习者',role:'admin',internal:true})]);
 await db.query("insert into auth.sessions values($1,$2,now()+interval '1 day')",[sid,id]);
 if(role==='admin'||managed)await db.query("insert into public.zb_profiles(id,email,role,status) values($1,$2,$3,'active')",[id,name+'@example.invalid',role]);
 actors[name]={id,sid,device};const status=await call(name,'status',{label:'isolated-test'});return status;
}
async function call(name,action,data={}){
 const a=actors[name];return(await db.query('select public.zb_command($1,$2,$3,$4,$5) as result',[a.id,a.sid,a.device,action,JSON.stringify(data)])).rows[0].result;
}
const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const scope=(type,ids=[],series=[],future=false)=>({type,course_ids:ids,series_ids:series,include_future:future});
async function course(id,series='personal-wealth'){
 const payload={id,title:'隔离测试课程',subtitle:'合成内容',description:'仅用于本地权限测试',series,lesson:1,category:'测试',keywords:[],minutes:1,calculator:'compound',
 sections:[{id:'unit-a',title:'公开标题甲',body:'<p>合成章节甲</p>'},{id:'unit-b',title:'公开标题乙',body:'<p>仅授权后返回的合成正文乙</p>'}],
 cases:[{title:'合成案例',body:'<p>隔离数据</p>'}],quiz:[{id:'qa',q:'合成测试问题',options:['选项甲','选项乙'],correct:1,explain:'合成解析',section:'unit-a'}],
 downloads:[{id:'workbook',label:'合成配套资料'}]};
 await db.query('insert into public.zb_courses(id,title,payload,published) values($1,$2,$3,true)',[id,payload.title,JSON.stringify(payload)]);
 await db.query("insert into public.zb_settings(key,value) values($1,$2)",['course_workbook_'+id,JSON.stringify({filename:'wealth_lesson01.xlsx',base64:'isolated-not-a-real-file'})]);
}
try{
 await course(90001);await course(90002);await course(90003,'global-macro');
 await actor('admin','admin');const ordinary=await actor('ordinary');await actor('buyer');await actor('internal');await actor('managed','student',true);
 check(ordinary.profile.role==='student'&&ordinary.profile.signup_source==='self_signup','editable auth metadata cannot grant admin/internal access');
 check(ordinary.device.status==='active','confirmed new signup can enroll its own device');
 check((await call('managed','status')).device.status==='pending','existing managed accounts keep device approval');
 await assert.rejects(()=>call('ordinary','commerce_dashboard'),/ADMIN_REQUIRED/);checks++;
 await assert.rejects(()=>call('managed','my_account'),/DEVICE_RESTRICTED/);checks++;
 check((await call('ordinary','courses')).courses.every(c=>!c.locked),'existing courses default to login free');
 check(!(await scalar('select public.zb_can_learn(null,90001)')),'guest cannot read login-free body');
 await call('admin','course_access_save',{course_id:90001,mode:'paid',preview_sections:['unit-a']});
 const locked=(await call('ordinary','courses')).courses.find(c=>c.id===90001);
 check(locked.locked&&locked.quiz.length===0&&locked.cases.length===0&&locked.downloads.length===0,'paid content stripped at database boundary');
 check(!JSON.stringify(locked).includes('仅授权后返回的合成正文乙'),'hidden section body not returned');
 check(locked.sections[0].body.includes('合成章节甲'),'explicit preview preserved');
 await assert.rejects(()=>call('ordinary','course_download',{course_id:90001}),/COURSE_ACCESS_REQUIRED/);checks++;
 await assert.rejects(()=>call('ordinary','quiz_submit',{course_id:90001}),/COURSE_ACCESS_REQUIRED/);checks++;
 await call('admin','product_save',{name:'隔离环境测试商品',description:'无正式售价',scope:scope('course',[90001]),price_minor:null,currency:'CNY',validity_days:null,active:false,expected_revision:0});
 let product=(await call('admin','commerce_dashboard')).products[0];
 await assert.rejects(()=>call('buyer','order_create',{product_id:product.id,product_revision:product.revision,request_key:crypto.randomUUID()}),/PRODUCT_NOT_AVAILABLE/);checks++;
 // Prices below are synthetic, in-memory test data, never a production price.
 await call('admin','product_save',{...product,scope:scope('course',[90001]),price_minor:1234,active:true,expected_revision:product.revision});
 product=(await call('admin','commerce_dashboard')).products[0];
 const key=crypto.randomUUID(),request={product_id:product.id,product_revision:product.revision,request_key:key,status:'paid',price_minor:1};
 const order=(await call('buyer','order_create',request)).order;
 check(order.price_minor===1234&&order.status==='pending','price and payment state come from backend product');
 check((await call('buyer','order_create',request)).order.id===order.id,'request idempotency');
 check((await call('buyer','order_create',{...request,request_key:crypto.randomUUID()})).order.id===order.id,'one pending order per user/product');
 check((await call('ordinary','my_account')).orders.length===0,'orders remain user owned');
 await assert.rejects(()=>call('ordinary','order_cancel',{order_id:order.id}),/ORDER_NOT_FOUND/);checks++;
 await assert.rejects(()=>call('buyer','order_confirm',{order_id:order.id,reference:'forged',note:'forged receipt'}),/ADMIN_REQUIRED/);checks++;
 const receipt={order_id:order.id,reference:'isolated-receipt-1',note:'隔离测试：模拟后台已核验收款'};
 await call('admin','order_confirm',receipt);await call('admin','order_confirm',receipt);
 check(await scalar('select count(*)::integer from public.zb_entitlements where order_id=$1',[order.id])===1,'repeated verified receipt grants once');
 check(await scalar("select count(*)::integer from public.zb_payment_events where order_id=$1",[order.id])===1,'repeated receipt records once');
 check(await scalar('select public.zb_can_learn($1,90001)',[actors.buyer.id]),'buyer can read purchased course');
 check((await call('buyer','course_download',{course_id:90001})).filename==='wealth_lesson01.xlsx','authorized download checked in same database command');
 const grant=await call('admin','grant_create',{user_id:actors.buyer.id,scope:scope('course',[90001]),expires_at:null,note:'ADMIN_ONLY_PRIVATE_NOTE',request_key:crypto.randomUUID()});
 check(!JSON.stringify(await call('buyer','my_account')).includes('ADMIN_ONLY_PRIVATE_NOTE'),'internal notes absent from user response');
 await call('admin','grant_revoke',{entitlement_id:grant.id,note:'隔离撤销'});
 check(await scalar('select public.zb_can_learn($1,90001)',[actors.buyer.id]),'revoking internal grant preserves purchase');
 const otherGrant=await call('admin','grant_create',{user_id:actors.buyer.id,scope:scope('course',[90001]),expires_at:null,note:'独立内部授权',request_key:crypto.randomUUID()});
 await call('admin','order_refund',{order_id:order.id,note:'隔离测试：模拟已核实全额退款'});
 await call('admin','order_refund',{order_id:order.id,note:'重复通知'});
 check(await scalar('select public.zb_can_learn($1,90001)',[actors.buyer.id]),'refund preserves other internal entitlement');
 await call('admin','grant_revoke',{entitlement_id:otherGrant.id,note:'撤销最后一项'});
 check(!(await scalar('select public.zb_can_learn($1,90001)',[actors.buyer.id])),'last entitlement removal denies access');
 const afterRefund=(await call('buyer','order_create',{...request,request_key:crypto.randomUUID()})).order;
 await assert.rejects(()=>call('admin','order_confirm',{order_id:afterRefund.id,reference:'isolated-receipt-1',note:'重复使用同一收款凭证'}),/duplicate key/);checks++;
 check((await call('buyer','my_account')).orders.find(o=>o.id===afterRefund.id).status==='pending','receipt collision cannot partially mark a second order paid');
 await call('admin','order_close',{order_id:afterRefund.id,note:'隔离关闭未付订单'});
 await call('admin','product_save',{...product,scope:scope('series',[],['personal-wealth'],true),price_minor:5678,expected_revision:product.revision});
 const oldOrder=(await call('buyer','my_account')).orders.find(o=>o.id===order.id);
 check(oldOrder.price_minor===1234&&oldOrder.scope.type==='course'&&!oldOrder.scope.include_future,'later price/scope edits do not rewrite old order snapshots');
 const normalized=await scalar('select public.zb_scope_normalize($1)',[JSON.stringify({...scope('course',[90001]),snapshot_ids:[90001,90003]})]);
 check(!normalized.snapshot_ids.includes(90003),'forged scope snapshots are recomputed by backend');

 const exp=await call('admin','grant_create',{user_id:actors.internal.id,scope:scope('series',[],['personal-wealth']),expires_at:new Date(Date.now()+86400000).toISOString(),note:'到期测试',request_key:crypto.randomUUID()});
 check(await scalar('select public.zb_can_learn($1,90001)',[actors.internal.id]),'internal series grant works without admin role');
 await assert.rejects(()=>call('internal','commerce_dashboard'),/ADMIN_REQUIRED/);checks++;
 await course(90004);await call('admin','course_access_save',{course_id:90004,mode:'paid',preview_sections:[]});
 check(!(await scalar('select public.zb_can_learn($1,90004)',[actors.internal.id])),'snapshot grant excludes future course');
 const dynamic=await call('admin','grant_create',{user_id:actors.internal.id,scope:scope('series',[],['personal-wealth'],true),expires_at:new Date(Date.now()+86400000).toISOString(),note:'包含未来课程',request_key:crypto.randomUUID()});
 check(await scalar('select public.zb_can_learn($1,90004)',[actors.internal.id]),'configured future grant includes new matching course');
 await call('admin','grant_extend',{entitlement_id:dynamic.id,expires_at:null,note:'延期为永久'});
 await call('admin','grant_revoke',{entitlement_id:dynamic.id,note:'测试独立撤销'});
 await db.query("update public.zb_entitlements set starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",[exp.id]);
 check(!(await scalar('select public.zb_can_learn($1,90001)',[actors.internal.id])),'expired grant denies access');
 await call('admin','course_access_save',{course_id:90002,mode:'public_free',preview_sections:[]});
 check((await scalar('select public.zb_course_view(90002,null)')).sections[1].body.includes('合成正文乙'),'explicit public course body readable anonymously');
 const anonView=await scalar('select public.zb_course_view(90001,null)');
 check(anonView.quiz.length===0&&!JSON.stringify(anonView).includes('合成解析'),'guest preview does not expose restricted quiz');
 check(await scalar('select public.zb_can_learn($1,90001)',[actors.admin.id]),'administrator retains full access');
 const saved=await call('ordinary','state_get');
 const state={...saved.state,courses:{90002:{read:['unit-a'],answers:{},submitted:false}},notes:{90002:'仅自己的合成笔记'},bookmarks:[],reviews:[],last:90002};
 await call('ordinary','state_save',{revision:saved.revision,state});
 const device2=crypto.randomUUID().replaceAll('-','').repeat(2),oldDevice=actors.ordinary.device;actors.ordinary.device=device2;await call('ordinary','status',{label:'second-isolated-device'});
 check((await call('ordinary','state_get')).state.notes[90002]==='仅自己的合成笔记','second approved device sees account state');
 const conflict=await call('ordinary','state_save',{revision:saved.revision,state});check(conflict.conflict,'cross-device stale revision rejected');
 check(!(await call('buyer','state_get')).state.notes[90002],'private notes never cross users');
 actors.ordinary.device=oldDevice;
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from public.zb_orders'),/permission denied/);await db.exec('reset role');checks++;
 await db.exec('set role authenticated');await assert.rejects(()=>db.query("select public.zb_commerce($1,'my_account','{}')",[actors.buyer.id]),/permission denied/);await db.exec('reset role');checks++;
 check(await scalar("select bool_and(relrowsecurity) from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname in ('zb_products','zb_orders','zb_entitlements','zb_payment_events','zb_course_access')"),'all commerce tables have RLS');
 await db.query('delete from auth.sessions where id=$1',[actors.ordinary.sid]);
 await assert.rejects(()=>call('ordinary','state_get'),/SESSION_EXPIRED/);checks++;
 console.log(JSON.stringify({isolatedPostgresChecks:checks,simulatedPaymentsProduction:false,checks:'guest,ordinary,purchase,internal,admin; identity,preview,price,idempotency,refund,overlap,future,expiry,RLS,session and state sync'}));
}finally{await db.close();}

}
main().catch(e=>{console.error(JSON.stringify({error:e.message,code:e.code,where:e.where,detail:e.detail}));process.exitCode=1;});
