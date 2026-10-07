import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import worker from '../src/worker.mjs';

const memo = 'Acmeの納品は10月15日15時です。金額は500 USDです。確認をお願いします。';
const english = 'Delivery for Acme is scheduled for October 15 at 15:00. The amount is 500 USD. Please confirm.';
const requestId = () => `${Date.now()}-${randomUUID()}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function wav(seconds = 2, audible = true) {
  const bytes = new Uint8Array(44 + Math.round(seconds * 16000) * 2), view = new DataView(bytes.buffer);
  const tag = (at, text) => bytes.set(new TextEncoder().encode(text), at);
  tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  if (audible) for (let offset = 44; offset < bytes.length; offset += 2) view.setInt16(offset, Math.sin(offset / 20) * 3000, true);
  return bytes;
}

function setup(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema-mvp.sql', import.meta.url), 'utf8'));
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  let batchQueue = Promise.resolve();
  const DB = {
    prepare(sql) {
      const create = (args = []) => ({
        bind: (...values) => create(values),
        first: async () => db.prepare(sql).get(...args) || null,
        all: async () => ({results: db.prepare(sql).all(...args)}),
        run: async () => ({meta: db.prepare(sql).run(...args)})
      });
      return create();
    },
    batch(statements) {
      const operation = batchQueue.then(async () => {
        db.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          db.exec('COMMIT');
          return results;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      });
      batchQueue = operation.catch(() => {});
      return operation;
    }
  };
  const calls = [];
  const env = {
    DB, QUOTA_SALT: 'local-test-salt', RESULT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    MVP_ENABLED: 'true', MIGRATION_VERIFIED: 'true', SITE_ORIGIN: 'https://phrase.test',
    AI_ENABLED: 'true', AI_PROVIDER: 'cloudflare', TRANSLATION_MODEL: 'translation-test', TRANSCRIPTION_MODEL: 'transcription-test', REPLY_MODEL: 'reply-test',
    AI_INPUT_USD_PER_MILLION: '1', AI_OUTPUT_USD_PER_MILLION: '1', ASR_USD_PER_MINUTE: '1',
    REPLY_INPUT_USD_PER_MILLION: '0.152', REPLY_OUTPUT_USD_PER_MILLION: '0.287',
    PRO_MONTHLY_BUDGET_USD: '10', FREE_MONTHLY_BUDGET_USD: '2', BILLING_ENABLED: 'false',
    AI: {async run(model, input, options) {
      calls.push({model, input, options});
      if (model === 'transcription-test') { await delay(8); return {text: memo}; }
      if (model === 'translation-test') return {translated_text: 'Existing translation result.'};
      await delay(12);
      return {response: JSON.stringify({reply: english}), usage: {completion_tokens: 60}};
    }}
  };
  const users = {};
  for (const [id, token] of [['one', '1'.repeat(64)], ['two', '2'.repeat(64)]]) {
    const hash = createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO accounts(id,recovery_hash,auth_subject,created) VALUES(?,?,?,?)').run(id, `recovery-${id}`, `google-${id}`, 1);
    db.prepare('INSERT INTO sessions(hash,account_id,expires,auth_method) VALUES(?,?,?,?)').run(hash, id, Math.floor(Date.now()/1000) + 3600, 'google');
    users[id] = {cookie: `__Host-phrase_session=${token}`, csrf: createHmac('sha256', env.QUOTA_SALT).update(`phrase-lane-csrf-v1:${hash}`).digest('hex')};
  }
  const request = async (path, {kind = 'text', id = requestId(), text = memo, direction = 'ja-en', audio = wav(), user = 'one', method = 'POST', headers = {}} = {}) => {
    const h = {Origin: env.SITE_ORIGIN, 'Sec-Fetch-Site': 'same-origin', ...user ? {Cookie: users[user].cookie, 'X-CSRF-Token': users[user].csrf} : {}, ...kind === 'audio' ? {'Content-Type': 'audio/wav', 'X-Request-Id': id, 'X-Translation-Direction': direction, 'X-Translation-Purpose': 'general'} : {'Content-Type': 'application/json'}, ...headers};
    const response = await worker.fetch(new Request(`${env.SITE_ORIGIN}${path}`, {method, headers: h, ...['GET', 'HEAD'].includes(method) ? {} : {body: kind === 'audio' ? audio : JSON.stringify({request_id: id, direction, purpose: 'general', text})}}), env, {});
    return {status: response.status, body: await response.json(), headers: response.headers};
  };
  return {db, env, calls, request};
}

test('authenticated audio reply transcribes, drafts and persists encrypted real stage times; replay charges once', async t => {
  const s = setup(t), id = requestId();
  const result = await s.request('/api/reply/audio', {kind: 'audio', id});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.mode, 'reply');
  assert.equal(result.body.original, memo); assert.equal(result.body.translated, english);
  assert.ok(result.body.timings.transcriptionMs >= 5); assert.ok(result.body.timings.generationMs >= 8);
  assert.ok(result.body.timings.totalMs >= result.body.timings.transcriptionMs + result.body.timings.generationMs);
  assert.equal(result.body.elapsedMs, result.body.timings.totalMs);
  assert.equal(result.body.usage.audio.used, 2); assert.equal(result.body.usage.audio.reserved, 0);
  assert.deepEqual(s.calls.map(call => call.model), ['transcription-test', 'reply-test']);
  assert.equal(s.calls[1].input.response_format.type, 'json_object'); assert.equal(s.calls[1].input.max_tokens, 2048);
  assert.equal(s.calls[1].input.messages[1].content, JSON.stringify({japanese_memo: memo}));
  const stored = s.db.prepare('SELECT * FROM ephemeral_results').get();
  assert.ok(stored.ciphertext); assert.ok(!JSON.stringify(stored).includes(memo)); assert.ok(!JSON.stringify(stored).includes(english));
  const replay = await s.request('/api/reply/audio', {kind: 'audio', id});
  assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
  assert.deepEqual(replay.body.timings, result.body.timings); assert.equal(replay.body.usage.audio.used, 2); assert.equal(s.calls.length, 2);
  const recovered = await s.request(`/api/requests/${id}`, {method: 'GET'});
  assert.deepEqual(recovered.body.timings, result.body.timings);
  assert.equal((await s.request(`/api/requests/${id}`, {method: 'GET', user: 'two'})).status, 404);
});

test('reply and legacy translation cannot reuse each other’s request IDs; existing translator still works', async t => {
  const s = setup(t), id = requestId();
  const reply = await s.request('/api/reply/text', {id});
  assert.equal(reply.status, 200); assert.equal(reply.body.timings.transcriptionMs, 0);
  assert.equal((await s.request('/api/translate/text', {id})).status, 409);
  const translatedId = requestId(), translated = await s.request('/api/translate/text', {id: translatedId});
  assert.equal(translated.status, 200); assert.equal(translated.body.translated, 'Existing translation result.');
  assert.equal((await s.request('/api/reply/text', {id: translatedId})).status, 409);
  assert.equal(s.calls.length, 2);
});

test('reply API requires the existing session, origin and CSRF checks before providers or quota', async t => {
  const s = setup(t);
  for (const [options, status] of [
    [{user: null}, 401], [{headers: {'X-CSRF-Token': '0'.repeat(64)}}, 403],
    [{headers: {Origin: 'https://attacker.test'}}, 403], [{headers: {'Sec-Fetch-Site': 'cross-site'}}, 403],
    [{direction: 'en-ja'}, 400]
  ]) assert.equal((await s.request('/api/reply/text', options)).status, status);
  assert.equal((await s.request('/api/reply/text', {method: 'GET'})).status, 405);
  assert.equal((await s.request('/api/reply/text?model=other')).status, 400);
  assert.equal(s.calls.length, 0); assert.equal(s.db.prepare('SELECT COUNT(*) n FROM usage_requests').get().n, 0);
});

test('reply readiness does not disable existing translation or expose model secrets', async t => {
  const s = setup(t);
  const check = () => s.request('/api/config', {method: 'GET'});
  assert.equal((await check()).body.replyEnabled, true);
  for (const [key, value] of [['REPLY_MODEL', ''], ['REPLY_INPUT_USD_PER_MILLION', '0'], ['REPLY_OUTPUT_USD_PER_MILLION', undefined]]) {
    const previous = s.env[key]; s.env[key] = value;
    const {body} = await check(); assert.equal(body.replyEnabled, false); assert.equal(body.translationEnabled, true);
    assert.equal((await s.request('/api/reply/text')).status, 503); s.env[key] = previous;
  }
  s.env.AI_API_KEY = 'server-secret-for-test';
  assert.ok(!JSON.stringify((await check()).body).includes(s.env.AI_API_KEY));
  assert.equal(s.calls.length, 0);
});

test('audio boundaries are based on WAV contents; silent, malformed, oversized and out-of-range audio cannot consume allowance', async t => {
  const s = setup(t);
  const malformed = wav(); new DataView(malformed.buffer).setUint32(24, 48000, true);
  for (const [audio, status] of [[wav(2, false), 400], [wav(1.9), 400], [wav(30.1), 400], [malformed, 400], [new Uint8Array(1048577), 413]]) {
    assert.equal((await s.request('/api/reply/audio', {kind: 'audio', audio})).status, status);
  }
  assert.equal(s.calls.length, 0); assert.equal(s.db.prepare('SELECT COUNT(*) n FROM usage_requests').get().n, 0);
  const result = await s.request('/api/reply/audio', {kind: 'audio', audio: wav(30)});
  assert.equal(result.status, 200); assert.equal(result.body.usage.audio.used, 30);
});

test('incomplete or empty replies and ASR errors release allowance and never save a partial result', async t => {
  const s = setup(t);
  for (const output of [
    {response: '{"reply":"Truncated'}, {response: '{"reply":""}'},
    {response: JSON.stringify({reply: english}), usage: {completion_tokens: 2048}},
    {response: JSON.stringify({reply: english}), finish_reason: 'length'},
    {response: JSON.stringify({reply: english, extra: 'not requested'})}
  ]) {
    s.env.AI.run = async () => output;
    const {status, body} = await s.request('/api/reply/text'); assert.equal(status, 502);
    assert.ok(body.request_id); assert.ok(!JSON.stringify(body).includes(english));
  }
  s.env.AI.run = async () => ({text: ''});
  assert.equal((await s.request('/api/reply/audio', {kind: 'audio'})).status, 502);
  const quota = s.db.prepare('SELECT * FROM quota_periods').get();
  assert.equal(quota.text_used, 0); assert.equal(quota.text_reserved, 0); assert.equal(quota.audio_used, 0); assert.equal(quota.audio_reserved, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ephemeral_results').get().n, 0);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM usage_requests WHERE state='released'").get().n, 6);
});

test('timeout releases allowance and a late provider response cannot complete or start reply generation', async t => {
  const s = setup(t); s.env.PROCESSING_TIMEOUT_MS = '5';
  const {status} = await s.request('/api/reply/audio', {kind: 'audio'}); assert.equal(status, 504);
  await delay(25);
  assert.deepEqual(s.calls.map(call => call.model), ['transcription-test']);
  assert.equal(s.db.prepare('SELECT state FROM usage_requests').get().state, 'released');
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ephemeral_results').get().n, 0);
  assert.equal(s.db.prepare('SELECT audio_reserved FROM quota_periods').get().audio_reserved, 0);
});

test('simultaneous reply requests share the existing one-active-request limit', async t => {
  const s = setup(t);
  const results = await Promise.all([s.request('/api/reply/text'), s.request('/api/reply/text')]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 429]);
  assert.equal(s.calls.length, 1); assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ephemeral_results').get().n, 1);
});

test('reply generation honors existing exhausted usage and server budget before invoking AI', async t => {
  const s = setup(t);
  await s.request('/api/me', {method: 'GET'});
  s.db.prepare('UPDATE quota_periods SET text_used=text_limit').run();
  s.db.prepare('UPDATE free_abuse_ledger SET text_used=5000').run();
  assert.equal((await s.request('/api/reply/text')).status, 422);
  s.db.prepare('UPDATE quota_periods SET text_used=0').run(); s.db.prepare('UPDATE free_abuse_ledger SET text_used=0').run();
  s.env.FREE_MONTHLY_BUDGET_USD = '0.000001';
  assert.equal((await s.request('/api/reply/text')).status, 503); assert.equal(s.calls.length, 0);
});

test('OpenAI uses only the server secret, preserves one retry and rejects truncated output', async t => {
  const s = setup(t), calls = [], originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  s.env.AI_PROVIDER = 'openai'; s.env.AI_API_KEY = 'server-only-fixture';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer server-only-fixture');
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return Response.json({error: {}}, {status: 503});
    return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify({reply: english})}}]});
  };
  const result = await s.request('/api/reply/text'); assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(calls.length, 2); assert.equal(calls[0].model, 'reply-test'); assert.equal(calls[0].max_completion_tokens, 2048);
  assert.equal(result.body.usage.text.used, [...memo].length); assert.equal(result.body.usage.text.attempts, 2);
  assert.equal(s.db.prepare('SELECT retry_count FROM usage_requests').get().retry_count, 1);
  assert.ok(!JSON.stringify(result.body).includes(s.env.AI_API_KEY));
  globalThis.fetch = async () => Response.json({choices: [{finish_reason: 'length', message: {content: JSON.stringify({reply: english})}}]});
  assert.equal((await s.request('/api/reply/text')).status, 502);
});

test('OpenAI audio uploads validated WAV with Japanese transcription and keeps the key on server requests', async t => {
  const s = setup(t), calls = [], originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  s.env.AI_PROVIDER = 'openai'; s.env.AI_API_KEY = 'server-only-audio-fixture';
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer server-only-audio-fixture');
    calls.push(url);
    if (url === 'https://api.openai.com/v1/audio/transcriptions') {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('language'), 'ja'); assert.equal(options.body.get('model'), 'transcription-test');
      const file = options.body.get('file'); assert.equal(file.type, 'audio/wav'); assert.equal(file.size, wav().byteLength);
      return Response.json({text: memo});
    }
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify({reply: english})}}]});
  };
  const result = await s.request('/api/reply/audio', {kind: 'audio'});
  assert.equal(result.status, 200); assert.equal(result.body.original, memo); assert.equal(result.body.translated, english);
  assert.equal(calls.length, 2); assert.ok(!JSON.stringify(result.body).includes(s.env.AI_API_KEY));
});

test('dedicated Whisper turbo uses Japanese base64 transcription and its own price while existing audio translation is unchanged', async t => {
  const s = setup(t), audio = wav(), calls = [];
  s.env.REPLY_TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo';
  s.env.REPLY_ASR_USD_PER_MINUTE = '0.000513';
  s.env.AI.run = async (model, input, options) => {
    calls.push({model, input, options});
    if (model === '@cf/openai/whisper-large-v3-turbo') {
      assert.equal(typeof input.audio, 'string'); assert.deepEqual(new Uint8Array(Buffer.from(input.audio, 'base64')), audio);
      assert.equal(input.language, 'ja'); assert.equal(input.task, 'transcribe'); assert.equal(input.vad_filter, true);
      assert.ok(options.signal instanceof AbortSignal);
      return {text: memo};
    }
    if (model === 'transcription-test') { assert.ok(Array.isArray(input.audio)); return {text: memo}; }
    if (model === 'translation-test') return {translated_text: 'Existing translation result.'};
    return {response: JSON.stringify({reply: english})};
  };
  const id = requestId(), result = await s.request('/api/reply/audio', {kind: 'audio', id, audio});
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.original, memo);
  const row = s.db.prepare('SELECT cost_spent FROM usage_requests WHERE request_id=?').get(id);
  const expected = Math.ceil((5000 * 0.152 / 1e6 + 2048 * 0.287 / 1e6 + 2 / 60 * 0.000513) * 1e6);
  assert.equal(row.cost_spent, expected);
  const translated = await s.request('/api/translate/audio', {kind: 'audio', audio});
  assert.equal(translated.status, 200); assert.equal(translated.body.translated, 'Existing translation result.');
  assert.deepEqual(calls.map(call => call.model), ['@cf/openai/whisper-large-v3-turbo', 'reply-test', 'transcription-test', 'translation-test']);
});

test('a separate reply transcription model requires its own positive price and leaves translation enabled', async t => {
  const s = setup(t); s.env.REPLY_TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo';
  for (const value of [undefined, '', '0', '-1', 'Infinity']) {
    s.env.REPLY_ASR_USD_PER_MINUTE = value;
    const {body} = await s.request('/api/config', {method: 'GET'});
    assert.equal(body.replyEnabled, false); assert.equal(body.translationEnabled, true);
    assert.equal((await s.request('/api/reply/audio', {kind: 'audio'})).status, 503);
  }
  s.env.REPLY_ASR_USD_PER_MINUTE = '0.000513';
  assert.equal((await s.request('/api/config', {method: 'GET'})).body.replyEnabled, true);
  assert.equal(s.calls.length, 0); assert.equal(s.db.prepare('SELECT COUNT(*) n FROM usage_requests').get().n, 0);
});

test('OpenAI can select a dedicated reply ASR model without changing the translation transcription model', async t => {
  const s = setup(t), originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  s.env.AI_PROVIDER = 'openai'; s.env.AI_API_KEY = 'server-only-fixture';
  s.env.REPLY_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'; s.env.REPLY_ASR_USD_PER_MINUTE = '0.003';
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/audio/transcriptions')) {
      assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe'); assert.equal(options.body.get('language'), 'ja');
      return Response.json({text: memo});
    }
    return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify({reply: english})}}]});
  };
  assert.equal((await s.request('/api/reply/audio', {kind: 'audio'})).status, 200);
  assert.equal(s.env.TRANSCRIPTION_MODEL, 'transcription-test');
});

test('Cloudflare 70B structured response parses the completed raw chat choice and rejects incomplete choices', async t => {
  const s = setup(t);
  s.env.REPLY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  s.env.REPLY_INPUT_USD_PER_MILLION = '0.293'; s.env.REPLY_OUTPUT_USD_PER_MILLION = '2.253';
  let choice = {finish_reason: 'stop', message: {content: JSON.stringify({reply: english})}};
  s.env.AI.run = async (model, input) => {
    assert.equal(model, s.env.REPLY_MODEL);
    assert.match(input.messages[0].content, /proposed NEW date\/time, not the current appointment/);
    return {response: {reply: 'Use the raw completed choice instead of this parsed object.'}, choices: [choice], usage: {completion_tokens: 60}};
  };
  const id = requestId(), result = await s.request('/api/reply/text', {id});
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.translated, english);
  assert.equal(s.db.prepare('SELECT cost_spent FROM usage_requests WHERE request_id=?').get(id).cost_spent, Math.ceil(5000 * 0.293 + 2048 * 2.253));
  for (const invalid of [
    {finish_reason: 'length', message: {content: JSON.stringify({reply: english})}},
    {message: {content: JSON.stringify({reply: english})}},
    {finish_reason: 'stop', message: {content: '{"reply":"Truncated'}},
    {finish_reason: 'stop', message: {content: JSON.stringify({reply: english}), tool_calls: [{type: 'function'}]}}
  ]) {
    choice = invalid;
    assert.equal((await s.request('/api/reply/text')).status, 502);
  }
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ephemeral_results').get().n, 1);
});
