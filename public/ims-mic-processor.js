// Passes raw microphone frames to the page (useImsLive.js resamples them to 16 kHz for Gemini).
class ImsMic extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('ims-mic', ImsMic);
