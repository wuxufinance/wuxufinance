import assert from 'node:assert/strict';
import {wealthLabs,householdBalance,annualCashflow,incomeStress,wealthAccumulation} from '../dist/wealth-labs.js';
import {runInlineLab} from '../dist/inline-labs.js';
import {lessonNumber,seriesOf,seriesGroups} from '../dist/course-series.js';
import {createHandler} from '../server/api.mjs';
const defaults=k=>Object.fromEntries(wealthLabs[k].fields.map(f=>[f.key,f.value]));
for(const [key,lab] of Object.entries(wealthLabs)){
 const d=defaults(key),stats=runInlineLab(key,d);assert(stats.length>1);
 for(const row of stats){assert.equal(row.length,2);assert.equal(typeof row[1],'string');assert(!/NaN|Infinity/.test(row[1]));}
 assert.throws(()=>runInlineLab(key,{...d,[lab.fields[0].key]:NaN}),/输入/);
}
const b=householdBalance(defaults('wealthbalance'));
assert.equal(b.assets-b.debt,b.net);assert.equal(b.net,2400000);assert.equal(b.free,80000);
assert.equal(householdBalance({...defaults('wealthbalance'),access:0}).free,-120000);
const annual=annualCashflow(defaults('wealthannual'));
assert.equal(annual[10][1],155000);assert.equal(annual[11][1],110000);assert(Math.abs(annual[11][2])<1e-8);
assert.equal(annual[11][1]-100000,40000*12-25000*12-10000*12-50000);
assert.throws(()=>annualCashflow({...defaults('wealthannual'),payment:1.5}),/月份/);
const stress=incomeStress(defaults('wealthincomestress'));
assert.equal(stress[5][4],50000);assert.equal(stress[11][4],140000);
assert.equal(incomeStress({...defaults('wealthincomestress'),decline:100,months:12})[11][5],220000);
assert.throws(()=>incomeStress({...defaults('wealthincomestress'),cut:30000}),/超过/);
assert.equal(wealthAccumulation({...defaults('wealthaccumulation'),rate:0}).fv,2400000);
assert(Math.abs(wealthAccumulation(defaults('wealthaccumulation')).fv-4620408.954)<.01);
assert.throws(()=>runInlineLab('wealthcashflow',{...defaults('wealthcashflow'),principal:9000}),/本金/);
assert.throws(()=>runInlineLab('wealthbudget',{...defaults('wealthbudget'),needs:80,wants:30}),/比例/);
const groups=seriesGroups([{id:1},{id:40},{id:1001,series:'personal-wealth',lesson:1},{id:1002,series:'personal-wealth',lesson:2}]);
assert.equal(groups.length,2);assert.equal(groups[0].total,40);assert.equal(groups[1].total,30);
assert.equal(lessonNumber(groups[1].courses[0]),1);assert.equal(lessonNumber(groups[0].courses[1]),40);
assert.equal(seriesOf({id:1}).id,'foundations');
// Protected downloads must authenticate and check publication before reading bytes.
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const token='abc.'+btoa(JSON.stringify({sub:uid,session_id:sid})).replace(/=/g,'')+'.sig';let reads=0,allowed=false;
const mock=async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,email_confirmed_at:'2026-01-01'});
 if(url.includes('/rpc/zb_command')){const command=JSON.parse(options.body);assert.equal(command.p_action,'course_download');assert.equal(command.p_data.course_id,101);if(!allowed)return Response.json({message:'COURSE_ACCESS_REQUIRED'},{status:403});reads++;return Response.json({filename:'wealth_lesson01.xlsx',base64:'UEsDBA=='});}
 throw Error('Unexpected request');
};
const handler=createHandler({url:'https://test.invalid',key:'test-key',allowedOrigins:['https://test.example'],fetcher:mock});
const req=(body,auth=true)=>new Request('https://test.invalid',{method:'POST',headers:{Origin:'https://test.example',...(auth?{Authorization:'Bearer '+token,'x-device-key':'a'.repeat(64)}:{})},body:JSON.stringify(body)});
const body={action:'course_download',course_id:101,file_id:'workbook'};
assert.equal((await handler(req(body,false))).status,401);assert.equal(reads,0);
assert.equal((await handler(req(body))).status,403);assert.equal(reads,0);
allowed=true;const file=await handler(req(body));assert.equal(file.status,200);assert.equal((await file.json()).filename,'wealth_lesson01.xlsx');assert.equal(reads,1);
assert.equal((await handler(req({...body,file_id:'../secret'}))).status,400);assert.equal(reads,1);
console.log('Passed: household identities, timing, shortfalls, zero-return boundaries, independent series and authenticated workbook downloads.');
