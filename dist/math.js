// Fixed-rate bullet bonds valued immediately after a coupon date.
// y is annual nominal YTM; m is payments per year; all rates are decimals.
export function bondMetrics(face, coupon, years, y, m = 1) {
  if (!(face > 0) || coupon < 0 || years < 1 || years > 50 || !Number.isInteger(years) || ![1,2].includes(m) || y/m <= -1 || ![face,coupon,years,y].every(Number.isFinite)) throw new Error('请使用有效的面值、利率和整数年限。');
  const n = years*m, c = face*coupon/m, cashflows = [];
  let price = 0, weighted = 0, curvature = 0;
  for (let k=1;k<=n;k++) {
    const cash = c+(k===n?face:0), pv = cash/(1+y/m)**k;
    price += pv; weighted += k/m*pv;
    curvature += k*(k+1)*cash/(1+y/m)**(k+2)/(m*m);
    cashflows.push({period:k,year:k/m,cash,pv});
  }
  return {price, macaulay:weighted/price, modified:weighted/price/(1+y/m), convexity:curvature/price, cashflows};
}
export function yieldToMaturity(face,coupon,years,price,m=1) {
  if (!(price>0) || !Number.isFinite(price)) throw new Error('成交价格必须大于 0。');
  let lo=-.95*m, hi=1;
  while(bondMetrics(face,coupon,years,hi,m).price>price && hi<1024) hi*=2;
  if(bondMetrics(face,coupon,years,lo,m).price<price || bondMetrics(face,coupon,years,hi,m).price>price) throw new Error('该价格超出收益率求解范围，请检查输入。');
  for(let i=0;i<160;i++) {
    const mid=(lo+hi)/2;
    if(bondMetrics(face,coupon,years,mid,m).price>price) lo=mid; else hi=mid;
  }
  return (lo+hi)/2;
}
export function portfolioMetrics(w,rs,rb,vs,vb,rho) {
  if (![w,rs,rb,vs,vb,rho].every(Number.isFinite) || w<0 || w>1 || vs<0 || vb<0 || Math.abs(rho)>1) throw new Error('请检查权重、波动率与相关系数。');
  return {expected:w*rs+(1-w)*rb,volatility:Math.sqrt(Math.max(0,w*w*vs*vs+(1-w)**2*vb*vb+2*w*(1-w)*rho*vs*vb))};
}
export function compound(principal,rate,years) { return principal*(1+rate)**years; }

// Annual asset-management operating model; money inputs share the same unit.
export function institutionMetrics(aum,fee,cost,loss,tax,capital) {
  if (![aum,fee,cost,loss,tax,capital].every(Number.isFinite) || aum<0 || fee<0 || cost<0 || loss<0 || tax<0 || tax>1 || capital<=0) throw new Error('请检查规模、费用、税率与风险资本。');
  const revenue=aum*fee, pretax=revenue-cost-loss;
  const adjustedProfit=pretax-Math.max(0,pretax)*tax;
  return {revenue,pretax,adjustedProfit,raroc:adjustedProfit/capital,costIncome:revenue>0?cost/revenue:null,breakEvenAum:fee>0?(cost+loss)/fee:null};
}

// Finite, year-end incremental after-tax free cash flows; no terminal value.
export function acquisitionMetrics(standalone,offer,debt,cash,synergy,years,rate,realization,integration,fees) {
  if (![standalone,offer,debt,cash,synergy,years,rate,realization,integration,fees].every(Number.isFinite) || standalone<0 || offer<0 || debt<0 || cash<0 || !Number.isInteger(years) || years<1 || years>50 || rate<=-1 || realization<0 || realization>1 || integration<0 || fees<0 || offer-debt+cash<0) throw new Error('请检查企业价值、年数、兑现比例和现金债务口径。');
  const cashflows=Array.from({length:years},(_,i)=>({year:i+1,cash:synergy*realization,pv:synergy*realization/(1+rate)**(i+1)}));
  const synergyPV=cashflows.reduce((s,c)=>s+c.pv,0), premium=offer-standalone;
  return {synergyPV,premium,equityPrice:offer-debt+cash,maxOffer:standalone+synergyPV-integration-fees,npv:synergyPV-premium-integration-fees,cashflows};
}
