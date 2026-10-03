import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, CancelledTaskError, readImageHeader, validateDecodedDimensions, fitDimensions, targetBytesFromKB, encodeToTarget, formatBytes } from '../public/core.mjs';

const join = (...arrays) => new Uint8Array(arrays.flatMap((array) => Array.from(array)));
const wordBE = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const wordLE = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
const text = (value) => Array.from(value, (char) => char.charCodeAt(0));
const pngChunk = (type, data = []) => join(wordBE(data.length), text(type), data, [0, 0, 0, 0]);
function png(width = 640, height = 480, extra = []) {
  return join([137, 80, 78, 71, 13, 10, 26, 10], pngChunk('IHDR', [...wordBE(width), ...wordBE(height), 8, 6, 0, 0, 0]), ...extra, pngChunk('IDAT', [1]), pngChunk('IEND'));
}
function jpeg(width = 640, height = 480) {
  return join([255, 216, 255, 224, 0, 4, 1, 1, 255, 192, 0, 17, 8, height >>> 8, height & 255, width >>> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 255, 218, 0, 12, 3, 1, 0, 2, 0, 3, 0, 0, 63, 0, 1, 255, 217]);
}
const webpChunk = (type, data) => join(text(type), wordLE(data.length), data, data.length % 2 ? [0] : []);
function webp(width = 640, height = 480, extras = []) {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;
  const chunks = join(...extras, webpChunk('VP8L', [0x2f, ...wordLE(bits)]));
  return join(text('RIFF'), wordLE(chunks.length + 4), text('WEBP'), chunks);
}

