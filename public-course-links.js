import {mountPublicReader} from './public-reader.js?v=20261125-access01';
import {config} from './config.js?v=20261125-access01';
const block=document.querySelector('[data-public-course]');
if(block){
 try{
   const response=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},cache:'no-store',body:JSON.stringify({action:'public_catalog'})});
   if(response.ok){
     const catalog=await response.json(),course=catalog.courses.find(c=>c.id===Number(block.dataset.publicCourse));
     if(course){
       const status=block.querySelector('[data-access-label]'),entry=block.querySelector('[data-access-entry]');
       status.textContent=course.mode==='public_free'?'本讲为公开免费课程。':course.mode==='paid'?'本讲全文需要有效购买或免费授权。':'本讲保持登录免费。';
       entry.textContent=course.mode==='public_free'?'公开阅读全文':course.mode==='paid'?'查看课程解锁方式':'登录学习本讲';
       entry.href=course.mode==='public_free'?'#public-reading':new URL('./learn/#/'+(course.mode==='paid'?'purchase/':'course/')+course.id+(course.mode==='paid'?'':'/overview'),import.meta.url).href;
       const reader=document.querySelector('#public-reading');
       if(reader&&(course.mode==='public_free'||course.preview_sections.length)){
         const content=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},cache:'no-store',body:JSON.stringify({action:'public_course',course_id:course.id})});
         if(content.ok)mountPublicReader(reader,await content.json());
         else reader.innerHTML='<h2>公开阅读</h2><p>内容暂时无法载入，请稍后刷新。上方的课程介绍和学习入口仍可使用。</p>';
       }
     }
   }
 }catch{/* Original static course links remain available if this optional enhancement fails. */}
}
