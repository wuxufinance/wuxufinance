export const courseSeries=[
  {id:'foundations',title:'金融经济学基础总课程',total:40,label:'基础总课程',description:'从货币、信用与利率，到全球金融经济学综合实战。'},
  {id:'personal-wealth',title:'专业个人投资者与长期财富管理实战课程',total:30,label:'个人财富管理进阶',description:'以个人和家庭为中心，建立可以长期执行的财富管理体系。'},
  {id:'global-macro',title:'全球宏观投资研究实战课程',total:30,label:'全球宏观研究进阶',description:'建立经济数据库、宏观研究、跨资产分析与投资决策体系。'}
];
export const seriesOf=c=>courseSeries.find(s=>s.id===c.series)||courseSeries[0];
export const lessonNumber=c=>Number.isInteger(c.lesson)?c.lesson:c.id;
export const courseCaption=c=>seriesOf(c).title+' · 第'+lessonNumber(c)+'讲';
export const seriesGroups=courses=>courseSeries.map(s=>({...s,courses:courses.filter(c=>seriesOf(c).id===s.id).sort((a,b)=>lessonNumber(a)-lessonNumber(b))})).filter(s=>s.courses.length);
