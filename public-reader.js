import {renderBody,renderFormulaLines,mountInlineLabs} from './course-content.js?v=20261125-access01';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function publicReaderHTML(course,document){
 const full=course.access?.mode==='public_free'&&course.access.full,
   sections=full?course.sections:course.sections.filter(s=>course.access?.preview_sections.includes(s.id));
 if(!sections.length)return '<h2>本讲阅读方式</h2><p>当前未配置公开正文或试听单元，可从上方登录入口进入完整课程。</p>';
 return '<h2>'+(full?'公开课程全文':'公开试听单元')+'</h2><p class="notice">'+(full?'本讲由管理员设为公开免费。登录后可以同步进度、参加测试并按权限下载资料。':'仅展示管理员选定的试听单元；完整课程、测试及配套资料仍需相应权限。')+'</p>'+sections.map(s=>'<article class="concept-card" id="public-unit-'+esc(s.id)+'"><h3>'+esc(s.title)+'</h3><div class="prose">'+renderBody(s.body,document)+'</div>'+(s.formula?renderFormulaLines(s.formula):'')+(s.meaning?'<p>'+esc(s.meaning)+'</p>':'')+'</article>').join('')+(full?(course.cases||[]).map(c=>'<article class="concept-card"><h3>'+esc(c.title)+'</h3><div class="prose">'+renderBody(c.body,document)+'</div><p>'+esc(c.takeaway)+'</p></article>').join(''):'');
}
export function mountPublicReader(root,course){root.innerHTML=publicReaderHTML(course,root.ownerDocument);mountInlineLabs(root);}
