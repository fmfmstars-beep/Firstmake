const MAX_BYTES = 2 * 1024 * 1024;

export const MAX_INPUT_BYTES = MAX_BYTES;

function fail(message) {
  throw new Error(message);
}

export function decodeSubtitleBytes(bytes) {
  if (bytes.byteLength > MAX_BYTES) fail('This file exceeds the 2 MiB input limit.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('This file is not valid UTF-8. Re-export it as UTF-8 in a text or subtitle editor.');
  }
}

export function parseTimestamp(value, format = 'srt') {
  const expression = format === 'vtt'
    ? /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/
    : /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/;
  const match = value.match(expression);
  if (!match) fail(`Invalid ${format.toUpperCase()} timestamp: ${value}`);
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  if (minutes > 59 || seconds > 59) fail(`Minutes and seconds must be below 60: ${value}`);
  const result = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  if (!Number.isSafeInteger(result)) fail('Timestamp is too large to handle safely.');
  return result;
}

export function formatTimestamp(milliseconds, format = 'srt') {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) fail('Timestamp must be a nonnegative integer number of milliseconds.');
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const fraction = milliseconds % 1000;
  const pad = (number, width) => String(number).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${format === 'vtt' ? '.' : ','}${pad(fraction, 3)}`;
}

export function parseSubtitles(source) {
  if (typeof source !== 'string') fail('Subtitle input must be text.');
  if (new TextEncoder().encode(source).byteLength > MAX_BYTES) fail('This file exceeds the 2 MiB input limit.');
  const trimBlankEdges = text => text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');
  let normalized = trimBlankEdges(source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  if (!normalized.trim()) fail('Paste subtitle text or choose an SRT or VTT file first.');
  const format = /^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(normalized) ? 'vtt' : 'srt';
  let metadataBlocks = 0;
  if (format === 'vtt') {
    const headerEnd = normalized.search(/\n[ \t]*\n/);
    if (headerEnd === -1) fail('WEBVTT needs a blank line after its header and at least one cue.');
    const header = normalized.slice(0, headerEnd).split('\n');
    if (header.length > 1 || header[0] !== 'WEBVTT') metadataBlocks++;
    normalized = trimBlankEdges(normalized.slice(headerEnd));
  }
  const blocks = normalized.split(/\n[ \t]*\n+/);
  const cues = [];
  let settingsCount = 0;
  let identifierCount = 0;
  for (const block of blocks) {
    const lines = block.split('\n');
    if (format === 'vtt' && /^(NOTE(?:[ \t]|$)|STYLE$|REGION$)/.test(lines[0])) {
      metadataBlocks++;
      continue;
    }
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) fail(`Block ${cues.length + 1} has no timing line. Separate cues with a blank line.`);
    if (timingIndex > 1) fail(`Cue ${cues.length + 1} has extra lines before its timestamp.`);
    if (timingIndex === 1) {
      if (format === 'srt' && !/^\d+$/.test(lines[0].trim())) fail(`Cue ${cues.length + 1} needs a numeric SRT cue number.`);
      identifierCount++;
    }
    const timing = lines[timingIndex].trim().match(/^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/);
    if (!timing) fail(`Cue ${cues.length + 1} has an invalid timing line. Use spaces around -->.`);
    const start = parseTimestamp(timing[1], format);
    const end = parseTimestamp(timing[2], format);
    if (end <= start) fail(`Cue ${cues.length + 1} must end after it starts.`);
    const text = lines.slice(timingIndex + 1).join('\n');
    if (!text.trim()) fail(`Cue ${cues.length + 1} has no caption text.`);
    if (lines.slice(timingIndex + 1).some(line => /^\s*\S+\s+-->\s+\S+/.test(line))) fail(`Cue ${cues.length + 1} contains another timing line. Separate each cue with a blank line.`);
    if (format === 'vtt' && /<(?:(?:\d{2,}):)?\d{2}:\d{2}\.\d{3}>/.test(text)) fail(`Cue ${cues.length + 1} contains inline WebVTT timing tags. Use a subtitle editor to remove or retime these karaoke-style tags before conversion.`);
    const settings = timing[3] || '';
    if (settings) {
      if (format !== 'vtt') fail(`Cue ${cues.length + 1} has unsupported text after its SRT end time.`);
      settingsCount++;
    }
    cues.push({ start, end, text, settings });
  }
  if (cues.length === 0) fail('No subtitle cues were found.');
  return { format, cues, metadataBlocks, settingsCount, identifierCount };
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|nbsp|quot|apos);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()];
    const hexadecimal = name[1].toLowerCase() === 'x';
    const codepoint = parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (codepoint > 0x10ffff || codepoint < 1 || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return entity;
    return String.fromCodePoint(codepoint);
  });
}

export function cleanCaption(text, { normalizeWhitespace = true, removeStyling = false } = {}) {
  let cleaned = text;
  if (removeStyling) {
    const captionTag = /<\/?(?:b|i|u|s|font|ruby|rt)(?:[ \t][^<>]*)?>|<\/?c(?:\.[^\s<>.]+)*(?:[ \t][^<>]*)?>|<\/?(?:v|lang)(?:[ \t][^<>]*)?>|<(?:(?:\d{2,}):)?\d{2}:\d{2}\.\d{3}>/gi;
    cleaned = decodeEntities(cleaned.replace(/<br\s*\/?>/gi, '\n').replace(captionTag, '').replace(/\{\\[^}]*\}/g, ''));
  }
  if (normalizeWhitespace) cleaned = cleaned.split('\n').map(line => line.replace(/[\t \u00a0]+/g, ' ').trim()).join('\n');
  return cleaned;
}

export function convertSubtitles(source, options = {}) {
  const outputFormat = options.outputFormat ?? 'srt';
  if (!['srt', 'vtt'].includes(outputFormat)) fail('Choose SRT or WebVTT as the output format.');
  const offsetMs = options.offsetMs ?? 0;
  if (!Number.isSafeInteger(offsetMs)) fail('The offset must resolve to a safe, whole number of milliseconds.');
  const parsed = parseSubtitles(source);
  const warnings = [];
  let clippedCueCount = 0;
  let removedCueCount = 0;
  const cues = [];
  for (const [index, cue] of parsed.cues.entries()) {
    const shiftedStart = cue.start + offsetMs;
    const shiftedEnd = cue.end + offsetMs;
    if (!Number.isSafeInteger(shiftedStart) || !Number.isSafeInteger(shiftedEnd)) fail('The shifted timestamp is too large to handle safely.');
    if (shiftedEnd <= 0) {
      removedCueCount++;
      continue;
    }
    if (shiftedStart < 0) clippedCueCount++;
    const text = cleanCaption(cue.text, options);
    if (!text.trim()) fail(`Cue ${index + 1} is empty after removing styling. Keep styling or edit that cue.`);
    cues.push({ start: Math.max(0, shiftedStart), end: shiftedEnd, text });
  }
  if (clippedCueCount) warnings.push(`${clippedCueCount} cue${clippedCueCount === 1 ? '' : 's'} started before zero after shifting. Their starts were clipped to 00:00:00.`);
  if (removedCueCount) warnings.push(`${removedCueCount} cue${removedCueCount === 1 ? '' : 's'} ended at or before zero after shifting and were omitted to avoid invalid durations.`);
  if (parsed.settingsCount) warnings.push(`Positioning and cue settings were removed from ${parsed.settingsCount} cue${parsed.settingsCount === 1 ? '' : 's'}. Review caption placement in your player.`);
  if (parsed.metadataBlocks) warnings.push(`${parsed.metadataBlocks} WebVTT header, NOTE, STYLE, or REGION block${parsed.metadataBlocks === 1 ? ' was' : 's were'} omitted. This tool exports caption text and timing only.`);
  if (parsed.format === 'vtt' && parsed.identifierCount) warnings.push('WebVTT cue identifiers were replaced. Output cue numbers are generated in order.');
  if (!cues.length) fail(`The offset places all ${parsed.cues.length} cues at or before zero. Use a smaller negative offset.`);
  const blocks = cues.map((cue, index) => `${index + 1}\n${formatTimestamp(cue.start, outputFormat)} --> ${formatTimestamp(cue.end, outputFormat)}\n${cue.text}`);
  const text = `${outputFormat === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
  return {
    text, warnings, cues,
    stats: { inputFormat: parsed.format, outputFormat, inputCueCount: parsed.cues.length, cueCount: cues.length, clippedCueCount, removedCueCount }
  };
}
