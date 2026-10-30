export function sipFutureValue(monthly, annualRate, years) {
  const payment = Number(monthly);
  const rate = Number(annualRate);
  const duration = Number(years);
  if (
    !Number.isFinite(payment) || payment <= 0 ||
    !Number.isFinite(rate) || rate < 0 || rate > 1 ||
    !Number.isFinite(duration) || duration <= 0 || duration > 60
  ) return 0;
  const r = rate / 12;
  const n = Math.round(duration * 12);
  if (r === 0) return payment * n;
  return payment * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

export function allocateMonthlyAmounts(allocation, monthlySIP) {
  const items = Array.isArray(allocation) ? allocation : [];
  const total = Math.max(0, Math.round(Number(monthlySIP) || 0));
  const amounts = {};
  let assigned = 0;
  items.forEach((item, index) => {
    const amount = index === items.length - 1
      ? total - assigned
      : Math.round((total * Number(item.percent || 0)) / 100);
    amounts[item.asset] = Math.max(0, amount);
    assigned += amounts[item.asset];
  });
  return amounts;
}