test('recognises dimensions and alpha in static PNG headers', () => {
  assert.deepEqual(readImageHeader(png()), { width: 640, height: 480, mime: 'image/png', transparency: true });
});
test('rejects PNG animation markers, even after image data', () => {
  assert.throws(() => readImageHeader(png(1, 1, [pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0])])), /Animated PNG/);
  assert.throws(() => readImageHeader(png(1, 1, [pngChunk('fdAT', [1])])), /Animated PNG/);
});
test('rejects truncated PNG chunks and absent final chunk', () => {
  assert.throws(() => readImageHeader(png().subarray(0, 40)), /truncated|incomplete|invalid/);
  assert.throws(() => readImageHeader(png().subarray(0, -12)), /incomplete/);
});
test('checks dimension and pixel caps before PNG decoding', () => {
  assert.throws(() => readImageHeader(png(8193, 1)), /8192/);
  assert.throws(() => readImageHeader(png(5000, 4000)), /16 megapixel/);
  assert.throws(() => readImageHeader(png(0, 1)), /invalid dimensions/);
  assert.equal(readImageHeader(png(4000, 4000)).width, 4000);
});
test('recognises baseline JPEG after metadata and rejects missing scans', () => {
  assert.deepEqual(readImageHeader(jpeg(1024, 768)), { width: 1024, height: 768, mime: 'image/jpeg', transparency: false });
  const broken = jpeg(); broken[11] = 100;
  assert.throws(() => readImageHeader(broken), /truncated/);
  assert.throws(() => readImageHeader(jpeg().subarray(0, -2)), /incomplete/);
});
test('rejects JPEG frame dimensions over cap', () => {
  assert.throws(() => readImageHeader(jpeg(8193, 1)), /8192/);
  assert.throws(() => readImageHeader(jpeg(8000, 3000)), /16 megapixel/);
});
test('checks markers after scan data and rejects a second hidden JPEG frame', () => {
  const first = jpeg(10, 10);
  const secondFrame = jpeg(8193, 1).subarray(8, 27);
  const bytes = join(first.subarray(0, -2), secondFrame, [255, 217]);
  assert.throws(() => readImageHeader(bytes), /frame encoding/);
});
test('recognises lossless WebP with odd chunk padding', () => {
  assert.deepEqual(readImageHeader(webp(111, 222)), { width: 111, height: 222, mime: 'image/webp', transparency: false });
});
test('recognises static lossy WebP', () => {
  const chunks = webpChunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 40, 1, 240, 0]);
  const bytes = join(text('RIFF'), wordLE(chunks.length + 4), text('WEBP'), chunks);
  assert.deepEqual(readImageHeader(bytes), { width: 296, height: 240, mime: 'image/webp', transparency: false });
});
test('rejects animated WebP flags and frame chunks', () => {
  assert.throws(() => readImageHeader(webp(1, 1, [webpChunk('VP8X', [2, 0, 0, 0, 0, 0, 0, 0, 0, 0])])), /Animated WebP/);
  assert.throws(() => readImageHeader(webp(1, 1, [webpChunk('ANMF', [])])), /Animated WebP/);
});
test('rejects malformed RIFF length and mismatched WebP canvas', () => {
  const bytes = webp(); bytes[4]--;
  assert.throws(() => readImageHeader(bytes), /RIFF length/);
  assert.throws(() => readImageHeader(webp(2, 2, [webpChunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])])), /inconsistent/);
});
test('sniffs file content rather than trusting extensions or MIME', () => {
  assert.throws(() => readImageHeader(new TextEncoder().encode('<svg/>')), /static JPEG/);
  assert.throws(() => readImageHeader(new Uint8Array(LIMITS.maxFileBytes + 1)), /10 MiB/);
  assert.throws(() => readImageHeader(new Uint8Array()), /10 MiB/);
});
test('allows decoded EXIF orientation swaps but rejects other dimensions', () => {
  assert.deepEqual(validateDecodedDimensions({ width: 1200, height: 800 }, 800, 1200), { width: 800, height: 1200 });
  assert.throws(() => validateDecodedDimensions({ width: 1200, height: 800 }, 1199, 800), /do not match/);
});
test('fits both dimensions without upscaling or stretching', () => {
  assert.deepEqual(fitDimensions(4000, 3000, 1200, 800), { width: 1066, height: 800 });
  assert.deepEqual(fitDimensions(100, 40, 1200, 800), { width: 100, height: 40 });
  assert.deepEqual(fitDimensions(1, 8192, 20, 30), { width: 1, height: 30 });
  assert.throws(() => fitDimensions(100, 100, 1.5, 20), /whole numbers/);
});
test('uses decimal KB and rejects invalid targets', () => {
  assert.equal(targetBytesFromKB('100'), 100000);
  assert.equal(targetBytesFromKB('12.34'), 12340);
  assert.equal(targetBytesFromKB(0.0001), 1);
  for (const value of ['', -1, 0, 'not a number', Infinity, 10486]) assert.throws(() => targetBytesFromKB(value), /Target size/);
  assert.equal(formatBytes(12345), '12.35 KB (12,345 bytes)');
});
test('quality search selects a measured under-budget candidate in at most nine attempts', async () => {
  const qualities = [];
  const result = await encodeToTarget({ mime: 'image/jpeg', targetBytes: 5000, encode: async (type, quality) => { qualities.push(quality); return { type, size: Math.ceil(quality * 10000 + 100) }; } });
  assert.equal(result.targetReached, true); assert.ok(result.blob.size <= 5000); assert.equal(qualities.length, 9); assert.ok(result.quality > 0.48 && result.quality < 0.49);
});
test('returns highest sampled quality immediately if it already meets target', async () => {
  const result = await encodeToTarget({ mime: 'image/webp', targetBytes: 1000, encode: async (type) => ({ type, size: 500 }) });
  assert.equal(result.quality, 0.95); assert.equal(result.attempts, 1); assert.equal(result.targetReached, true);
});
test('reports an unmet target rather than resizing or lying about byte size', async () => {
  const result = await encodeToTarget({ mime: 'image/jpeg', targetBytes: 10, encode: async (type, quality) => ({ type, size: Math.round(1000 + quality * 100) }) });
  assert.equal(result.targetReached, false); assert.equal(result.attempts, 2); assert.equal(result.blob.size, 1010);
});
test('PNG exports once with no quality promise', async () => {
  let attempts = 0;
  const result = await encodeToTarget({ mime: 'image/png', targetBytes: 1000, encode: async (type, quality) => { attempts++; assert.equal(quality, undefined); return { type, size: 2000 }; } });
  assert.equal(attempts, 1); assert.equal(result.targetReached, false); assert.equal(result.quality, undefined);
});
test('rejects null encoder results and unsupported-format PNG fallback', async () => {
  await assert.rejects(encodeToTarget({ mime: 'image/webp', targetBytes: 1000, encode: async () => null }), /could not encode/);
  await assert.rejects(encodeToTarget({ mime: 'image/webp', targetBytes: 1000, encode: async () => ({ type: 'image/png', size: 500 }) }), /requested format/);
});
test('cancels asynchronous encodes superseded by new files or settings', async () => {
  let current = true;
  await assert.rejects(encodeToTarget({ mime: 'image/jpeg', targetBytes: 1000, isCurrent: () => current, encode: async (type) => { current = false; return { type, size: 500 }; } }), CancelledTaskError);
});
