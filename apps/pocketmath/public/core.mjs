export const MAX_MONEY_CENTS = 100_000_000_000n;
export const MAX_PEOPLE = 10_000;

function decimalText(value, label) {
  if (!['string', 'number'].includes(typeof value)) throw new Error(`${label} must be a decimal number.`);
  const text = String(value).trim();
  if (!text || text.length > 32 || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error(`${label}: use a non-negative decimal with at most two decimal places; no commas or exponent notation.`);
  }
  return text;
}

function hundredths(value, label) {
  const text = decimalText(value, label);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function parseMoney(value, label = 'Amount') {
  const cents = hundredths(value, label);
  if (cents > MAX_MONEY_CENTS) throw new Error(`${label} must be no more than 1,000,000,000.00.`);
  return cents;
}

export function parseRate(value, maxPercent = 100, label = 'Percentage') {
  const rate = hundredths(value, label);
  if (rate > BigInt(maxPercent) * 100n) throw new Error(`${label} must be between 0 and ${maxPercent}%.`);
  return rate;
}

export function parsePeople(value) {
  const text = String(value).trim();
  if (!/^\d{1,5}$/.test(text)) throw new Error('People must be a whole number from 1 to 10,000.');
  const people = Number(text);
  if (people < 1 || people > MAX_PEOPLE) throw new Error('People must be a whole number from 1 to 10,000.');
  return people;
}

export function roundHalfUp(numerator, denominator) {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || numerator < 0n || denominator <= 0n) throw new Error('Rounding requires non-negative integer units and a positive denominator.');
  const whole = numerator / denominator, remainder = numerator % denominator;
  return whole + (remainder * 2n >= denominator ? 1n : 0n);
}

export function formatMoney(cents) {
  if (typeof cents !== 'bigint' || cents < 0n) throw new Error('Money must be a non-negative whole number of cents.');
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function formatRate(rate) {
  return `${rate / 100n}.${(rate % 100n).toString().padStart(2, '0')}%`;
}

export function allocateShares(totalCents, people) {
  if (typeof totalCents !== 'bigint' || totalCents < 0n) throw new Error('The total must be a non-negative whole number of cents.');
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) throw new Error('People must be a whole number from 1 to 10,000.');
  const baseCents = totalCents / BigInt(people);
  const extraPeople = Number(totalCents % BigInt(people));
  const groups = [];
  if (extraPeople) groups.push({ count: extraPeople, shareCents: baseCents + 1n });
  if (people > extraPeople) groups.push({ count: people - extraPeople, shareCents: baseCents });
  return { people, baseCents, extraPeople, groups };
}

export function tipBill(bill, rate, people) {
  const billCents = parseMoney(bill, 'Bill amount');
  const rateHundredths = parseRate(rate, 1000, 'Tip percentage');
  const tipCents = roundHalfUp(billCents * rateHundredths, 10_000n);
  const totalCents = billCents + tipCents;
  return { billCents, rateHundredths, tipCents, totalCents, allocation: allocateShares(totalCents, parsePeople(people)) };
}

export function splitBill(bill, extras, people) {
  const billCents = parseMoney(bill, 'Bill amount'), extraCents = parseMoney(extras, 'Extras');
  const totalCents = billCents + extraCents;
  return { billCents, extraCents, totalCents, allocation: allocateShares(totalCents, parsePeople(people)) };
}

export function discountPrice(original, firstRate, secondRate = '0') {
  const originalCents = parseMoney(original, 'Original price');
  const rates = [parseRate(firstRate, 100, 'First discount'), parseRate(secondRate, 100, 'Second discount')];
  let current = originalCents;
  const stages = rates.map((rateHundredths, index) => {
    const beforeCents = current;
    const savingCents = roundHalfUp(beforeCents * rateHundredths, 10_000n);
    current -= savingCents;
    return { number: index + 1, beforeCents, rateHundredths, savingCents, afterCents: current };
  });
  const totalSavingCents = originalCents - current;
  const effectiveRateHundredths = originalCents === 0n ? null : roundHalfUp(totalSavingCents * 10_000n, originalCents);
  return { originalCents, finalCents: current, totalSavingCents, effectiveRateHundredths, stages };
}
