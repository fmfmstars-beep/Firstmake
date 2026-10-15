import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ja = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const en = await readFile(new URL('../en.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build-static.mjs', import.meta.url), 'utf8');

test('both language pages declare their language', () => {
  assert.match(ja, /<html lang="ja">/);
  assert.match(en, /<html lang="en">/);
});
test('language navigation is reciprocal', () => {
  assert.match(ja, /href="\/en\.html"[^>]*lang="en"/);
  assert.match(en, /href="\/"[^>]*lang="ja"/);
});
test('English version is clearly a fictional demo', () => {
  assert.match(en, /fictional caf[eé]/i);
  assert.match(en, /cannot accept orders, inquiries, or reservations/i);
});
test('both pages specify localized canonical URLs', () => {
  assert.match(ja, /rel="canonical" href="https:\/\/firstmake\.fmfm-stars\.workers\.dev\/"/);
  assert.match(en, /rel="canonical" href="https:\/\/firstmake\.fmfm-stars\.workers\.dev\/en\.html"/);
});
test('build includes English page in assets and CSP hash inputs', () => {
  assert.match(build, /readFile\(resolve\(root, 'en\.html'\)/);
  assert.match(build, /writeFile\(resolve\(out, 'en\.html'\), englishHtml\)/);
  assert.match(build, /englishHtml\.matchAll/);
});
