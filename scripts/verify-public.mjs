import {readdir,readFile} from 'node:fs/promises';
const expected=new Set(['.nojekyll','index.html','admin.html','app.js','admin.js','platform.js','bootstrap.js','state-merge.js','courses.js','config.js','math.js','topic-labs.js','styles.css','platform.css','favicon.svg','course-content.js','inline-labs.js','vendor']);
for(const name of await readdir(new URL('../dist/',import.meta.url))){
  if(!expected.has(name))throw Error('Unexpected public file: '+name);
  if(name==='vendor'){const entries=await readdir(new URL('../dist/vendor/',import.meta.url));if(entries.sort().join(',')!=='katex-LICENSE.txt,katex.mjs')throw Error('Unexpected vendor files');continue;}
  const source=await readFile(new URL('../dist/'+name,import.meta.url),'utf8');
  if(/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|BEGIN (RSA |EC )?PRIVATE KEY/.test(source))throw Error('Private credential reference in public client: '+name);
}
const loader=await readFile(new URL('../dist/courses.js',import.meta.url),'utf8');
if(!loader.includes('export const courses=[];')||loader.includes('COURSE_INSERTION_POINT'))throw Error('The public course loader must not embed private course content.');
console.log('Passed: public file allowlist, no private keys, and no bundled curriculum.');
