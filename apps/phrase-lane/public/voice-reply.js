import {MessageRecorder} from './recording.js';

const $ = (selector) => document.querySelector(selector);
let me = {signedIn: false}, config = {}, checked = false, accessFailed = false;
let epoch = 0, busy = false, recording = false, controller = null;
let result = null, retry = null, expiryTimer = null, recordingSeconds = null;
const seconds = (milliseconds) => `${(milliseconds / 1000).toFixed(2)} 秒`;
const validTime = (value) => Number.isFinite(value) && value >= 0;
const ready = () => checked && !accessFailed && me.signedIn === true && me.serviceReady === true && config.replyEnabled === true && config.sampleOnly !== true;
function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function allowance(kind, amount = kind === 'audio' ? 2 : 1) {
  const value = me.usage?.[kind];
  if (!value || !Number.isFinite(value.limit)) return true;
  const daily = kind === 'audio' && me.plan !== 'pro' ? me.usage?.dailyAudio : null;
  return value.limit - (value.used || 0) - (value.reserved || 0) >= amount
    && (!Number.isFinite(value.attemptLimit) || (value.attempts || 0) < value.attemptLimit)
    && (!daily || !Number.isFinite(daily.limit) || daily.limit - (daily.used || 0) - (daily.reserved || 0) >= amount);
}
function controls() {
  const count = [...$('#source').value].length;
  $('#count').textContent = `${count.toLocaleString()} / 1,000文字`;
  $('#source').disabled = recording;
  $('#record').hidden = recording;
  $('#record').disabled = !ready() || busy || !allowance('audio') || !MessageRecorder.supported() || !$('#cloud-consent').checked || !$('#record-consent').checked;
  $('#stop-recording').hidden = !recording;
  $('#stop-recording').disabled = !recording || recorder.state !== 'recording';
  $('#cancel').hidden = !recording && !busy;
  $('#generate').disabled = !ready() || busy || recording || !$('#source').value.trim() || count > 1000 || (!allowance('text', [...$('#source').value.trim()].length) && retry?.kind !== 'text');
  $('#generate').textContent = busy ? '返信を作成中…' : result ? '原文から返信を作り直す ↗' : '入力したメモから返信を作る ↗';
  $('#retry').hidden = !retry || busy || recording;
  $('#retry').disabled = !ready() || (retry?.kind === 'audio' && (!$('#cloud-consent').checked || !$('#record-consent').checked));
  $('#retry').textContent = retry?.kind === 'audio' ? '同じ録音を再試行' : '同じメモを再試行';
  $('#copy').disabled = !result || busy || recording;
  $('.voice-panel').dataset.recording = String(recording && recorder.state === 'recording');
}
function usage() {
  $('#plan-label').textContent = !checked ? '利用状況を確認中' : !me.signedIn ? '固定例を利用可能' : me.plan === 'pro' ? 'Pro プラン' : '無料プラン';
  $('#account-link').textContent = !me.signedIn && me.oidcReady ? 'ログイン' : 'アカウント';
  let availability = '';
  if (accessFailed) availability = '利用状況を確認できませんでした。ページを再読み込みするか、固定例をお試しください。';
  else if (!checked) availability = 'ログインと返信機能の利用状況を確認しています。';
  else if (config.replyEnabled !== true || config.sampleOnly === true || me.serviceReady !== true) availability = 'この環境ではAI返信機能の準備が完了していません。録音・AI生成は利用できません。固定例の表示とコピーをお試しいただけます。';
  else if (!me.signedIn && !me.oidcReady) availability = 'この環境ではログインの準備が完了していません。固定例の表示とコピーをお試しいただけます。';
  else if (!me.signedIn) availability = '自分のメモから返信を作るには、アカウントからログインしてください。固定例はログインせずに試せます。';
  else if (!MessageRecorder.supported()) availability = 'このブラウザーでは録音できません。日本語のメモを入力して返信を作成できます。';
  $('#availability').hidden = !availability;
  $('#availability').textContent = availability;
  const values = ['audio', 'text'].map((kind) => {
    const value = me.usage?.[kind];
    if (!value || !Number.isFinite(value.limit)) return null;
    const remaining = Math.max(0, value.limit - (value.used || 0) - (value.reserved || 0));
    const unit = kind === 'audio' ? '秒' : '文字';
    return `${kind === 'audio' ? '音声' : 'テキスト'}：残り ${remaining.toLocaleString()} ${unit}${value.reserved ? `（処理中 ${value.reserved} ${unit}）` : ''}${Number.isFinite(value.attemptLimit) ? `・試行 ${value.attempts || 0}/${value.attemptLimit} 回` : ''}`;
  }).filter(Boolean);
  const daily = me.plan !== 'pro' ? me.usage?.dailyAudio : null;
  if (daily && Number.isFinite(daily.limit)) values.push(`本日の音声：残り ${Math.max(0, daily.limit - (daily.used || 0) - (daily.reserved || 0))} 秒`);
  $('#usage').textContent = me.signedIn && values.length ? `${values.join(' ／ ')}。翻訳機能と同じ利用枠を使います。音声は秒未満切り上げ、原文の編集・再生成はテキスト枠を使います。` : 'ログイン後、既存プランの利用枠を表示します。';
  controls();
}
function resetTiming() {
  for (const name of ['total', 'transcription', 'generation', 'recording']) $(`#elapsed-${name}`).textContent = '—';
  $('#total-label').textContent = '停止 → 返信表示';
  $('#timing-kind').textContent = '未計測';
  $('#timing-note').textContent = '停止から表示までの時間には、音声変換・アップロード・サーバー処理・結果の表示を含みます。録音時間は別に表示します。';
}
function discardResult() {
  result = null;
  $('#output').value = '';
  $('#result-type').textContent = 'まだ作成していません';
  $('#result-note').textContent = '送る前に、名前・日付・数字・意図が正しいか確認してください。';
  $('#manual-select').hidden = true;
  resetTiming();
}
function discardRetry() {
  retry?.audio?.fill(0);
  retry = null;
}
function invalidate() {
  ++epoch;
  controller?.abort(); controller = null;
  clearTimeout(expiryTimer); expiryTimer = null;
  busy = false; discardRetry(); discardResult(); recordingSeconds = null;
  controls();
}
function stopAndDiscard(message) {
  invalidate(); recording = false; void recorder.cancel();
  $('#record-timer').textContent = '残り 30 秒';
  status(message); controls();
}
function recordingError(error) {
  const message = error?.message || '';
  if (/permission|denied|NotAllowed/i.test(message)) return 'マイクの使用が許可されませんでした。ブラウザーの設定で許可するか、メモを直接入力してください。';
  if (/at least 2|under 30/i.test(message)) return '2〜30秒で録音してください。短いメモは直接入力することもできます。';
  return '録音を開始・保存できませんでした。マイクの接続を確認するか、メモを直接入力してください。';
}
function handleRecordingError(error) {
  recording = false; busy = false; $('#record-timer').textContent = '残り 30 秒';
  status(recordingError(error), true); controls();
}
const recorder = new MessageRecorder({
  onTick: (remaining) => { $('#record-timer').textContent = `残り ${remaining} 秒`; controls(); },
  onStop: () => { status('録音を停止しました。音声を送信して、文字起こし・返信を作成します。'); controls(); },
  onComplete: (audio, metadata) => {
    recording = false;
    recordingSeconds = metadata.durationSeconds;
    $('#record-timer').textContent = `${recordingSeconds.toFixed(1)} 秒 録音済み`;
    void send({kind: 'audio', audio, requestId: `${Date.now()}-${crypto.randomUUID()}`}, metadata.stoppedAt);
  },
  onError: handleRecordingError,
});
function displayResult(original, translated, kind) {
  if (typeof original !== 'string' || !original.trim() || typeof translated !== 'string' || !translated.trim() || original.length > 10000 || translated.length > 20000) throw new Error('有効な返信が届きませんでした。同じリクエストを再試行してください。');
  result = {original, translated, kind};
  $('#source').value = original; $('#output').value = translated;
  $('#result-type').textContent = kind === 'sample' ? '固定例・AI生成なし' : 'AIで作成した返信';
  $('#result-note').textContent = kind === 'sample' ? '用意済みの例文です。送信前に内容を確認してください。' : '名前・日付・数字・意図を確認してから、コピーして送ってください。';
}
function responseError(response, data, isAudio) {
  const restart = isAudio ? '音声を録音し直すか、メモを直接入力してください。' : '「入力したメモから返信を作る」を押すと、新しいリクエストとして作成できます。';
  if (response.status === 401) { me.signedIn = false; usage(); return 'ログインの有効期限が切れました。アカウントからログインし直してください。'; }
  if (response.status === 403) return 'この操作を確認できませんでした。ページを再読み込みしてログイン状態を確認してください。';
  if (response.status === 429 || response.status === 422) return '利用枠または試行回数の上限に達しました。アカウントで音声秒数・文字数・試行回数をご確認ください。';
  if (response.status === 409) return '同じリクエストを処理中です。少し待ってから再試行してください。';
  if (response.status === 410) return `前回の結果の保存期限が過ぎました。${restart}`;
  if (response.status === 400 || response.status === 413 || response.status === 415) return '音声または文章を処理できませんでした。2〜30秒の日本語を明瞭に話すか、1〜1,000文字のメモを入力してください。';
  if (response.status === 503) return '返信サービスを現在利用できません。しばらく待って再試行するか、固定例をお試しください。';
  if (data?.code === 'timeout' || response.status === 504) return `サーバー処理が時間内に完了しませんでした。${restart}`;
  if (response.status === 502) return `AIによる返信の作成に失敗しました。${restart}`;
  return '返信を作成できませんでした。通信状態を確認して、同じリクエストを再試行してください。';
}
async function send(request, startedAt = performance.now()) {
  if (busy || recording || !ready()) { if (request !== retry) request.audio?.fill(0); return; }
  if (request.kind === 'audio' && (!$('#cloud-consent').checked || !$('#record-consent').checked)) { request.audio?.fill(0); status('音声の送信・録音について確認してから、録音し直してください。', true); controls(); return; }
  const currentEpoch = ++epoch;
  clearTimeout(expiryTimer); expiryTimer = null;
  discardResult(); retry = request; busy = true; controls();
  const isAudio = request.kind === 'audio';
  $('#timing-kind').textContent = '計測中';
  $('#total-label').textContent = request.retried ? '再試行 → 返信表示' : isAudio ? '停止 → 返信表示' : '作成開始 → 返信表示';
  if (isAudio && validTime(recordingSeconds)) $('#elapsed-recording').textContent = `${recordingSeconds.toFixed(2)} 秒`;
  status(isAudio ? '文字起こしと英語の返信を作成しています…' : 'メモから英語の返信を作成しています…');
  controller = new AbortController(); const activeController = controller; let timedOut = false, terminalFailure = false;
  const timer = setTimeout(() => { timedOut = true; activeController.abort(); }, 30000);
  try {
    const headers = {'X-CSRF-Token': me.csrfToken || ''};
    let body;
    if (isAudio) {
      Object.assign(headers, {'Content-Type': 'audio/wav', 'X-Request-Id': request.requestId, 'X-Translation-Direction': 'ja-en', 'X-Translation-Purpose': 'general'});
      body = request.audio;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({request_id: request.requestId, direction: 'ja-en', purpose: 'general', text: request.text});
    }
    const response = await fetch(`/api/reply/${request.kind}`, {method: 'POST', headers, body, signal: activeController.signal});
    let data;
    try { data = await response.json(); } catch { throw new Error('サーバーの応答を読み取れませんでした。同じリクエストを再試行してください。'); }
    if (currentEpoch !== epoch) return;
    if (data.usage) { me.usage = data.usage; usage(); }
    if (!response.ok) {
      terminalFailure = [400, 401, 403, 410, 413, 415, 422, 502, 504].includes(response.status);
      throw new Error(responseError(response, data, isAudio));
    }
    if (['failed', 'released', 'expired'].includes(data.state)) {
      terminalFailure = true;
      throw new Error(isAudio ? '前回の音声処理は終了し、返信を取得できませんでした。音声を録音し直すか、メモを直接入力してください。' : '前回の処理は終了し、返信を取得できませんでした。「入力したメモから返信を作る」で新しいリクエストとして作成できます。');
    }
    if (data.request_id !== request.requestId || data.state !== 'completed' || data.mode !== 'reply') throw new Error('返信の完了を確認できませんでした。同じリクエストを再試行してください。');
    displayResult(data.original, data.translated, 'cloud');
    // Wait until the next frame after inserting the result, including browser presentation work.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (currentEpoch !== epoch) return;
    $('#elapsed-total').textContent = seconds(performance.now() - startedAt);
    $('#elapsed-transcription').textContent = isAudio && validTime(data.timings?.transcriptionMs) ? seconds(data.timings.transcriptionMs) : isAudio ? '未計測' : '対象外';
    $('#elapsed-generation').textContent = validTime(data.timings?.generationMs) ? seconds(data.timings.generationMs) : '未計測';
    $('#timing-kind').textContent = data.replayed === true ? '今回の取得時間・前回の処理内訳' : 'このリクエストの実測';
    if (data.replayed === true) $('#total-label').textContent = '再取得 → 返信表示';
    $('#timing-note').textContent = data.replayed === true
      ? '同じリクエストの保存済み結果を取得しました。合計は今回の取得・表示時間、文字起こしと返信生成は初回処理時の実測です。'
      : `${isAudio ? '停止から表示まで（音声変換・アップロードを含む）' : '作成ボタンを押してから表示まで（通信を含む）'}をこの端末で実測しました。${validTime(data.timings?.totalMs) ? `サーバー受信から返信生成完了：${seconds(data.timings.totalMs)}。` : ''}録音時間は含みません。`;
    request.audio?.fill(0); retry = null;
    const expiresAt = typeof data.expires_at === 'number' ? (data.expires_at < 1e12 ? data.expires_at * 1000 : data.expires_at) : Date.parse(data.expires_at);
    if (Number.isFinite(expiresAt)) expiryTimer = setTimeout(() => { invalidate(); $('#source').value = ''; status('結果の保存期限が過ぎたため、このページの内容を消去しました。'); controls(); }, Math.max(0, Math.min(expiresAt - Date.now(), 2147483647)));
    status(data.replayed === true ? '前回作成した返信を取得しました。内容を確認してコピーしてください。' : '英語の返信ができました。内容を確認してコピーしてください。');
  } catch (error) {
    if (currentEpoch !== epoch) return;
    discardResult();
    if (terminalFailure) discardRetry();
    $('#timing-kind').textContent = '未完了・完了時間は未計測';
    if (isAudio && validTime(recordingSeconds)) $('#elapsed-recording').textContent = `${recordingSeconds.toFixed(2)} 秒`;
    status(timedOut ? '30秒以内に応答が届きませんでした。同じリクエストを再試行できます。' : error.name === 'AbortError' ? '処理を中断しました。同じリクエストを再試行できます。' : error instanceof TypeError ? '通信できませんでした。接続を確認して同じリクエストを再試行してください。' : error.message, true);
    expiryTimer = setTimeout(() => { invalidate(); status('再試行用の録音・リクエストを消去しました。メモを入力するか録音し直してください。'); }, 10 * 60 * 1000);
  } finally {
    clearTimeout(timer);
    if (currentEpoch === epoch) { busy = false; controller = null; controls(); }
  }
}

