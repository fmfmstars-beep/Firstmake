import { cleanDelimited, MAX_INPUT_BYTES } from './core.mjs';

const byId = id => document.getElementById(id);
const input = byId('source');
const output = byId('result');
const delimiter = id => ({ comma: ',', tab: '\t', semicolon: ';', pipe: '|' })[byId(id).value];
let resultReady = false;
let sourceName = 'cleaned-data';

function status(message, isError = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('error', isError);
}
function invalidate() {
  resultReady = false;
  output.value = '';
  byId('copy').disabled = true;
  byId('download').disabled = true;
  byId('preview').replaceChildren();
  byId('summary').textContent = 'Your cleanup summary will appear here.';
  status('Ready. Choose your options, then clean the data.');
}
function showPreview(rows) {
  const preview = byId('preview');
  preview.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No rows remain after cleanup.';
    preview.append(empty);
    return;
  }
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = `Preview: first ${Math.min(rows.length, 8)} rows, up to 12 columns. The download contains all rows and columns.`;
  table.append(caption);
  const tbody = document.createElement('tbody');
  rows.slice(0, 8).forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.slice(0, 12).forEach(cell => {
      const cellElement = document.createElement(byId('has-header').checked && rowIndex === 0 ? 'th' : 'td');
      if (cellElement.tagName === 'TH') cellElement.scope = 'col';
      cellElement.textContent = cell;
      tr.append(cellElement);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  preview.append(table);
}

byId('clean-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!input.value) { invalidate(); status('Paste data or choose a UTF-8 file first.', true); input.focus(); return; }
  try {
    const result = cleanDelimited(input.value, {
      inputDelimiter: delimiter('input-delimiter'), outputDelimiter: delimiter('output-delimiter'),
      trim: byId('trim').checked, removeBlank: byId('blank-rows').checked,
      deduplicate: byId('deduplicate').checked, hasHeader: byId('has-header').checked,
      formulaProtection: byId('formula-protection').checked
    });
    output.value = result.output;
    const s = result.stats;
    byId('summary').textContent = `${s.inputRows} rows read · ${s.outputRows} rows kept · ${s.blankRowsRemoved} blank rows removed · ${s.duplicatesRemoved} duplicates removed · ${s.trimmedCells} cells trimmed · ${s.protectedCells} cells protected`;
    showPreview(result.rows);
    resultReady = true;
    byId('copy').disabled = !result.output;
    byId('download').disabled = !result.output;
    status('Cleanup complete. Review the preview and output before importing into another application.');
  } catch (error) {
    invalidate();
    status(error.message, true);
  }
});

input.addEventListener('input', invalidate);
byId('clean-form').addEventListener('change', event => { if (event.target.id !== 'file') invalidate(); });
byId('file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  invalidate();
  if (file.size > MAX_INPUT_BYTES) {
    status('This file exceeds 2 MiB. Choose a smaller file.', true);
    event.target.value = '';
    return;
  }
  try {
    const bytes = await file.arrayBuffer();
    input.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    sourceName = file.name.replace(/\.[^.]*$/u, '').replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 80) || 'data';
    if (/\.(tsv|tab)$/iu.test(file.name)) byId('input-delimiter').value = 'tab';
    status(`Loaded ${file.name} locally. Choose the input delimiter and clean the data.`);
  } catch {
    status('This file could not be read as UTF-8 text. Export it as UTF-8 CSV or TSV and try again.', true);
    event.target.value = '';
  }
});

byId('example').addEventListener('click', () => {
  input.value = 'name,email,note\n Alice , alice@example.com ,"Likes tea, coffee"\nBob,bob@example.com,"Two lines:\nhello"\nBob,bob@example.com,"Two lines:\nhello"\n,,\n';
  byId('input-delimiter').value = 'comma';
  byId('output-delimiter').value = 'comma';
  byId('deduplicate').checked = true;
  sourceName = 'example';
  invalidate();
  status('Example loaded with whitespace, a multiline field, a duplicate, and a blank row.');
});
byId('clear').addEventListener('click', () => {
  input.value = '';
  byId('file').value = '';
  sourceName = 'cleaned-data';
  invalidate();
  input.focus();
});
byId('copy').addEventListener('click', async () => {
  if (!resultReady) return;
  try { await navigator.clipboard.writeText(output.value); status('Cleaned data copied to your clipboard.'); }
  catch { output.focus(); output.select(); status('Clipboard access is unavailable. The output is selected; use your browser’s copy command.', true); }
});
byId('download').addEventListener('click', () => {
  if (!resultReady) return;
  const isTab = delimiter('output-delimiter') === '\t';
  const blob = new Blob([output.value], { type: isTab ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sourceName}-cleaned.${isTab ? 'tsv' : 'csv'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Your cleaned file is ready to download.');
});
