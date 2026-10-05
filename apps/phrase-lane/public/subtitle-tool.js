'use strict';

(() => {
  const form = document.getElementById('subtitleForm');
  if (!form) return;

  const input = document.getElementById('captions');
  const duration = document.getElementById('duration');
  const format = document.getElementById('subtitleFormat');
  const output = document.getElementById('srtOutput');
  const feedback = document.getElementById('subtitleStatus');
  const counter = document.getElementById('captionCount');
  const summary = document.getElementById('subtitleSummary');
  const copy = document.getElementById('copySubtitles');
  const save = document.getElementById('saveSrt');
  const formats = {
    srt: { label: 'SRT', help: 'Numbered captions with timestamps.', mime: 'application/x-subrip;charset=utf-8' },
    vtt: { label: 'WebVTT', help: 'Timed captions for web video players.', mime: 'text/vtt;charset=utf-8' },
    txt: { label: 'plain text', help: 'Caption text only, without timestamps.', mime: 'text/plain;charset=utf-8' }
  };
  let result = null;
  let revision = 0;

  function message(text, error = false) {
    feedback.textContent = text;
    feedback.classList.toggle('error', error);
  }

  function lines() {
    return input.value.split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean);
  }

  function count() {
    const total = lines().length;
    const characters = input.value.length;
    counter.textContent = `${total.toLocaleString('en-US')} / 200 captions · ${characters.toLocaleString('en-US')} / 20,000 characters`;
    counter.classList.toggle('error', total > 200 || characters > 20000);
  }

  function invalidate() {
    result = null;
    revision++;
    output.value = '';
    copy.disabled = true;
    save.disabled = true;
    summary.textContent = 'Ready when you are';
    input.removeAttribute('aria-invalid');
    duration.removeAttribute('aria-invalid');
    const selected = formats[format.value] || formats.srt;
    document.getElementById('outputLabel').textContent = `Your ${selected.label} draft`;
    document.getElementById('formatHelp').textContent = selected.help;
    save.textContent = `Download .${formats[format.value] ? format.value : 'srt'}`;
    count();
  }

  function changed() {
    const hadResult = Boolean(result);
    invalidate();
    message(hadResult ? 'Your input changed. Create a new draft to preview, copy or download it.' : 'Create a draft when your captions and settings are ready.');
  }

  function stamp(seconds, separator) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = seconds % 60;
    return [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':') + separator + '000';
  }

  function fail(text, field) {
    message(text, true);
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    invalidate();
    const captions = lines();
    const seconds = Number(duration.value);
    const extension = format.value;
    if (!captions.length) return fail('Enter at least one caption, or use Try a sample.', input);
    if (captions.length > 200 || input.value.length > 20000) return fail('Use up to 200 non-empty caption lines and 20,000 characters.', input);
    if (!duration.value.trim() || !Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 1 || seconds > 30) return fail('Enter a whole number of seconds from 1 to 30.', duration);
    if (!formats[extension]) return fail('Choose SRT, WebVTT or plain text.', format);

    let text;
    if (extension === 'txt') {
      text = captions.join('\n') + '\n';
    } else {
      const separator = extension === 'vtt' ? '.' : ',';
      const cues = captions.map((caption, index) => {
        // WebVTT interprets angle brackets and ampersands as cue markup.
        const captionText = extension === 'vtt' ? caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : caption;
        return `${index + 1}\n${stamp(index * seconds, separator)} --> ${stamp((index + 1) * seconds, separator)}\n${captionText}`;
      });
      text = (extension === 'vtt' ? 'WEBVTT\n\n' : '') + cues.join('\n\n') + '\n';
    }
    result = { text, extension, mime: formats[extension].mime };
    output.value = text;
    copy.disabled = false;
    save.disabled = false;
    summary.textContent = extension === 'txt' ? `${captions.length} captions · text only` : `${captions.length} captions · ${stamp(captions.length * seconds, '.').slice(0, -4)} total`;
    message(extension === 'txt' ? 'Text draft ready. Preview, copy or download your captions.' : 'Draft ready. Preview, copy or download it, then adjust the timing to match your video.');
  });

  input.addEventListener('input', changed);
  duration.addEventListener('input', changed);
  duration.addEventListener('change', changed);
  format.addEventListener('change', changed);

  document.getElementById('sampleCaptions').addEventListener('click', () => {
    input.value = 'Welcome to our studio.\nToday we are sharing a new idea.\nStart small. Make it useful.\nThanks for watching.';
    invalidate();
    message('Sample loaded. Choose your format, then create a draft.');
    input.focus();
  });

  document.getElementById('clearSrt').addEventListener('click', () => {
    input.value = '';
    invalidate();
    message('Captions and draft cleared.');
    input.focus();
  });

  copy.addEventListener('click', async () => {
    if (!result) return;
    const currentRevision = revision;
    const text = result.text;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (currentRevision === revision) message('Draft copied to your clipboard.');
    } catch {
      if (currentRevision !== revision) return;
      output.focus();
      output.select();
      output.setSelectionRange(0, output.value.length);
      let copied = false;
      try { copied = typeof document.execCommand === 'function' && document.execCommand('copy'); } catch { /* Keep selected text available for manual copy. */ }
      message(copied ? 'Draft copied to your clipboard.' : 'Draft selected. Use your device’s Copy command, or download the file.');
    }
  });

  save.addEventListener('click', () => {
    if (!result) return;
    let objectUrl;
    let link;
    try {
      objectUrl = URL.createObjectURL(new Blob([result.text], { type: result.mime }));
      link = document.createElement('a');
      link.href = objectUrl;
      link.download = `phraselane-captions.${result.extension}`;
      document.body.appendChild(link);
      link.click();
      message(`Your .${result.extension} download has started. Check your browser’s downloads.`);
    } catch {
      message('The file could not be downloaded. Use Copy draft to save the text instead.', true);
    } finally {
      if (link) link.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  });

  invalidate();
})();
