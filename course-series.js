export const courseSeries=[
  {id:'foundations',title:'金融经济学基础总课程',total:40,description:'从货币、信用与利率，到全球金融经济学综合实战。'},
  {id:'personal-wealth',title:'专业个人投资者与长期财富管理实战课程',total:30,description:'以个人和家庭为中心，建立可以长期执行的财富管理体系。'}
];
export const seriesOf=c=>courseSeries.find(s=>s.id===c.series)||courseSeries[0];
export const lessonNumber=c=>Number.isInteger(c.lesson)?c.lesson:c.id;
export const courseCaption=c=>seriesOf(c).title+' · 第'+lessonNumber(c)+'讲';
export const seriesGroups=courses=>courseSeries.map(s=>({...s,courses:courses.filter(c=>seriesOf(c).id===s.id).sort((a,b)=>lessonNumber(a)-lessonNumber(b))})).filter(s=>s.courses.length);
