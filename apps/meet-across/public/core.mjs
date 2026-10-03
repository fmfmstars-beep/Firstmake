export const CITIES = Object.freeze([
  { id: 'tokyo', name: 'Tokyo', zone: 'Asia/Tokyo' },
  { id: 'new-york', name: 'New York', zone: 'America/New_York' },
  { id: 'los-angeles', name: 'Los Angeles', zone: 'America/Los_Angeles' },
  { id: 'london', name: 'London', zone: 'Europe/London' },
  { id: 'berlin', name: 'Berlin', zone: 'Europe/Berlin' },
  { id: 'singapore', name: 'Singapore', zone: 'Asia/Singapore' },
  { id: 'sydney', name: 'Sydney', zone: 'Australia/Sydney' },
  { id: 'delhi', name: 'Delhi', zone: 'Asia/Kolkata' },
  { id: 'kathmandu', name: 'Kathmandu', zone: 'Asia/Kathmandu' },
  { id: 'utc', name: 'UTC', zone: 'Etc/UTC' },
]);
const cityById = new Map(CITIES.map(city => [city.id, city]));
const formatters = new Map();
const pad = (n, width = 2) => String(n).padStart(width, '0');

export function city(id) {
  const value = cityById.get(id);
  if (!value) throw new Error('Choose a supported city.');
  return value;
}

export function validDate(value, allowEndBoundary = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid calendar date.');
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > (allowEndBoundary ? 2101 : 2100)) throw new Error('Choose a date between 2000 and 2100.');
  const stamp = Date.UTC(year, month - 1, day);
  const test = new Date(stamp);
  if (test.getUTCFullYear() !== year || test.getUTCMonth() + 1 !== month || test.getUTCDate() !== day) throw new Error('Choose a valid calendar date.');
  return { year, month, day, stamp };
}

export function clockMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Use a valid 24-hour time.');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function localParts(instant, zone) {
  if (!Number.isFinite(instant)) throw new Error('Invalid meeting instant.');
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    formatters.set(zone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const { year, month, day, hour, minute, second } = parts;
  const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const time = `${pad(hour)}:${pad(minute)}`;
  const offsetMinutes = (Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant / 1000) * 1000) / 60000;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, date, time, offsetMinutes, weekday };
}

