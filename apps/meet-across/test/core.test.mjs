import test from 'node:test';
import assert from 'node:assert/strict';
import { city, validDate, localParts, localToInstant, dayBounds, offsetLabel, defaultConfig, validateConfig, fullDurationFits, plan, encodeConfig, decodeConfig, icsEscape, foldIcsLine, meetingIcs } from '../public/core.mjs';

const instant = value => Date.parse(value);
const participant = (cityId, start = '09:00', end = '17:00', weekdaysOnly = true) => ({ city: cityId, start, end, weekdaysOnly });
function configuration(date = '2026-10-28', reference = 'london', participants = [participant('london'), participant('new-york')], duration = 60) {
  return { version: 1, reference, date, duration, participants };
}

test('London and New York use date-specific offsets around both autumn clock changes', () => {
  const expected = [['2026-10-20T12:00:00Z', 60, -240, 5], ['2026-10-28T12:00:00Z', 0, -240, 4], ['2026-11-03T12:00:00Z', 0, -300, 5]];
  for (const [stamp, london, newYork, difference] of expected) {
    assert.equal(localParts(instant(stamp), city('london').zone).offsetMinutes, london);
    assert.equal(localParts(instant(stamp), city('new-york').zone).offsetMinutes, newYork);
    assert.equal((london - newYork) / 60, difference);
  }
});

test('New York spring and autumn days generate 46 and 50 actual half-hour starts', () => {
  const spring = plan(configuration('2026-03-08', 'new-york', [participant('new-york', '00:00', '23:59', false)]));
  const autumn = plan(configuration('2026-11-01', 'new-york', [participant('new-york', '00:00', '23:59', false)]));
  assert.equal(spring.dayHours, 23); assert.equal(spring.slots.length, 46);
  assert.equal(autumn.dayHours, 25); assert.equal(autumn.slots.length, 50);
  const repeated = autumn.slots.filter(slot => slot.referenceStart.time === '01:30');
  assert.equal(repeated.length, 2);
  assert.deepEqual(repeated.map(slot => slot.referenceStart.offsetMinutes), [-240, -300]);
  assert.equal(spring.slots.filter(slot => slot.referenceStart.time.startsWith('02:')).length, 0);
});

test('London day bounds also follow 23-hour spring and 25-hour autumn days', () => {
  const spring = dayBounds('2026-03-29', 'Europe/London');
  const autumn = dayBounds('2026-10-25', 'Europe/London');
  assert.equal(spring.end - spring.start, 23 * 3600000);
  assert.equal(autumn.end - autumn.start, 25 * 3600000);
});

test('nonexistent and ambiguous local midnight are explicitly rejected', () => {
  assert.throws(() => dayBounds('2026-03-08', 'America/Havana'), /does not exist/);
  assert.throws(() => dayBounds('2026-11-01', 'America/Havana'), /ambiguous/);
});

test('half-hour and quarter-hour cities preserve their exact offsets', () => {
  const stamp = instant('2026-10-28T00:00:00Z');
  const delhi = localParts(stamp, city('delhi').zone), kathmandu = localParts(stamp, city('kathmandu').zone);
  assert.equal(delhi.time, '05:30'); assert.equal(delhi.offsetMinutes, 330);
  assert.equal(kathmandu.time, '05:45'); assert.equal(kathmandu.offsetMinutes, 345);
  assert.equal(offsetLabel(345), 'UTC+05:45'); assert.equal(offsetLabel(-300), 'UTC−05:00');
  assert.equal(localToInstant('2026-10-28', '09:00', 'Asia/Kathmandu'), instant('2026-10-28T03:15:00Z'));
});

test('Kathmandu reference starts align to its local half hours rather than UTC half hours', () => {
  const result = plan(configuration('2026-10-28', 'kathmandu', [participant('kathmandu')]));
  assert.equal(result.slots[0].start, instant('2026-10-27T18:15:00Z'));
  assert.equal(result.slots[0].referenceStart.time, '00:00');
  assert.equal(result.slots[1].referenceStart.time, '00:30');
});

