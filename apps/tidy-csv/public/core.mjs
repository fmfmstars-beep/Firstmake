export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const DELIMITERS = [',', '\t', ';', '|'];

function validateDelimiter(delimiter) {
  if (!DELIMITERS.includes(delimiter)) throw new Error('Choose comma, tab, semicolon, or pipe as the delimiter.');
}

export function parseDelimited(input, delimiter = ',') {
  validateDelimiter(delimiter);
  if (typeof input !== 'string') throw new TypeError('Input must be text.');
  if (new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES) {
    throw new Error('Input exceeds the 2 MiB limit. Choose a smaller file or paste less text.');
  }
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (!text.length) return [];
  const rows = [];
  let row = [], value = '', state = 'start', line = 1, column = 1, recordStarted = false;
  const fail = message => { throw new Error(`${message} at line ${line}, column ${column}.`); };
  const endField = () => { row.push(value); value = ''; state = 'start'; };
  const endRow = () => { endField(); rows.push(row); row = []; recordStarted = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    let lineBreak = char === '\n' || (char === '\r' && text[i + 1] !== '\n');
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; column++; }
        else state = 'closed';
      } else {
        value += char;
      }
    } else if (char === delimiter) {
      endField();
      recordStarted = true;
    } else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && text[i + 1] === '\n') { i++; lineBreak = true; }
    } else if (state === 'closed') {
      fail('Unexpected text after a closing quote');
    } else if (char === '"') {
      if (state !== 'start') fail('A quote inside an unquoted field must be escaped by quoting the entire field');
      state = 'quoted';
      recordStarted = true;
    } else {
      value += char;
      state = 'plain';
      recordStarted = true;
    }
    if (lineBreak) { line++; column = 1; }
    else column++;
  }
  if (state === 'quoted') fail('Unclosed quoted field');
  if (recordStarted || row.length || state !== 'start') endRow();
  return rows;
}

export function protectFormula(value) {
  return (/^[\s]*[=+\-@]/u.test(value) || /^[\t\r]/u.test(value)) ? `'${value}` : value;
}

export function cleanRows(rows, options = {}) {
  const { trim = true, removeBlank = true, deduplicate = false, hasHeader = true, formulaProtection = true } = options;
  const result = [], seen = new Set();
  const stats = { inputRows: rows.length, outputRows: 0, blankRowsRemoved: 0, duplicatesRemoved: 0, trimmedCells: 0, protectedCells: 0 };
  rows.forEach((row, index) => {
    let cleaned = row.map(cell => {
      const value = trim ? cell.trim() : cell;
      if (value !== cell) stats.trimmedCells++;
      return value;
    });
    const isHeader = hasHeader && index === 0;
    if (!isHeader && removeBlank && cleaned.every(cell => cell === '')) { stats.blankRowsRemoved++; return; }
    if (!isHeader && deduplicate) {
      const key = JSON.stringify(cleaned);
      if (seen.has(key)) { stats.duplicatesRemoved++; return; }
      seen.add(key);
    }
    if (formulaProtection) cleaned = cleaned.map(cell => {
      const guarded = protectFormula(cell);
      if (guarded !== cell) stats.protectedCells++;
      return guarded;
    });
    result.push(cleaned);
  });
  stats.outputRows = result.length;
  return { rows: result, stats };
}

export function serializeDelimited(rows, delimiter = ',') {
  validateDelimiter(delimiter);
  return rows.map(row => row.map(value => {
    const cell = String(value);
    return (row.length === 1 && cell === '') || cell.includes(delimiter) || /["\r\n]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
  }).join(delimiter)).join('\r\n');
}

export function cleanDelimited(input, options = {}) {
  const inputDelimiter = options.inputDelimiter ?? ',';
  const outputDelimiter = options.outputDelimiter ?? ',';
  const { rows, stats } = cleanRows(parseDelimited(input, inputDelimiter), options);
  return { rows, stats, output: serializeDelimited(rows, outputDelimiter) };
}
