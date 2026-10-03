import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson, parseJson, summarize, MAX_BYTES, MAX_DEPTH } from '../public/core.mjs';

test('formats object with two, four spaces and tabs', () => {
  assert.equal(formatJson('{"a":1}').output, '{\n  "a": 1\n}');
  assert.equal(formatJson('{"a":1}', { indent: '4' }).output, '{\n    "a": 1\n}');
  assert.equal(formatJson('{"a":1}', { indent: 'tab' }).output, '{\n\t"a": 1\n}');
});
test('minifies nested structures without reordering arrays', () => {
  assert.equal(formatJson(' {"b": [3, 1, {"x": false}], "a": null} ', { minify: true }).output, '{"b":[3,1,{"x":false}],"a":null}');
});
test('sorts object keys recursively using a deterministic code-unit order', () => {
  assert.equal(formatJson('{"z":{"b":1,"a":2},"a":[{"y":0,"b":3}]}', { sortKeys: true, minify: true }).output, '{"a":[{"b":3,"y":0}],"z":{"a":2,"b":1}}');
});
test('rejects unsafe integer tokens before any rounding', () => {
  for (const input of ['9007199254740992', '-9007199254740993', '9.007199254740993e15', '9007199254740991.1', '1e100000']) {
    assert.throws(() => formatJson(input), /safe range/);
  }
  assert.equal(formatJson('9007199254740991').output, '9007199254740991');
  assert.equal(formatJson('"9007199254740993"').output, '"9007199254740993"');
});
test('preserves source decimal and exponent spellings including underflow values', () => {
  assert.equal(formatJson('[0.1234567890123456789,1e-500,-0,1.00]', { minify: true }).output, '[0.1234567890123456789,1e-500,-0,1.00]');
});
test('rejects duplicate keys even when escaped or nested', () => {
  assert.throws(() => parseJson('{"a":1,"\\u0061":2}'), /Duplicate object key/);
  assert.throws(() => parseJson('{"x":{"same":1,"same":2}}'), /Duplicate object key/);
  assert.doesNotThrow(() => parseJson('{"x":{"same":1},"y":{"same":2}}'));
});
test('supports escaped quotes, Unicode, null and scalar root values', () => {
  const input = '{"日本語":"こんにちは 🌎","quote":"a\\\"b","line":"a\\nb"}';
  assert.deepEqual(JSON.parse(formatJson(input).output), JSON.parse(input));
  assert.equal(formatJson('false').output, 'false');
  assert.equal(formatJson('null').output, 'null');
});
test('reports invalid JSON with line and column', () => {
  assert.throws(() => parseJson('{\n  "a": 1,\n}'), /line 3, column 1/);
  for (const text of ['', '{a:1}', '[1,]', '01', '+2', 'NaN', 'true false', '"bad\\x"', '"bad\nline"']) {
    assert.throws(() => parseJson(text));
  }
});
test('summarizes values, object keys and root-relative depth', () => {
  assert.deepEqual(summarize(parseJson('{"a":[1,true,null],"b":{"c":"x"}}')), {
    rootType: 'object', values: 7, keys: 3, objects: 2, arrays: 1, strings: 1, numbers: 1, booleans: 1, nulls: 1, maxDepth: 2,
  });
});
test('enforces UTF-8 byte and nesting limits', () => {
  assert.throws(() => parseJson('"' + 'a'.repeat(MAX_BYTES) + '"'), /2 MiB/);
  assert.throws(() => parseJson('['.repeat(MAX_DEPTH + 1) + '0' + ']'.repeat(MAX_DEPTH + 1)), /nesting limit/);
  assert.doesNotThrow(() => parseJson('['.repeat(MAX_DEPTH) + '0' + ']'.repeat(MAX_DEPTH)));
});
test('preserves dangerous-looking object keys as ordinary JSON data', () => {
  assert.equal(formatJson('{"__proto__":{"polluted":true},"constructor":1}', { minify: true }).output, '{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal({}.polluted, undefined);
});
test('stops excessive pretty-output expansion before building the whole output', () => {
  const input = '['.repeat(100) + '[' + '0,'.repeat(22000) + '0]' + ']'.repeat(100);
  assert.throws(() => formatJson(input, { indent: '4' }), /output would exceed 8 MiB/);
  assert.equal(formatJson(input, { minify: true }).output, input);
});