test('real weekdays and full meeting duration determine the shared overlap', () => {
  const result = plan(configuration());
  assert.equal(result.overlaps.length, 7);
  assert.equal(result.overlaps[0].referenceStart.time, '13:00');
  assert.equal(result.overlaps.at(-1).referenceStart.time, '16:00');
  const slot = result.slots.find(slot => slot.referenceStart.time === '14:00');
  assert.equal(slot.fittingCount, 2);
  assert.equal(slot.participants[1].localStart.time, '10:00');
  assert.equal(slot.participants[1].localEnd.time, '11:00');
});

test('a meeting finishing exactly at work end fits, but one going past it does not', () => {
  const p = participant('london');
  assert.equal(fullDurationFits(instant('2026-10-28T16:00:00Z'), 60, p), true);
  assert.equal(fullDurationFits(instant('2026-10-28T16:30:00Z'), 60, p), false);
  assert.equal(fullDurationFits(instant('2026-10-28T08:30:00Z'), 60, p), false);
});

test('weekday-only settings use each participant local date', () => {
  const stamp = instant('2026-10-30T23:00:00Z');
  assert.equal(localParts(stamp, city('tokyo').zone).date, '2026-10-31');
  assert.equal(fullDurationFits(stamp, 30, participant('tokyo', '07:00', '12:00', true)), false);
  assert.equal(fullDurationFits(stamp, 30, participant('tokyo', '07:00', '12:00', false)), true);
  assert.equal(fullDurationFits(stamp, 30, participant('new-york', '09:00', '23:00', true)), true);
});

test('midnight rollover is shown and cannot silently fit a daytime work window', () => {
  const result = plan(configuration('2026-10-28', 'tokyo', [participant('tokyo', '00:00', '23:59', false)], 120));
  const last = result.slots.at(-1);
  assert.equal(last.referenceStart.date, '2026-10-28');
  assert.equal(last.referenceEnd.date, '2026-10-29');
  assert.equal(last.referenceEnd.time, '01:30');
  assert.equal(last.fittingCount, 0);
});

test('the repeated autumn hour does not hide a work-hour excursion between endpoints', () => {
  const start = instant('2026-11-01T05:45:00Z');
  assert.equal(localParts(start, city('new-york').zone).time, '01:45');
  assert.equal(localParts(start + 1800000, city('new-york').zone).time, '01:15');
  assert.equal(fullDurationFits(start, 30, participant('new-york', '01:15', '01:50', false)), false);
  assert.equal(fullDurationFits(start, 30, participant('new-york', '01:00', '02:00', false)), true);
});

test('Tokyo London New York standard work windows honestly have no common slot', () => {
  const result = plan(configuration('2026-10-28', 'tokyo', [participant('tokyo'), participant('london'), participant('new-york')]));
  assert.equal(result.overlaps.length, 0); assert.equal(result.bestCount, 2);
  assert.equal(result.bestSlots.every(slot => slot.fittingCount === 2), true);
  assert.equal(result.slots.every((slot, i, list) => !i || slot.start > list[i - 1].start), true);
});

test('the half-hour grid may miss a narrow overlap at another start minute', () => {
  const p = participant('london', '09:05', '09:35');
  const result = plan(configuration('2026-10-28', 'london', [p], 30));
  assert.equal(result.overlaps.length, 0);
  assert.equal(fullDurationFits(instant('2026-10-28T09:05:00Z'), 30, p), true);
});

test('invalid dates, unsupported zones and cities are rejected', () => {
  assert.throws(() => validDate('2026-02-29'), /valid calendar/);
  assert.throws(() => validDate('2026-13-01'), /valid calendar/);
  assert.throws(() => validDate('2026-2-1'), /valid calendar/);
  assert.throws(() => validDate('1999-01-01'), /between/);
  assert.throws(() => localToInstant('2026-10-28', '09:00', 'Mars/Base'), RangeError);
  assert.throws(() => validateConfig({ ...configuration(), reference: 'unknown' }), /supported city/);
});

