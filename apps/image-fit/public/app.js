import { LIMITS, OUTPUT_TYPES, CancelledTaskError, readImageHeader, validateDecodedDimensions, fitDimensions, targetBytesFromKB, encodeToTarget, formatBytes } from './core.mjs';

const $ = (id) => document.getElementById(id);
const form = $('image-form'), fileInput = $('image-file'), formatInput = $('output-format');
let version = 0, source = null, outputURL = null, loading = false, working = false;

function message(text, kind = '') { $('status').textContent = text; $('status').className = `notice ${kind}`.trim(); }
function refreshButtons() { $('optimize-button').disabled = !source || loading || working; $('sample-button').disabled = loading; }
function clearResult() {
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = null;
  $('after-preview').removeAttribute('src'); $('after-preview').hidden = true; $('after-placeholder').hidden = false;
  $('result').hidden = true; $('download-link').hidden = true; $('download-link').removeAttribute('href');
}
function discardSource() {
  if (source) { source.bitmap.close(); URL.revokeObjectURL(source.url); }
  source = null;
  $('before-preview').removeAttribute('src'); $('before-preview').hidden = true; $('before-placeholder').hidden = false;
  $('source-info').textContent = 'No image selected yet.';
}
function invalidate() { version++; working = false; loading = false; clearResult(); refreshButtons(); }
function noteFormat() {
  $('format-note').textContent = formatInput.value === 'jpeg'
    ? 'JPEG cannot store transparency. Transparent areas are filled with white.'
    : formatInput.value === 'png'
      ? 'PNG preserves transparency and is lossless. Its target is checked after one export; no lossy quality search is possible.'
      : 'WebP can preserve transparency. This browser must support WebP canvas export.';
}

async function chooseFile(file) {
  invalidate(); const task = version;
  discardSource(); loading = true; refreshButtons();
  message('Checking the file header before decoding…');
  let bitmap = null, url = null;
  try {
    if (!file || !file.size || file.size > LIMITS.maxFileBytes) throw new Error('Choose one image no larger than 10 MiB (10,485,760 bytes).');
    const bytes = await file.arrayBuffer();
    if (version !== task) return;
    const header = readImageHeader(bytes);
    if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot decode images with this tool. Try a current browser.');
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (version !== task) { bitmap.close(); return; }
    const dimensions = validateDecodedDimensions(header, bitmap.width, bitmap.height);
    url = URL.createObjectURL(file);
    source = { file, bitmap, url, header, ...dimensions };
    $('before-preview').src = url; $('before-preview').hidden = false; $('before-placeholder').hidden = true;
    $('source-info').textContent = `${file.name} · ${dimensions.width} × ${dimensions.height} px · ${formatBytes(file.size)}`;
    message('Image ready. Set your budget and maximum dimensions, then optimize.');
  } catch (error) {
    if (bitmap) bitmap.close();
    if (url) URL.revokeObjectURL(url);
    if (version === task) message(error.message || 'The image could not be opened.', 'error');
  } finally {
    if (version === task) { loading = false; refreshButtons(); }
  }
}

function canvasBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image. Try smaller dimensions.')), mime, quality); }
    catch (error) { reject(error); }
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!source || loading || working || !form.reportValidity()) return;
  invalidate(); const task = version, image = source;
  working = true; refreshButtons(); message('Encoding locally and checking the actual file size…');
  try {
    const targetBytes = targetBytesFromKB($('target-kb').value);
    const mime = OUTPUT_TYPES[formatInput.value];
    const dimensions = fitDimensions(image.width, image.height, Number($('max-width').value), Number($('max-height').value));
    const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create an image canvas.');
    if (mime === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image.bitmap, 0, 0, dimensions.width, dimensions.height);
    const result = await encodeToTarget({ mime, targetBytes, encode: (type, quality) => canvasBlob(canvas, type, quality), isCurrent: () => version === task });
    if (version !== task) return;
    outputURL = URL.createObjectURL(result.blob);
    $('after-preview').src = outputURL; $('after-preview').hidden = false; $('after-placeholder').hidden = true;
    $('result-size').textContent = formatBytes(result.blob.size);
    $('result-dimensions').textContent = `${dimensions.width} × ${dimensions.height} px`;
    $('result-target').textContent = formatBytes(targetBytes);
    $('result-quality').textContent = mime === 'image/png' ? 'PNG · lossless export' : `${mime === 'image/jpeg' ? 'JPEG' : 'WebP'} · quality ${(result.quality * 100).toFixed(1)}%`;
    const change = (1 - result.blob.size / image.file.size) * 100;
    $('result-comparison').textContent = `${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'smaller' : 'larger'} than the selected file · ${result.attempts} encoding ${result.attempts === 1 ? 'trial' : 'trials'}. Quality percentages are browser encoder settings, not a measurement of visual quality.`;
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    const filename = image.file.name.replace(/\.[^.]+$/, '').replace(/[\x00-\x1f/\\:*?"<>|]/g, '-').slice(0, 100) || 'image';
    const download = $('download-link'); download.href = outputURL; download.download = `${filename}-optimized.${extension}`; download.textContent = `Download ${mime === 'image/jpeg' ? 'JPEG' : mime === 'image/webp' ? 'WebP' : 'PNG'}`; download.hidden = false;
    $('result').hidden = false;
    if (result.targetReached) message(`Target met: the result is ${formatBytes(result.blob.size)}. Review the preview before downloading.`, 'success');
    else message(`Target not met: the result is ${formatBytes(result.blob.size)}. ${mime === 'image/png' ? 'PNG has no lossy quality control. Try WebP/JPEG if suitable, or reduce the maximum dimensions.' : 'The lowest sampled quality is still over budget. Reduce the maximum dimensions and try again.'}`, 'warning');
  } catch (error) {
    if (version === task && !(error instanceof CancelledTaskError)) { clearResult(); message(error.message || 'Image encoding failed.', 'error'); }
  } finally { if (version === task) { working = false; refreshButtons(); } }
});

fileInput.addEventListener('change', () => { if (fileInput.files[0]) void chooseFile(fileInput.files[0]); });
for (const id of ['target-kb', 'max-width', 'max-height', 'output-format']) $(id).addEventListener('input', () => { invalidate(); noteFormat(); message(source ? 'Settings changed. Optimize again to make a new result.' : 'Choose an image or try the sample to begin.'); });
$('reset-button').addEventListener('click', () => { invalidate(); loading = false; discardSource(); form.reset(); noteFormat(); refreshButtons(); message('Choose an image or try the sample to begin.'); });

const drop = $('drop-zone');
drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('dragover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
drop.addEventListener('drop', (event) => {
  event.preventDefault(); drop.classList.remove('dragover');
  const files = event.dataTransfer?.files;
  if (files?.length !== 1) { invalidate(); message('Drop exactly one JPEG, PNG or WebP image.', 'error'); return; }
  fileInput.value = ''; void chooseFile(files[0]);
});

$('sample-button').addEventListener('click', async () => {
  invalidate(); const task = version; loading = true; refreshButtons(); message('Drawing a local sample image…');
  try {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 800;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the sample.');
    const pixels = context.createImageData(canvas.width, canvas.height); let seed = 13579;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = ((seed >>> 24) - 128) / 8, at = (y * canvas.width + x) * 4;
      pixels.data[at] = 25 + x / 8 + grain; pixels.data[at + 1] = 95 + y / 7 + grain; pixels.data[at + 2] = 205 - x / 16 + grain; pixels.data[at + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    context.fillStyle = 'rgba(255,255,255,0.85)'; context.beginPath(); context.arc(930, 270, 155, 0, Math.PI * 2); context.fill();
    context.fillStyle = 'rgba(13,53,103,0.6)'; context.beginPath(); context.moveTo(0, 800); context.lineTo(380, 340); context.lineTo(770, 800); context.fill();
    context.fillStyle = 'rgba(255,255,255,0.25)'; context.beginPath(); context.moveTo(420, 800); context.lineTo(850, 410); context.lineTo(1280, 800); context.fill();
    context.fillStyle = '#ffffff'; context.font = 'bold 54px sans-serif'; context.fillText('A lighter image.', 76, 128);
    context.font = '26px sans-serif'; context.fillText('Generated in your browser · 1280 × 800', 78, 174);
    const blob = await canvasBlob(canvas, 'image/png');
    if (task !== version) return;
    loading = false; fileInput.value = '';
    await chooseFile(new File([blob], 'imagefit-sample.png', { type: 'image/png' }));
  } catch (error) { if (task === version) { loading = false; refreshButtons(); message(error.message || 'The sample could not be created.', 'error'); } }
});
noteFormat();
