import {MessageRecorder} from './recording.js';

const $ = (selector) => document.querySelector(selector);
const samples = [
  [
    "schedule",
    "deadline",
    "Could you confirm whether the deadline is October 20 at 5 pm Japan time?",
    "締め切りは日本時間10月20日午後5時で間違いないか、ご確認いただけますか。"
  ],
  [
    "schedule",
    "reschedule",
    "Would it be possible to move our meeting to October 22 at 10 am Japan time?",
    "打ち合わせを日本時間10月22日午前10時に変更することは可能でしょうか。"
  ],
  [
    "schedule",
    "meeting-time",
    "Is the meeting time shown in Japan time or your local time?",
    "記載されている打ち合わせの時刻は、日本時間でしょうか。それとも、そちらの現地時間でしょうか。"
  ],
  [
    "request",
    "scope",
    "To confirm, you need three banner images and one logo file. Is that correct?",
    "確認ですが、必要なものはバナー画像3点とロゴファイル1点でよろしいでしょうか。"
  ],
  [
    "request",
    "format",
    "Which file format would you prefer for the final delivery?",
    "最終納品のファイル形式は、どの形式をご希望でしょうか。"
  ],
  [
    "request",
    "priority",
    "Which of these changes should I work on first?",
    "これらの修正のうち、どれから先に進めればよろしいでしょうか。"
  ],
  [
    "delivery",
    "delivery",
    "The final files are ready. Please let me know if you have any trouble opening them.",
    "最終版のファイルが完成しました。開けない場合はお知らせください。"
  ],
  [
    "delivery",
    "revision",
    "I have updated the file based on your feedback. Could you review the changes?",
    "いただいたご意見をもとにファイルを修正しました。変更内容をご確認いただけますか。"
  ],
  [
    "delivery",
    "receipt",
    "Could you let me know when you have received the files?",
    "ファイルを受け取られましたら、お知らせいただけますか。"
  ]
];
let me = {signedIn: false}, config = {}, checked = false, epoch = 0, busy = false, controller = null;
let retry = null, wav = null, audioUrl = null, expiryTimer = null, recording = false, speaking = false;
let result = null, speechEpoch = 0;
const status = (message, error = false) => { $('#status').textContent = message; $('#status').classList.toggle('error', error); };
const targetLanguage = () => $('#direction').value === 'en-ja' ? 'ja' : 'en';
const targetVoice = () => {
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return null;
  const language = targetLanguage();
  return window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().split('-')[0] === language).sort((a, b) => Number(b.localService) - Number(a.localService))[0] || null;
};
const cloudReady = () => checked && me.signedIn === true && me.serviceReady === true && config.translationEnabled === true && config.sampleOnly !== true;
function controls() {
  const count = [...$('#source').value].length;
  $('#count').textContent = `${count.toLocaleString()} / 1,000`;
  $('#translate').disabled = !cloudReady() || busy || recording || (wav && (!$('#cloud-consent').checked || !$('#record-consent').checked)) || (!wav && (!$('#source').value.trim() || count > 1000));
  $('#translate').textContent = busy ? 'Translating…' : retry && !retry.completed ? 'Retry translation ↗' : wav ? 'Translate recording ↗' : 'Translate message ↗';
  $('#record').disabled = !cloudReady() || busy || recording || !MessageRecorder.supported() || !$('#cloud-consent').checked || !$('#record-consent').checked;
  $('#stop-recording').disabled = !recording || recorder.state !== 'recording';
  $('#copy').disabled = !result; $('#show').disabled = !result;
  const voice = targetVoice(); $('#speak').disabled = !result || !voice || speaking; $('#stop-speech').disabled = !speaking;
  $('#voice-status').textContent = voice ? `Read aloud: ${voice.name}. Your OS or browser may process text externally.` : `No ${targetLanguage() === 'ja' ? 'Japanese' : 'English'} voice is available on this device. Copy and Show still work.`;
  $('#source-label').textContent = $('#direction').value === 'en-ja' ? 'English original' : 'Japanese original';
  $('#output-label').textContent = $('#direction').value === 'en-ja' ? 'Japanese translation' : 'English translation';
  $('#source').lang = $('#direction').value === 'en-ja' ? 'en' : 'ja'; $('#output').lang = targetLanguage();
}
function usage() {
  $('#plan-label').textContent = !checked ? 'Checking access' : !me.signedIn ? 'Sample access' : me.plan === 'pro' ? 'Pro' : 'Free account';
  $('#account-link').textContent = me.signedIn || (checked && !me.oidcReady) ? 'Account' : 'Sign in';
  const describe = (kind) => {
    const value = me.usage?.[kind]; if (!value || !Number.isFinite(value.limit)) return null;
    return `${kind === 'text' ? 'Text' : 'Audio'}: ${Math.max(0, value.limit - (value.used || 0) - (value.reserved || 0))} left (${value.used || 0} used, ${value.reserved || 0} pending${Number.isFinite(value.attemptLimit) ? `; ${value.attempts || 0}/${value.attemptLimit} attempts` : ''})`;
  };
  const parts = ['text', 'audio'].map(describe).filter(Boolean);
  const unavailable = config.translationEnabled !== true || config.sampleOnly === true;
  const availability = !checked ? 'Checking translation availability…' : unavailable
    ? 'Cloud translation is currently unavailable. Try the fixed examples without signing in.'
    : !me.signedIn && me.oidcReady
      ? 'Try the fixed examples, or sign in to translate your own message.'
      : !me.signedIn
        ? 'Google sign-in is currently unavailable. Try the fixed examples without signing in.'
        : 'Cloud translation is unavailable. Fixed examples still work.';
  $('#usage').textContent = me.signedIn && parts.length ? parts.join(' · ') : availability;
  $('#availability').hidden = cloudReady();
  $('#availability').textContent = availability;
  controls();
}
function stopSpeech() { ++speechEpoch; window.speechSynthesis?.cancel(); speaking = false; }
function discardResult() {
  clearTimeout(expiryTimer); expiryTimer = null; stopSpeech(); result = null;
  $('#output').value = ''; $('#result-type').textContent = 'No result yet'; $('#result-note').textContent = 'Review the meaning and tone before you share.';
  $('#shown-translation').textContent = ''; $('#manual-select').hidden = true;
  if ($('#show-dialog').open) $('#show-dialog').close();
}
function discardAudio() {
  if (wav) wav.fill(0); wav = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null;
  $('#record-preview').pause(); $('#record-preview').removeAttribute('src'); $('#record-preview').load(); $('#record-preview').hidden = true;
}
function invalidate({audio = true} = {}) {
  ++epoch; controller?.abort(); controller = null; busy = false; retry = null; discardResult();
  if (audio) discardAudio(); controls();
}
function setResult(original, translated, kind, elapsedMs, expiresAt) {
  if (typeof original !== 'string' || typeof translated !== 'string' || !original.trim() || !translated.trim() || original.length > 10000 || translated.length > 20000) throw new Error('The service returned an invalid result. Please retry.');
  result = {original, translated}; $('#source').value = original; $('#output').value = translated;
  $('#result-type').textContent = kind === 'sample' ? 'Fixed example' : 'Cloud result';
  $('#result-note').textContent = kind === 'sample' ? 'Fixed example pair. Human native-speaker review is pending.' : 'Check names, dates, numbers and tone before sharing.';
  if (kind === 'sample') status('Fixed example loaded. No AI request was made.');
  else status(`Translation ready${Number.isFinite(elapsedMs) ? ` · ${(elapsedMs / 1000).toFixed(1)}s processing` : ''}. Check the meaning before sharing.`);
  if (expiresAt) {
    const expires = typeof expiresAt === 'number' ? (expiresAt < 1e12 ? expiresAt * 1000 : expiresAt) : Date.parse(expiresAt);
    if (Number.isFinite(expires)) expiryTimer = setTimeout(() => { invalidate(); status('This result expired. Enter a new message or load an example.'); }, Math.max(0, Math.min(expires - Date.now(), 2147483647)));
  }
  controls();
}
const recorder = new MessageRecorder({
  onTick: (remaining) => { $('#record-timer').textContent = `${remaining} seconds remaining`; controls(); },
  onComplete: (bytes) => {
    recording = false; discardAudio(); wav = bytes; retry = null;
    audioUrl = URL.createObjectURL(new Blob([wav], {type: 'audio/wav'})); $('#record-preview').src = audioUrl; $('#record-preview').hidden = false;
    $('#record-timer').textContent = `${((wav.length - 44) / 32000).toFixed(1)} seconds recorded`;
    status('Recording ready. Check the preview, then press Translate recording.'); controls();
  },
  onError: (error) => { recording = false; status(error.message, true); $('#record-timer').textContent = '30 seconds maximum'; controls(); },
});
function clear() {
  invalidate(); recording = false; recorder.cancel(); $('#source').value = '';
  $('#cloud-consent').checked = false; $('#record-consent').checked = false; $('#record-timer').textContent = '30 seconds maximum';
  status('Original, translation and recording cleared from this page.'); controls();
}

