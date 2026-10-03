import { convertSubtitles, decodeSubtitleBytes, MAX_INPUT_BYTES } from './core.mjs';

const input = document.querySelector('#subtitle-input');
const output = document.querySelector('#subtitle-output');
const form = document.querySelector('#cleaner-form');
const fileInput = document.querySelector('#subtitle-file');
const status = document.querySelector('#status');
const warningList = document.querySelector('#warnings');
const copyButton = document.querySelector('#copy-output');
const downloadButton = document.querySelector('#download-output');
const statistics = document.querySelector('#result-summary');
let result = null;
let sourceName = 'captions';

const example = '7\n00:00:01,200 --> 00:00:03,800\n  Welcome   to our caption workshop.\nLet’s make every word easy to follow.\n\n12\n00:00:04,100 --> 00:00:06,700\n<i>A small timing fix can make a big difference.</i>\n\n15\n00:00:07,000 --> 00:00:09,500\nKeep your captions clear, consistent, and readable.\n';

function invalidate() {
  result = null;
  output.value = '';
  warningList.replaceChildren();
  statistics.textContent = 'Your cleaned captions will appear here.';
  copyButton.disabled = true;
  downloadButton.disabled = true;
}

function announce(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function inputChanged() {
  invalidate();
  announce('Input changed. Select Clean & convert to update the result.');
}

input.addEventListener('input', inputChanged);
form.querySelectorAll('select, input:not([type="file"])').forEach(element => element.addEventListener('change', inputChanged));

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  invalidate();
  if (file.size > MAX_INPUT_BYTES) {
    fileInput.value = '';
    announce('Choose a file up to 2 MiB (2,097,152 bytes).', true);
    return;
  }
  try {
    const bytes = await file.arrayBuffer();
    input.value = decodeSubtitleBytes(bytes);
    sourceName = file.name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'captions';
    announce(`Loaded ${file.name}. Choose your options, then clean & convert.`);
  } catch {
    fileInput.value = '';
    announce('This file could not be read as UTF-8. Re-export it as UTF-8 in a text or subtitle editor, then try again.', true);
  }
});

document.querySelector('#load-example').addEventListener('click', () => {
  input.value = example;
  fileInput.value = '';
  sourceName = 'caption-example';
  invalidate();
  announce('Example loaded: three cues with nonconsecutive numbers, extra spaces, and an italic tag.');
  input.focus();
});

document.querySelector('#reset-tool').addEventListener('click', () => {
  form.reset();
  input.value = '';
  sourceName = 'captions';
  invalidate();
  announce('Cleared. Your next subtitle file stays in this browser.');
  input.focus();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  invalidate();
  const rawOffset = document.querySelector('#offset').value.trim();
  if (rawOffset === '' || !Number.isFinite(Number(rawOffset))) {
    announce('Enter a numeric timing offset, such as 0, 1.25, or -0.5.', true);
    return;
  }
  const multiplier = document.querySelector('#offset-unit').value === 'seconds' ? 1000 : 1;
  const preciseOffset = Number(rawOffset) * multiplier;
  const offsetMs = Math.round(preciseOffset);
  if (!Number.isSafeInteger(offsetMs) || Math.abs(preciseOffset - offsetMs) > 0.000001) {
    announce('Use at most three decimal places for seconds, or a whole number of milliseconds.', true);
    return;
  }
  try {
    result = convertSubtitles(input.value, {
      outputFormat: document.querySelector('#output-format').value,
      offsetMs,
      normalizeWhitespace: document.querySelector('#normalize-spaces').checked,
      removeStyling: document.querySelector('#remove-styling').checked
    });
    output.value = result.text;
    statistics.textContent = `${result.stats.cueCount} cues · ${result.stats.inputFormat.toUpperCase()} → ${result.stats.outputFormat.toUpperCase()} · ${offsetMs >= 0 ? '+' : ''}${offsetMs} ms`;
    for (const warning of result.warnings) {
      const item = document.createElement('li');
      item.textContent = warning;
      warningList.append(item);
    }
    copyButton.disabled = false;
    downloadButton.disabled = false;
    announce(`Ready. ${result.stats.cueCount} caption cues cleaned and converted.${result.warnings.length ? ' Review the notices below.' : ''}`);
  } catch (error) {
    announce(error.message || 'The subtitle could not be converted. Check your input.', true);
  }
});

copyButton.addEventListener('click', async () => {
  if (!result) return;
  try {
    await navigator.clipboard.writeText(result.text);
    announce('Cleaned captions copied to your clipboard.');
  } catch {
    output.focus();
    output.select();
    announce('Clipboard access is unavailable. The output is selected; copy it with your keyboard.', true);
  }
});

downloadButton.addEventListener('click', () => {
  if (!result) return;
  const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${sourceName}-clean.${result.stats.outputFormat}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Downloaded ${sourceName}-clean.${result.stats.outputFormat}. Preview it with your video before publishing.`);
});
