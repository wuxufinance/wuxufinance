// Run only against a private export; never commit the export or normalized payloads.
import {readFile,writeFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {normalizeBody,contentIssues} from '../dist/course-content.js';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Provide private input and output paths.');
const rows=JSON.parse(await readFile(input,'utf8'));const {document}=parseHTML('<html><body></body></html>');
let changed=0,tables=0,tools=0;const issues=[];
for(const row of rows){const before=JSON.stringify(row.payload);for(const item of [...row.payload.sections,...row.payload.cases]){item.body=normalizeBody(item.body,document);tables+=(item.body.match(/<table>/g)||[]).length;tools+=(item.body.match(/互动工具：/g)||[]).length;}if(row.id>=11&&row.id<=29)for(const item of row.payload.sections){const root=document.createElement('div');root.innerHTML=item.body;const formulas=[...root.querySelectorAll('p')].map(p=>p.textContent.trim()).filter(t=>t.startsWith('公式：')).map(t=>t.slice(3).trim().replace(/\n/g,' '));if(formulas.length){const chosen=[];for(const formula of formulas){if(chosen.length===3)break;if([...chosen,formula].join('\n').length<=1200)chosen.push(formula);}item.formula=chosen.join('\n');}}if(JSON.stringify(row.payload)!==before)changed++;issues.push(...contentIssues(row.payload).map(x=>'第'+row.id+'讲 '+x));}
await writeFile(output,JSON.stringify(rows));console.log(JSON.stringify({courses:rows.length,changed,tables,tools,issues},null,2));if(issues.length)process.exitCode=1;
