import assert from 'node:assert/strict';
import {bondMetrics,yieldToMaturity,portfolioMetrics,compound,institutionMetrics,acquisitionMetrics} from '../dist/math.js';
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
for(const m of [1,2]) {
  near(bondMetrics(1000,.04,10,.04,m).price,1000);
  near(yieldToMaturity(1000,.04,10,1000,m),.04);
  near(bondMetrics(1000,0,5,.05,m).macaulay,5);
}
near(bondMetrics(1000,.03,5,.04).price,955.481776689838);
near(bondMetrics(1000,0,5,.05).price,1000/1.05**5);
near(yieldToMaturity(1000,.03,5,950),.04127150399344204);
near(bondMetrics(1000,.03,5,0).price,1150);
near(compound(10000,.05,10),16288.94626777442);
for(const y of [-.02,0,.04,.12]) for(const m of [1,2]) {
  const b=bondMetrics(1000,.03,5,y,m);
  near(yieldToMaturity(1000,.03,5,b.price,m),y);
  const h=.00001,up=bondMetrics(1000,.03,5,y+h,m).price,down=bondMetrics(1000,.03,5,y-h,m).price;
  near((down-up)/(2*h*b.price),b.modified,1e-6);
  near((up+down-2*b.price)/(h*h*b.price),b.convexity,2e-5);
  assert.ok(up<b.price&&b.price<down);
}
assert.throws(()=>bondMetrics(0,.03,5,.04));
assert.throws(()=>yieldToMaturity(1000,.03,5,0));
near(portfolioMetrics(.6,-.2,.04,.2,.05,.1).expected,-.104);
near(portfolioMetrics(.6,-.2,-.08,.2,.05,.6).expected,-.152);
near(portfolioMetrics(.5,.08,.03,.2,.2,-1).volatility,0);
near(portfolioMetrics(.5,.08,.03,.2,.2,1).volatility,.2);
near(portfolioMetrics(1,.08,.03,.2,.05,0).volatility,.2);
assert.throws(()=>portfolioMetrics(.5,.08,.03,.2,.05,2));
const institution=institutionMetrics(100000,.01,600,100,.25,2000);
near(institution.revenue,1000);near(institution.adjustedProfit,225);near(institution.raroc,.1125);
near(institution.costIncome,.6);near(institution.breakEvenAum,70000);
near(institutionMetrics(80000,.01,600,100,.25,2000).raroc,.0375);
near(institutionMetrics(0,0,600,100,.25,2000).adjustedProfit,-700);
assert.equal(institutionMetrics(0,0,600,100,.25,2000).costIncome,null);
assert.equal(institutionMetrics(0,0,600,100,.25,2000).breakEvenAum,null);
assert.throws(()=>institutionMetrics(100000,.01,600,100,.25,0));
const acquisition=acquisitionMetrics(10000,11500,2000,500,600,5,.08,1,500,200);
near(acquisition.synergyPV,600*(1-1.08**-5)/.08);
near(acquisition.npv,195.626022246);
near(acquisition.equityPrice,10000);near(acquisition.maxOffer,11695.626022246);
near(acquisitionMetrics(10000,11500,2000,500,600,5,.08,.5,500,200).npv,-1002.186988877);
near(acquisitionMetrics(10000,10000,0,0,600,5,0,1,0,0).synergyPV,3000);
near(acquisitionMetrics(10000,10000,0,0,600,5,.08,0,0,0).npv,0);
assert.ok(acquisitionMetrics(10000,11500,0,0,-100,5,.08,1,500,200).npv<0);
assert.throws(()=>acquisitionMetrics(10000,100,2000,0,600,5,.08,1,0,0));
assert.throws(()=>acquisitionMetrics(10000,11500,0,0,600,1.5,.08,1,0,0));
console.log('Passed: bond benchmarks, annual/semiannual YTM, negative/zero rates, finite-difference duration/convexity, portfolio scenarios, and price/risk benchmarks.');
