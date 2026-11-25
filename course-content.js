import {activityHTML,parseActivity,mountActivities} from './course-activities.js?v=20261125-seo01';
import katex from './vendor/katex.mjs';
import {inlineLabs,legacyLabNames,runInlineLab} from './inline-labs.js?v=20261125-seo01';
import {renderSourceFigure} from './source-figures.js?v=20261125-seo01';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formulaOptions={output:'mathml',displayMode:true,throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:30};
const decodeMath=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#39|#34);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#34;':'"'}[m]));
export function mathHTML(source){return katex.renderToString(decodeMath(source).trim().replace(/^公式[：:]\s*/,''),formulaOptions);}
export function renderFormulaLines(source){return String(source).split(/\n/).filter(x=>x.trim()).map(line=>{try{return '<div class="readable-formula">'+mathHTML(line)+'</div>';}catch{return '<div class="formula-fallback">'+esc(line)+'</div>';}}).join('');}
function importedParagraphs(value){
  const chunks=[];let pending='';
  const complete=s=>{const braces=(s.match(/(?<!\\)\{/g)||[]).length-(s.match(/(?<!\\)\}/g)||[]).length,env=(s.match(/\\begin\{/g)||[]).length-(s.match(/\\end\{/g)||[]).length,delimiters=(s.match(/\\left\b/g)||[]).length-(s.match(/\\right\b/g)||[]).length;if(!(braces===0&&env===0&&delimiters===0&&!/[+\-=]$/.test(s.trim())))return false;try{mathHTML(s);return true;}catch{return false;}};
  for(const line of value.split(/\n/)){const t=line.trim();if(!t)continue;if(pending){pending+=' '+t;if(complete(pending)){chunks.push(pending);pending='';}}else if(chunks.at(-1)?.startsWith('公式：')&&(/^[+\-=\\{]/.test(t)||(/\\[a-zA-Z]+/.test(t)&&!/[\u3400-\u9fff]/.test(t)))){const joined=chunks.pop()+' '+t;if(complete(joined))chunks.push(joined);else pending=joined;}else if(t.startsWith('公式：')&&!complete(t))pending=t;else chunks.push(t);}
  if(pending)chunks.push(pending);return chunks.flatMap(s=>s.split(/(?=公式[：:])/).filter(x=>x.trim()).map(x=>x.trim()));
}
// Migration is lossless for text and formula source. Do not infer missing chart values.
export function normalizeBody(source,document){
  const root=document.createElement('div');root.innerHTML=source;
  // Entity decoding may create adjacent text nodes; merge before paragraph conversion.
  for(const node of [...root.childNodes])if(node.nodeType===3&&node.parentNode){while(node.nextSibling?.nodeType===3){node.textContent+=node.nextSibling.textContent;node.nextSibling.remove();}}
  for(const list of [...root.querySelectorAll('ul')]){
    const rows=[...list.children];if(!rows.length||!rows.every(li=>li.tagName==='LI'&&li.innerHTML.includes('｜')))continue;
    const cells=rows.map(li=>li.innerHTML.split(/\s*｜\s*/).map(cell=>cell.replace(/^\s*<p>|<\/p>\s*$/g,'').trim()));
    if(cells.some(row=>row.length!==cells[0].length)||cells[0].length<2)continue;
    const table=document.createElement('table');table.innerHTML='<thead><tr>'+cells[0].map(cell=>'<th>'+cell+'</th>').join('')+'</tr></thead><tbody>'+cells.slice(1).map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody>';list.replaceWith(table);
  }
  // Former chart/control labels were bare text between block elements.
  for(const node of [...root.childNodes])if(node.nodeType===3){
    const value=node.textContent.trim();if(!value){node.remove();continue;}
    const parts=importedParagraphs(value),fragment=document.createDocumentFragment();
    for(let part of parts){const p=document.createElement('p');if(part.includes('Generating ')){const at=part.indexOf('Generating '),name=part.slice(at+11).trim(),key=legacyLabNames[name];if(key){if(at>0){const note=document.createElement('p');note.textContent=part.slice(0,at).trim();fragment.append(note);}part='互动工具：'+key;}}p.textContent=part;fragment.append(p);}node.replaceWith(fragment);
  }
  // Merge short chart labels with an immediately following numerical value.
  const numeric=/^[−–+\-]?[\d,.]+\s*(?:%|％|万|万元|亿元|元|倍|万股|股|年|天|bp|基点|个百分点|x)?$/;
  for(const node of [...root.children]){
    if(node.tagName!=='P'||!node.isConnected&&!node.parentNode)continue;
    const next=node.nextElementSibling;let label=node.textContent.trim();if(next?.tagName==='P'&&numeric.test(next.textContent.trim())&&/[。！？]/.test(label)){const cut=Math.max(label.lastIndexOf('。'),label.lastIndexOf('！'),label.lastIndexOf('？'));if(label.length-cut>1&&label.length-cut<30){const note=document.createElement('p');note.textContent=label.slice(0,cut+1);node.before(note);label=label.slice(cut+1);node.textContent=label;}}
    if(next?.tagName==='P'&&label.length>0&&label.length<=55&&!/[。！？：:]|公式|互动工具/.test(label)&&!numeric.test(label)&&numeric.test(next.textContent.trim())){const strong=document.createElement('strong');strong.textContent=label+'：';node.replaceChildren(strong,document.createTextNode(next.textContent.trim()));next.remove();}
  }
  // Remove duplicated snapshot notices without changing explanatory content.
  const notice='以下为原课示例快照；实时计算请使用本讲「互动实验」。';
  for(const p of root.querySelectorAll('p'))if(/^互动工具：[a-z]+$/.test(p.textContent)&&p.previousElementSibling?.textContent===notice)p.previousElementSibling.textContent='调整下面的参数，观察计算结果如何变化。';
  for(const p of [...root.querySelectorAll('p')])if(p.textContent===notice&&p.nextElementSibling?.textContent.startsWith('案例演示：')&&p.nextElementSibling.nextElementSibling?.textContent===notice)p.remove();
  return root.innerHTML.replace(/'/g,'&#39;');
}
function labHTML(key){const lab=inlineLabs[key];if(!lab)return '';return `<section class="inline-lab" data-inline-lab="${key}"><h4>${esc(lab.title)}</h4><form class="inline-lab-form"><div class="field-grid">${lab.fields.map(f=>`<label class="input-field"><span>${esc(f.label)}${f.unit?'（'+esc(f.unit)+'）':''}</span>${f.options?`<select name="${f.key}">${f.options.map(([v,l])=>`<option value="${v}" ${v===f.value?'selected':''}>${esc(l)}</option>`).join('')}</select>`:`<input type="number" name="${f.key}" value="${f.value}" min="${f.min}" max="${f.max}" step="any" required>`}</label>`).join('')}</div><button class="button secondary compact" type="reset">恢复示例参数</button></form><div class="inline-lab-result" aria-live="polite"></div><p class="small">${esc(lab.note)}</p></section>`;}
export function renderBody(source,document=globalThis.document){
  const root=document.createElement('div');root.innerHTML=normalizeBody(source,document);
  for(const table of [...root.querySelectorAll('table')]){const wrap=document.createElement('div');wrap.className='table-scroll course-table';table.replaceWith(wrap);wrap.append(table);}
  for(const p of [...root.querySelectorAll('p')]){
    const text=p.textContent.trim();const marker=text.match(/^互动工具：([a-z]+)$/);
    if(text.startsWith('课程练习：')){try{p.outerHTML=activityHTML(text.slice(5));}catch{p.className='activity-fallback';p.textContent='课程练习格式有误，请联系管理员。';}continue;}
    if(text.startsWith('代码示例：')){try{const data=JSON.parse(text.slice(5));if(typeof data.code!=='string')throw Error();p.outerHTML='<pre class="course-code"><code>'+esc(data.code)+'</code></pre>';}catch{p.className='code-fallback';}continue;}
    if(text.startsWith('图示源码：')){try{p.outerHTML=renderSourceFigure(text.slice(5),document,'source-'+[...root.querySelectorAll('.source-figure')].length);}catch{p.className='figure-fallback';p.textContent='图示暂时无法显示，请参考相邻说明及数据表。';}continue;}
    if(marker){p.outerHTML=labHTML(marker[1]);continue;}
    if(text.startsWith('公式：')||text.startsWith('公式:')){try{p.innerHTML='<span class="readable-formula">'+mathHTML(text)+'</span>';}catch{p.innerHTML=renderFormulaLines(text);}}
  }
  // Formulas in converted table cells also need math rendering.
  for(const p of root.querySelectorAll('p'))if(/\\[a-zA-Z]+/.test(p.textContent)&&!p.querySelector('math')&&!p.closest('.inline-lab')){const text=p.textContent;p.innerHTML=esc(text).replace(/公式[：:]\s*([^：。，；]+?)(?=\s+(?:为|是|的|且)|[：。，；]|$)/g,(_,tex)=>{try{return katex.renderToString(tex.trim().replace(/&lt;/g,'<').replace(/&gt;/g,'>'),{...formulaOptions,displayMode:false});}catch{return esc(tex);}});}
  for(const cell of root.querySelectorAll('th,td'))if(!cell.querySelector('math')&&/\\[a-zA-Z]+|^公式[：:]/.test(cell.textContent))cell.innerHTML=renderFormulaLines(cell.textContent);
  return root.innerHTML;
}
export function mountInlineLabs(root,activityStorage){
  mountActivities(root,activityStorage);
  for(const node of root.querySelectorAll('[data-inline-lab]')){if(node.dataset.mounted)continue;node.dataset.mounted='true';const form=node.querySelector('form'),output=node.querySelector('.inline-lab-result');
    const update=()=>{try{const data=Object.fromEntries([...form.querySelectorAll('input[name],select[name]')].filter(x=>x.name).map(x=>[x.name,x.value.trim()===''?NaN:Number(x.value)]));output.innerHTML=runInlineLab(node.dataset.inlineLab,data).map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');const figure=inlineLabs[node.dataset.inlineLab].figure?.(data);if(figure)output.innerHTML+=renderSourceFigure(JSON.stringify({svg:figure}),root.ownerDocument,'lab-'+node.dataset.inlineLab).replace('原课图示（静态）','当前参数计算图示').replace('原课图示。图中参数与数据为教学设定；交互计算请使用本讲计算器。','图示随当前输入更新；参数为教学假设。');const table=inlineLabs[node.dataset.inlineLab].table?.(data);if(table)output.innerHTML+='<div class="table-scroll lab-data-table"><table><thead><tr>'+table.headers.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}catch(error){output.textContent=error.message;}};
    form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',update);form.addEventListener('reset',()=>queueMicrotask(update));update();
  }
}
export function contentIssues(course){
  const issues=[];
  for(const item of [...course.sections,...course.cases]){
    const checkBody=item.body.replace(/<p>图示源码：([\s\S]*?)<\/p>/g,(all,value)=>{try{const decoded=value.replace(/&(?:lt|gt|quot|#39|apos|amp);/g,x=>({'&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&amp;':'&'}[x])),data=JSON.parse(decoded);if(typeof data.svg!=='string'||data.svg.length>180000||!/^<svg\b/.test(data.svg))throw Error();}catch{issues.push(item.title+'：图示数据无效');}return '';});
    for(const m of item.body.matchAll(/<p>课程练习：([^<]+)<\/p>/g))try{parseActivity(decodeMath(m[1]));}catch{issues.push(item.title+'：课程练习格式无效');}
    for(const m of item.body.matchAll(/<p>代码示例：([^<]+)<\/p>/g))try{if(typeof JSON.parse(decodeMath(m[1])).code!=='string')throw Error();}catch{issues.push(item.title+'：代码示例格式无效');}
    if(/<\/p>\s*｜\s*<p>/.test(item.body))issues.push(item.title+'：对比表已拆散，请先恢复表格结构');
    if(/&lt;(?:svg|canvas|iframe|script|input)\b/i.test(checkBody))issues.push(item.title+'：存在未支持的图表或交互代码');
    if(/Generating\s|NaN|undefined/.test(item.body))issues.push(item.title+'：存在未完成占位内容');
    for(const m of item.body.matchAll(/<p>互动工具：([^<\s]+)<\/p>/g))if(!inlineLabs[m[1]])issues.push(item.title+'：未知互动工具');
    const formulas=[...(item.body.matchAll(/<p>公式[：:]\s*([^<]+)<\/p>/g))].map(m=>m[1]);
    if(item.formula)formulas.push(...item.formula.split('\n'));
    for(const formula of formulas)try{mathHTML(formula.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));}catch{issues.push(item.title+'：公式无法排版：'+formula.slice(0,90));}
    for(const table of item.body.matchAll(/<table>([\s\S]*?)<\/table>/g)){const widths=[...table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(row=>(row[1].match(/<(?:th|td)>/g)||[]).length);if(!widths.length||widths.some(n=>n!==widths[0]))issues.push(item.title+'：表格列数不一致');}
  }
  return [...new Set(issues)];
}