export function offsetLabel(minutes) {
  const sign = minutes < 0 ? '−' : '+';
  const value = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(value / 60))}:${pad(Math.round(value % 60))}`;
}

// Try every offset observed near the requested wall time, then require an exact
// round trip. This detects skipped and repeated wall times instead of normalizing.
export function localToInstant(date, time, zone, allowEndBoundary = false) {
  const parsed = validDate(date, allowEndBoundary);
  const minutes = clockMinutes(time);
  const wall = parsed.stamp + minutes * 60000;
  const offsets = new Set();
  for (let delta = -48; delta <= 48; delta += 3) offsets.add(localParts(wall + delta * 3600000, zone).offsetMinutes);
  const matches = [...offsets].map(offset => wall - offset * 60000).filter(candidate => {
    const observed = localParts(candidate, zone);
    return observed.date === date && observed.time === time && observed.second === 0;
  });
  if (!matches.length) throw new Error(`${date} ${time} does not exist in ${zone} because the clock changes. Choose another reference day.`);
  if (matches.length !== 1) throw new Error(`${date} ${time} is ambiguous in ${zone} because the clock repeats. Choose another reference day.`);
  return matches[0];
}

export function dayBounds(date, zone) {
  const { stamp } = validDate(date);
  const next = new Date(stamp + 86400000).toISOString().slice(0, 10);
  return { start: localToInstant(date, '00:00', zone), end: localToInstant(next, '00:00', zone, true) };
}

export function defaultConfig(now = Date.now()) {
  return { version: 1, reference: 'tokyo', date: localParts(now, 'Asia/Tokyo').date, duration: 60, participants: [
    { city: 'london', start: '09:00', end: '17:00', weekdaysOnly: true },
    { city: 'new-york', start: '09:00', end: '17:00', weekdaysOnly: true },
  ] };
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

export function validateConfig(value) {
  if (!exactKeys(value, ['version', 'reference', 'date', 'duration', 'participants']) || value.version !== 1) throw new Error('The shared configuration is not supported.');
  city(value.reference); validDate(value.date);
  if (![30, 60, 90, 120].includes(value.duration)) throw new Error('Choose a supported meeting duration.');
  if (!Array.isArray(value.participants) || !value.participants.length || value.participants.length > 4) throw new Error('Choose between one and four participant cities.');
  const ids = new Set();
  const participants = value.participants.map(p => {
    if (!exactKeys(p, ['city', 'start', 'end', 'weekdaysOnly']) || typeof p.weekdaysOnly !== 'boolean') throw new Error('Invalid participant settings.');
    city(p.city);
    if (ids.has(p.city)) throw new Error('Choose a different city for each participant row.');
    ids.add(p.city);
    if (clockMinutes(p.end) <= clockMinutes(p.start)) throw new Error('Work end must be later than work start. Overnight work windows are not supported.');
    return { city: p.city, start: p.start, end: p.end, weekdaysOnly: p.weekdaysOnly };
  });
  return { version: 1, reference: value.reference, date: value.date, duration: value.duration, participants };
}

export function fullDurationFits(start, duration, participant) {
  const zone = city(participant.city).zone;
  const workStart = clockMinutes(participant.start), workEnd = clockMinutes(participant.end);
  if (workEnd <= workStart) throw new Error('Work end must be later than work start.');
  // Inputs and candidates have whole-minute precision. Check each occupied
  // minute, not just the endpoints: a repeated clock hour can hide an excursion.
  for (let elapsed = 0; elapsed < duration; elapsed++) {
    const p = localParts(start + elapsed * 60000, zone);
    const minute = p.hour * 60 + p.minute;
    if (minute < workStart || minute >= workEnd || (participant.weekdaysOnly && (p.weekday === 0 || p.weekday === 6))) return false;
  }
  return true;
}

export function plan(raw) {
  const config = validateConfig(raw);
  const reference = city(config.reference);
  const bounds = dayBounds(config.date, reference.zone);
  const slots = [];
  for (let start = bounds.start; start < bounds.end; start += 1800000) {
    const end = start + config.duration * 60000;
    const participants = config.participants.map(p => ({
      ...p, name: city(p.city).name, zone: city(p.city).zone,
      localStart: localParts(start, city(p.city).zone), localEnd: localParts(end, city(p.city).zone),
      fits: fullDurationFits(start, config.duration, p),
    }));
    slots.push({ start, end, referenceStart: localParts(start, reference.zone), referenceEnd: localParts(end, reference.zone), participants, fittingCount: participants.filter(p => p.fits).length });
  }
  const bestCount = Math.max(...slots.map(slot => slot.fittingCount));
  const bestSlots = slots.filter(slot => slot.fittingCount === bestCount);
  const overlaps = slots.filter(slot => slot.fittingCount === config.participants.length);
  return { config, reference, bounds, dayHours: (bounds.end - bounds.start) / 3600000, slots, bestCount, bestSlots, overlaps };
}

export function encodeConfig(config) {
  return '#config=' + encodeURIComponent(JSON.stringify(validateConfig(config)));
}

export function decodeConfig(fragment) {
  if (typeof fragment !== 'string' || fragment.length > 2200 || !fragment.startsWith('#config=')) throw new Error('The shared link is invalid and was ignored.');
  try { return validateConfig(JSON.parse(decodeURIComponent(fragment.slice(8)))); }
  catch { throw new Error('The shared link is invalid and was ignored.'); }
}

export function scheduleText(slot, duration) {
  return [`MeetAcross meeting — ${duration} minutes`, `${new Date(slot.start).toISOString()} to ${new Date(slot.end).toISOString()}`, ...slot.participants.map(p => `${p.name}: ${p.localStart.date} ${p.localStart.time} (${offsetLabel(p.localStart.offsetMinutes)}) to ${p.localEnd.date} ${p.localEnd.time} (${offsetLabel(p.localEnd.offsetMinutes)}) — ${p.fits ? 'within work hours' : 'outside work hours'}`)].join('\n');
}

export function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  let output = '', column = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (column + bytes > 75) { output += '\r\n '; column = 1; }
    output += character; column += bytes;
  }
  return output;
}

export function meetingIcs(slot, duration, generatedAt = Date.now(), title = 'MeetAcross meeting') {
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MeetAcross//Meeting Planner//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:meeting-${slot.start}-${duration}@meetacross.local`, `DTSTAMP:${stamp(generatedAt)}`, `DTSTART:${stamp(slot.start)}`, `DTEND:${stamp(slot.end)}`, `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(scheduleText(slot, duration))}`, 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
