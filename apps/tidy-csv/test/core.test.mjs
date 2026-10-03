import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, serializeDelimited, cleanRows, cleanDelimited, protectFormula, MAX_INPUT_BYTES } from '../public/core.mjs';

test('parses quoted commas and escaped quotes', () => {
  assert.deepEqual(parseDelimited('name,note\r\nAda,"Hello, ""friend"""\r\n'), [['name', 'note'], ['Ada', 'Hello, "friend"']]);
});
test('preserves CRLF inside a quoted multiline field', () => {
  assert.deepEqual(parseDelimited('a,"line 1\r\nline 2",z'), [['a', 'line 1\r\nline 2', 'z']]);
});
test('supports TSV, semicolon, pipe, BOM, and empty trailing columns', () => {
  assert.deepEqual(parseDelimited('\ufeffa\tb\t\n', '\t'), [['a', 'b', '']]);
  assert.deepEqual(parseDelimited('a;"b;c"', ';'), [['a', 'b;c']]);
  assert.deepEqual(parseDelimited('a|b', '|'), [['a', 'b']]);
});
test('rejects unclosed quotes, unquoted quotes, and trailing characters after quotes', () => {
  assert.throws(() => parseDelimited('a,"broken'), /Unclosed quoted field/u);
  assert.throws(() => parseDelimited('a,b"c'), /inside an unquoted/u);
  assert.throws(() => parseDelimited('a,"b" c'), /Unexpected text/u);
});
test('roundtrips delimiters, empty values, quotes, and multiline strings', () => {
  const rows = [['name', 'value', ''], ['a,b', 'a"b', '\n\r\nx'], ['=', '|;\t', '']];
  for (const delimiter of [',', '\t', ';', '|']) assert.deepEqual(parseDelimited(serializeDelimited(rows, delimiter), delimiter), rows);
});
test('retained single-cell empty records survive serialization and parsing', () => {
  for (const rows of [[['']], [['a'], ['']], [[''], [''], ['a'], ['']]]) {
    assert.deepEqual(parseDelimited(serializeDelimited(rows)), rows);
  }
  const cleaned = cleanDelimited('a\n\n', { hasHeader: false, removeBlank: false, formulaProtection: false });
  assert.equal(cleaned.output, 'a\r\n""');
  assert.deepEqual(parseDelimited(cleaned.output), [['a'], ['']]);
});
test('error line numbers count consecutive CRLF and blank records', () => {
  assert.throws(() => parseDelimited('a\r\n\r\n"b"x'), /line 3, column 4/u);
});
test('preserves header and removes exact data duplicates after trimming', () => {
  const result = cleanRows([[' label '], ['label'], [' label '], [''], ['  ']], { deduplicate: true, formulaProtection: false });
  assert.deepEqual(result.rows, [['label'], ['label']]);
  assert.deepEqual(result.stats, { inputRows: 5, outputRows: 2, blankRowsRemoved: 2, duplicatesRemoved: 1, trimmedCells: 3, protectedCells: 0 });
});
test('deduplication compares complete rows, preserves order, and works without a header', () => {
  const { rows } = cleanRows([['a', 'bc'], ['ab', 'c'], ['a', 'bc'], ['A', 'bc']], { hasHeader: false, deduplicate: true, formulaProtection: false });
  assert.deepEqual(rows, [['a', 'bc'], ['ab', 'c'], ['A', 'bc']]);
});
test('formula protection covers dangerous prefixes and does not double-prefix apostrophes', () => {
  for (const value of ['=SUM(A1)', '+12', '-12', '@A1', '  =A1', '\ttext', '\rtext']) assert.equal(protectFormula(value), `'${value}`);
  assert.equal(protectFormula("'=SUM(A1)"), "'=SUM(A1)");
  assert.equal(protectFormula('plain text'), 'plain text');
});
test('formula protection can be disabled and blank removal is optional', () => {
  assert.deepEqual(cleanRows([['=1'], ['']], { hasHeader: false, formulaProtection: false, removeBlank: false }).rows, [['=1'], ['']]);
});
test('conversion preserves flexible row widths instead of silently padding or discarding cells', () => {
  const result = cleanDelimited('a;b;c\nx;y\n1;2;3;4', { inputDelimiter: ';', outputDelimiter: '\t', formulaProtection: false });
  assert.equal(result.output, 'a\tb\tc\r\nx\ty\r\n1\t2\t3\t4');
});
test('handles empty input, empty quoted values, blank lines, and trailing newlines', () => {
  assert.deepEqual(parseDelimited(''), []);
  assert.deepEqual(parseDelimited('""'), [['']]);
  assert.deepEqual(parseDelimited('\n\n'), [[''], ['']]);
  assert.deepEqual(parseDelimited('a\n'), [['a']]);
});
test('enforces the UTF-8 byte limit and known delimiter set', () => {
  assert.throws(() => parseDelimited('x'.repeat(MAX_INPUT_BYTES + 1)), /exceeds/u);
  assert.throws(() => parseDelimited('💡'.repeat(MAX_INPUT_BYTES / 4 + 1)), /exceeds/u);
  assert.throws(() => parseDelimited('a:b', ':'), /Choose comma/u);
});