async function translate() {
  if (busy || recording) return;
  if (!checked || config.translationEnabled !== true || config.sampleOnly === true) { status('Cloud translation is currently unavailable. Try the fixed examples without signing in.', true); return; }
  if (!me.signedIn && !me.oidcReady) { status('Google sign-in is currently unavailable. Try the fixed examples without signing in.', true); return; }
  if (!me.signedIn) { status('Sign in to translate your own message. You can still use the fixed examples.', true); return; }
  if (!cloudReady()) { status('Cloud translation is unavailable. Fixed examples still work.', true); return; }
  const text = $('#source').value.trim(), direction = $('#direction').value, purpose = $('#purpose').value;
  if (!wav && (!text || [...$('#source').value].length > 1000)) { status('Enter a message with 1–1,000 characters.', true); $('#source').focus(); return; }
  if (wav && (!$('#cloud-consent').checked || !$('#record-consent').checked)) { status('Confirm cloud processing and recording permission first.', true); return; }
  const audio = Boolean(wav);
  const key = JSON.stringify([audio ? 'audio' : 'text', direction, purpose, audio ? wav.length : text]);
  if (!retry || retry.key !== key) retry = {key, id: `${Date.now()}-${crypto.randomUUID()}`};
  const requestId = retry.id, currentEpoch = ++epoch;
  discardResult(); busy = true; controls(); status('Translating your message… Please wait a moment.');
  controller = new AbortController(); const currentController = controller; let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; currentController.abort(); }, 17000);
  try {
    const headers = {'X-CSRF-Token': me.csrfToken || ''};
    let body;
    if (audio) {
      headers['Content-Type'] = 'audio/wav'; headers['X-Request-Id'] = requestId;
      headers['X-Translation-Direction'] = direction; headers['X-Translation-Purpose'] = purpose; body = wav;
    } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify({request_id: requestId, direction, purpose, text}); }
    const response = await fetch(audio ? '/api/translate/audio' : '/api/translate/text', {method: 'POST', headers, body, signal: currentController.signal});
    let data; try { data = await response.json(); } catch { throw new Error('The service response could not be read. Please retry.'); }
    if (currentEpoch !== epoch) return;
    if (!response.ok) {
      if (response.status === 401) { me.signedIn = false; usage(); throw new Error('Your session has ended. Sign in to continue.'); }
      if (response.status === 429) throw new Error('Your translation or attempt limit has been reached. Check your account for remaining access.');
      throw new Error(typeof data.error === 'string' ? data.error : 'Translation failed. Please retry.');
    }
    if (data.request_id !== requestId || data.state !== 'completed') throw new Error('The service returned an incomplete result. Retry this request.');
    setResult(data.original, data.translated, 'cloud', data.elapsedMs, data.expires_at);
    retry.completed = true;
    if (data.usage) { me.usage = data.usage; usage(); }
  } catch (error) {
    if (currentEpoch !== epoch) return;
    status(timedOut ? 'Translation timed out. You can retry this request.' : error.name === 'AbortError' ? 'The request was interrupted. Please retry.' : error.message, true);
  } finally {
    clearTimeout(timer);
    if (currentEpoch === epoch) { busy = false; controller = null; controls(); }
  }
}

