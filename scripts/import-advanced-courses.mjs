// Transform private, DOM-exported lesson sources. All teaching text stays outside git.
import {readFile,writeFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {normalizeBody,contentIssues} from '../dist/course-content.js';
import {safeBody,validateCourse} from '../server/validation.mjs';
const [input,configPath,output]=process.argv.slice(2);if(!output)throw Error('Provide private source, reviewed configuration, and output paths.');
const sources=JSON.parse(await readFile(input,'utf8')),config=JSON.parse(await readFile(configPath,'utf8'));
const {document}=parseHTML('<html><body></body></html>');const report=[];
const plain=s=>{const root=document.createElement('div');root.innerHTML=s;return root.textContent.trim();};
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function bodyHTML(source){let s=source.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g,'<p><strong>$2</strong></p>');s=normalizeBody(s,document);const root=document.createElement('div');root.innerHTML=s;
  for(const p of root.querySelectorAll('p'))if(!p.textContent.trim())p.remove();
  for(const table of root.querySelectorAll('table')){const rows=[...table.querySelectorAll('tr')],width=Math.max(...rows.map(r=>r.children.length));for(const row of rows)while(row.children.length<width){const td=document.createElement('td');if(row.textContent.includes('所有者权益'))row.prepend(td);else row.append(td);}}
  return safeBody(normalizeBody(root.innerHTML,document));
}
const courses=[];
for(const settings of config){const source=sources.find(s=>s.key===settings.sourceKey);if(!source)throw Error('Missing source: '+settings.id);let html=source.html;
  for(const [before,after] of settings.replacements||[]){if(!html.includes(before))throw Error('Missing reviewed replacement '+before);html=html.split(before).join(after);}
  // Insert live tools alongside the original parameter/result snapshots.
  let toolIndex=0;html=html.replace(/(<(?:h[123]|p)>(?:<strong>)*(互动计算器[①-⑳][^<]+)(?:<\/strong>)*<\/(?:h[123]|p)>)/g,(all)=>{const key=settings.tools[toolIndex++];if(!key)throw Error('Unmapped original tool '+settings.id);return all+'<p>互动工具：'+key+'</p><p>以下保留原课默认参数与结果，作为静态对照；上方工具可调整参数。</p>';});
  // Course 32 numbers its calculator titles as ordinary h2 subsections.
  if(settings.id===32){toolIndex=0;html=html.replace(/(<h2>(?:<strong>)*[^<]*、互动计算器[①-⑳][^<]*(?:<\/strong>)*<\/h2>)/g,all=>all+'<p>互动工具：'+settings.tools[toolIndex++]+'</p><p>以下为原课默认参数与结果，供静态对照。</p>');}
  if(toolIndex!==settings.tools.length)throw Error('Tool count mismatch '+settings.id+': '+toolIndex);
  const heads=[...html.matchAll(/<h([123])>([\s\S]*?)<\/h\1>/g)].map(m=>({start:m.index,end:m.index+m[0].length,title:plain(m[2]),level:+m[1]}));
  const pivots=heads.filter(h=>/^第[一二三四五六七八九十百]+(?:部分|章)[：:]/.test(h.title));const sections=[];
  for(let i=0;i<pivots.length;i++){const h=pivots[i];if(/测试|测验|考试|掌握|自我检查|知识清单/.test(h.title))continue;let segment=html.slice(h.end,pivots[i+1]?.start??html.length);const preview=segment.indexOf('<h1><strong>下一讲');if(preview>=0)segment=segment.slice(0,preview);if(!plain(segment))continue;
    const body=bodyHTML(segment),root=document.createElement('div');root.innerHTML=body;const formulas=[...root.querySelectorAll('p')].map(p=>p.textContent.trim()).filter(t=>t.startsWith('公式：')).map(t=>t.slice(3).replace(/\n/g,' '));const chosen=[];for(const formula of [...new Set(formulas)]){if(chosen.length===4)break;if([...chosen,formula].join('\n').length<=1200)chosen.push(formula);}sections.push({id:'unit-'+String(sections.length+1).padStart(2,'0'),title:h.title.replace(/^第.+?(?:部分|章)[：:]\s*/,''),body,formula:chosen.join('\n'),meaning:chosen.length?'请结合本单元的变量、币种、时间口径和模型假设阅读；年化、百分点与基点须区分。':''});}
  const root=document.createElement('div');root.innerHTML=html;const ps=[...root.querySelectorAll('p')].map(p=>p.textContent.trim());const quiz=[];
  for(let i=0;i<ps.length;i++)if(/^\d+\.\s/.test(ps[i])&&/^A\./.test(ps[i+1]||'')){
    const index=quiz.length,options=ps.slice(i+1,i+5).map(s=>s.replace(/^[A-D]\.\s*/,''));if(options.length!==4||!/^D\./.test(ps[i+4]))throw Error('Invalid original quiz options');const q=ps[i].replace(/^\d+\.\s*/,''),review=settings.answers[index];if(!review)throw Error('Missing reviewed answer');
    const segmenter=new Intl.Segmenter('zh-CN',{granularity:'word'});const tokens=[...new Set([...segmenter.segment(q+' '+options[review[0]])].filter(x=>x.isWordLike&&x.segment.length>=2).map(x=>x.segment))];const related=sections.map(s=>({s,score:tokens.reduce((score,t)=>score+(s.title.includes(t)?6*t.length:plain(s.body).includes(t)?t.length:0),0)})).sort((a,b)=>b.score-a.score)[0].s;
    quiz.push({id:'q'+String(index+1).padStart(2,'0'),q,options,correct:review[0],explain:review[1],section:related.id});}
  if(quiz.length!==30||settings.answers.length!==30)throw Error('Original quiz must contain 30 reviewed questions: '+settings.id);
  const cases=[];for(const keyword of settings.caseKeywords){const h=heads.find(h=>h.title.includes(keyword));if(!h)throw Error('Missing original case '+keyword);const next=heads.find(x=>x.start>h.start&&x.level<=h.level);const body=bodyHTML(html.slice(h.end,next?.start??html.length));if(body.length<40)continue;cases.push({title:h.title.replace(/^[一二三四五六七八九十百]+、/,''),body,takeaway:'先明确现金流、统计口径与约束，再改变关键假设，检查案例结论是否仍然成立。'});}
  const course={id:settings.id,title:settings.title,subtitle:settings.subtitle,category:settings.category,description:settings.description,minutes:settings.minutes,keywords:settings.keywords,calculator:settings.calculator,sections,cases,quiz};
  const issues=contentIssues(course);if(issues.length)throw Error(JSON.stringify(issues));const validated=validateCourse(course);courses.push(validated);report.push({id:course.id,sections:sections.length,cases:cases.length,questions:quiz.length,tools:toolIndex,characters:sections.reduce((sum,s)=>sum+plain(s.body).length,0)});
}
await writeFile(output,JSON.stringify(courses));console.log(JSON.stringify(report,null,2));
