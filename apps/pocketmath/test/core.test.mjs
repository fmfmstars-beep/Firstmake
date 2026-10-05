import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseRate, parsePeople, roundHalfUp, formatMoney, tipBill, splitBill, discountPrice, allocateShares, MAX_MONEY_CENTS } from '../public/core.mjs';

test('parses exact decimal money without binary floating-point rounding', () => {
  assert.equal(parseMoney('0.29'), 29n);
  assert.equal(parseMoney('.5'), 50n);
  assert.equal(parseMoney(' 001.20 '), 120n);
  assert.equal(parseMoney('1000000000.00'), MAX_MONEY_CENTS);
  assert.equal(formatMoney(123456789n), '1,234,567.89');
});

test('rejects malformed, signed, fractional-cent and oversized input', () => {
  for (const value of ['', ' ', '-1', '+1', '0.001', '1,000', '1e3', 'Infinity', 'NaN', '1000000000.01', '9'.repeat(40), null]) assert.throws(() => parseMoney(value));
  for (const value of ['-1', '0', '1.5', '10001', '1e3', '3abc']) assert.throws(() => parsePeople(value));
  assert.equal(parsePeople('10000'), 10000);
  assert.throws(() => parseRate('100.01', 100));
  assert.throws(() => parseRate('1000.01', 1000));
  assert.throws(() => parseRate('12.345', 100));
});

test('tip half-cent ties round up exactly at known binary-float failures', () => {
  const first = tipBill('0.29', '50', '1');
  assert.equal(first.tipCents, 15n);
  assert.equal(first.totalCents, 44n);
  assert.equal(tipBill('0.57', '50', 1).tipCents, 29n);
  assert.equal(tipBill('1.00', '0.49', 1).tipCents, 0n);
  assert.equal(tipBill('1.00', '0.50', 1).tipCents, 1n);
});

test('standard tip and maximum supported values remain exact', () => {
  const result = tipBill('80', '18', '2');
  assert.equal(result.tipCents, 1440n);
  assert.equal(result.totalCents, 9440n);
  assert.deepEqual(result.allocation.groups, [{ count: 2, shareCents: 4720n }]);
  assert.equal(tipBill('1000000000', '1000', '10000').totalCents, 1_100_000_000_000n);
});

test('uneven bill shares add to the exact total, including fewer cents than people', () => {
  assert.deepEqual(splitBill('10', '0', '3').allocation.groups, [{ count: 1, shareCents: 334n }, { count: 2, shareCents: 333n }]);
  assert.deepEqual(splitBill('0.02', '0', '5').allocation.groups, [{ count: 2, shareCents: 1n }, { count: 3, shareCents: 0n }]);
  assert.deepEqual(splitBill('0', '0', '2').allocation.groups, [{ count: 2, shareCents: 0n }]);
});

test('allocation invariant holds for varied totals and group sizes', () => {
  for (const total of [0n, 1n, 29n, 1000n, 13_245n, 2n * MAX_MONEY_CENTS]) {
    for (const people of [1, 2, 3, 7, 100, 10000]) {
      const allocation = allocateShares(total, people);
      assert.equal(allocation.groups.reduce((sum, group) => sum + BigInt(group.count) * group.shareCents, 0n), total);
      assert.equal(allocation.groups.reduce((sum, group) => sum + group.count, 0), people);
      assert.ok(allocation.groups.every(group => group.shareCents === allocation.baseCents || group.shareCents === allocation.baseCents + 1n));
    }
  }
});

test('extras are included once and percentages are not added together', () => {
  assert.equal(splitBill('120', '12', '3').totalCents, 13200n);
  assert.equal(splitBill('120', '12', '3').allocation.baseCents, 4400n);
  const result = discountPrice('100', '20', '10');
  assert.equal(result.finalCents, 7200n);
  assert.equal(result.totalSavingCents, 2800n);
  assert.equal(result.effectiveRateHundredths, 2800n);
  assert.equal(result.stages[1].beforeCents, 8000n);
});

test('discount rounding follows each stage and retains exact conservation', () => {
  const result = discountPrice('0.29', '50', '50');
  assert.equal(result.stages[0].savingCents, 15n);
  assert.equal(result.stages[0].afterCents, 14n);
  assert.equal(result.finalCents, 7n);
  assert.equal(result.finalCents + result.totalSavingCents, result.originalCents);
  assert.equal(discountPrice('60', '25').finalCents, 4500n);
  assert.equal(discountPrice('60', '100', '50').finalCents, 0n);
  assert.equal(discountPrice('0', '20', '10').effectiveRateHundredths, null);
});

test('rounding rejects invalid denominators and rounds both sides of a tie', () => {
  assert.equal(roundHalfUp(14n, 10n), 1n);
  assert.equal(roundHalfUp(15n, 10n), 2n);
  assert.equal(roundHalfUp(16n, 10n), 2n);
  assert.throws(() => roundHalfUp(1n, 0n));
  assert.throws(() => roundHalfUp(-1n, 10n));
});
