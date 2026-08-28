/**
 * AudioWorkletProcessor: PCMPlayerProcessor
 * 
 * Runs on a dedicated Web Audio rendering thread.
 * 
 * Continuous Streaming Queue Architecture (Matching Official GenAI Reference):
 * - Clean sequential FIFO ring buffer
 * - Seamless linear resampling (24kHz -> Hardware 48kHz/44.1kHz)
 * - Safe buffer underrun tolerance (holds position during network jitter without dropping audio)
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 30-second ring buffer capacity (720,000 samples at 24kHz)
    this.bufferSize = 720000;
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.isPlaying = false;

    // Resampling ratio: 24kHz source per output hardware sample (e.g. 24000 / 48000 = 0.5)
    this.sourceSampleRate = 24000;
    this.step = this.sourceSampleRate / sampleRate;
    this.readFraction = 0.0;

    // 250ms pre-buffer before initial playback (6000 samples at 24kHz)
    this.startThreshold = 6000;
    this.emptyHoldCount = 0;
    this.emptyHoldLimit = Math.round((sampleRate * 0.8) / 128); // 800ms underrun tolerance for network spikes

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'push') {
        const floatSamples = data.samples;
        const len = floatSamples.length;
        if (len === 0) return;

        for (let i = 0; i < len; i++) {
          this.ringBuffer[this.writeIndex] = floatSamples[i];
          this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
        }
        this.emptyHoldCount = 0;

        const available = this.getAvailableSamples();
        if (!this.isPlaying && available >= this.startThreshold) {
          this.isPlaying = true;
          this.port.postMessage({ type: 'status', status: 'playing' });
        }
      } else if (data.type === 'clear') {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.readFraction = 0.0;
        this.isPlaying = false;
        this.emptyHoldCount = 0;
        this.port.postMessage({ type: 'status', status: 'idle' });
      }
    };
  }

  getAvailableSamples() {
    if (this.writeIndex >= this.readIndex) {
      return this.writeIndex - this.readIndex;
    }
    return this.bufferSize - (this.readIndex - this.writeIndex);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    const frameCount = channel.length; // 128 samples

    if (this.isPlaying) {
      const available = this.getAvailableSamples();

      if (available > 2) {
        for (let i = 0; i < frameCount; i++) {
          if (this.getAvailableSamples() > 2) {
            const idx0 = this.readIndex;
            const idx1 = (this.readIndex + 1) % this.bufferSize;

            const s0 = this.ringBuffer[idx0];
            const s1 = this.ringBuffer[idx1];
            channel[i] = s0 + (s1 - s0) * this.readFraction;

            this.readFraction += this.step;
            while (this.readFraction >= 1.0) {
              this.readFraction -= 1.0;
              this.readIndex = (this.readIndex + 1) % this.bufferSize;
            }
          } else {
            channel[i] = 0.0;
          }
        }
        this.emptyHoldCount = 0;
      } else {
        // Buffer momentarily starving: output silence during network jitter without resetting position
        for (let i = 0; i < frameCount; i++) {
          channel[i] = 0.0;
        }
        this.emptyHoldCount++;

        if (this.emptyHoldCount > this.emptyHoldLimit) {
          this.isPlaying = false;
          this.emptyHoldCount = 0;
          this.port.postMessage({ type: 'status', status: 'idle' });
        }
      }
    } else {
      for (let i = 0; i < frameCount; i++) {
        channel[i] = 0.0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);
