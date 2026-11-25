// Private DOM exports and reviewed answers are explicit inputs, never bundled assets.
import {readFile,writeFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {normalizeBody,contentIssues} from '../dist/course-content.js';
import {sanitizeFigure} from '../dist/source-figures.js';
import {validateCourse,safeBody} from '../server/validation.mjs';
const [input,reviewed,output]=process.argv.slice(2);if(!output)throw Error('Provide private source, reviewed configuration and output paths.');
const sources=JSON.parse(await readFile(input)),config=JSON.parse(await readFile(reviewed));
const {document}=parseHTML('<html><body></body></html>');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=html=>{const e=document.createElement('div');e.innerHTML=html;return e.textContent.trim();};
const inline=new Set(['STRONG','EM','SPAN','BR']);
function serialize(n){if(n.nodeType===3)return esc(n.textContent);if(n.nodeType!==1)return '';const tag=n.tagName,inner=()=>[...n.childNodes].map(serialize).join('');
 if(inline.has(tag))return tag==='SPAN'?inner():tag==='BR'?'<br>':'<'+tag.toLowerCase()+'>'+inner()+'</'+tag.toLowerCase()+'>';
 if(/^H[1-6]$/.test(tag))return '<p><strong>'+inner()+'</strong></p>';
 if(['P','TABLE','THEAD','TBODY','TR','TD','TH','UL','OL','LI'].includes(tag))return '<'+tag.toLowerCase()+'>'+inner()+'</'+tag.toLowerCase()+'>';
 let result='',pending='';const flush=()=>{if(pending.trim())result+='<p>'+pending+'</p>';pending='';};for(const child of n.childNodes){if(child.nodeType===3||inline.has(child.tagName))pending+=serialize(child);else{flush();result+=serialize(child);}}flush();return result;
}
function normalize(html){const root=document.createElement('div');root.innerHTML=html;let s=serialize(root);root.innerHTML=s;
 for(const p of [...root.querySelectorAll('p')]){const text=p.textContent.trim();if(!text||text==='on'||/^Generating /.test(text)||/^原课交互组件：/.test(text))p.remove();if(text.startsWith('公式：'))p.textContent=text.replace(/\s*\n\s*/g,' ');}
 for(const table of root.querySelectorAll('table')){const rows=[...table.querySelectorAll('tr')],width=Math.max(0,...rows.map(r=>r.children.length));for(const row of rows)while(row.children.length<width)row.append(document.createElement('td'));}
 return safeBody(normalizeBody(root.innerHTML,document));
}
function originalQuestions(source){if(source.exam)return source.exam.map(text=>{const a=text.split('\n');const start=a.findIndex(s=>/^A\. /.test(s));if(start<0)throw Error('Missing exam options');return {q:a[start-1],options:a.slice(start,start+4).map(s=>s.replace(/^[A-D]\.\s*/,''))};});
 const qs=[...source.text.matchAll(/(?:^|\n)(\d+)\.\s*([^\n]+)\n+\s*A\.\s*([^\n]+)\n+B\.\s*([^\n]+)\n+C\.\s*([^\n]+)\n+D\.\s*([^\n]+)/g)];return qs.map(m=>({q:m[2].trim(),options:m.slice(3,7).map(s=>s.trim())}));}
const courses=[],report=[];
for(const c of config){const source=sources.find(s=>s.key===c.sourceKey);if(!source)throw Error('Missing original source '+c.id);let html=source.html;
 for(const [before,after] of c.replacements||[]){if(!html.includes(before))throw Error('Reviewed correction missing in '+c.id+': '+before.slice(0,80));html=html.split(before).join(after);}
 const root=document.createElement('div');root.innerHTML=html;const headings=[...root.querySelectorAll('h1,h2,h3')],toolHeads=headings.filter(h=>/互动计算器[①-⑳]/.test(h.textContent));if(toolHeads.length!==c.tools.length)throw Error('Original calculator count mismatch '+c.id);
 for(let i=0;i<toolHeads.length;i++){const h=toolHeads[i],p=document.createElement('p');p.textContent='互动工具：'+c.tools[i];h.after(p);if(!source.frames){const note=document.createElement('p');note.textContent='以下保留原课默认参数与结果，供静态对照；请以上方计算器的当前输入和输出为准。';p.after(note);}}
 for(const p of [...root.querySelectorAll('p')]){const m=p.textContent.trim().match(/^原课图示 (\d+)$/);if(m){const figure=source.figures[+m[1]-1];if(!figure)throw Error('Missing diagram source');const next=p.nextElementSibling;if(next?.tagName==='TABLE'&&next.textContent.includes('原图位置'))next.remove();p.textContent='图示源码：'+JSON.stringify({svg:sanitizeFigure(figure.svg,document,'import-'+c.id+'-'+m[1])});}}
 if(source.frames){for(const frame of source.frames){const marker=[...root.querySelectorAll('p')].find(p=>p.textContent==='原课交互组件：'+frame.title);if(!marker)throw Error('Missing original frame '+frame.title);if(c.frameTools?.[frame.title])marker.textContent='互动工具：'+c.frameTools[frame.title];else if(frame.title.includes('考试'))marker.textContent='本讲40道综合原题与答案解析已收录在「随堂测试」，可提交评分并保存练习进度。';else if(source.frames.indexOf(frame)>=c.tools.length)marker.remove();}
   // Numbered tools already have markers at their headings; embed their original snapshots.
   for(let i=0;i<Math.min(c.tools.length,source.frames.length);i++){const frame=source.frames[i],p=[...root.querySelectorAll('p')].find(p=>p.textContent==='原课交互组件：'+frame.title);if(p){p.textContent='以下保留原课默认参数与结果，供静态对照；上方计算器可调整参数。';const snapshot=document.createElement('div');snapshot.innerHTML=frame.text.split('\n').filter(s=>s.trim()).map(s=>'<p>'+esc(s)+'</p>').join('');p.after(snapshot);}}
 }
 html=root.innerHTML;
 const heads=[...html.matchAll(/<h([123])>([\s\S]*?)<\/h\1>/g)].map(m=>({start:m.index,end:m.index+m[0].length,title:plain(m[2]),level:+m[1]}));
 const pivots=heads.filter(h=>/^第[一二三四五六七八九十百]+章[：:]/.test(h.title));if(pivots.length!==c.chapters)throw Error('Original chapter count mismatch '+c.id+': '+pivots.length);
 const sections=[];for(let i=0;i<pivots.length;i++){const h=pivots[i];let segment=html.slice(h.end,pivots[i+1]?.start??html.length);const cuts=[...segment.matchAll(/<h[123]>([\s\S]*?)<\/h[123]>/g)].filter(m=>/下一讲|后续进阶|本讲教学说明|第三十[六七八九]讲综合(?:考试|测试)|九十九、第三十六讲综合测试/.test(plain(m[1])));if(cuts.length)segment=segment.slice(0,cuts[0].index);
  let body=/综合考试/.test(h.title)?'<p>本讲原课测试题已收录在「随堂测试」，完成全部题目后可提交评分并查看解析。</p>':normalize(segment);if(!plain(body))body='<p>请结合本讲「随堂测试」与学习进度复习本章内容。</p>';
  const r=document.createElement('div');r.innerHTML=body;const formulas=[...new Set([...r.querySelectorAll('p')].map(p=>p.textContent).filter(t=>t.startsWith('公式：')).map(t=>t.slice(3)))];let chosen=[];for(const f of formulas){if(chosen.length<4&&[...chosen,f].join('\n').length<=1200)chosen.push(f);}sections.push({id:'unit-'+String(i+1).padStart(2,'0'),title:h.title.replace(/^第.+?章[：:]\s*/,''),body,formula:chosen.join('\n'),meaning:chosen.length?'请区分模型假设、币种、期间、税前税后与年化口径；公式不代表收益保证。':''});}
 const questions=originalQuestions(source);if(questions.length!==c.answers.length||questions.length!==c.questionCount)throw Error('Original question count mismatch '+c.id+': '+questions.length);
 const segmenter=new Intl.Segmenter('zh-CN',{granularity:'word'});const quiz=questions.map((q,i)=>{const [correct,explain]=c.answers[i];const tokens=[...new Set([...segmenter.segment(q.q+' '+q.options[correct])].filter(x=>x.isWordLike&&x.segment.length>=2).map(x=>x.segment))];const related=sections.map(s=>({s,score:tokens.reduce((a,t)=>a+(s.title.includes(t)?10*t.length:plain(s.body).includes(t)?t.length:0),0)})).sort((a,b)=>b.score-a.score)[0].s;return {id:'q'+String(i+1).padStart(2,'0'),...q,correct,explain,section:related.id};});
 const cases=[];for(const keyword of c.caseKeywords){const h=heads.find(x=>x.title.includes(keyword));if(!h)throw Error('Missing original case '+c.id+': '+keyword);const next=heads.find(x=>x.start>h.start&&x.level<=h.level);const body=normalize(html.slice(h.end,next?.start??html.length));if(body.length>59000)throw Error('Case too long, choose narrower original subsection');cases.push({title:h.title.replace(/^[一二三四五六七八九十百零]+、/,''),body,takeaway:'先核对现金流、权利义务与统计口径，再改变关键假设，检查结论与风险是否随之变化。'});}
 const payload=validateCourse({id:c.id,title:c.title,subtitle:c.subtitle,category:c.category,description:c.description,minutes:c.minutes,keywords:c.keywords,calculator:c.calculator,sections,cases,quiz});if(contentIssues(payload).length)throw Error(contentIssues(payload).join('\n'));courses.push(payload);report.push({id:c.id,chapters:sections.length,cases:cases.length,questions:quiz.length,numberedTools:c.tools.length,diagrams:source.figures.length});
}
await writeFile(output,JSON.stringify(courses));console.log(JSON.stringify(report,null,2));
