import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, parseTimestamp, formatTimestamp, cleanCaption, convertSubtitles, decodeSubtitleBytes, MAX_INPUT_BYTES } from '../public/core.mjs';

const cue = (start = '00:00:01,000', end = '00:00:03,000', text = 'Hello.\nSecond line.') => `9\n${start} --> ${end}\n${text}\n`;

test('SRT parses multiline text, hours, BOM, and CRLF', () => {
  const source = '\ufeff' + cue('12:15:45,120', '12:15:49,700').replace(/\n/g, '\r\n');
  const parsed = parseSubtitles(source);
  assert.equal(parsed.format, 'srt');
  assert.equal(parsed.cues[0].start, 44145120);
  assert.equal(parsed.cues[0].text, 'Hello.\nSecond line.');
});

test('output renumbers nonconsecutive SRT and preserves line breaks', () => {
  const source = cue() + '\n' + '52\n00:00:04,000 --> 00:00:05,000\nNext caption.';
  const result = convertSubtitles(source);
  assert.equal(result.stats.cueCount, 2);
  assert.match(result.text, /^1\n/);
  assert.match(result.text, /\n\n2\n/);
  assert.match(result.text, /Hello\.\nSecond line\./);
});

test('VTT handles short timestamps, NOTE, STYLE, REGION, identifiers and settings', () => {
  const source = 'WEBVTT\n\nNOTE Example note\nDo not convert this text.\n\nSTYLE\n::cue { color: lime; }\n\nREGION\nid:main\n\nintro\n00:01.000 --> 00:03.500 align:start position:25%\nA caption.\n';
  const parsed = parseSubtitles(source);
  assert.equal(parsed.cues[0].start, 1000);
  assert.equal(parsed.cues[0].end, 3500);
  assert.equal(parsed.metadataBlocks, 3);
  assert.equal(parsed.settingsCount, 1);
  const converted = convertSubtitles(source);
  assert.match(converted.text, /00:00:01,000 --> 00:00:03,500/);
  assert.doesNotMatch(converted.text, /align:|Example note/);
  assert.equal(converted.warnings.length, 3);
});

test('SRT to VTT includes header and dotted millisecond timestamps', () => {
  const result = convertSubtitles(cue(), { outputFormat: 'vtt' });
  assert.match(result.text, /^WEBVTT\n\n1\n00:00:01\.000 --> 00:00:03\.000/);
  assert.equal(parseSubtitles(result.text).cues.length, 1);
});

test('positive offset crosses minute and hour boundaries exactly', () => {
  const result = convertSubtitles(cue('00:59:59,750', '01:00:02,200'), { offsetMs: 500 });
  assert.match(result.text, /01:00:00,250 --> 01:00:02,700/);
});

test('negative offset clips cue start at zero with notice', () => {
  const result = convertSubtitles(cue(), { offsetMs: -1500 });
  assert.equal(result.cues[0].start, 0);
  assert.equal(result.cues[0].end, 1500);
  assert.equal(result.stats.clippedCueCount, 1);
  assert.match(result.warnings[0], /clipped/);
});

test('fully negative cue is omitted without producing zero duration', () => {
  const result = convertSubtitles(cue() + '\n' + '3\n00:00:05,000 --> 00:00:06,000\nLater.', { offsetMs: -3000 });
  assert.equal(result.stats.removedCueCount, 1);
  assert.equal(result.stats.cueCount, 1);
  assert.equal(result.cues[0].start, 2000);
  assert.match(result.warnings[0], /omitted/);
  assert.throws(() => convertSubtitles(cue(), { offsetMs: -3000 }), /all 1 cues/);
});

test('rejects reversed or equal timing, missing text and malformed blocks', () => {
  assert.throws(() => parseSubtitles(cue('00:00:03,000', '00:00:01,000')), /end after/);
  assert.throws(() => parseSubtitles(cue('00:00:03,000', '00:00:03,000')), /end after/);
  assert.throws(() => parseSubtitles(cue('00:00:01,000', '00:00:03,000', '')), /no caption text/);
  assert.throws(() => parseSubtitles('not subtitle content'), /no timing line/);
  assert.throws(() => parseSubtitles('name\n' + cue()), /extra lines/);
});

