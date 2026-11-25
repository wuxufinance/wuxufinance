import {showAuthPage,consumeAuthCallback,rememberLearningTarget,learningTarget,showResetPassword} from './auth-ui.js?v=20261125-access01';
import {authRoute,publicAuthError} from './auth-utils.js?v=20261125-access01';
const publicHome=new URL('./',import.meta.url).href,learningHome=new URL('./learn/',import.meta.url).href;
import {config} from './config.js?v=20261125-access01';
import {setCurriculum} from './courses.js?v=20261125-access01';
import {mergeState} from './state-merge.js?v=20261125-access01';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sessionKey='zhiben-auth-v1',deviceStorageKey='zhiben-browser-v1';
let current=null,refreshing,revision=0,baseState={},pendingState,queue=Promise.resolve(),timer,heartbeat,callbackChecked=false;
let storedDevice=localStorage.getItem(deviceStorageKey);
if(!/^[a-f0-9]{64}$/.test(storedDevice||'')){storedDevice=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem(deviceStorageKey,storedDevice);}
try{current=JSON.parse(localStorage.getItem(sessionKey));}catch{}
const persistSession=value=>{current=value;if(value)localStorage.setItem(sessionKey,JSON.stringify(value));else localStorage.removeItem(sessionKey);};
const signal=(status)=>{window.dispatchEvent(new CustomEvent('learning-sync',{detail:status}));};
async function auth(path,body){
  const response=await fetch(config.supabaseUrl+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(publicAuthError(result));
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
  async downloadWorkbook(courseId){const file=await api('course_download',{course_id:courseId,file_id:'workbook'});const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=file.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},
  async logout(){clearInterval(heartbeat);clearTimeout(timer);try{await this.flush();}catch{}try{await fetch(config.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+await token()}});}catch{}persistSession(null);location.href=learningHome;},
  async changePassword(password){return api('change_password',{password});}
};
window.platform=platform;
const browserLabel=()=>{const ua=navigator.userAgent;let browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'浏览器';return browser+' · '+(/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':'设备');};
function gateShell(content){$('#app').innerHTML=`<main class="auth-page"><section class="auth-story"><a class="auth-brand" href="${publicHome}"><span>戊戌.</span><small>金融知识体系</small></a><div><span class="auth-eyebrow">UNDERSTAND, THEN DECIDE.</span><h1>把金融知识，<br>变成自己的判断。</h1><p>从货币、信用到资本与并购，<br>循序渐进理解钱的逻辑。</p><div class="auth-features"><span>系统课程</span><span>互动实验</span><span>复习与练习</span></div></div><small>让理解，成为你的底气。</small></section><section class="auth-panel">${content}</section></main>`;}
export async function showGate(admin=false){
  rememberLearningTarget();
  if(!callbackChecked){callbackChecked=true;try{const callback=await consumeAuthCallback(auth);if(callback?.recovery){showResetPassword({gateShell,changePassword:p=>platform.changePassword(p),logout:()=>platform.logout()});return;}if(callback){location.replace(admin?new URL('./admin.html',import.meta.url).href:learningHome+learningTarget());return;}}catch(error){gateShell('<div class="auth-box"><h2>验证未完成</h2><p class="auth-error">'+esc(error.message)+'</p><a href="'+learningHome+'#/auth/verify">使用邮件验证码验证</a></div>');return;}}
  const setup=new URLSearchParams(location.hash.slice(1)).get('setup');
  if(setup){
    history.replaceState(null,'',location.pathname);
    gateShell('<div class="auth-box"><span class="eyebrow">管理员首次开通</span><h2>为你的学习空间设置密码</h2><p class="muted">开通链接仅供管理员本人使用。</p><div id="setup-content" class="auth-form"><p>正在验证开通链接…</p></div></div>');
    try{
      const info=await api('setup_info',{setup_key:setup},true);
      $('#setup-content').innerHTML=`<form id="setup-form"><label>管理员邮箱<input value="${esc(info.email)}" readonly autocomplete="username"></label><label>显示名称<input name="display_name" value="管理员" required maxlength="80" autocomplete="name"></label><label>设置密码<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>再次输入密码<input name="confirm" type="password" minlength="12" required autocomplete="new-password"></label><p class="auth-error" role="alert"></p><button class="button primary" type="submit">开通管理员账号</button><p class="auth-hint">密码至少 12 个字符。开通后，用此邮箱和密码登录。</p></form>`;
      $('#setup-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(f.password.value!==f.confirm.value){$('.auth-error').textContent='两次输入的密码不一致。';return;}f.querySelector('button').disabled=true;try{await api('setup_admin',{setup_key:setup,password:f.password.value,display_name:f.display_name.value},true);gateShell('<div class="auth-box"><span class="eyebrow">开通成功</span><h2>你的学习空间已准备就绪</h2><p>请使用刚刚设置的邮箱和密码登录。</p><a class="button primary" href="/wuxufinance/learn/">前往登录</a></div>');}catch(err){$('.auth-error').textContent=err.message;f.querySelector('button').disabled=false;}});
    }catch(e){$('#setup-content').innerHTML=`<p class="auth-error">${esc(e.message)}</p><a class="button secondary" href="/wuxufinance/learn/">返回登录</a>`;}return;
  }
  if(!current?.access_token){
    const match=location.hash.match(/^#\/course\/([1-9]\d{0,5})/);
    if(!admin&&match){try{const catalog=await api('public_catalog',{},true),entry=catalog.courses.find(c=>c.id===Number(match[1]));if(entry?.mode==='public_free'){location.replace(new URL('./courses/'+entry.series+'/lesson-'+String(entry.lesson).padStart(2,'0')+'/#public-reading',import.meta.url).href);return;}}catch{}}
    await showAuthPage({gateShell,auth,api,learningHome,onLogin:()=>admin?location.reload():location.replace(learningHome+learningTarget()),changePassword:p=>platform.changePassword(p),logout:()=>platform.logout()});return;
  }
  gateShell('<div class="auth-box"><span class="eyebrow">正在准备你的学习空间</span><h2>确认账号与浏览器授权</h2><p class="muted">马上就好。</p></div>');
  try{
    const status=await api('status',{label:browserLabel()});platform.profile=status.profile;platform.device=status.device;
    if(status.profile.status!=='active'||status.device.status!=='active'||(admin&&status.profile.role!=='admin')){
      gateShell(`<div class="auth-box"><span class="eyebrow">${esc(status.profile.email)}</span><h2>${status.profile.status==='blocked'?'账号已暂停':status.device.status==='revoked'?'此浏览器的授权已撤销':admin&&status.profile.role!=='admin'?'此页面仅供管理员使用':'等待管理员批准'}</h2><p class="muted">${admin&&status.profile.role!=='admin'?'你可以返回学习页面。':'请联系管理员，在人员与设备页面批准账号和此浏览器。'}</p><div class="device-card"><b>${esc(status.device.label)}</b><span>设备编号 ${esc(status.device.id.slice(0,8))}</span><span>账号设备上限 ${status.profile.max_devices} 台浏览器</span></div><div class="button-row"><button class="button primary" id="check-again">刷新授权状态</button><button class="button secondary" id="gate-logout">退出登录</button>${admin&&status.profile.role!=='admin'?'<a href="/wuxufinance/learn/" class="text-link">返回学习</a>':''}</div></div>`);$('#check-again').onclick=()=>location.reload();$('#gate-logout').onclick=()=>platform.logout();return;
    }
    const [curriculum,saved]=await Promise.all([api('courses'),api('state_get')]);
    if(!curriculum.courses.length)throw new Error('课程尚未发布，请稍后再来。');setCurriculum(curriculum);
    if(!curriculum.courses.some(c=>c.id===saved.state.last))saved.state.last=curriculum.courses.at(-1).id;
    platform.state=saved.state;revision=saved.revision;baseState=structuredClone(saved.state);
    const pending=localStorage.getItem(platform.storageKey+':pending');if(pending){try{const local=JSON.parse(pending),old=JSON.parse(localStorage.getItem(platform.storageKey+':base')||'{}');platform.state=mergeState(old,local,saved.state);platform.saveState(platform.state);}catch{}}localStorage.setItem(platform.storageKey,JSON.stringify(platform.state));
    $('#app').innerHTML='';
    heartbeat=setInterval(async()=>{try{const s=await api('status',{label:browserLabel()});if(s.profile.status!=='active'||s.device.status!=='active')location.reload();const m=location.hash.match(/^#\/course\/([1-9]\d*)/);if(m)await api('access_check',{course_id:Number(m[1])});}catch(e){if(e.status===401||e.status===403)location.reload();}},45000);
    if(admin)await import('./admin.js?v=20261125-access01');else await import('./app.js?v=20261125-access01');
  }catch(err){gateShell(`<div class="auth-box"><h2>暂时无法进入学习空间</h2><p class="auth-error">${esc(err.message)}</p><div class="button-row"><button class="button primary" id="retry-entry">重新检查</button><button class="button secondary" id="gate-logout">退出登录</button></div></div>`);$('#retry-entry').onclick=()=>location.reload();$('#gate-logout').onclick=()=>platform.logout();}
}
window.addEventListener('online',()=>{const stored=platform.profile&&localStorage.getItem(platform.storageKey+':pending');if(stored){try{platform.saveState(JSON.parse(stored));}catch{}}});
window.addEventListener('storage',e=>{if(e.key===sessionKey)location.reload();});
window.addEventListener('pagehide',()=>{if(pendingState)platform.flush().catch(()=>{});});

window.addEventListener('hashchange',()=>{if(!platform.profile&&(!current?.access_token||authRoute(location.hash)))showGate(document.body.dataset.page==='admin');});