function loadExample([type, id, english, japanese]) {
  invalidate(); recorder.cancel(); recording = false; $('#purpose').value = type;
  setResult($('#direction').value === 'en-ja' ? english : japanese, $('#direction').value === 'en-ja' ? japanese : english, 'sample');
}
for (const [category, heading] of [['schedule', 'Scheduling'], ['request', 'Confirming a request'], ['delivery', 'Delivery updates']]) {
  const group = document.createElement('section'); group.className = 'sample-group';
  const title = document.createElement('h3'); title.textContent = heading; group.append(title);
  for (const [type, id, english, japanese] of samples.filter((sample) => sample[0] === category)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'sample-button'; button.dataset.sample = id; button.textContent = english;
    button.addEventListener('click', () => loadExample([type, id, english, japanese])); group.append(button);
  }
  $('#samples').append(group);
}
const linkedExample = samples.find(sample => sample[1] === new URLSearchParams(location.search).get('example'));
if (linkedExample) loadExample(linkedExample);
$('#source').addEventListener('input', () => { invalidate(); if (recording) { recorder.cancel(); recording = false; } status('Message changed. Translate again to get a matching result.'); controls(); });
for (const selector of ['#direction', '#purpose']) $(selector).addEventListener('change', () => { invalidate(); recorder.cancel(); recording = false; status('Settings changed. Translate again or choose an example.'); controls(); });
$('#source').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); translate(); } });
$('#translate').addEventListener('click', translate); $('#clear').addEventListener('click', clear);
const selectForCopy = () => { $('#output').focus(); $('#output').select(); $('#manual-select').hidden = false; status('Translation selected. Use your device’s Copy command to copy it.'); };
$('#copy').addEventListener('click', async () => {
  if (!result) return; const text = result.translated, currentEpoch = epoch;
  try { await navigator.clipboard.writeText(text); if (currentEpoch === epoch && result) status('Translation copied.'); }
  catch { if (currentEpoch === epoch && result) { selectForCopy(); status('Automatic copy is unavailable. The translation is selected; use your device’s Copy command.', true); } }
});
$('#manual-select').addEventListener('click', selectForCopy);
$('#show').addEventListener('click', () => { if (!result) return; $('#shown-translation').textContent = result.translated; $('#shown-translation').lang = targetLanguage(); $('#show-dialog').showModal(); });
$('#close-dialog').addEventListener('click', () => $('#show-dialog').close());
$('#speak').addEventListener('click', () => {
  const voice = targetVoice(); if (!result || !voice) return;
  stopSpeech(); const currentEpoch = epoch, currentSpeechEpoch = speechEpoch; const utterance = new SpeechSynthesisUtterance(result.translated); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 1;
  speaking = true; controls();
  utterance.onend = () => { if (currentEpoch === epoch && currentSpeechEpoch === speechEpoch) { speaking = false; controls(); } };
  utterance.onerror = () => { if (currentEpoch === epoch && currentSpeechEpoch === speechEpoch) { speaking = false; status('Read aloud could not start. Copy or Show is still available.', true); controls(); } };
  try { window.speechSynthesis.speak(utterance); } catch { speaking = false; status('Read aloud is unavailable. Copy or Show is still available.', true); controls(); }
});
$('#stop-speech').addEventListener('click', () => { stopSpeech(); controls(); });
window.speechSynthesis?.addEventListener('voiceschanged', controls);
for (const selector of ['#cloud-consent', '#record-consent']) $(selector).addEventListener('change', controls);
$('#record').addEventListener('click', async () => {
  if (!cloudReady() || busy || recording || !$('#cloud-consent').checked || !$('#record-consent').checked) return;
  invalidate(); recording = true; controls(); status('Requesting microphone access…');
  const currentEpoch = epoch;
  try { await recorder.start(); if (currentEpoch !== epoch) return; controls(); if (recorder.state === 'recording') status('Recording. Stop when finished, or wait for the 30-second limit.'); }
  catch (error) { if (currentEpoch === epoch) { recording = false; status(error.message, true); controls(); } }
});
$('#stop-recording').addEventListener('click', async () => { try { await recorder.stop(); } catch (error) { recording = false; status(error.message, true); controls(); } });
window.addEventListener('pagehide', clear);
controls();
Promise.all([fetch('/api/me').then((response) => { if (!response.ok) throw new Error(); return response.json(); }), fetch('/api/config').then((response) => { if (!response.ok) throw new Error(); return response.json(); })])
  .then(([account, settings]) => { me = account; config = settings; checked = true; usage(); })
  .catch(() => { checked = true; usage(); $('#availability').textContent = 'Account access could not be checked. Try a fixed example or reload.'; });
