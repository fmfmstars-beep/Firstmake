export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_DEPTH = 256;
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export class JsonValidationError extends Error {
  constructor(message, source, index) {
    const before = source.slice(0, index);
    const line = (before.match(/\n/g) || []).length + 1;
    const column = index - before.lastIndexOf('\n');
    super(`${message} (line ${line}, column ${column}).`);
    this.name = 'JsonValidationError';
    this.line = line;
    this.column = column;
  }
}

// Compare the source spelling, without rounding a numeric token first.
function outsideSafeRange(raw) {
  const unsigned = raw.replace(/^-/, '');
  const [mantissa, exponentText = '0'] = unsigned.toLowerCase().split('e');
  const fractionLength = (mantissa.split('.')[1] || '').length;
  const digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (!digits) return false;
  const decimalPosition = digits.length + Number(exponentText) - fractionLength;
  if (decimalPosition > 16) return true;
  if (decimalPosition < 16) return false;
  const integer = (digits + '0'.repeat(Math.max(0, 16 - digits.length))).slice(0, 16);
  const limit = '9007199254740991';
  return integer > limit || (integer === limit && /[1-9]/.test(digits.slice(16)));
}

export function parseJson(source) {
  if (typeof source !== 'string') throw new TypeError('JSON input must be text.');
  if (new TextEncoder().encode(source).length > MAX_BYTES) {
    throw new Error('The input exceeds the 2 MiB limit. Use a smaller JSON document.');
  }
  let index = 0;
  const fail = (message, position = index) => { throw new JsonValidationError(message, source, position); };
  const space = () => { while (/[\t\n\r ]/.test(source[index] || '\u0000')) index++; };
  function string() {
    const start = index++;
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') {
        const raw = source.slice(start, index);
        try { return JSON.parse(raw); } catch { fail('Invalid string escape', start); }
      }
      if (char.charCodeAt(0) < 32) fail('Unescaped control character in a string', index - 1);
      if (char === '\\') {
        const escaped = source[index++];
        if (escaped === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(index, index + 4))) fail('Invalid Unicode escape', index);
          index += 4;
        } else if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(escaped)) {
          fail('Invalid string escape', index - 1);
        }
      }
    }
    fail('Unterminated string', start);
  }
  function value(depth) {
    if (depth > MAX_DEPTH) fail(`The nesting limit is ${MAX_DEPTH} levels`);
    space();
    const start = index;
    const char = source[index];
    if (char === '"') return { type: 'string', value: string() };
    if (char === '{') {
      index++;
      space();
      const entries = [];
      const seen = new Set();
      if (source[index] === '}') { index++; return { type: 'object', entries }; }
      while (index < source.length) {
        space();
        const keyStart = index;
        if (source[index] !== '"') fail('Expected a quoted object key');
        const key = string();
        if (seen.has(key)) fail(`Duplicate object key ${JSON.stringify(key).slice(0, 90)}`, keyStart);
        seen.add(key);
        space();
        if (source[index++] !== ':') fail('Expected a colon after the object key', index - 1);
        entries.push([key, value(depth + 1)]);
        space();
        const separator = source[index++];
        if (separator === '}') return { type: 'object', entries };
        if (separator !== ',') fail('Expected a comma or closing brace', index - 1);
      }
      fail('Unterminated object', start);
    }
    if (char === '[') {
      index++;
      space();
      const items = [];
      if (source[index] === ']') { index++; return { type: 'array', items }; }
      while (index < source.length) {
        items.push(value(depth + 1));
        space();
        const separator = source[index++];
        if (separator === ']') return { type: 'array', items };
        if (separator !== ',') fail('Expected a comma or closing bracket', index - 1);
      }
      fail('Unterminated array', start);
    }
    for (const [literal, type, literalValue] of [['true', 'boolean', true], ['false', 'boolean', false], ['null', 'null', null]]) {
      if (source.startsWith(literal, index)) {
        index += literal.length;
        return { type, value: literalValue };
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (number) {
      index += number[0].length;
      if (outsideSafeRange(number[0])) {
        fail('This number exceeds the safe range of ±9,007,199,254,740,991. Quote large identifiers as strings before formatting', start);
      }
      return { type: 'number', raw: number[0] };
    }
    fail(index === source.length ? 'Expected a JSON value' : 'Unexpected character; expected a JSON value');
  }
  const node = value(0);
  space();
  if (index !== source.length) fail('Unexpected text after the JSON value');
  return node;
}

export function summarize(node) {
  const result = { rootType: node.type, values: 0, keys: 0, objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, maxDepth: 0 };
  function walk(current, depth) {
    result.values++;
    result.maxDepth = Math.max(result.maxDepth, depth);
    const names = { object: 'objects', array: 'arrays', string: 'strings', number: 'numbers', boolean: 'booleans', null: 'nulls' };
    result[names[current.type]]++;
    if (current.type === 'object') {
      result.keys += current.entries.length;
      current.entries.forEach(([, child]) => walk(child, depth + 1));
    } else if (current.type === 'array') current.items.forEach(child => walk(child, depth + 1));
  }
  walk(node, 0);
  return result;
}

export function formatJson(source, { indent = '2', sortKeys = false, minify = false } = {}) {
  if (!['2', '4', 'tab'].includes(String(indent))) throw new Error('Choose 2 spaces, 4 spaces, or tabs.');
  const node = parseJson(source);
  const unit = minify ? '' : indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
  const chunks = [];
  const encoder = new TextEncoder();
  let outputBytes = 0;
  function write(text) {
    outputBytes += encoder.encode(text).length;
    if (outputBytes > MAX_OUTPUT_BYTES) throw new Error('The output would exceed 8 MiB. Try minifying, or format a smaller document.');
    chunks.push(text);
  }
  function render(current, depth) {
    if (current.type === 'number') { write(current.raw); return; }
    if (current.type !== 'object' && current.type !== 'array') { write(JSON.stringify(current.value)); return; }
    const isObject = current.type === 'object';
    const open = isObject ? '{' : '[';
    const close = isObject ? '}' : ']';
    const children = isObject
      ? sortKeys ? [...current.entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) : current.entries
      : current.items;
    write(open);
    children.forEach((child, index) => {
      if (index) write(',');
      if (unit) write('\n' + unit.repeat(depth + 1));
      if (isObject) {
        write(JSON.stringify(child[0]) + (unit ? ': ' : ':'));
        render(child[1], depth + 1);
      } else render(child, depth + 1);
    });
    if (children.length && unit) write('\n' + unit.repeat(depth));
    write(close);
  }
  render(node, 0);
  return { output: chunks.join(''), summary: summarize(node) };
}
