/**
 * Dynamic Web Audio Ambient Soundscapes & RPG Sound Effects Engine
 * Procedurally generates immersive D&D / Tabletop atmospheres and crisp SFX
 * without requiring external downloads or broken asset links.
 */

class DndAudioEngine {
  constructor() {
    this.ctx = null;
    this.ambientGain = null;
    this.sfxGain = null;
    this.currentAtmosphere = null;
    this.activeNodes = [];
    this.ambientVolume = 0.35;
    this.sfxVolume = 0.7;
    this.isMuted = false;
    this.dropletTimer = null;
    this.crackleTimer = null;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    // Master Ambient bus
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.ctx.currentTime);
    this.ambientGain.connect(this.ctx.destination);

    // Master SFX bus
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    this.sfxGain.connect(this.ctx.destination);
  }

  ensureRunning() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setAmbientVolume(val) {
    this.ambientVolume = Math.max(0, Math.min(1, val));
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.isMuted ? 0 : this.ambientVolume, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.isMuted ? 0 : this.ambientVolume, this.ctx.currentTime, 0.05);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  stopAmbience() {
    if (this.dropletTimer) {
      clearTimeout(this.dropletTimer);
      this.dropletTimer = null;
    }
    if (this.crackleTimer) {
      clearTimeout(this.crackleTimer);
      this.crackleTimer = null;
    }
    for (const node of this.activeNodes) {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (_) {}
    }
    this.activeNodes = [];
    this.currentAtmosphere = null;
  }

  startAmbience(type = 'dungeon') {
    this.ensureRunning();
    if (!this.ctx) return;
    if (this.currentAtmosphere === type) return;

    this.stopAmbience();
    this.currentAtmosphere = type;

    switch (type) {
      case 'dungeon':
        this._buildDungeonSoundscape();
        break;
      case 'campfire':
        this._buildCampfireSoundscape();
        break;
      case 'tavern':
        this._buildTavernSoundscape();
        break;
      case 'scifi':
        this._buildScifiDerelictSoundscape();
        break;
      case 'storm':
        this._buildStormSoundscape();
        break;
      default:
        this._buildDungeonSoundscape();
    }
  }

  // --- PROCEDURAL AMBIENT SOUNDSCAPES ---

  _buildDungeonSoundscape() {
    const t = this.ctx.currentTime;

    // Sub-bass resonant cave drone
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(52, t);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(55, t); // Binaural slow beating 3 Hz

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    osc1.start();
    osc2.start();
    this.activeNodes.push(osc1, osc2, filter, gain);

    // Filtered air draft (pink noise)
    const noise = this._createNoiseBufferNode(true);
    if (noise) {
      const airFilter = this.ctx.createBiquadFilter();
      airFilter.type = 'bandpass';
      airFilter.frequency.setValueAtTime(280, t);
      airFilter.Q.setValueAtTime(1.8, t);

      const airGain = this.ctx.createGain();
      airGain.gain.setValueAtTime(0.08, t);

      noise.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(this.ambientGain);

      noise.start();
      this.activeNodes.push(noise, airFilter, airGain);
    }

    // Occasional cave water droplets
    const scheduleDroplet = () => {
      if (this.currentAtmosphere !== 'dungeon') return;
      const delay = 1800 + Math.random() * 3400;
      this.dropletTimer = setTimeout(() => {
        this._playDroplet();
        scheduleDroplet();
      }, delay);
    };
    scheduleDroplet();
  }

  _playDroplet() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freq = 1200 + Math.random() * 900;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ambientGain);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  _buildCampfireSoundscape() {
    const t = this.ctx.currentTime;

    // Warm nocturnal low breeze
    const noise = this._createNoiseBufferNode(true);
    if (noise) {
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(320, t);

      const windGain = this.ctx.createGain();
      windGain.gain.setValueAtTime(0.1, t);

      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.ambientGain);

      noise.start();
      this.activeNodes.push(noise, windFilter, windGain);
    }

    // Gentle warm fire hum
    const hum = this.ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.setValueAtTime(75, t);
    const humGain = this.ctx.createGain();
    humGain.gain.setValueAtTime(0.15, t);

    hum.connect(humGain);
    humGain.connect(this.ambientGain);
    hum.start();
    this.activeNodes.push(hum, humGain);

    // Random wood ember crackle pops
    const scheduleCrackle = () => {
      if (this.currentAtmosphere !== 'campfire') return;
      const delay = 120 + Math.random() * 450;
      this.crackleTimer = setTimeout(() => {
        this._playCracklePop();
        scheduleCrackle();
      }, delay);
    };
    scheduleCrackle();
  }

  _playCracklePop() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, t);

    osc.type = 'square';
    osc.frequency.setValueAtTime(800 + Math.random() * 1200, t);

    const dur = 0.02 + Math.random() * 0.04;
    gain.gain.setValueAtTime(0.06 + Math.random() * 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  _buildTavernSoundscape() {
    const t = this.ctx.currentTime;
    // Low warm room acoustic body
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    osc.start();

    // Muffled background crowd / murmur simulation
    const noise = this._createNoiseBufferNode(true);
    if (noise) {
      const murmurFilter = this.ctx.createBiquadFilter();
      murmurFilter.type = 'bandpass';
      murmurFilter.frequency.setValueAtTime(450, t);
      murmurFilter.Q.setValueAtTime(1.2, t);

      const murmurGain = this.ctx.createGain();
      murmurGain.gain.setValueAtTime(0.08, t);

      noise.connect(murmurFilter);
      murmurFilter.connect(murmurGain);
      murmurGain.connect(this.ambientGain);
      noise.start();
      this.activeNodes.push(noise, murmurFilter, murmurGain);
    }

    this.activeNodes.push(osc, filter, gain);
  }

  _buildScifiDerelictSoundscape() {
    const t = this.ctx.currentTime;
    // Reactor core sub hum with slow modulation (Alien RPG / Across a Thousand Dead Worlds)
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(42, t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(90, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);

    // High electrical tension tone
    const buzz = this.ctx.createOscillator();
    buzz.type = 'sine';
    buzz.frequency.setValueAtTime(240, t);
    const buzzGain = this.ctx.createGain();
    buzzGain.gain.setValueAtTime(0.03, t);

    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    buzz.connect(buzzGain);
    buzzGain.connect(this.ambientGain);

    sub.start();
    buzz.start();
    this.activeNodes.push(sub, filter, gain, buzz, buzzGain);
  }

  _buildStormSoundscape() {
    const t = this.ctx.currentTime;
    // Continuous heavy rain
    const noise = this._createNoiseBufferNode(true);
    if (noise) {
      const rainFilter = this.ctx.createBiquadFilter();
      rainFilter.type = 'lowpass';
      rainFilter.frequency.setValueAtTime(800, t);

      const rainGain = this.ctx.createGain();
      rainGain.gain.setValueAtTime(0.18, t);

      noise.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(this.ambientGain);
      noise.start();
      this.activeNodes.push(noise, rainFilter, rainGain);
    }
  }

  _createNoiseBufferNode(loop = true) {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    // Pink noise generation
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = loop;
    return node;
  }

  // --- SOUND EFFECTS (SFX) ---

  playSfx(name) {
    this.ensureRunning();
    if (!this.ctx || this.isMuted) return;

    switch (name) {
      case 'dice_roll':
        this._sfxDiceRoll();
        break;
      case 'sword_clash':
        this._sfxSwordClash();
        break;
      case 'shield_block':
        this._sfxShieldBlock();
        break;
      case 'spell_cast':
        this._sfxSpellCast();
        break;
      case 'door_creak':
        this._sfxDoorCreak();
        break;
      case 'critical_hit':
        this._sfxCriticalHit();
        break;
      case 'fumble':
        this._sfxFumble();
        break;
      case 'oracle_whisper':
        this._sfxOracleWhisper();
        break;
      default:
        this._sfxDiceRoll();
    }
  }

  // One die knocking the felt, the rim or another die (the 3D tray calls this on every hard contact; 0-1 strength)
  knock(strength = 0.5) {
    this.ensureRunning();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (this._lastKnock && now - this._lastKnock < 0.025) return; // a burst of contacts is one click
    this._lastKnock = now;
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 2200;
    bp.Q.value = 2.5;
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = 520 + Math.random() * 420;
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.18 * strength, now);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    const g = this.ctx.createGain();
    g.gain.value = 0.55 * Math.max(0.15, strength);
    src.connect(bp); bp.connect(g); g.connect(this.sfxGain);
    body.connect(bg); bg.connect(this.sfxGain);
    src.start(now); body.start(now); body.stop(now + 0.04);
  }

  _sfxDiceRoll() {
    const t = this.ctx.currentTime;
    const impacts = 4;
    for (let i = 0; i < impacts; i++) {
      const delay = i * 0.06 + Math.random() * 0.03;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600 + Math.random() * 600, t + delay);
      filter.Q.setValueAtTime(4.0, t + delay);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + Math.random() * 180, t + delay);

      const impactVol = (0.25 / (i + 1)) * (0.8 + Math.random() * 0.4);
      gain.gain.setValueAtTime(impactVol, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.05);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t + delay);
      osc.stop(t + delay + 0.06);
    }
  }

  _sfxSwordClash() {
    const t = this.ctx.currentTime;
    // Metallic clash high strike
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2200, t);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(3200, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.35);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.42);
  }

  _sfxShieldBlock() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);

    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.32);
  }

  _sfxSpellCast() {
    const t = this.ctx.currentTime;
    const notes = [440, 554, 659, 880]; // A Major arpeggio
    notes.forEach((freq, idx) => {
      const delay = idx * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);

      gain.gain.setValueAtTime(0.18, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.45);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t + delay);
      osc.stop(t + delay + 0.46);
    });
  }

  _sfxDoorCreak() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(320, t + 0.4);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.7);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.78);
  }

  _sfxCriticalHit() {
    const t = this.ctx.currentTime;
    // Golden chime fanfare
    const chords = [523.25, 659.25, 783.99, 1046.5]; // C Major
    chords.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.86);
    });
  }

  _sfxFumble() {
    const t = this.ctx.currentTime;
    // Low ominous dissonance
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, t);
    osc1.frequency.exponentialRampToValueAtTime(65, t + 0.6);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(116.54, t); // Minor second dissonance
    osc2.frequency.exponentialRampToValueAtTime(69, t + 0.6);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.66);
    osc2.stop(t + 0.66);
  }

  _sfxOracleWhisper() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.4);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.52);
  }
}

export const dndAudio = new DndAudioEngine();