test('the final allowed planning day has a valid next-year end boundary', () => {
  const result = plan(configuration('2100-12-31', 'utc', [participant('utc', '00:00', '23:59', false)]));
  assert.equal(result.bounds.end, instant('2101-01-01T00:00:00Z'));
  assert.equal(result.slots.length, 48);
  assert.throws(() => validateConfig({ ...configuration(), date: '2101-01-01' }), /between/);
});

test('work-window schema rejects overnight times, duplicates, extra keys and excess rows', () => {
  assert.throws(() => validateConfig(configuration('2026-10-28', 'utc', [participant('utc', '17:00', '09:00')])), /Overnight/);
  assert.throws(() => validateConfig(configuration('2026-10-28', 'utc', [participant('utc', '24:00', '25:00')])), /valid 24-hour/);
  assert.throws(() => validateConfig(configuration('2026-10-28', 'utc', [participant('utc'), participant('utc')])), /different city/);
  assert.throws(() => validateConfig({ ...configuration(), email: 'unsupported@example.com' }), /not supported/);
  assert.throws(() => validateConfig(configuration('2026-10-28', 'utc', [participant('utc'), participant('tokyo'), participant('london'), participant('berlin'), participant('delhi')])), /one and four/);
  assert.throws(() => validateConfig({ ...configuration(), duration: 45 }), /supported meeting duration/);
});

test('sharing round trips only the strict bounded configuration', () => {
  const config = configuration('2026-10-28', 'london', [participant('london'), participant('new-york'), participant('delhi'), participant('kathmandu')], 90);
  const hash = encodeConfig(config);
  assert.equal(hash.length < 2200, true);
  assert.deepEqual(decodeConfig(hash), config);
  assert.throws(() => decodeConfig('#config=%zz'), /ignored/);
  assert.throws(() => decodeConfig('#config=' + encodeURIComponent(JSON.stringify({ ...config, names: ['Alice'] }))), /ignored/);
  assert.throws(() => decodeConfig('#config=' + 'a'.repeat(2200)), /ignored/);
  assert.throws(() => decodeConfig('#other=value'), /ignored/);
});

test('calendar uses correct UTC instants, duration, stable UID and escaped text', () => {
  const result = plan(configuration());
  const slot = result.slots.find(slot => slot.referenceStart.time === '14:00');
  const data = meetingIcs(slot, 60, instant('2026-10-01T00:00:00Z'), 'Meet, review; notes\\next\nline');
  assert.match(data, /DTSTART:20261028T140000Z\r\n/);
  assert.match(data, /DTEND:20261028T150000Z\r\n/);
  assert.match(data, /DTSTAMP:20261001T000000Z\r\n/);
  assert.match(data, /SUMMARY:Meet\\, review\\; notes\\\\next\\nline/);
  assert.doesNotMatch(data, /ATTENDEE|METHOD:REQUEST|ORGANIZER/);
  const uid = text => text.match(/UID:([^\r]+)/)[1];
  assert.equal(uid(data), uid(meetingIcs(slot, 60)));
  assert.equal(data.endsWith('END:VCALENDAR\r\n'), true);
  assert.equal(icsEscape('a,b;c\\d\r\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('calendar folding uses UTF-8 byte limits and preserves Unicode', () => {
  const source = 'DESCRIPTION:' + '東京 meeting; '.repeat(30);
  const folded = foldIcsLine(source);
  for (const line of folded.split('\r\n')) assert.equal(new TextEncoder().encode(line).length <= 75, true);
  assert.equal(folded.replace(/\r\n /g, ''), source);
});

test('default date follows the reference city rather than the browser system zone', () => {
  const config = defaultConfig(instant('2026-10-02T15:30:00Z'));
  assert.equal(config.reference, 'tokyo'); assert.equal(config.date, '2026-10-03');
  assert.equal(validateConfig(config).participants.length, 2);
});
