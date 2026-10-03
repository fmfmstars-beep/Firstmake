import { CITIES, city, defaultConfig, validateConfig, plan, encodeConfig, decodeConfig, offsetLabel, scheduleText, meetingIcs } from './core.mjs';

const $ = id => document.getElementById(id);
let activePlan, selectedSlot, calendarUrl;
const dateDisplay = date => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function options(select, selected) {
  for (const item of CITIES) {
    const option = el('option', '', item.name); option.value = item.id; option.selected = item.id === selected; select.append(option);
  }
}
options($('reference'), 'tokyo');

function renderParticipantRows(participants) {
  $('participants').replaceChildren();
  participants.forEach((p, i) => {
    const row = el('div', 'city-row');
    const cityLabel = el('label', '', `City ${i + 1}`), select = el('select');
    select.dataset.field = 'city'; select.setAttribute('aria-label', `Participant ${i + 1} city`); options(select, p.city); cityLabel.append(select);
    const startLabel = el('label', '', 'Work starts'), start = el('input');
    start.type = 'time'; start.step = '60'; start.required = true; start.value = p.start; start.dataset.field = 'start'; start.setAttribute('aria-label', `Participant ${i + 1} work start`); startLabel.append(start);
    const endLabel = el('label', '', 'Work ends'), end = el('input');
    end.type = 'time'; end.step = '60'; end.required = true; end.value = p.end; end.dataset.field = 'end'; end.setAttribute('aria-label', `Participant ${i + 1} work end`); endLabel.append(end);
    const checkLabel = el('label', 'check-label'), check = el('input'); check.type = 'checkbox'; check.checked = p.weekdaysOnly; check.dataset.field = 'weekdaysOnly'; check.setAttribute('aria-label', `Participant ${i + 1} weekdays only`); checkLabel.append(check, document.createTextNode('Weekdays only'));
    const remove = el('button', 'remove-button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove participant ${i + 1}`); remove.disabled = participants.length === 1; remove.addEventListener('click', () => { const next = readRows(); next.splice(i, 1); renderParticipantRows(next); markChanged(); });
    row.append(cityLabel, startLabel, endLabel, checkLabel, remove); $('participants').append(row);
  });
  $('add-city').disabled = participants.length >= 4;
}
function readRows() {
  return [...$('participants').children].map(row => ({ city: row.querySelector('[data-field="city"]').value, start: row.querySelector('[data-field="start"]').value, end: row.querySelector('[data-field="end"]').value, weekdaysOnly: row.querySelector('[data-field="weekdaysOnly"]').checked }));
}
function readConfig() { return validateConfig({ version: 1, reference: $('reference').value, date: $('meeting-date').value, duration: Number($('duration').value), participants: readRows() }); }
function setConfig(config) { $('reference').value = config.reference; $('meeting-date').value = config.date; $('duration').value = String(config.duration); renderParticipantRows(config.participants); }
function fail(message) { $('error').textContent = message; $('error').hidden = false; }
function markChanged() {
  $('results').hidden = true; activePlan = null; selectedSlot = null;
  $('link-message').textContent = 'Settings changed. Find meeting times to refresh the results.';
}
function run() {
  $('error').hidden = true; $('link-message').textContent = '';
  try {
    activePlan = plan(readConfig()); selectedSlot = null; $('selected').hidden = true; $('results').hidden = false;
    if (calendarUrl) { URL.revokeObjectURL(calendarUrl); calendarUrl = null; }
    const p = activePlan, total = p.config.participants.length;
    $('results-summary').textContent = p.overlaps.length ? `${p.overlaps.length} tested starts fit the full ${p.config.duration}-minute meeting inside every participant's work hours.` : `No tested 30-minute-grid start fits all ${total} participant cities. The best tested starts fit ${p.bestCount} of ${total}; the other cities are outside their work hours. Other start minutes are not tested.`;
    $('results-summary').classList.toggle('no-overlap', !p.overlaps.length);
    $('results-detail').textContent = `${p.slots.length} starts, every 30 minutes, across ${dateDisplay(p.config.date)} in ${p.reference.name} (${p.dayHours}-hour day). Results stay in chronological order. Meetings may finish on the following local day. Offsets are shown for both endpoints.`;
    renderSlots();
    return true;
  } catch (error) { $('results').hidden = true; activePlan = null; fail(error.message); return false; }
}
function renderSlots() {
  if (!activePlan) return;
  const list = $('result-view').value === 'all' ? activePlan.slots : activePlan.bestSlots;
  $('slots').replaceChildren();
  for (const slot of list) {
    const card = el('article', 'slot-card');
    if (slot.fittingCount === activePlan.config.participants.length) card.classList.add('all-fit');
    const top = el('div', 'slot-top'), heading = el('div');
    heading.append(el('h3', '', `${slot.referenceStart.time} → ${slot.referenceEnd.time} ${activePlan.reference.name}`), el('p', 'slot-reference', `${slot.referenceStart.date} (${offsetLabel(slot.referenceStart.offsetMinutes)}) → ${slot.referenceEnd.date} (${offsetLabel(slot.referenceEnd.offsetMinutes)})`));
    const badge = el('span', 'fit-badge', `${slot.fittingCount}/${activePlan.config.participants.length} within work hours`);
    top.append(heading, badge); card.append(top);
    const localList = el('div', 'local-times');
    for (const participant of slot.participants) {
      const row = el('div', 'local-row');
      row.append(el('strong', '', participant.name));
      const times = el('div', 'local-range');
      times.append(el('span', '', `${participant.localStart.date} ${participant.localStart.time} (${offsetLabel(participant.localStart.offsetMinutes)})`), el('span', 'to-end', `to ${participant.localEnd.date} ${participant.localEnd.time} (${offsetLabel(participant.localEnd.offsetMinutes)})`));
      row.append(times, el('span', participant.fits ? 'fit-status yes' : 'fit-status no', participant.fits ? 'Fits whole meeting' : 'Outside work hours')); localList.append(row);
    }
    card.append(localList);
    const select = el('button', 'button secondary small choose-slot', 'Choose this time'); select.type = 'button'; select.setAttribute('aria-label', `Choose ${slot.referenceStart.date} ${slot.referenceStart.time} ${activePlan.reference.name} ${offsetLabel(slot.referenceStart.offsetMinutes)}`); select.addEventListener('click', () => selectSlot(slot)); card.append(select); $('slots').append(card);
  }
}
function selectSlot(slot) {
  selectedSlot = slot;
  $('selected').hidden = false; $('selected-text').textContent = scheduleText(slot, activePlan.config.duration); $('selected-message').textContent = '';
  if (calendarUrl) URL.revokeObjectURL(calendarUrl);
  calendarUrl = URL.createObjectURL(new Blob([meetingIcs(slot, activePlan.config.duration)], { type: 'text/calendar;charset=utf-8' }));
  $('download-calendar').href = calendarUrl;
  $('selected').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}
async function copyText(text, status, success) {
  let timeoutId;
  status.textContent = 'Copying…';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('Clipboard did not respond')), 2000); }),
    ]);
    status.textContent = success;
  } catch {
    status.textContent = 'Clipboard access is unavailable or did not respond. Select and copy the text below.';
    const fallback = el('textarea', 'copy-fallback'); fallback.readOnly = true; fallback.value = text; fallback.setAttribute('aria-label', 'Text to copy manually'); status.append(fallback); fallback.focus(); fallback.select();
  } finally { clearTimeout(timeoutId); }
}
$('planner-form').addEventListener('submit', event => { event.preventDefault(); run(); });
$('planner-form').addEventListener('change', markChanged);
$('result-view').addEventListener('change', renderSlots);
$('add-city').addEventListener('click', () => { const rows = readRows(); if (rows.length >= 4) return; rows.push({ city: CITIES.find(c => !rows.some(row => row.city === c.id)).id, start: '09:00', end: '17:00', weekdaysOnly: true }); renderParticipantRows(rows); markChanged(); });
$('copy-link').addEventListener('click', async () => {
  $('error').hidden = true;
  try { const fragment = encodeConfig(readConfig()); const url = location.origin + '/' + fragment; history.replaceState(null, '', '/' + fragment); await copyText(url, $('link-message'), 'Plan link copied. It shares only the date, cities, duration and work windows.'); }
  catch (error) { fail(error.message); }
});
$('copy-schedule').addEventListener('click', () => { if (selectedSlot && activePlan) copyText(scheduleText(selectedSlot, activePlan.config.duration), $('selected-message'), 'Schedule copied.'); });
$('example').addEventListener('click', () => { const config = defaultConfig(); config.reference = 'london'; config.date = '2026-10-28'; setConfig(config); run(); });
window.addEventListener('pagehide', () => { if (calendarUrl) URL.revokeObjectURL(calendarUrl); });
let config = defaultConfig();
if (location.hash) {
  try { config = decodeConfig(location.hash); }
  catch (error) { history.replaceState(null, '', location.pathname); $('link-message').textContent = error.message; }
}
setConfig(config);
if (location.hash) run();
