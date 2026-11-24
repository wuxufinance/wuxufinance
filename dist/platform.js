import {config} from './config.js?v=20261124-wuxu1';
import {setCurriculum} from './courses.js?v=20261124-wuxu1';
import {mergeState} from './state-merge.js?v=20261124-wuxu1';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sessionKey='zhiben-auth-v1',deviceStorageKey='zhiben-browser-v1';
let current=null,refreshing,revision=0,baseState={},pendingState,queue=Promise.resolve(),timer,heartbeat;
let storedDevice=localStorage.getItem(deviceStorageKey);
if(!/^[a-f0-9]{64}$/.test(storedDevice||'')){storedDevice=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem(deviceStorageKey,storedDevice);}
try{current=JSON.parse(localStorage.getItem(sessionKey));}catch{}
const persistSession=value=>{current=value;if(value)localStorage.setItem(sessionKey,JSON.stringify(value));else localStorage.removeItem(sessionKey);};
const signal=(status)=>{window.dispatchEvent(new CustomEvent('learning-sync',{detail:status}));};
async function auth(path,body){
  const response=await fetch(config.supabaseUrl+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error_code==='invalid_credentials'||result.msg==='Invalid login credentials'?'邮箱或密码不正确。':result.msg||result.error_description||'登录暂未完成，请稍后重试。');
  if(result.access_token){result.expires_at=Date.now()+result.expires_in*1000;persistSession(result);}return result;
}
async function token(){
  if(!current?.access_token)throw new Error('请先登录。');
  if(current.expires_at<Date.now()+60000){
    if(!refreshing)refreshing=auth('token?grant_type=refresh_token',{refresh_token:current.refresh_token}).finally(()=>refreshing=null);
    await refreshing;
  }return current.access_token;
}
export async function api(action,data={},publicCall=false){
  const headers={'Content-Type':'application/json',apikey:config.publishableKey,'x-device-key':storedDevice};
  if(!publicCall)headers.Authorization='Bearer '+await token();
  const response=await fetch(config.apiUrl,{method:'POST',headers,body:JSON.stringify({action,...data})});
  let result;try{result=await response.json();}catch{throw new Error('服务暂时不可用，请稍后重试。');}
  if(!response.ok){const e=new Error(result.error||'操作未完成。');e.code=result.code;e.status=response.status;if(['SESSION_EXPIRED','AUTH_REQUIRED'].includes(e.code))persistSession(null);throw e;}return result;
}
function updateLocalFromServer(data){
  revision=data.revision;baseState=structuredClone(data.state);
  window.dispatchEvent(new CustomEvent('learning-remote-state',{detail:data.state}));
}
async function saveSnapshot(snapshot){
  signal('saving');
  for(let attempt=0;attempt<4;attempt++){
    const result=await api('state_save',{state:snapshot,revision});
    if(result.conflict){snapshot=mergeState(baseState,snapshot,result.state);revision=result.revision;baseState=structuredClone(result.state);continue;}
    revision=result.revision;baseState=structuredClone(result.state);localStorage.setItem(platform.storageKey+':base',JSON.stringify(baseState));const stored=localStorage.getItem(platform.storageKey+':pending');if(stored===JSON.stringify(snapshot))localStorage.removeItem(platform.storageKey+':pending');window.dispatchEvent(new CustomEvent('learning-server-metrics',{detail:result.state.courses}));signal('saved');return result;
  }throw new Error('其他设备正在更新记录，请刷新后继续。');
}
export const platform={
  profile:null,device:null,state:null,
  get storageKey(){return 'zhiben-learning-'+this.profile.id;},
  saveState(state){localStorage.setItem(this.storageKey+':pending',JSON.stringify(state));pendingState=structuredClone(state);clearTimeout(timer);signal('saving');timer=setTimeout(()=>{const snapshot=pendingState;pendingState=null;queue=queue.catch(()=>{}).then(()=>saveSnapshot(snapshot)).catch(e=>{signal('error');console.warn('Learning progress could not be saved.');});},500);},
  async flush(){clearTimeout(timer);if(pendingState){const snapshot=pendingState;pendingState=null;queue=queue.catch(()=>{}).then(()=>saveSnapshot(snapshot));}return queue;},
  async submitQuiz(course,answers){await this.flush();const result=await api('quiz_submit',{course_id:course.id,course_revision:course.revision,answers,attempt_id:crypto.randomUUID()});updateLocalFromServer(result);signal('saved');return result.state.courses[course.id];},
  async logout(){clearInterval(heartbeat);clearTimeout(timer);try{await this.flush();}catch{}try{await fetch(config.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+await token()}});}catch{}persistSession(null);location.href='./';},
  async changePassword(password){return api('change_password',{password});}
};
window.platform=platform;
const browserLabel=()=>{const ua=navigator.userAgent;let browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'浏览器';return browser+' · '+(/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':'设备');};
function gateShell(content){$('#app').innerHTML=`<main class="auth-page"><section class="auth-story"><a class="auth-brand" href="./"><span>戊戌.</span><small>金融知识体系</small></a><div><span class="auth-eyebrow">UNDERSTAND, THEN DECIDE.</span><h1>把金融知识，<br>变成自己的判断。</h1><p>从货币、信用到资本与并购，<br>循序渐进理解钱的逻辑。</p><div class="auth-features"><span>系统课程</span><span>互动实验</span><span>复习与练习</span></div></div><small>让理解，成为你的底气。</small></section><section class="auth-panel">${content}</section></main>`;}
export async function showGate(admin=false){
  const setup=new URLSearchParams(location.hash.slice(1)).get('setup');
  if(setup){
    history.replaceState(null,'',location.pathname);
    gateShell('<div class="auth-box"><span class="eyebrow">管理员首次开通</span><h2>为你的学习空间设置密码</h2><p class="muted">开通链接仅供管理员本人使用。</p><div id="setup-content" class="auth-form"><p>正在验证开通链接…</p></div></div>');
    try{
      const info=await api('setup_info',{setup_key:setup},true);
      $('#setup-content').innerHTML=`<form id="setup-form"><label>管理员邮箱<input value="${esc(info.email)}" readonly autocomplete="username"></label><label>显示名称<input name="display_name" value="管理员" required maxlength="80" autocomplete="name"></label><label>设置密码<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>再次输入密码<input name="confirm" type="password" minlength="12" required autocomplete="new-password"></label><p class="auth-error" role="alert"></p><button class="button primary" type="submit">开通管理员账号</button><p class="auth-hint">密码至少 12 个字符。开通后，用此邮箱和密码登录。</p></form>`;
      $('#setup-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(f.password.value!==f.confirm.value){$('.auth-error').textContent='两次输入的密码不一致。';return;}f.querySelector('button').disabled=true;try{await api('setup_admin',{setup_key:setup,password:f.password.value,display_name:f.display_name.value},true);gateShell('<div class="auth-box"><span class="eyebrow">开通成功</span><h2>你的学习空间已准备就绪</h2><p>请使用刚刚设置的邮箱和密码登录。</p><a class="button primary" href="./">前往登录</a></div>');}catch(err){$('.auth-error').textContent=err.message;f.querySelector('button').disabled=false;}});
    }catch(e){$('#setup-content').innerHTML=`<p class="auth-error">${esc(e.message)}</p><a class="button secondary" href="./">返回登录</a>`;}return;
  }
  if(!current?.access_token){
    gateShell(`<div class="auth-box"><span class="eyebrow">欢迎回到戊戌</span><h2>登录你的学习空间</h2><p class="muted">继续课程，保存每一次理解。</p><form id="login-form" class="auth-form"><label>登录邮箱<input type="email" name="email" required autocomplete="username" placeholder="你的账号邮箱"></label><label>密码<input name="password" type="password" required autocomplete="current-password" placeholder="输入登录密码"></label><p class="auth-error" role="alert"></p><button class="button primary" type="submit">登录学习</button></form><div class="auth-notice"><b>账号由管理员开通</b><p>首次在新浏览器登录后，需要管理员批准此浏览器。</p></div><p class="auth-privacy">本站记录登录时间、浏览器信息、课程进度与练习成绩，供管理员管理账号和检查学习情况。</p></div>`);
    $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('button');button.disabled=true;button.textContent='正在登录…';try{await auth('token?grant_type=password',{email:f.email.value.trim(),password:f.password.value});location.reload();}catch(err){$('.auth-error').textContent=err.message;button.disabled=false;button.textContent='登录学习';}});return;
  }
  gateShell('<div class="auth-box"><span class="eyebrow">正在准备你的学习空间</span><h2>确认账号与浏览器授权</h2><p class="muted">马上就好。</p></div>');
  try{
    const status=await api('status',{label:browserLabel()});platform.profile=status.profile;platform.device=status.device;
    if(status.profile.status!=='active'||status.device.status!=='active'||(admin&&status.profile.role!=='admin')){
      gateShell(`<div class="auth-box"><span class="eyebrow">${esc(status.profile.email)}</span><h2>${status.profile.status==='blocked'?'账号已暂停':status.device.status==='revoked'?'此浏览器的授权已撤销':admin&&status.profile.role!=='admin'?'此页面仅供管理员使用':'等待管理员批准'}</h2><p class="muted">${admin&&status.profile.role!=='admin'?'你可以返回学习页面。':'请联系管理员，在人员与设备页面批准账号和此浏览器。'}</p><div class="device-card"><b>${esc(status.device.label)}</b><span>设备编号 ${esc(status.device.id.slice(0,8))}</span><span>账号设备上限 ${status.profile.max_devices} 台浏览器</span></div><div class="button-row"><button class="button primary" id="check-again">刷新授权状态</button><button class="button secondary" id="gate-logout">退出登录</button>${admin&&status.profile.role!=='admin'?'<a href="./" class="text-link">返回学习</a>':''}</div></div>`);$('#check-again').onclick=()=>location.reload();$('#gate-logout').onclick=()=>platform.logout();return;
    }
    const [curriculum,saved]=await Promise.all([api('courses'),api('state_get')]);
    if(!curriculum.courses.length)throw new Error('课程尚未发布，请稍后再来。');setCurriculum(curriculum);
    if(!curriculum.courses.some(c=>c.id===saved.state.last))saved.state.last=curriculum.courses.at(-1).id;
    platform.state=saved.state;revision=saved.revision;baseState=structuredClone(saved.state);
    const pending=localStorage.getItem(platform.storageKey+':pending');if(pending){try{const local=JSON.parse(pending),old=JSON.parse(localStorage.getItem(platform.storageKey+':base')||'{}');platform.state=mergeState(old,local,saved.state);platform.saveState(platform.state);}catch{}}localStorage.setItem(platform.storageKey,JSON.stringify(platform.state));
    $('#app').innerHTML='';
    heartbeat=setInterval(async()=>{try{const s=await api('status',{label:browserLabel()});if(s.profile.status!=='active'||s.device.status!=='active')location.reload();}catch(e){if(e.status===401||e.status===403)location.reload();}},45000);
    if(admin)await import('./admin.js?v=20261124-wuxu1');else await import('./app.js?v=20261124-wuxu1');
  }catch(err){gateShell(`<div class="auth-box"><h2>暂时无法进入学习空间</h2><p class="auth-error">${esc(err.message)}</p><div class="button-row"><button class="button primary" id="retry-entry">重新检查</button><button class="button secondary" id="gate-logout">退出登录</button></div></div>`);$('#retry-entry').onclick=()=>location.reload();$('#gate-logout').onclick=()=>platform.logout();}
}
window.addEventListener('online',()=>{const stored=platform.profile&&localStorage.getItem(platform.storageKey+':pending');if(stored){try{platform.saveState(JSON.parse(stored));}catch{}}});
window.addEventListener('storage',e=>{if(e.key===sessionKey)location.reload();});
window.addEventListener('pagehide',()=>{if(pendingState)platform.flush().catch(()=>{});});
