// Private curriculum exports must stay outside the public repository.
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {validateCourse} from '../server/validation.mjs';
import {renderBody,normalizeBody} from '../dist/course-content.js';
const path=process.argv[2];if(!path)throw Error('Provide the path to a private curriculum JSON export.');
const rows=JSON.parse(await readFile(path,'utf8'));const {document}=parseHTML('<html><body></body></html>');
let units=0,tables=0,formulas=0,tools=0;const issues=[];
for(const row of rows){const course=row.payload||row;try{validateCourse(course);}catch(error){issues.push('第'+course.id+'讲：'+error.message);}
  for(const unit of [...course.sections,...course.cases]){units++;const root=document.createElement('div');root.innerHTML=renderBody(unit.body,document);tables+=root.querySelectorAll('table').length;formulas+=root.querySelectorAll('math').length;tools+=root.querySelectorAll('[data-inline-lab]').length;
    const add=message=>issues.push('第'+course.id+'讲 '+unit.title+'：'+message);
    if(root.querySelector('.formula-fallback'))add('公式无法排版');
    if([...root.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))add('存在散落文字');
    if(normalizeBody(unit.body,document)!==unit.body)add('尚未完成结构归一化');
    for(const node of root.querySelectorAll('p,td,li'))if(!node.querySelector('math')&&/\\[a-zA-Z]+/.test(node.textContent))add('存在未渲染公式');
  }
}
console.log(JSON.stringify({courses:rows.length,units,tables,formulas,tools,issues},null,2));if(issues.length)process.exitCode=1;
