import test from 'node:test';
import assert from 'node:assert/strict';
import {revenuePeriod} from '../src/revenue-period.mjs';
const now=Date.parse('2026-10-14T00:00:00Z');
test('JST day maps to half-open UTC bounds',()=>{const p=revenuePeriod('?from=2026-10-13&to=2026-10-13',now);assert.equal(p.start,Date.parse('2026-10-12T15:00:00Z'));assert.equal(p.end,Date.parse('2026-10-13T15:00:00Z'));assert.equal(p.timeZone,'Asia/Tokyo');});
test('empty query preserves all-time reporting',()=>assert.equal(revenuePeriod('',now),null));
test('rejects invalid, duplicate, incomplete, overlong and inverted ranges',()=>{for(const q of ['from=2026-02-30&to=2026-03-01','from=2026-10-14','from=2026-10-14&to=2026-10-12','from=2020-01-01&to=2026-10-14','from=2027-01-01&to=2027-01-02','other=1','from=2026-10-13&from=2026-10-14&to=2026-10-14'])assert.throws(()=>revenuePeriod(q,now),RangeError);});
