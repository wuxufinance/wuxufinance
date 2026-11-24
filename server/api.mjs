import {validateCourse,sanitizeState,preserveHiddenState} from './validation.mjs';
const messages={AUTH_REQUIRED:'请先登录。',SESSION_EXPIRED:'登录已过期，请重新登录。',ACCOUNT_RESTRICTED:'账号正在等待审核或已暂停。',DEVICE_RESTRICTED:'此浏览器尚未获得授权，或授权已被撤销。',ADMIN_REQUIRED:'只有管理员可以执行此操作。',DEVICE_LIMIT:'已达到此账号的设备数量上限，请先撤销其他设备。',KEEP_OWN_ACCESS:'请保留当前管理员账号与浏览器的访问权限。',REVOKE_EXTRA_DEVICES:'请先撤销多余设备，再降低数量上限。',COURSE_UPDATED:'课程已更新，请刷新后再操作。',QUIZ_INCOMPLETE:'请完成所有题目后提交。',SETUP_INVALID:'管理员开通链接无效或已经使用。',SETUP_BUSY:'管理员开通正在处理，请稍后重试。',COURSE_NOT_FOUND:'课程不存在或尚未发布。'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createHandler({url,key,allowedOrigins,fetcher=fetch}){
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  async function remote(path,body,customHeaders){
    const response=await fetcher(url+path,{method:body===undefined?'GET':'POST',headers:customHeaders||headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data;try{data=await response.json();}catch{data={};}
    if(!response.ok){const err=new Error(data.message||data.msg||data.error_description||data.error||'REQUEST_FAILED');err.status=response.status;throw err;}
    return data;
  }
  const rpc=(name,data)=>remote('/rest/v1/rpc/'+name,data);
  const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  return async function handler(req){
    const origin=req.headers.get('Origin'),cors={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-device-key','Access-Control-Allow-Methods':'POST,OPTIONS'};
    if(origin&&allowedOrigins.includes(origin))cors['Access-Control-Allow-Origin']=origin;
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
    if(origin&&!allowedOrigins.includes(origin))return reply({error:'此访问来源未获许可。'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(req.method!=='POST')return reply({error:'请通过学习网站访问。'},405);
    try{
      const raw=await req.text();if(raw.length>1000000)return reply({error:'提交内容过大。'},413);
      let body;try{body=JSON.parse(raw);}catch{return reply({error:'请求格式无效。'},400);}
      const action=body.action;
      if(action==='setup_info'||action==='setup_admin'){
        if(typeof body.setup_key!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(body.setup_key))throw new Error('SETUP_INVALID');
        const tokenHash=await hash(body.setup_key);
        const info=await rpc('zb_setup_claim',{p_hash:tokenHash,p_reserve:action==='setup_admin'});
        if(action==='setup_info')return reply({email:info.email});
        if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new Error('密码需要 12 至 128 个字符。');
        const name=typeof body.display_name==='string'?body.display_name.trim().slice(0,80):'管理员';
        let user;
        if(info.existing_user_id){
          const response=await fetcher(url+'/auth/v1/admin/users/'+info.existing_user_id,{method:'PUT',headers,body:JSON.stringify({password:body.password,email_confirm:true})});
          if(!response.ok)throw new Error('管理员账号开通失败，请稍后重试。');user=await response.json();
        }else user=await remote('/auth/v1/admin/users',{email:info.email,password:body.password,email_confirm:true});
        await rpc('zb_setup_finish',{p_hash:tokenHash,p_user:user.id||user.user?.id,p_name:name||'管理员'});
        return reply({ok:true,email:info.email});
      }
      const auth=req.headers.get('Authorization')||'';
      if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))throw new Error('AUTH_REQUIRED');
      const user=await remote('/auth/v1/user',undefined,{...headers,Authorization:auth});
      if(!uuid.test(user.id)||user.is_anonymous||!user.email_confirmed_at)throw new Error('AUTH_REQUIRED');
      const token=auth.slice(7);let claims;
      try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new Error('AUTH_REQUIRED');}
      if(!uuid.test(claims.session_id)||claims.sub!==user.id)throw new Error('SESSION_EXPIRED');
      const proof=req.headers.get('x-device-key')||'';if(!/^[a-f0-9]{64}$/.test(proof))throw new Error('DEVICE_RESTRICTED');
      const params={p_actor:user.id,p_session:claims.session_id,p_device:await hash(proof)};
      const command=(a,data={})=>rpc('zb_command',{...params,p_action:a,p_data:data});
      if(action==='status')return reply(await command('status',{label:typeof body.label==='string'?body.label.slice(0,180):'浏览器'}));
      if(action==='courses'||action==='state_get'||action==='admin_dashboard')return reply(await command(action));
      if(action==='state_save'){
        const all=await command('courses');
        if(!Number.isInteger(body.revision)||body.revision<0)throw new Error('学习记录版本无效。');
        const previous=await command('state_get');
        const state=preserveHiddenState(sanitizeState(body.state,all.courses),previous.state,all.courses);
        return reply(await command('state_save',{state,revision:body.revision}));
      }
      if(action==='quiz_submit'){
        if(!Number.isInteger(body.course_id)||!Number.isInteger(body.course_revision)||!uuid.test(body.attempt_id)||!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))throw new Error('答题记录格式无效。');
        return reply(await command(action,{course_id:body.course_id,course_revision:body.course_revision,attempt_id:body.attempt_id,answers:body.answers}));
      }
      if(action==='change_password'){
        await command('access_check');
        if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new Error('密码需要 12 至 128 个字符。');
        const response=await fetcher(url+'/auth/v1/user',{method:'PUT',headers:{...headers,Authorization:auth},body:JSON.stringify({password:body.password})});
        if(!response.ok)throw new Error('密码修改失败，请稍后重试。');return reply({ok:true});
      }
      await command('admin_check');
      if(action==='create_student'){
        if(typeof body.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)||body.email.length>250||typeof body.password!=='string'||body.password.length<12||body.password.length>128||!Number.isInteger(body.max_devices)||body.max_devices<1||body.max_devices>10)throw new Error('请检查邮箱、密码和设备上限。');
        const name=typeof body.display_name==='string'?body.display_name.trim().slice(0,80):'';if(!name)throw new Error('请填写学员姓名或称呼。');
        const created=await remote('/auth/v1/admin/users',{email:body.email.toLowerCase(),password:body.password,email_confirm:true});
        await command('student_created',{user_id:created.id||created.user?.id,display_name:name,max_devices:body.max_devices});return reply({ok:true});
      }
      if(action==='profile_update'){
        if(!uuid.test(body.user_id)||!['active','pending','blocked'].includes(body.status)||!Number.isInteger(body.max_devices)||body.max_devices<1||body.max_devices>10)throw new Error('人员设置无效。');
        return reply(await command(action,{user_id:body.user_id,status:body.status,max_devices:body.max_devices}));
      }
      if(action==='device_update'){
        if(!uuid.test(body.device_id)||!['active','revoked'].includes(body.status))throw new Error('设备设置无效。');
        return reply(await command(action,{device_id:body.device_id,status:body.status}));
      }
      if(action==='course_save'){
        if(!Number.isInteger(body.expected_revision)||body.expected_revision<0||typeof body.published!=='boolean')throw new Error('课程版本或发布状态无效。');
        const course=validateCourse(body.course);return reply(await command(action,{course,expected_revision:body.expected_revision,published:body.published}));
      }
      throw new Error('UNKNOWN_ACTION');
    }catch(error){
      const message=String(error?.message||'请求失败');
      const code=Object.keys(messages).find(k=>message.includes(k));
      const status=code==='AUTH_REQUIRED'||code==='SESSION_EXPIRED'?401:code==='ADMIN_REQUIRED'||code==='ACCOUNT_RESTRICTED'||code==='DEVICE_RESTRICTED'?403:code==='COURSE_UPDATED'?409:400;
      return reply({error:code?messages[code]:message.includes('Invalid login credentials')?'邮箱或密码不正确。':message.length<160&&!/SQL|relation|column|function|syntax|permission|constraint/i.test(message)?message:'操作未完成，请刷新后重试。',code:code||'REQUEST_FAILED'},status);
    }
  };
}
