import {safeLearningHash,authRoute,passwordValid,emailValid,createPKCE} from './auth-utils.js?v=20261125-access01';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pendingKey='wuxu-auth-request-v1',returnKey='wuxu-learning-return-v1';
const readPending=()=>{try{return JSON.parse(sessionStorage.getItem(pendingKey))||{};}catch{return {};}};
export function rememberLearningTarget(hash=location.hash){if(!authRoute(hash)&&safeLearningHash(hash)===hash)try{sessionStorage.setItem(returnKey,safeLearningHash(hash));}catch{}}
export function learningTarget(){try{return safeLearningHash(sessionStorage.getItem(returnKey)||location.hash);}catch{return safeLearningHash(location.hash);}}
export async function consumeAuthCallback(auth){
 const u=new URL(location.href),code=u.searchParams.get('code');
 if(!code)return null;
 u.searchParams.delete('code');history.replaceState(null,'',u.pathname+u.search+u.hash);
 const pending=readPending();
 if(typeof pending.verifier!=='string'||!/^[a-f0-9]{64}$/.test(pending.verifier))throw Error('请在发起请求的浏览器打开验证链接，或使用邮件验证码验证。');
 try{await auth('token?grant_type=pkce',{auth_code:code,code_verifier:pending.verifier});}
 finally{sessionStorage.removeItem(pendingKey);}
 return {recovery:pending.flow==='recovery'};
}
export function showResetPassword({gateShell,changePassword,logout}){
 gateShell('<div class="auth-box"><span class="eyebrow">邮箱身份已验证</span><h2>设置新的登录密码</h2><form id="recovery-password" class="auth-form"><label>新密码<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>再次输入新密码<input name="confirm" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><p class="auth-error" role="alert"></p><button class="button primary" type="submit">保存新密码</button></form></div>');
 document.querySelector('#recovery-password').addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');
   if(!passwordValid(f.password.value)||f.password.value!==f.confirm.value){f.querySelector('[role=alert]').textContent='请使用12至128个字符，并确认两次输入一致。';return;}
   b.disabled=true;try{await changePassword(f.password.value);f.reset();await logout();}catch(error){f.querySelector('[role=alert]').textContent=error.message;b.disabled=false;}
 });
}
export async function showAuthPage({gateShell,auth,api,onLogin,learningHome,changePassword,logout}){
 const pending=readPending(),mode=location.hash.match(/^#\/auth\/(register|recover|verify|reset)$/)?.[1]||'login';
 const links='<nav class="auth-links" aria-label="账号入口"><a href="#/auth/login">登录</a><a href="#/auth/register">邮箱注册</a><a href="#/auth/recover">找回密码</a></nav>';
 let ready=false;
 if(mode!=='login'){
   try{ready=(await api('public_catalog',{},true)).email_ready===true;}catch{}
 }
 const mailNotice=ready?'<p class="auth-hint">验证邮件由认证服务发送。发送后请检查收件箱和垃圾邮件；60秒内请勿重复申请。</p>':'<p class="auth-notice"><b>邮件服务尚未配置，注册及找回密码暂未对外开放。</b><br>已有账号仍可正常登录；管理员完成邮件配置与投递验收后再开放。</p>';
 if(mode==='reset'){gateShell('<div class="auth-box"><h2>请先验证找回密码请求</h2><p>新密码必须通过有效的邮件验证链接或验证码设置。</p>'+links+'</div>');return;}
 if(mode==='verify'){
   gateShell('<div class="auth-box"><span class="eyebrow">EMAIL VERIFICATION</span><h2>验证你的邮箱</h2>'+mailNotice+'<form id="verify-email" class="auth-form"><label>邮箱<input name="email" type="email" required autocomplete="email" value="'+esc(pending.email||'')+'"></label><label>验证用途<select name="type"><option value="email" '+(pending.flow!=='recovery'?'selected':'')+'>注册邮箱验证</option><option value="recovery" '+(pending.flow==='recovery'?'selected':'')+'>找回密码验证</option></select></label><label>邮件验证码<input name="token" inputmode="numeric" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required autocomplete="one-time-code"></label><p class="auth-error" role="alert"></p><button class="button primary" type="submit">验证邮箱</button></form>'+links+'</div>');
   document.querySelector('#verify-email').addEventListener('submit',async e=>{
     e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;
     try{
       await auth('verify',{email:f.email.value.trim(),token:f.token.value.trim(),type:f.type.value});
       sessionStorage.removeItem(pendingKey);
       if(f.type.value==='recovery')showResetPassword({gateShell,changePassword,logout});else onLogin();
     }catch(error){f.querySelector('[role=alert]').textContent=error.message;b.disabled=false;}
   });return;
 }
 const signup=mode==='register',recover=mode==='recover',label=signup?'注册学习账号':recover?'找回登录密码':'登录你的学习空间';
 gateShell('<div class="auth-box"><span class="eyebrow">'+(signup?'从理解开始':recover?'安全找回账号':'欢迎回到戊戌')+'</span><h2>'+label+'</h2><p class="muted">'+(signup?'验证邮箱后建立普通学习账号。内部授权由管理员单独授予。':recover?'通过注册邮箱验证身份后设置新密码。':'登录后继续课程，并同步你的学习记录。')+'</p>'+((signup||recover)?mailNotice:'')+
 '<form id="auth-entry" class="auth-form"><fieldset '+((signup||recover)&&!ready?'disabled':'')+'>'+
 (signup?'<label>姓名或称呼<input name="display_name" required maxlength="80" autocomplete="nickname"></label>':'')+
 '<label>登录邮箱<input type="email" name="email" required maxlength="250" autocomplete="'+(signup?'email':'username')+'"></label>'+
 (!recover?'<label>密码<input name="password" type="password" required '+(signup?'minlength="12" maxlength="128" autocomplete="new-password"':'autocomplete="current-password"')+'></label>':'')+
 (signup?'<label>再次输入密码<input name="confirm" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label>':'')+
 '<div class="auth-honeypot" aria-hidden="true"><label>网站<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="button primary" type="submit">'+(signup?'注册并发送验证邮件':recover?'发送密码找回邮件':'登录学习')+'</button></fieldset><p class="auth-error" role="alert"></p><p class="auth-result" role="status"></p></form>'+
 (signup||recover?'<p class="auth-hint"><a href="#/auth/verify">已经收到邮件验证码</a></p>':'<div class="auth-notice"><b>已有账号继续使用原登录信息</b><p>原有人员和设备审批继续保留。新注册普通账号不能自行获得管理员或内部授权。</p></div>')+
 links+'<p class="auth-privacy">学习进度和成绩与你的账号关联。本站记录登录时间与浏览器信息，用于账号、设备和学习管理。</p></div>');
 document.querySelector('#auth-entry').addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),errorNode=f.querySelector('[role=alert]'),result=f.querySelector('[role=status]');
   errorNode.textContent='';result.textContent='';
   if(f.website.value)return;
   if(!emailValid(f.email.value.trim())){errorNode.textContent='请填写有效邮箱。';return;}
   if(signup&&(!passwordValid(f.password.value)||f.password.value!==f.confirm.value)){errorNode.textContent='密码需12至128个字符，且两次输入一致。';return;}
   b.disabled=true;
   try{
     if(!signup&&!recover){await auth('token?grant_type=password',{email:f.email.value.trim(),password:f.password.value});f.password.value='';onLogin();return;}
     if(!ready)throw Error('邮件服务尚未开放。');
     const pkce=await createPKCE(),flow=recover?'recovery':'signup';
     sessionStorage.setItem(pendingKey,JSON.stringify({email:f.email.value.trim(),flow,verifier:pkce.verifier}));
     const callback=new URL(learningHome);callback.searchParams.set('auth',flow);
     const body={email:f.email.value.trim(),code_challenge:pkce.challenge,code_challenge_method:'s256'};
     if(signup){body.password=f.password.value;body.data={display_name:f.display_name.value.trim()};}
     await auth((recover?'recover':'signup')+'?redirect_to='+encodeURIComponent(callback.href),body);
     if(signup){f.password.value='';f.confirm.value='';}
     result.innerHTML='如果该邮箱符合条件，验证邮件将发送至收件箱。请使用最新邮件完成验证。 <a href="#/auth/verify">输入邮件验证码</a>';
     setTimeout(()=>{if(b.isConnected)b.disabled=false;},60000);
   }catch(error){errorNode.textContent=error.message;b.disabled=false;}
 });
}
