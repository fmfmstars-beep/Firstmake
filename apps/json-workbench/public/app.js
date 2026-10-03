import { formatJson, parseJson, summarize, MAX_BYTES } from './core.mjs';

const byId = id => document.getElementById(id);
const input = byId('input');
const output = byId('output');
const status = byId('status');
const byteLength = value => new TextEncoder().encode(value).length;
const readableBytes = bytes => bytes < 1024 ? `${bytes.toLocaleString()} bytes` : `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`;
const example = '{"project":"JSONWorkbench","version":1,"features":["format","validate","inspect"],"settings":{"theme":"violet","enabled":true},"owner":null,"external_id":"9007199254740993"}';

function message(text, kind = 'info') {
  status.textContent = text;
  status.dataset.kind = kind;
}
function clearResult() {
  output.value = '';
  byId('output-size').textContent = 'Ready when you are';
  byId('copy').disabled = true;
  byId('download').disabled = true;
  byId('summary-section').hidden = true;
}
function showSummary(summary) {
  const container = byId('summary');
  container.replaceChildren();
  const names = [['Root type', 'rootType'], ['Total values', 'values'], ['Object keys', 'keys'], ['Objects', 'objects'], ['Arrays', 'arrays'], ['Strings', 'strings'], ['Numbers', 'numbers'], ['Booleans', 'booleans'], ['Nulls', 'nulls'], ['Deepest level', 'maxDepth']];
  for (const [name, key] of names) {
    const item = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = name;
    detail.textContent = typeof summary[key] === 'number' ? summary[key].toLocaleString() : summary[key];
    item.append(term, detail);
    container.append(item);
  }
  byId('summary-section').hidden = false;
}
function updateInput() {
  const bytes = byteLength(input.value);
  byId('input-size').textContent = readableBytes(bytes);
  clearResult();
  if (bytes > MAX_BYTES) message('Your input exceeds 2 MiB. Remove some content or choose a smaller file.', 'error');
  else message('Input changed. Validate or format it to create a fresh result.');
}
function run(mode) {
  clearResult();
  try {
    if (mode === 'validate') {
      showSummary(summarize(parseJson(input.value)));
      message('Valid JSON. No duplicate keys or numbers outside the supported safe range. No output file was created.', 'success');
      return;
    }
    const result = formatJson(input.value, { indent: byId('indent').value, sortKeys: byId('sort').checked, minify: mode === 'minify' });
    output.value = result.output;
    byId('output-size').textContent = readableBytes(byteLength(result.output));
    byId('copy').disabled = false;
    byId('download').disabled = false;
    showSummary(result.summary);
    message(`${mode === 'minify' ? 'Minified' : 'Formatted'} successfully${byId('sort').checked ? ' with recursively sorted object keys' : ''}. Your input has not been changed.`, 'success');
  } catch (error) {
    message(error.message, 'error');
  }
}

input.addEventListener('input', updateInput);
byId('format').addEventListener('click', () => run('format'));
byId('minify').addEventListener('click', () => run('minify'));
byId('validate').addEventListener('click', () => run('validate'));
byId('example').addEventListener('click', () => { input.value = example; updateInput(); run('format'); input.focus(); });
byId('reset').addEventListener('click', () => {
  input.value = '';
  byId('file').value = '';
  byId('indent').value = '2';
  byId('sort').checked = false;
  updateInput();
  message('Workbench cleared. Paste a document or load the example to begin.');
  input.focus();
});
byId('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > MAX_BYTES) {
    message('This file exceeds 2 MiB. Choose a smaller JSON file. Your current input has been kept.', 'error');
    event.target.value = '';
    return;
  }
  try {
    const bytes = await file.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.charCodeAt(0) === 0xFEFF) throw new Error('The file begins with a byte-order mark. Save it as UTF-8 without a BOM and try again.');
    input.value = text;
    updateInput();
    message(`Opened ${file.name} locally. Validate or format it to continue.`);
  } catch (error) {
    message(error.message.startsWith('The file') ? error.message : 'Unable to read this file as UTF-8. Save it as UTF-8 text and try again.', 'error');
  } finally { event.target.value = ''; }
});
byId('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    message('Output copied to your clipboard.', 'success');
  } catch {
    output.focus();
    output.select();
    message('Clipboard access was unavailable. The output is selected; use your device’s Copy command.');
  }
});
byId('download').addEventListener('click', () => {
  const blob = new Blob([output.value + '\n'], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'formatted.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message('Download requested. Your original file has not been changed.', 'success');
});