$('#record').addEventListener('click', async () => {
  if (!ready() || busy || recording || !allowance('audio') || !$('#cloud-consent').checked || !$('#record-consent').checked) return;
  invalidate(); $('#source').value = ''; recording = true;
  const currentEpoch = epoch;
  status('マイクの使用を確認しています。'); controls();
  try {
    await recorder.start();
    if (currentEpoch !== epoch) return;
    if (recorder.state === 'recording') status('録音中です。話し終わったら「停止して返信を作る」を押してください。30秒で自動停止します。');
    controls();
  } catch (error) { if (currentEpoch === epoch) handleRecordingError(error); }
});
$('#stop-recording').addEventListener('click', async () => {
  const currentEpoch = epoch;
  try { await recorder.stop(); } catch (error) { if (currentEpoch === epoch) handleRecordingError(error); }
});
$('#generate').addEventListener('click', () => {
  const text = $('#source').value.trim();
  if (!text || [...$('#source').value].length > 1000 || !ready() || busy || recording) return;
  const request = retry?.kind === 'text' && retry.text === text ? {...retry, retried: true} : {kind: 'text', text, requestId: `${Date.now()}-${crypto.randomUUID()}`};
  discardRetry(); recordingSeconds = null;
  void send(request);
});
$('#retry').addEventListener('click', () => { if (retry && !busy && !recording) void send({...retry, retried: true}); });
$('#source').addEventListener('input', () => { invalidate(); status('メモを編集しました。英語の返信を作り直してください。'); controls(); });
$('#cancel').addEventListener('click', () => stopAndDiscard('録音・返信の作成を取り消しました。すでに送信済みの処理は完了する場合があります。'));
$('#clear').addEventListener('click', () => {
  stopAndDiscard('このページの原文・返信・録音をすべて消去しました。');
  $('#source').value = ''; $('#cloud-consent').checked = false; $('#record-consent').checked = false; controls();
});
for (const selector of ['#cloud-consent', '#record-consent']) $(selector).addEventListener('change', () => {
  if (!$(selector).checked && (recording || (busy && retry?.kind === 'audio'))) stopAndDiscard('録音・音声の送信を取り消しました。すでに送信済みの処理は完了する場合があります。');
  controls();
});
$('#example').addEventListener('click', () => {
  stopAndDiscard('固定例を表示しました。AI生成・速度の実測は行っていません。');
  displayResult('修正ありがとうございます。金曜日までに確認して返信します。', 'Thank you for the revisions. I’ll review them and get back to you by Friday.', 'sample');
  $('#timing-kind').textContent = '未計測・固定例';
  $('#timing-note').textContent = '用意済みの例文を表示しています。音声処理・AI生成・処理時間の実測は行っていません。';
  controls();
});
$('#copy').addEventListener('click', async () => {
  if (!result || busy || recording) return;
  const currentEpoch = epoch, text = result.translated;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    if (currentEpoch === epoch) status('英語の返信をコピーしました。送信前にもう一度内容を確認してください。');
  } catch {
    if (currentEpoch !== epoch) return;
    $('#manual-select').hidden = false;
    $('#output').focus(); $('#output').select();
    status('自動コピーを利用できません。選択した返信文を長押し、または端末のコピー操作でコピーしてください。');
  }
});
$('#manual-select').addEventListener('click', () => { if (result) { $('#output').focus(); $('#output').select(); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && recording) stopAndDiscard('画面を離れたため録音を取り消しました。音声は送信していません。');
});
window.addEventListener('pagehide', () => { stopAndDiscard(''); $('#source').value = ''; });
controls();
Promise.all([
  fetch('/api/me', {cache: 'no-store'}).then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
  fetch('/api/config', {cache: 'no-store'}).then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
]).then(([account, settings]) => { me = account; config = settings; checked = true; usage(); })
  .catch(() => { checked = true; accessFailed = true; usage(); });
