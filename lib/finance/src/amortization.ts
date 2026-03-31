export function computeAnnualDebt(principal: number, rate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (rate <= 0) return principal / termYears;
  const mr = rate / 12;
  const m = termYears * 12;
  return (principal * (mr * Math.pow(1 + mr, m)) / (Math.pow(1 + mr, m) - 1)) * 12;
}

export function computeMonthlyDebt(principal: number, rate: number, termYears: number): number {
  return computeAnnualDebt(principal, rate, termYears) / 12;
}

export function computeAnnualDebtForYear(principal: number, rate: number, termYears: number, year: number): number {
  if (year >= termYears) return 0;
  return computeAnnualDebt(principal, rate, termYears);
}

export function computeInterestPortion(principal: number, rate: number, termYears: number, year: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const monthlyPayment = computeMonthlyDebt(principal, rate, termYears);
  const mr = rate <= 0 ? 0 : rate / 12;
  let balance = principal;
  let yearInterest = 0;
  for (let m = 0; m < (year + 1) * 12; m++) {
    const interest = balance * mr;
    const prinPay = monthlyPayment - interest;
    if (m >= year * 12) yearInterest += interest;
    balance -= prinPay;
    if (balance <= 0) break;
  }
  return yearInterest;
}

export function computePrincipalPortion(principal: number, rate: number, termYears: number, year: number): number {
  if (principal <= 0 || termYears <= 0 || year >= termYears) return 0;
  const annual = computeAnnualDebtForYear(principal, rate, termYears, year);
  const interest = computeInterestPortion(principal, rate, termYears, year);
  return Math.max(0, annual - interest);
}

export function computeRemainingBalance(principal: number, rate: number, termYears: number, afterYear: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const monthlyPayment = computeMonthlyDebt(principal, rate, termYears);
  const mr = rate <= 0 ? 0 : rate / 12;
  let balance = principal;
  for (let m = 0; m < (afterYear + 1) * 12; m++) {
    const interest = balance * mr;
    balance -= (monthlyPayment - interest);
    if (balance <= 0) return 0;
  }
  return Math.max(0, balance);
}
