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
