export const LIMITS = Object.freeze({ maxFileBytes: 10 * 1024 * 1024, maxDimension: 8192, maxPixels: 16_000_000 });
export const OUTPUT_TYPES = Object.freeze({ jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' });

function fail(message) { throw new Error(message); }
function asBytes(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  fail('Image data must be an ArrayBuffer or Uint8Array.');
}
function dimensionCheck(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail('The image has invalid dimensions.');
  if (width > LIMITS.maxDimension || height > LIMITS.maxDimension) fail('Each image dimension must be 8192 pixels or less.');
  if (width * height > LIMITS.maxPixels) fail('The image exceeds the 16 megapixel limit.');
  return { width, height };
}
function equalAt(bytes, start, expected) { return expected.every((value, index) => bytes[start + index] === value); }
function ascii(bytes, start, count) { return String.fromCharCode(...bytes.subarray(start, start + count)); }

function pngHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, dimensions, idat = false, end = false, transparency = false, chunks = 0;
  const colourDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  while (offset < bytes.length) {
    if (++chunks > 2048 || offset + 12 > bytes.length) fail('The PNG chunk structure is invalid.');
    const length = view.getUint32(offset), type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type) || length > bytes.length - offset - 12) fail('The PNG contains a truncated or invalid chunk.');
    const start = offset + 8;
    if (chunks === 1 && type !== 'IHDR') fail('The PNG must start with an IHDR chunk.');
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') fail('Animated PNG is not supported. Choose a static image.');
    if (type === 'IHDR') {
      if (dimensions || length !== 13) fail('The PNG has an invalid image header.');
      dimensions = dimensionCheck(view.getUint32(start), view.getUint32(start + 4));
      const depth = bytes[start + 8], colour = bytes[start + 9];
      if (!colourDepths[colour]?.includes(depth) || bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || bytes[start + 12] > 1) fail('The PNG header uses an unsupported encoding.');
      transparency = colour === 4 || colour === 6;
    }
    if (type === 'tRNS') transparency = true;
    if (type === 'IDAT' && length) idat = true;
    offset += length + 12;
    if (type === 'IEND') {
      if (length || offset !== bytes.length) fail('The PNG has an invalid end chunk or trailing data.');
      end = true; break;
    }
  }
  if (!dimensions || !idat || !end) fail('The PNG is incomplete.');
  return { ...dimensions, mime: 'image/png', transparency };
}

function jpegHeader(bytes) {
  if (bytes.length < 12 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) fail('The JPEG is incomplete or has trailing data.');
  let offset = 2, dimensions, components, segments = 0, scanSeen = false;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset < bytes.length) {
    if (++segments > 2048 || bytes[offset++] !== 0xff) fail('The JPEG marker structure is invalid.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!dimensions || !scanSeen || offset !== bytes.length) fail('The JPEG has an early end marker or trailing data.');
      return { ...dimensions, mime: 'image/jpeg', transparency: false };
    }
    if (marker === undefined || marker === 0 || marker === 0xd8) fail('The JPEG contains an invalid marker.');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) fail('The JPEG contains an unexpected standalone marker.');
    if (offset + 2 > bytes.length) fail('The JPEG header is truncated.');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) fail('The JPEG segment is truncated.');
    if (frameMarkers.has(marker)) {
      if (dimensions || ![0xc0, 0xc1, 0xc2].includes(marker) || length < 8 || bytes[offset + 2] !== 8) fail('The JPEG frame encoding is not supported.');
      components = bytes[offset + 7];
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) fail('The JPEG frame header is invalid.');
      dimensions = dimensionCheck(bytes[offset + 5] * 256 + bytes[offset + 6], bytes[offset + 3] * 256 + bytes[offset + 4]);
    }
    if (marker === 0xda) {
      const scanComponents = bytes[offset + 2];
      if (!dimensions || scanComponents < 1 || scanComponents > components || length !== 6 + 2 * scanComponents) fail('The JPEG scan header is invalid or appears before a valid image header.');
      scanSeen = true; offset += length;
      // Walk entropy data without decoding it, so a second frame header cannot
      // hide larger dimensions after the first scan. Stuffed bytes and restart
      // markers are data; all other markers return to the bounded parser.
      let nextMarker = false;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const markerStart = offset;
        while (bytes[offset] === 0xff) offset++;
        const code = bytes[offset];
        if (code === 0 || (code >= 0xd0 && code <= 0xd7)) { offset++; continue; }
        offset = markerStart; nextMarker = true; break;
      }
      if (!nextMarker) fail('The JPEG scan is truncated.');
      continue;
    }
    offset += length;
  }
  fail('The JPEG has no valid image scan.');
}

function webpHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(4, true) !== bytes.length - 8) fail('The WebP RIFF length is invalid.');
  let offset = 12, canvas, frame, transparency = false, chunks = 0;
  const little24 = (at) => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
  while (offset < bytes.length) {
    if (++chunks > 2048 || offset + 8 > bytes.length) fail('The WebP chunk structure is invalid.');
    const type = ascii(bytes, offset, 4), length = view.getUint32(offset + 4, true), start = offset + 8;
    if (length > bytes.length - start || start + length + (length % 2) > bytes.length) fail('The WebP contains a truncated chunk.');
    if (type === 'ANIM' || type === 'ANMF') fail('Animated WebP is not supported. Choose a static image.');
    if (type === 'VP8X') {
      if (chunks !== 1 || canvas || length !== 10 || (bytes[start] & 0xc1) || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) fail('The extended WebP header is invalid.');
      if (bytes[start] & 2) fail('Animated WebP is not supported. Choose a static image.');
      canvas = dimensionCheck(little24(start + 4) + 1, little24(start + 7) + 1);
      transparency = Boolean(bytes[start] & 16);
    }
    if (type === 'VP8 ' || type === 'VP8L') {
      if (frame) fail('The WebP contains multiple image frames.');
      if (type === 'VP8 ') {
        if (length < 10 || (bytes[start] & 1) || !equalAt(bytes, start + 3, [0x9d, 0x01, 0x2a])) fail('The WebP lossy frame header is invalid.');
        frame = dimensionCheck(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      } else {
        if (length < 5 || bytes[start] !== 0x2f) fail('The WebP lossless frame header is invalid.');
        const bits = view.getUint32(start + 1, true);
        if ((bits >>> 29) !== 0) fail('The WebP lossless version is not supported.');
        frame = dimensionCheck((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
        transparency ||= Boolean(bits & 0x10000000);
      }
    }
    offset = start + length + (length % 2);
  }
  if (!frame || (canvas && (canvas.width !== frame.width || canvas.height !== frame.height))) fail('The WebP image dimensions are missing or inconsistent.');
  return { ...(canvas || frame), mime: 'image/webp', transparency };
}

export function readImageHeader(buffer) {
  const bytes = asBytes(buffer);
  if (!bytes.length || bytes.length > LIMITS.maxFileBytes) fail('Choose an image no larger than 10 MiB (10,485,760 bytes).');
  if (equalAt(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return pngHeader(bytes);
  if (equalAt(bytes, 0, [0xff, 0xd8])) return jpegHeader(bytes);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpHeader(bytes);
  fail('Choose a static JPEG, PNG or WebP image. GIF, SVG and HEIC are not supported.');
}

export function validateDecodedDimensions(header, width, height) {
  dimensionCheck(width, height);
  if (!((width === header.width && height === header.height) || (width === header.height && height === header.width))) fail('Decoded dimensions do not match the image header.');
  return { width, height };
}

export function fitDimensions(width, height, maxWidth, maxHeight) {
  dimensionCheck(width, height);
  for (const value of [maxWidth, maxHeight]) {
    if (!Number.isInteger(value) || value < 1 || value > LIMITS.maxDimension) fail('Maximum dimensions must be whole numbers from 1 to 8192.');
  }
  const ratio = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}

export function targetBytesFromKB(value) {
  const kb = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(kb) || kb <= 0 || kb > LIMITS.maxFileBytes / 1000) fail('Target size must be greater than 0 and no more than 10,485.76 KB.');
  return Math.max(1, Math.floor(kb * 1000));
}

export class CancelledTaskError extends Error {
  constructor() { super('A newer image or setting replaced this result.'); this.name = 'CancelledTaskError'; }
}

export async function encodeToTarget({ encode, mime, targetBytes, isCurrent = () => true }) {
  if (!Object.values(OUTPUT_TYPES).includes(mime)) fail('Choose a supported output format.');
  if (!Number.isInteger(targetBytes) || targetBytes < 1) fail('The byte target must be a positive whole number.');
  const candidates = [];
  async function attempt(quality) {
    if (!isCurrent()) throw new CancelledTaskError();
    const blob = await encode(mime, quality);
    if (!isCurrent()) throw new CancelledTaskError();
    if (!blob || !Number.isInteger(blob.size) || blob.size < 1) fail('The browser could not encode this image. Try another format or smaller dimensions.');
    if (blob.type !== mime) fail('Your browser did not produce the requested format. Choose PNG or another supported format.');
    const candidate = { blob, quality }; candidates.push(candidate); return candidate;
  }
  let selected;
  if (mime === 'image/png') selected = await attempt(undefined);
  else {
    const high = await attempt(0.95);
    if (high.blob.size <= targetBytes) selected = high;
    else {
      const low = await attempt(0.1);
      if (low.blob.size <= targetBytes) {
        let lower = 0.1, upper = 0.95;
        selected = low;
        for (let index = 0; index < 7; index++) {
          const quality = (lower + upper) / 2, candidate = await attempt(quality);
          if (candidate.blob.size <= targetBytes) { lower = quality; selected = candidate; }
          else upper = quality;
        }
      } else selected = candidates.reduce((smallest, candidate) => candidate.blob.size < smallest.blob.size ? candidate : smallest);
    }
  }
  return { ...selected, targetReached: selected.blob.size <= targetBytes, attempts: candidates.length };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) fail('The file size is invalid.');
  return `${(bytes / 1000).toFixed(2)} KB (${Math.round(bytes).toLocaleString('en-US')} bytes)`;
}
