import {wealthLabs} from './wealth-labs.js?v=20261125-access01';
import {macroLabs} from './macro-labs.js?v=20261125-access01';
import {bondMetrics} from './math.js?v=20261125-access01';
const n=x=>Number(Math.abs(x)<1e-9?0:x).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=x=>n(x*100)+'%';
const field=(label,key,value,min,max,unit,options)=>({label,key,value,min,max,unit,options});
const customized=(lab,values)=>({...lab,fields:lab.fields.map(f=>({...f,value:values[f.key]??f.value}))});
const balance=customized(wealthLabs.wealthbalance,{cash:50000,deposit:100000,etf:150000,bond:0,stock:0,gold:0,private:0,property:1200000,car:50000,pension:50000,mortgage:800000,carloan:30000,card:20000,loan:0,income:30000,necessary:10000,optional:4000,service:5000,months:6,planned:0,extra:0});
export const publicToolModels={
 'bond-price':{title:'债券价格与利率风险计算器',fields:[field('债券面值','face',1000,.01,1e10,'元'),field('年票面利率','coupon',3,0,100,'%'),field('剩余年数','years',5,1,50,'年'),field('年化名义到期收益率','ytm',4,-20,100,'%'),field('每年付息次数','frequency',1,1,2,'次',[[1,'每年一次'],[2,'每半年一次']]),field('收益率冲击','shock',100,-2000,2000,'基点')],run:d=>{if(![1,2].includes(d.frequency))throw Error('付息频率须为每年一次或两次。');const y=d.ytm/100,dy=d.shock/10000,b=bondMetrics(d.face,d.coupon/100,d.years,y,d.frequency),next=bondMetrics(d.face,d.coupon/100,d.years,y+dy,d.frequency);return [['理论债券价格',n(b.price)+' 元'],['相对面值',b.price<d.face?'折价':b.price>d.face?'溢价':'平价'],['修正久期',n(b.modified)+' 年'],['有效年收益率',percent((1+y/d.frequency)**d.frequency-1)],['冲击后重新定价',n(next.price)+' 元'],['精确定价的价格变化',percent(next.price/b.price-1)],['久期一阶近似变化',percent(-b.modified*dy)]];},note:'普通固定票息、到期还本，剩余年数为整数；在付息日刚付息后估值。每期折现率为年化名义收益率除以付息次数。未计应计利息、违约、税费和嵌入期权。大幅冲击下久期近似可能明显失真。'},
 'purchasing-power':customized(wealthLabs.wealthreal,{principal:10000,rate:0,inflation:3,years:10}),
 'household-balance':balance,
 'household-budget':customized(wealthLabs.wealthbudget,{income:30000,needs:50,wants:30}),
 'household-cashflow':customized(wealthLabs.wealthcashflow,{income:30000,necessary:10000,optional:4000,service:5000,principal:3000,annual:24000,invest:7000}),
 'annual-cashflow':customized(wealthLabs.wealthannual,{cash:50000,income:30000,outflow:19000,invest:7000,annual:24000,payment:2}),
 'growth-rates':macroLabs.macrogrowth
};
export function runPublicTool(key,data){const lab=publicToolModels[key];if(!lab)throw Error('计算工具不存在。');for(const f of lab.fields){const v=data[f.key];if(!Number.isFinite(v)||v<f.min||v>f.max)throw Error('请填写范围内的有效数字：'+f.label+'。');if(f.key==='years'&&!Number.isInteger(v))throw Error('年数须为整数。');if(f.options&&!f.options.some(([x])=>x===v))throw Error('请选择有效选项：'+f.label+'。');}const stats=lab.run(data);if(stats.some(([,v])=>/NaN|Infinity/.test(v)))throw Error('当前输入无法计算，请检查分母与范围。');return {stats,table:lab.table?.(data)};}
