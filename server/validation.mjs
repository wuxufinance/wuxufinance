export const calculators=['purchasing','credit','compound','fx','inflation','balance','liquidity','portfolio','valuation','bond'];
const plain=(value,label,max=400)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[<>]/.test(value))throw new Error(label+'需要有效纯文本');return value.trim();};
const text=(value,max=10000)=>typeof value==='string'?value.slice(0,max):'';
const htmlEscape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeBody(value){
  if(typeof value!=='string'||!value.trim()||value.length>60000)throw new Error('正文为空或过长');
  const allowed=/^(<\/?(?:p|strong|em|ul|ol|li)>|<br\s*\/?>)$/i;
  return value.split(/(<[^>]*>)/g).map(part=>allowed.test(part)?part.toLowerCase():htmlEscape(part)).join('');
}
export function validateCourse(input){
  if(!input||!Number.isInteger(input.id)||input.id<1||input.id>100000)throw new Error('课程编号无效');
  const c={id:input.id,title:plain(input.title,'标题',120),subtitle:plain(input.subtitle,'副标题',160),category:plain(input.category,'分类',80),description:plain(input.description,'简介',1200),minutes:input.minutes,calculator:input.calculator};
  if(!Number.isInteger(c.minutes)||c.minutes<1||c.minutes>1440||!calculators.includes(c.calculator))throw new Error('学习时长或计算器类型无效');
  if(!Array.isArray(input.keywords)||input.keywords.length>12)throw new Error('课程关键词无效');
  c.keywords=input.keywords.map(x=>plain(x,'关键词',40));
  if(!Array.isArray(input.sections)||input.sections.length<4||input.sections.length>80)throw new Error('每讲需要 4 至 80 个知识单元');
  c.sections=input.sections.map(s=>{if(!/^[a-z][a-z0-9-]{0,60}$/.test(s.id))throw new Error('知识单元编号无效');return {id:s.id,title:plain(s.title,'单元标题',200),body:safeBody(s.body),formula:text(s.formula,1200),meaning:text(s.meaning,1500)};});
  if(new Set(c.sections.map(s=>s.id)).size!==c.sections.length)throw new Error('知识单元编号重复');
  if(!Array.isArray(input.cases)||input.cases.length<1||input.cases.length>40)throw new Error('请至少添加一个生活案例');
  c.cases=input.cases.map(k=>({title:plain(k.title,'案例标题',200),body:safeBody(k.body),takeaway:plain(k.takeaway,'案例启示',1000)}));
  if(!Array.isArray(input.quiz)||input.quiz.length<3||input.quiz.length>100)throw new Error('每讲需要 3 至 100 道测试题');
  c.quiz=input.quiz.map(q=>{if(!/^[a-z][a-z0-9-]{0,60}$/.test(q.id)||!Array.isArray(q.options)||q.options.length<2||q.options.length>3||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length||!c.sections.some(s=>s.id===q.section))throw new Error('题目编号、答案或关联单元无效');return {id:q.id,q:plain(q.q,'题干',1200),options:q.options.map(o=>plain(o,'选项',1000)),correct:q.correct,explain:plain(q.explain,'解析',4000),section:q.section};});
  if(new Set(c.quiz.map(q=>q.id)).size!==c.quiz.length)throw new Error('题目编号重复');
  return c;
}
export function sanitizeState(raw,courses){
  if(!raw||raw.version!==1||typeof raw.courses!=='object'||!raw.courses)throw new Error('学习记录格式无效');
  const state={version:1,courses:{},bookmarks:[],reviews:[],notes:{},last:courses.some(c=>c.id===raw.last)?raw.last:courses.at(-1)?.id||1};
  const keys=new Set();
  for(const c of courses){
    const r=raw.courses[c.id]||{},answers={};
    for(const q of c.quiz){const a=r.answers?.[q.id];if(Number.isInteger(a)&&a>=0&&a<q.options.length)answers[q.id]=a;}
    state.courses[c.id]={read:[...new Set(Array.isArray(r.read)?r.read.filter(id=>c.sections.some(s=>s.id===id)):[])],answers,submitted:r.submitted===true,score:0,best:0,attempts:0,courseRevision:c.revision};
    state.notes[c.id]=text(raw.notes?.[c.id],50000);
    keys.add(c.id+':all');for(const s of c.sections)keys.add(c.id+':'+s.id);
  }
  for(const name of ['bookmarks','reviews'])state[name]=[...new Set(Array.isArray(raw[name])?raw[name].filter(k=>keys.has(k)):[])];
  return state;
}
export function mergeState(base,local,remote){
  const copy=structuredClone(remote),mergeSet=(a=[],b=[],c=[])=>{const result=new Set(c);for(const x of a)if(!b.includes(x))result.delete(x);for(const x of b)if(!a.includes(x))result.add(x);return [...result];};
  for(const key of ['bookmarks','reviews'])copy[key]=mergeSet(base[key],local[key],remote[key]);
  copy.courses||={};copy.notes||={};
  for(const [id,r] of Object.entries(local.courses||{})){
    const b=base.courses?.[id]||{},other=copy.courses[id]||{};
    copy.courses[id]={...other,read:mergeSet(b.read,r.read,other.read)};
    if(JSON.stringify(r.answers)!==JSON.stringify(b.answers))copy.courses[id].answers=r.answers;
    if(r.submitted===false&&b.submitted!==false)copy.courses[id].submitted=false;
  }
  for(const [id,note] of Object.entries(local.notes||{}))if(note!==base.notes?.[id])copy.notes[id]=note;
  copy.last=local.last;return copy;
}
