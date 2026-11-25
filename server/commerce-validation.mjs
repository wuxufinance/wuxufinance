const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=(v,label='编号')=>{if(typeof v!=='string'||!uuid.test(v))throw Error(label+'无效。');return v;};
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(label+'无效。');return v;};
const text=(v,min,max,label)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max||/[<>]/.test(v))throw Error(label+'需要有效纯文本。');return v.trim();};
const expiry=v=>{if(v===null)return null;if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('到期时间无效。');return new Date(v).toISOString();};
export const commerceActions=new Set(['my_account','order_create','order_cancel','commerce_dashboard','user_lookup','product_save','course_access_save','grant_create','grant_extend','grant_revoke','order_confirm','order_close','order_refund','email_delivery_update']);
export function validateScope(raw){
 if(!raw||typeof raw!=='object'||!['course','series','bundle','all'].includes(raw.type)||typeof raw.include_future!=='boolean')throw Error('授权范围无效。');
 const course_ids=raw.course_ids??[],series_ids=raw.series_ids??[];
 if(!Array.isArray(course_ids)||course_ids.length>500||!Array.isArray(series_ids)||series_ids.length>20)throw Error('授权范围无效。');
 course_ids.forEach(v=>integer(v,1,100000,'课程编号'));
 if(series_ids.some(v=>!['foundations','personal-wealth','global-macro'].includes(v)))throw Error('课程系列无效。');
 if(raw.type==='course'&&(course_ids.length!==1||series_ids.length||raw.include_future)
   ||raw.type==='series'&&(series_ids.length!==1||course_ids.length)
   ||raw.type==='all'&&(course_ids.length||series_ids.length)
   ||raw.type==='bundle'&&!course_ids.length&&!series_ids.length)throw Error('请明确单讲、系列或课程包的范围。');
 return {type:raw.type,course_ids:[...new Set(course_ids)],series_ids:[...new Set(series_ids)],include_future:raw.include_future};
}
export function validateCommerce(action,b){
 if(['my_account','commerce_dashboard'].includes(action))return {};
 if(action==='user_lookup')return {email:text(b.email,3,250,'邮箱').toLowerCase()};
 if(action==='order_create')return {product_id:id(b.product_id),product_revision:integer(b.product_revision,1,1000000,'商品版本'),request_key:id(b.request_key)};
 if(action==='order_cancel')return {order_id:id(b.order_id)};
 if(action==='product_save'){
   if(typeof b.active!=='boolean'||!['CNY','GBP','USD','EUR'].includes(b.currency))throw Error('商品状态或币种无效。');
   const price=b.price_minor===null?null:integer(b.price_minor,1,100000000,'最小货币单位价格');
   if(b.active&&price===null)throw Error('请先配置正式售价，再开放商品。');
   return {id:b.id==null?null:id(b.id),expected_revision:integer(b.expected_revision,0,1000000,'商品版本'),name:text(b.name,1,160,'商品名称'),
    description:text(b.description??'',0,1200,'商品简介'),scope:validateScope(b.scope),price_minor:price,currency:b.currency,active:b.active,
    validity_days:b.validity_days===null?null:integer(b.validity_days,1,36500,'授权天数')};
 }
 if(action==='course_access_save'){
   if(!['public_free','login_free','paid'].includes(b.mode)||!Array.isArray(b.preview_sections)||b.preview_sections.length>80
     ||b.preview_sections.some(v=>typeof v!=='string'||!/^[a-z][a-z0-9-]{0,60}$/.test(v)))throw Error('课程访问或试听配置无效。');
   return {course_id:integer(b.course_id,1,100000,'课程编号'),mode:b.mode,preview_sections:[...new Set(b.preview_sections)]};
 }
 if(action==='grant_create')return {user_id:id(b.user_id),request_key:id(b.request_key),scope:validateScope(b.scope),expires_at:expiry(b.expires_at),note:text(b.note??'',0,1000,'内部备注')};
 if(action==='grant_extend')return {entitlement_id:id(b.entitlement_id),expires_at:expiry(b.expires_at),note:text(b.note??'',0,1000,'操作备注')};
 if(action==='grant_revoke')return {entitlement_id:id(b.entitlement_id),note:text(b.note??'',0,1000,'操作备注')};
 if(['order_confirm','order_close','order_refund'].includes(action))return {order_id:id(b.order_id),note:text(b.note,3,1000,'核实记录'),
   ...(action==='order_confirm'?{reference:text(b.reference,3,160,'唯一收款凭证编号')}:{})};
 if(action==='email_delivery_update'){if(typeof b.ready!=='boolean')throw Error('邮件配置状态无效。');return {ready:b.ready};}
 throw Error('UNKNOWN_ACTION');
}
