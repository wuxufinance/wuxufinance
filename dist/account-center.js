import {publicCourseUrl,seriesOf} from './course-series.js?v=20261125-access01';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium'}).format(new Date(v)):'永久有效';
export const money=(n,currency)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency}).format(Number(n)/100);
export const scopeLabel=s=>s.type==='all'?'全站课程':s.type==='series'?'课程系列':s.type==='bundle'?'课程包':'单讲课程';
export const futureLabel=s=>s.include_future?'包含范围内未来新增课程':'仅含授权或订单建立时已发布的范围';
const statusLabel={pending:'待支付',paid:'已支付',cancelled:'已取消',closed:'已关闭',refunded:'已退款'};
export function accountCenterHTML(course){
 return '<div class="page-eyebrow">YOUR LEARNING ACCOUNT<span>课程、授权与订单</span></div><div class="page-heading"><div><h1>'+(course?'查看课程解锁方式':'我的学习中心')+'</h1><p>'+(course?esc(course.title):'查看已购课程、免费授权与学习进度。')+'</p></div><a class="button secondary" href="#/account">我的课程与订单</a></div><div id="account-center" aria-live="polite"><p>正在读取你的课程权限…</p></div>';
}
export function lockedCourseHTML(c,apiUrl){
 const reader=publicCourseUrl(c)+'#public-reading';
 return '<div class="page-eyebrow">COURSE ACCESS<span>课程介绍与权限</span></div><div class="page-heading"><div><h1>'+esc(c.title)+'</h1><p>'+esc(c.description)+'</p></div></div><section class="white-card access-summary"><h2>本课程需要有效授权</h2><p>完整正文、案例、测试及资料由服务器按账号权限提供。课程目录和已配置的试听单元可以先阅读。</p><div class="button-row"><a class="button primary" href="#/purchase/'+c.id+'">查看解锁方式</a><a class="button secondary" href="'+publicCourseUrl(c)+'">公开课程介绍</a>'+(c.access?.preview_sections.length?'<a class="button secondary" href="'+reader+'">阅读试听单元</a>':'')+'</div><p class="muted">当前暂未开放在线付款。没有有效授权时不会下载完整课程。</p></section><section class="white-card"><h2>本讲知识目录</h2><ol>'+c.sections.map(s=>'<li>'+esc(s.title)+(c.access?.preview_sections.includes(s.id)?' <span class="access-badge">可试听</span>':'')+'</li>').join('')+'</ol></section>';
}
const productMatches=(p,c)=>p.scope.type==='all'||p.scope.course_ids.includes(c.id)||p.scope.series_ids.includes(seriesOf(c).id);
export async function mountAccountCenter(root,{api,courses,progress,course}){
 const panel=root.querySelector('#account-center');if(!panel)return;
 let model,catalog;
 const message=t=>{const n=panel.querySelector('.account-feedback');if(n)n.textContent=t;};
 async function load(){
   [model,catalog]=await Promise.all([api('my_account'),api('public_catalog',{},true)]);
   if(!panel.isConnected)return;
   const relevant=course?catalog.products.filter(p=>productMatches(p,course)):catalog.products;
   const orders='<section class="white-card account-section" id="my-orders"><h2>我的订单</h2><p class="muted">订单不会自动开通课程。仅后台核实收款后发放购买授权；当前暂不支持在线付款。</p>'+(model.orders.length?'<div class="table-scroll"><table><thead><tr><th>课程商品</th><th>金额</th><th>状态</th><th>范围与时间</th><th></th></tr></thead><tbody>'+model.orders.map(o=>'<tr><td><b>'+esc(o.product_name)+'</b><small>订单 '+esc(o.id.slice(0,8))+'</small></td><td>'+money(o.price_minor,o.currency)+'</td><td>'+statusLabel[o.status]+'</td><td>'+scopeLabel(o.scope)+'<small>'+futureLabel(o.scope)+'</small><small>'+date(o.created_at)+'</small></td><td>'+(o.status==='pending'?'<button class="button secondary compact" data-account-action="cancel" data-id="'+o.id+'">取消订单</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<p>你还没有订单。</p>')+'</section>';
   const entitlements='<section class="white-card account-section"><h2>已购与免费授权</h2>'+(model.entitlements.length?'<div class="account-cards">'+model.entitlements.map(e=>'<article class="entitlement-card"><span class="access-badge">'+(e.source==='purchase'?'已购':'已授权')+'</span><h3>'+scopeLabel(e.scope)+'</h3><p>'+futureLabel(e.scope)+'</p><p>有效期：'+date(e.expires_at)+'</p><p class="muted">'+(e.revoked_at?'该项授权已撤销':e.currently_valid===false?'该项授权已到期或尚未生效':'该项授权有效')+'</p><p class="small">覆盖 '+e.scope.snapshot_ids.length+' 讲已发布课程</p></article>').join('')+'</div>':'<p>目前没有购买或免费授权记录。登录免费课程仍可正常学习。</p>')+'</section>';
   const available=new Set(model.access.filter(a=>a.full).map(a=>a.course_id));
   const learning='<section class="white-card account-section"><h2>可以继续学习的课程</h2><div class="table-scroll"><table><thead><tr><th>课程</th><th>当前权限</th><th>学习进度</th><th></th></tr></thead><tbody>'+courses.filter(c=>available.has(c.id)).map(c=>{
     const p=progress(c),a=model.access.find(a=>a.course_id===c.id);return '<tr><td><small>'+esc(seriesOf(c).title)+'</small><b>'+esc(c.title)+'</b></td><td>'+(a.mode==='public_free'?'公开免费':a.mode==='login_free'?'登录免费':'已授权')+'</td><td>'+p.pct+'%</td><td><a class="button secondary compact" href="#/course/'+c.id+'/overview">继续学习</a></td></tr>';
   }).join('')+'</tbody></table></div></section>';
   const products='<section class="white-card account-section"><h2>'+(course?'本讲可用的课程商品':'课程商品')+'</h2><p class="notice">暂未开放在线付款。配置正式售价并开售后，可以建立待支付订单；建立订单不会代表收款或开通课程。</p>'+(relevant.length?'<div class="account-cards">'+relevant.map(p=>'<article class="entitlement-card"><h3>'+esc(p.name)+'</h3><p>'+esc(p.description)+'</p><p class="product-price">'+money(p.price_minor,p.currency)+'</p><p>'+scopeLabel(p.scope)+' · '+p.scope.snapshot_ids.length+'讲已发布课程</p><p>'+futureLabel(p.scope)+'</p><p>开通后有效期：'+(p.validity_days?p.validity_days+'天':'永久')+'</p><button class="button primary" data-account-action="order" data-id="'+p.id+'">创建待支付订单</button></article>').join('')+'</div>':'<p>尚未配置可售商品或正式售价，暂未开售。现有免费课程的访问规则没有因此改变。</p>')+'</section>';
   panel.innerHTML='<p class="account-feedback auth-error" role="status"></p>'+(course?products+entitlements+orders:entitlements+learning+orders+products);
 }
 panel.addEventListener('click',async e=>{
   const b=e.target.closest('[data-account-action]');if(!b)return;b.disabled=true;message('');
   try{
     if(b.dataset.accountAction==='cancel')await api('order_cancel',{order_id:b.dataset.id});
     if(b.dataset.accountAction==='order'){
       const product=catalog.products.find(p=>p.id===b.dataset.id);
       await api('order_create',{product_id:product.id,product_revision:product.revision,request_key:crypto.randomUUID()});
     }
     await load();message(b.dataset.accountAction==='order'?'待支付订单已建立。当前没有在线付款功能，课程尚未因此开通。':'订单已取消。');
   }catch(error){message(error.message);b.disabled=false;}
 });
 try{await load();}catch(error){panel.innerHTML='<p class="auth-error" role="alert">'+esc(error.message)+'</p>';}
}
