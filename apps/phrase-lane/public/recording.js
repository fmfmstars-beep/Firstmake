export const MAX_RECORD_SECONDS = 30;
export const MIN_RECORD_SECONDS = 2;
export const WAV_SAMPLE_RATE = 16000;

export function encodeMonoWav(samples, inputRate) {
  if (!(samples instanceof Float32Array) || !Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 192000) throw new Error('Recording could not be converted. Please type your message instead.');
  const duration = samples.length / inputRate;
  if (duration < MIN_RECORD_SECONDS) throw new Error('Record at least 2 seconds, or type your message instead.');
  if (duration > MAX_RECORD_SECONDS + 0.01) throw new Error('Keep the recording under 30 seconds.');
  const count = Math.min(MAX_RECORD_SECONDS * WAV_SAMPLE_RATE, Math.floor(duration * WAV_SAMPLE_RATE));
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, WAV_SAMPLE_RATE, true); view.setUint32(28, WAV_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    const position = index * inputRate / WAV_SAMPLE_RATE;
    const left = Math.floor(position), right = Math.min(left + 1, samples.length - 1), fraction = position - left;
    const value = samples[left] * (1 - fraction) + samples[right] * fraction;
    const clamped = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    view.setInt16(44 + index * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(buffer);
}

export class MessageRecorder {
  constructor({onTick = () => {}, onComplete = () => {}, onError = () => {}} = {}) {
    this.onTick = onTick; this.onComplete = onComplete; this.onError = onError;
    this.generation = 0; this.state = 'idle'; this.chunks = []; this.length = 0;
  }
  static supported() { return Boolean(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext)); }
  async start() {
    if (this.state !== 'idle') return;
    if (!MessageRecorder.supported()) throw new Error('Recording is unavailable in this browser. Type your message instead.');
    const generation = ++this.generation;
    this.state = 'requesting';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}, video: false});
      if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const Context = window.AudioContext || window.webkitAudioContext;
      this.context = new Context(); await this.context.resume();
      if (generation !== this.generation) { await this.release(); return; }
      if (typeof this.context.createScriptProcessor !== 'function') throw new Error('Recording is unavailable here. Type your message instead.');
      this.sampleRate = this.context.sampleRate;
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.mute = this.context.createGain(); this.mute.gain.value = 0;
      this.chunks = []; this.length = 0; this.state = 'recording'; this.startedAt = performance.now();
      this.processor.onaudioprocess = (event) => {
        if (this.state !== 'recording' || generation !== this.generation) return;
        const incoming = event.inputBuffer.getChannelData(0);
        const available = Math.max(0, Math.floor(this.sampleRate * MAX_RECORD_SECONDS) - this.length);
        if (!available) return;
        const chunk = incoming.slice(0, available); this.chunks.push(chunk); this.length += chunk.length;
      };
      this.source.connect(this.processor); this.processor.connect(this.mute); this.mute.connect(this.context.destination);
      this.onTick(MAX_RECORD_SECONDS);
      this.interval = setInterval(() => this.onTick(Math.max(0, Math.ceil(MAX_RECORD_SECONDS - (performance.now() - this.startedAt) / 1000))), 200);
      this.timer = setTimeout(() => this.stop().catch((error) => this.onError(error)), MAX_RECORD_SECONDS * 1000);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.cancel();
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') throw new Error('Microphone permission was denied. You can still type your message.');
      throw new Error(error.message || 'The microphone could not start. Type your message instead.');
    }
  }
  async stop() {
    if (this.state !== 'recording') return;
    const generation = this.generation;
    this.state = 'stopping'; const samples = new Float32Array(this.length);
    let offset = 0; for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    const sampleRate = this.sampleRate; this.chunks = []; this.length = 0;
    await this.release();
    if (generation !== this.generation) { samples.fill(0); return; }
    this.state = 'idle';
    try { const wav = encodeMonoWav(samples, sampleRate); this.onComplete(wav); return wav; }
    finally { samples.fill(0); }
  }
  async release() {
    clearTimeout(this.timer); clearInterval(this.interval);
    if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); }
    this.source?.disconnect(); this.mute?.disconnect(); this.stream?.getTracks().forEach((track) => track.stop());
    const context = this.context; this.context = null; this.source = null; this.processor = null; this.mute = null; this.stream = null;
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }
  async cancel() { ++this.generation; this.state = 'idle'; this.chunks = []; this.length = 0; await this.release(); }
}
