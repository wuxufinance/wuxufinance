import {courseSeries,seriesOf} from './course-series.js?v=20261125-access01';
import {money,scopeLabel,futureLabel} from './account-center.js?v=20261125-access01';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=t=>t?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t)):'永久';
const statuses={pending:'待支付',paid:'已支付',cancelled:'已取消',closed:'已关闭',refunded:'已退款'};
export const commerceAdminHTML=()=>'<section id="commerce-admin" class="commerce-admin"><p>正在读取商品、订单和授权…</p></section>';
export async function mountCommerceAdmin(root,{api,courses,profiles}){
 const panel=root.querySelector('#commerce-admin');if(!panel)return;
 let data,editing=null,selected=null,tab='products';
 const info=t=>{const n=panel.querySelector('#commerce-feedback');if(n)n.textContent=t;};
 const title=id=>courses.find(c=>c.id===id)?.title||'课程 '+id;
 const findUser=id=>profiles.find(p=>p.id===id)||(selected?.profile.id===id?selected.profile:null);
 const user=id=>findUser(id)?.display_name||'学习者';
 const mail=id=>findUser(id)?.email||'';
 const options=(values,chosen)=>values.map(([v,label])=>'<option value="'+esc(v)+'" '+(chosen.includes(v)?'selected':'')+'>'+esc(label)+'</option>').join('');
 function scopeFields(scope={type:'course',course_ids:[courses[0]?.id],series_ids:[],include_future:false}){
   const c=courses.map(c=>[String(c.id),c.id+' · '+c.title]),s=courseSeries.map(s=>[s.id,s.title]);
   return '<fieldset class="scope-picker"><legend>售卖或授权范围</legend><label class="input-field"><span>范围类型</span><select name="scope_type">'+options([['course','单讲'],['series','课程系列'],['bundle','课程包'],['all','全站']], [scope.type])+'</select></label>'+
    '<div data-scope-for="course"><label class="input-field"><span>选择单讲</span><select name="course_id">'+options(c,scope.course_ids.map(String))+'</select></label></div>'+
    '<div data-scope-for="series"><label class="input-field"><span>选择系列</span><select name="series_id">'+options(s,scope.series_ids)+'</select></label></div>'+
    '<div data-scope-for="bundle"><label class="input-field"><span>课程包讲次（可多选）</span><select name="bundle_courses" multiple size="6">'+options(c,scope.course_ids.map(String))+'</select></label><label class="input-field"><span>课程包系列（可多选）</span><select name="bundle_series" multiple size="3">'+options(s,scope.series_ids)+'</select></label></div>'+
    '<label class="checkline"><input type="checkbox" name="include_future" '+(scope.include_future?'checked':'')+'> 包含范围内未来新增课程</label><p class="small">不包含未来课程时，授权和订单分别保存当时已发布讲次的快照。后续修改商品不会改变旧订单范围。</p></fieldset>';
 }
 function readScope(f){
   const type=f.scope_type.value;
   return {type,course_ids:type==='course'?[Number(f.course_id.value)]:type==='bundle'?[...f.bundle_courses.selectedOptions].map(o=>Number(o.value)):[],
    series_ids:type==='series'?[f.series_id.value]:type==='bundle'?[...f.bundle_series.selectedOptions].map(o=>o.value):[],include_future:type!=='course'&&f.include_future.checked};
 }
 function updateScope(fieldset){
   const type=fieldset.querySelector('[name=scope_type]').value;
   fieldset.querySelectorAll('[data-scope-for]').forEach(e=>{e.hidden=e.dataset.scopeFor!==type;});
   const future=fieldset.querySelector('[name=include_future]');future.disabled=type==='course';if(type==='course')future.checked=false;
 }
 function products(){
   const p=editing||{id:null,revision:0,name:'',description:'',price_minor:null,currency:'CNY',validity_days:null,active:false};
   return '<section class="white-card account-section"><h2>商品与正式售价</h2><p class="muted">所有商品由管理员定价。商品开售与课程设为付费是两项独立配置；没有配置的现有课程继续登录免费。</p><div class="table-scroll"><table><thead><tr><th>商品</th><th>售价</th><th>范围</th><th>状态</th><th></th></tr></thead><tbody>'+data.products.map(p=>'<tr><td><b>'+esc(p.name)+'</b></td><td>'+(p.price_minor===null?'待定价':money(p.price_minor,p.currency))+'</td><td>'+scopeLabel(p.scope)+'<small>'+futureLabel(p.scope)+'</small></td><td>'+(p.active?'已开售':'未开售')+'</td><td><button class="button secondary compact" data-commerce-action="edit-product" data-id="'+p.id+'">编辑</button></td></tr>').join('')+'</tbody></table></div></section>'+
    '<section class="white-card account-section"><h2>'+(editing?'编辑商品':'新建商品')+'</h2><form id="product-settings" class="auth-form"><div class="field-grid"><label>商品名称<input name="name" maxlength="160" required value="'+esc(p.name)+'"></label><label>简介<textarea name="description" maxlength="1200">'+esc(p.description)+'</textarea></label><label>正式售价<input name="price" type="number" min="0.01" max="1000000" step="0.01" value="'+(p.price_minor===null?'':Number(p.price_minor)/100)+'" placeholder="未填写时保持待定价"></label><label>币种<select name="currency">'+options([['CNY','人民币 CNY'],['GBP','英镑 GBP'],['USD','美元 USD'],['EUR','欧元 EUR']],[p.currency])+'</select></label><label>授权有效天数<input name="validity_days" type="number" min="1" max="36500" step="1" value="'+(p.validity_days??'')+'" placeholder="留空为永久"></label></div>'+scopeFields(p.scope)+'<label class="checkline"><input name="active" type="checkbox" '+(p.active?'checked':'')+'> 按上述正式售价开售</label><p class="small">当前没有支付渠道，不展示在线付款按钮。开售仅允许用户建立待支付订单。</p><button class="button primary" type="submit">保存商品与价格</button>'+(editing?'<button class="button secondary" type="button" data-commerce-action="new-product">取消编辑</button>':'')+'</form></section>';
 }
 function orderTable(list){
   return '<div class="table-scroll"><table><thead><tr><th>用户与订单</th><th>商品和金额</th><th>状态</th><th>核实与权限</th></tr></thead><tbody>'+list.map(o=>'<tr><td><b>'+esc(user(o.user_id))+'</b><small>'+esc(mail(o.user_id))+'</small><small>'+o.id+'</small></td><td>'+esc(o.product_name)+'<small>'+money(o.price_minor,o.currency)+'</small><small>'+scopeLabel(o.scope)+' · '+futureLabel(o.scope)+'</small></td><td>'+statuses[o.status]+'<small>'+when(o.created_at)+'</small></td><td>'+(o.status==='pending'?'<button class="button primary compact" data-commerce-action="order-confirm" data-id="'+o.id+'">核实收款并开通</button><button class="button secondary compact" data-commerce-action="order-close" data-id="'+o.id+'">关闭订单</button>':o.status==='paid'?'<button class="button secondary compact" data-commerce-action="order-refund" data-id="'+o.id+'">记录已核实的全额退款</button>':'')+(o.confirmation_note?'<small>收款记录：'+esc(o.confirmation_note)+'</small>':'')+(o.refund_note?'<small>退款记录：'+esc(o.refund_note)+'</small>':'')+'</td></tr>').join('')+'</tbody></table></div>';
 }
 function orders(){return '<section class="white-card account-section"><h2>订单查询</h2><p class="notice">这里记录管理员已核实的收款和退款，不执行真实付款或退款。不得仅凭用户截图确认。全额退款只撤销该订单的购买授权。</p><label class="input-field"><span>筛选已载入订单（邮箱、商品、编号或状态）</span><input id="order-filter" type="search"></label><p class="small">显示最近'+data.order_limit+'条范围内的 '+data.orders.length+' 条订单。按邮箱查询用户可查看该用户的历史记录。</p><div id="commerce-orders">'+orderTable(data.orders)+'</div></section>';}
 function entitlementRows(list){
   return '<div class="table-scroll"><table><thead><tr><th>来源与范围</th><th>有效期和状态</th><th>内部备注</th><th>管理</th></tr></thead><tbody>'+list.map(e=>'<tr><td>'+(e.source==='purchase'?'购买授权':'内部免费授权')+'<small>'+scopeLabel(e.scope)+' · '+e.scope.snapshot_ids.length+'讲</small><small>'+futureLabel(e.scope)+'</small></td><td>'+when(e.expires_at)+'<small>'+(e.revoked_at?'已撤销':e.expires_at&&Date.parse(e.expires_at)<=Date.now()?'已到期':'未撤销')+'</small></td><td>'+esc(e.note||'')+'<small>操作时间：'+when(e.updated_at)+'</small></td><td>'+(e.source==='internal'&&!e.revoked_at?'<button class="button secondary compact" data-commerce-action="grant-extend" data-id="'+e.id+'" '+(e.expires_at===null?'disabled':'')+'>延期</button><button class="button secondary compact" data-commerce-action="grant-revoke" data-id="'+e.id+'">撤销此项授权</button>':e.source==='internal'?'此项内部授权已撤销':'购买授权通过对应订单退款管理')+'</td></tr>').join('')+'</tbody></table></div>';
 }
 function grants(){
   return '<section class="white-card account-section"><h2>内部免费授权与用户查询</h2><form id="grant-lookup" class="inline-lookup"><label class="input-field"><span>已注册用户邮箱</span><input name="email" type="email" required value="'+esc(selected?.profile.email||'')+'"></label><button class="button primary">查询用户和当前权限</button></form><p class="small">内部授权不会改变管理员身份，不生成支付订单，也不计入销售收入。</p></section>'+
    (selected?'<section class="white-card account-section"><h2>'+esc(selected.profile.display_name)+'的当前权限</h2><p>'+esc(selected.profile.email)+' · '+(selected.profile.role==='admin'?'管理员':'普通账户')+'</p><p>当前可访问 '+selected.access.filter(a=>a.full).length+' / '+selected.access.length+' 讲（含免费课程与所有有效授权）。</p>'+entitlementRows(selected.entitlements)+'<h3>发放内部免费授权</h3><form id="internal-grant" class="auth-form">'+scopeFields()+'<label>到期时间<input name="expires_at" type="datetime-local"></label><p class="small">留空表示永久有效。可按单讲、系列、课程包或全站授予，默认不含未来新增课程。</p><label>内部备注<textarea name="note" maxlength="1000"></textarea></label><button class="button primary">授予免费学习权限</button></form></section><section class="white-card account-section"><h2>该用户订单</h2>'+orderTable(selected.orders||[])+'</section>':'');
 }
 function access(){
   return '<section class="white-card account-section"><h2>课程访问与试听</h2><p class="notice">每讲可以单独设置访问方式。将课程设为公开会公开其全文；配置试听会公开选中的单元，请逐讲确认。配套资料继续根据账号权限提供。</p><form id="course-access" class="auth-form"><label>选择课程<select name="course_id">'+options(courses.map(c=>[String(c.id),c.id+' · '+c.title]),[String(courses[0]?.id)])+'</select></label><label>访问方式<select name="mode">'+options([['login_free','登录免费'],['public_free','公开免费全文'],['paid','付费或有效免费授权']],['login_free'])+'</select></label><fieldset id="preview-options"><legend>公开试听单元</legend></fieldset><p class="small">不勾选则不公开任何受限正文；配套下载和课程测试继续在登录且有完整权限时提供。</p><button class="button primary">保存该讲访问配置</button></form></section><section class="white-card account-section"><h2>邮件功能开放状态</h2><p>请先配置SMTP、认证回跳地址和邮件模板，并完成真实邮箱验证与密码找回测试，再开放用户入口。不要在这里填写SMTP密码。</p><form id="email-readiness" class="auth-form"><label class="checkline"><input name="ready" type="checkbox" '+(data.email_ready?'checked':'')+'> 邮件配置与真实投递已经验收，开放注册及找回密码</label><button class="button secondary">保存邮件开放状态</button></form><p class="muted">在线付款始终未开启，需要后续独立接入。</p></section>';
 }
 function render(){
   if(!panel.isConnected)return;
   panel.innerHTML='<p id="commerce-feedback" class="auth-error" role="status"></p><nav class="filter-tabs">'+[['products','商品与价格'],['orders','订单与收款'],['grants','内部授权'],['access','访问与邮件配置']].map(([key,label])=>'<button data-commerce-tab="'+key+'" class="'+(tab===key?'active':'')+'">'+label+'</button>').join('')+'</nav>'+({products,orders,grants,access})[tab]();
   panel.querySelectorAll('.scope-picker').forEach(updateScope);if(tab==='access')loadCourseAccess();
 }
 function loadCourseAccess(){
   const f=panel.querySelector('#course-access');if(!f)return;
   const c=courses.find(c=>c.id===Number(f.course_id.value)),a=data.course_access.find(a=>a.course_id===c.id)||{mode:'login_free',preview_sections:[]};
   f.mode.value=a.mode;panel.querySelector('#preview-options').innerHTML='<legend>公开试听单元</legend>'+c.payload.sections.map(s=>'<label class="checkline"><input type="checkbox" name="preview" value="'+esc(s.id)+'" '+(a.preview_sections.includes(s.id)?'checked':'')+'> '+esc(s.title)+'</label>').join('');
 }
 async function reload(){data=await api('commerce_dashboard');if(selected)selected=await api('user_lookup',{email:selected.profile.email});render();}
 function dialog(title,body,onSubmit){
   const d=document.createElement('dialog');d.className='commerce-dialog';d.innerHTML='<form method="dialog"><div class="dialog-head"><b>'+esc(title)+'</b><button class="button secondary compact">关闭</button></div></form><form class="auth-form commerce-dialog-form">'+body+'<p class="auth-error" role="alert"></p><button class="button primary" type="submit">确认记录并保存</button></form>';document.body.append(d);d.showModal();d.addEventListener('close',()=>d.remove());
   d.querySelector('.commerce-dialog-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{await onSubmit(f);d.close();await reload();info('操作已记录。');}catch(error){f.querySelector('[role=alert]').textContent=error.message;b.disabled=false;}});
 }
 panel.addEventListener('change',e=>{if(e.target.name==='scope_type')updateScope(e.target.closest('.scope-picker'));if(e.target.matches('#course-access [name=course_id]'))loadCourseAccess();});
 panel.addEventListener('input',e=>{if(e.target.id==='order-filter'){const term=e.target.value.trim().toLowerCase();panel.querySelector('#commerce-orders').innerHTML=orderTable(data.orders.filter(o=>[mail(o.user_id),o.id,o.product_name,o.status,statuses[o.status]].join(' ').toLowerCase().includes(term)));}});
 panel.addEventListener('click',async e=>{
   const t=e.target.closest('[data-commerce-tab]');if(t){tab=t.dataset.commerceTab;render();return;}
   const b=e.target.closest('[data-commerce-action]');if(!b)return;const action=b.dataset.commerceAction;
   if(action==='edit-product'){editing=data.products.find(p=>p.id===b.dataset.id);render();return;}
   if(action==='new-product'){editing=null;render();return;}
   if(action.startsWith('order-')){
     const type=action.slice(6);dialog(type==='confirm'?'核实收款并发放购买权限':type==='refund'?'记录已核实全额退款':'关闭待支付订单',
       '<p class="notice">'+(type==='confirm'?'仅在后台确认实际已收款后记录。此操作不发起支付，会为本订单建立一项购买授权。':type==='refund'?'请先核实实际全额退款；此操作只记录退款并撤销该订单对应授权，不影响其他有效授权。':'关闭后不发放授权。')+'</p>'+
       (type==='confirm'?'<label>唯一收款凭证编号<input name="reference" minlength="3" maxlength="160" required></label>':'')+'<label>核实记录或原因<textarea name="note" minlength="3" maxlength="1000" required></textarea></label>',
       f=>api('order_'+type,{order_id:b.dataset.id,note:f.note.value,...(type==='confirm'?{reference:f.reference.value}:{})}));return;
   }
   if(action==='grant-extend')dialog('延期内部免费授权','<label>新的到期时间<input name="expires_at" type="datetime-local"></label><p>留空将改为永久授权；不能缩短期限。</p><label>操作备注<textarea name="note" maxlength="1000"></textarea></label>',f=>api('grant_extend',{entitlement_id:b.dataset.id,expires_at:f.expires_at.value?new Date(f.expires_at.value).toISOString():null,note:f.note.value}));
   if(action==='grant-revoke')dialog('撤销此项内部授权','<p>只撤销这一项授权，其他购买或免费授权继续有效。</p><label>撤销备注<textarea name="note" maxlength="1000"></textarea></label>',f=>api('grant_revoke',{entitlement_id:b.dataset.id,note:f.note.value}));
 });
 panel.addEventListener('submit',async e=>{
   const f=e.target;if(!['product-settings','grant-lookup','internal-grant','course-access','email-readiness'].includes(f.id))return;e.preventDefault();const b=f.querySelector('button');b.disabled=true;
   try{
     if(f.id==='grant-lookup'){selected=await api('user_lookup',{email:f.email.value.trim()});render();return;}
     if(f.id==='product-settings'){
       const price=f.price.value.trim();await api('product_save',{id:editing?.id||null,expected_revision:editing?.revision||0,name:f.querySelector('[name=name]').value,description:f.description.value,scope:readScope(f),price_minor:price===''?null:Math.round(Number(price)*100),currency:f.currency.value,validity_days:f.validity_days.value===''?null:Number(f.validity_days.value),active:f.active.checked});editing=null;
     }
     if(f.id==='internal-grant')await api('grant_create',{user_id:selected.profile.id,request_key:crypto.randomUUID(),scope:readScope(f),expires_at:f.expires_at.value?new Date(f.expires_at.value).toISOString():null,note:f.note.value});
     if(f.id==='course-access')await api('course_access_save',{course_id:Number(f.course_id.value),mode:f.mode.value,preview_sections:[...f.querySelectorAll('[name=preview]:checked')].map(n=>n.value)});
     if(f.id==='email-readiness')await api('email_delivery_update',{ready:f.ready.checked});
     await reload();info('设置已保存，操作记录已保留。');
   }catch(error){info(error.message);b.disabled=false;}
 });
 try{await reload();}catch(error){panel.innerHTML='<p class="auth-error" role="alert">'+esc(error.message)+'</p>';}
}
