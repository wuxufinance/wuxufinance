import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createHandler} from '../server/api.mjs';
import {validateCommerce,validateScope} from '../server/commerce-validation.mjs';
import {publicReaderHTML} from '../dist/public-reader.js';
import {safeLearningHash,passwordValid,createPKCE,publicAuthError} from '../dist/auth-utils.js';
import {consumeAuthCallback,rememberLearningTarget,learningTarget} from '../dist/auth-ui.js';

const uid=crypto.randomUUID(),sid=crypto.randomUUID(),jwt='test.'+btoa(JSON.stringify({sub:uid,session_id:sid})).replace(/=/g,'')+'.signature';
const course={id:1,title:'合成公开课程',series:'foundations',lesson:1,description:'隔离测试正文渲染',locked:false,access:{mode:'public_free',full:true,preview_sections:[]},
 sections:[{id:'unit-a',title:'合成标题',body:'<p>完整公开说明。</p><p>公式：P=100/(1+r)</p><table><tr><th>单位</th><th>金额</th></tr><tr><td>元</td><td>100</td></tr></table>'}],cases:[],quiz:[{correct:1,explain:'PRIVATE_QUIZ_EXPLANATION'}]};
let commands=[],anonymous=false,confirmed=true;
const fetcher=async(url,opts)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,is_anonymous:anonymous,email_confirmed_at:confirmed?'2026-11-25':null,user_metadata:{role:'admin'}});
 if(url.endsWith('/rpc/zb_public_catalog'))return Response.json({courses:[],products:[],email_ready:false,online_payments:false});
 if(url.endsWith('/rpc/zb_course_view')){const body=JSON.parse(opts.body);assert.equal(body.p_user,null);return Response.json(course);}
 if(url.endsWith('/rpc/zb_command')){
   const body=JSON.parse(opts.body);commands.push(body);
   if(['commerce_dashboard','product_save','grant_create','order_confirm'].includes(body.p_action))return Response.json({message:'ADMIN_REQUIRED'},{status:403});
   if(body.p_action==='courses')return Response.json({courses:[]});
   return Response.json({ok:true});
 }
 throw Error('Unexpected upstream request');
};
const handler=createHandler({url:'https://example.invalid',key:'isolated-server-only-value',allowedOrigins:['https://wuxufinance.github.io'],fetcher});
const request=(body,auth=false)=>new Request('https://example.invalid/api',{method:'POST',headers:{Origin:'https://wuxufinance.github.io',...(auth?{Authorization:'Bearer '+jwt,'x-device-key':'a'.repeat(64)}:{})},body:JSON.stringify(body)});
for(const action of ['my_account','order_create','grant_create','commerce_dashboard','course_download'])assert.equal((await handler(request({action}))).status,401);
const publicResult=await handler(request({action:'public_catalog',user_id:uid,role:'admin'}));assert.equal(publicResult.status,200);assert.equal((await publicResult.json()).email_ready,false);
for(const action of ['payment_webhook','payment_notify']){
 const r=await handler(request({action,status:'paid',order_id:crypto.randomUUID(),verified:true},true));
 assert.equal(r.status,503);assert.equal((await r.json()).code,'PAYMENTS_NOT_CONFIGURED');
}
const me=await handler(request({action:'my_account',user_id:crypto.randomUUID(),p_actor:crypto.randomUUID()},true));assert.equal(me.status,200);assert.equal(commands.at(-1).p_actor,uid);assert.deepEqual(commands.at(-1).p_data,{});
assert.equal((await handler(request({action:'commerce_dashboard'},true))).status,403);
anonymous=true;assert.equal((await handler(request({action:'my_account'},true))).status,401);anonymous=false;
confirmed=false;assert.equal((await handler(request({action:'my_account'},true))).status,401);confirmed=true;
const page=await handler(new Request('https://example.invalid/api?public=course&id=1'));
assert.equal(page.status,302);assert.match(page.headers.get('Cache-Control'),/no-store/);assert.equal(page.headers.get('Location'),'https://wuxufinance.github.io/wuxufinance/courses/foundations/lesson-01/#public-reading');
const {document}=parseHTML('<html><body></body></html>'),html=publicReaderHTML(course,document);
assert(html.includes('<math'));assert(html.includes('<table'));assert(!html.includes('PRIVATE_QUIZ_EXPLANATION'));
const locked={...course,locked:true,access:{mode:'paid',full:false,preview_sections:['unit-a']},sections:[course.sections[0],{id:'secret-unit',title:'受限目录标题',body:'<p>DO_NOT_PUBLISH_BODY</p>'}]};
assert(!publicReaderHTML(locked,document).includes('DO_NOT_PUBLISH_BODY'));
assert.equal(safeLearningHash('#/course/1002/concepts/unit-05'),'#/course/1002/concepts/unit-05');
for(const bad of ['https://evil.invalid/','//evil.invalid/','#/auth/reset','#/course/../admin','#/course/0/quiz'])assert.equal(safeLearningHash(bad),'#/account');
assert(passwordValid('a'.repeat(12)));assert(!passwordValid('short'));assert(!passwordValid('a'.repeat(129)));
const pkce=await createPKCE();assert.match(pkce.verifier,/^[a-f0-9]{64}$/);assert.match(pkce.challenge,/^[A-Za-z0-9_-]{43}$/);
assert.equal(publicAuthError({code:'email_not_confirmed'}),'邮箱尚未验证，请先完成邮箱验证。');
assert.deepEqual(validateCommerce('my_account',{user_id:'forged'}),{});
assert.throws(()=>validateScope({type:'all',course_ids:[],series_ids:[],include_future:'true'}),/范围/);
assert.throws(()=>validateCommerce('product_save',{active:true,price_minor:null,currency:'CNY'}),/正式售价/);
assert.throws(()=>validateCommerce('order_create',{product_id:'not-uuid'}),/编号/);
const store=new Map();globalThis.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
globalThis.location={hash:'#/course/1002/calculator',href:'https://wuxufinance.github.io/wuxufinance/learn/?auth=signup&code=synthetic-one-time-code'};
let cleanURL;globalThis.history={replaceState:(_,__,url)=>{cleanURL=url;}};
rememberLearningTarget();location.hash='';rememberLearningTarget();assert.equal(learningTarget(),'#/course/1002/calculator','callback without fragment preserves the original target');
store.set('wuxu-auth-request-v1',JSON.stringify({flow:'signup',verifier:pkce.verifier}));
const callbackCalls=[];const outcome=await consumeAuthCallback(async(path,body)=>{callbackCalls.push({path,body});});
assert.equal(outcome.recovery,false);assert.equal(callbackCalls[0].path,'token?grant_type=pkce');assert.equal(callbackCalls[0].body.code_verifier,pkce.verifier);assert(!cleanURL.includes('code='));
store.set('wuxu-auth-request-v1',JSON.stringify({flow:'recovery',verifier:pkce.verifier}));
assert.equal((await consumeAuthCallback(async()=>{})).recovery,true);
await assert.rejects(()=>consumeAuthCallback(async()=>{}),/发起请求的浏览器/);
delete globalThis.sessionStorage;delete globalThis.location;delete globalThis.history;
const source=await readFile(new URL('../dist/auth-ui.js',import.meta.url),'utf8');
assert(source.includes("type:f.type.value"));assert(source.includes("body.data={display_name:"));assert(!source.includes('body.data={role:'));assert(source.includes('!ready'));assert(!source.includes('access_token='));
console.log('Passed: Auth confirmation/recovery callbacks and safe return route, PKCE, ordinary identity, anonymous/user boundaries, private HTML, SMTP gating and disabled payment notifications.');