test('rejects malformed timestamps, unsafe and fractional offsets, invalid formats', () => {
  assert.throws(() => parseTimestamp('00:61:00,000'), /below 60/);
  assert.throws(() => parseTimestamp('00:00:01.000'), /Invalid SRT/);
  assert.throws(() => parseTimestamp('00:00:01,000', 'vtt'), /Invalid VTT/);
  assert.throws(() => convertSubtitles(cue(), { offsetMs: 0.5 }), /whole number/);
  assert.throws(() => convertSubtitles(cue(), { offsetMs: Infinity }), /whole number/);
  assert.throws(() => convertSubtitles(cue(), { outputFormat: 'xml' }), /Choose SRT/);
});

test('clean spaces preserves lines and removes markup only when requested', () => {
  assert.equal(cleanCaption('  Hello   there. \n\tSecond line.  '), 'Hello there.\nSecond line.');
  assert.equal(cleanCaption('<i>Words</i> &amp; sound'), '<i>Words</i> &amp; sound');
  assert.equal(cleanCaption('<v Narrator><i>Words</i></v> &amp; sound &#39;quoted&#39; {\\an8}', { removeStyling: true }), "Words & sound 'quoted'");
  assert.equal(cleanCaption('  Literal   spaces. ', { normalizeWhitespace: false }), '  Literal   spaces. ');
  assert.equal(cleanCaption('1 < 2 > 0', { removeStyling: true }), '1 < 2 > 0');
  assert.equal(cleanCaption('<c.yellow>Yellow</c><br><font color="red">Red</font>', { removeStyling: true }), 'Yellow\nRed');
});

test('rejects empty captions after stripping markup', () => {
  assert.throws(() => convertSubtitles(cue('00:00:01,000', '00:00:03,000', '<i></i>'), { removeStyling: true }), /empty after removing styling/);
});

test('input limit measures UTF-8 bytes and rejects oversized text', () => {
  assert.equal(MAX_INPUT_BYTES, 2097152);
  assert.throws(() => parseSubtitles('é'.repeat(MAX_INPUT_BYTES / 2 + 1)), /2 MiB/);
});

test('WebVTT header metadata is ignored with a notice', () => {
  const result = convertSubtitles('WEBVTT captions\nKind: captions\nLanguage: en\n\n00:01.000 --> 00:02.000\nHello.', { outputFormat: 'vtt' });
  assert.match(result.warnings[0], /header/);
  assert.throws(() => parseSubtitles('WEBVTT\n00:01.000 --> 00:02.000\nHello.'), /blank line/);
});

test('overlapping cues stay in source order without hidden adjustment', () => {
  const result = convertSubtitles(cue('00:00:01,000', '00:00:03,000') + '\n' + '2\n00:00:02,000 --> 00:00:04,000\nOverlap.');
  assert.equal(result.cues[1].start, 2000);
  assert.equal(result.cues[0].end, 3000);
  assert.equal(formatTimestamp(3661002, 'vtt'), '01:01:01.002');
});

test('rejects inline WebVTT karaoke timings rather than keeping stale tags', () => {
  const source = 'WEBVTT\n\n00:01.000 --> 00:03.000\nHello <00:02.000>world.';
  assert.throws(() => convertSubtitles(source, { offsetMs: 5000 }), /inline WebVTT timing tags/);
  assert.throws(() => convertSubtitles(source, { offsetMs: 0 }), /subtitle editor/);
});

test('disabled whitespace normalization preserves text edges', () => {
  const source = '1\n00:00:01,000 --> 00:00:02,000\n  Keep these spaces.  \n';
  assert.equal(convertSubtitles(source, { normalizeWhitespace: false }).cues[0].text, '  Keep these spaces.  ');
});

test('rejects missing separators between cue blocks', () => {
  const source = cue() + '2\n00:00:04,000 --> 00:00:05,000\nNext.';
  assert.throws(() => parseSubtitles(source), /Separate each cue/);
});

test('file decoding preserves UTF-8 and rejects malformed bytes', () => {
  assert.equal(decodeSubtitleBytes(new TextEncoder().encode('こんにちは — café')), 'こんにちは — café');
  assert.throws(() => decodeSubtitleBytes(Uint8Array.from([0x48, 0xe9, 0x20])), /not valid UTF-8/);
});
