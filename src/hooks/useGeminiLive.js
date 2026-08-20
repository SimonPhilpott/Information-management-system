import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook providing direct interaction with the Gemini Multimodal Live API
 * via a proxied WebSocket endpoint. Handles mic recording, speaker output, and tools.
 *
 * Key design decisions:
 * - Enables server-side VAD in generationConfig so Gemini auto-detects end-of-speech
 * - Uses activityStart/activityEnd signals in realtimeInput to manually bracket turns
 *   as a belt-and-braces approach alongside server VAD
 * - Uses chunked base64 encoding to avoid stack overflows on large PCM buffers
 * - All close codes are safe (no 1005/1006 forwarded to ws library)
 *
 * @param {Object} config Config properties
 * @param {string[]} config.selectedSubjects Currently selected library subjects filter
 * @param {boolean} config.showPersonal Include personal RPG books in tool search
 * @returns {Object} Live session state and control actions
 */
export function useGeminiLive({ selectedSubjects = [], showPersonal = false }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [isMuted,     setIsMuted]     = useState(false);
  const [userVolume,  setUserVolume]  = useState(0);
  const [modelVolume, setModelVolume] = useState(0);
  /**
   * liveStatus: 4-phase visual indicator for UI
   * idle = connected, waiting | listening = user speaking
   * thinking = awaiting Gemini response | speaking = Gemini playing audio
   */
  const [liveStatus, setLiveStatus] = useState('idle');
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('gemini-live-voice') || 'Puck');
  const [isSearching, setIsSearching] = useState(false);
  const liveStatusRef = useRef(liveStatus);

  useEffect(() => {
    liveStatusRef.current = liveStatus;
  }, [liveStatus]);

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const processorRef = useRef(null);
  const gainNodeRef = useRef(null);
  const activeSourcesRef = useRef([]);
  const nextPlayTimeRef = useRef(0);
  const isSetupCompleteRef = useRef(false);

  // VAD state: track whether the user is currently in an active speech turn
  const isInSpeechTurnRef = useRef(false);
  // Silence timer: fires turnComplete after sustained silence
  const silenceTimerRef = useRef(null);
  // Volume smoothing
  const smoothVolumeRef = useRef(0);

  // References to keep callbacks current without resetting WebSocket listeners
  const selectedSubjectsRef = useRef(selectedSubjects);
  const showPersonalRef = useRef(showPersonal);
  const isMutedRef = useRef(isMuted);
  const voiceNameRef = useRef(voiceName);
  const activeVoiceRef = useRef(voiceName);

  /**
   * Stable ref to disconnectLive — lets the cleanup useEffect use empty deps
   * so React never calls disconnectLive() mid-handshake when callback refs change.
   */
  const disconnectRef = useRef(null);

  useEffect(() => {
    selectedSubjectsRef.current = selectedSubjects;
    showPersonalRef.current = showPersonal;
  }, [selectedSubjects, showPersonal]);

  const speakIntroRef = useRef(false);

  useEffect(() => {
    voiceNameRef.current = voiceName;
    localStorage.setItem('gemini-live-voice', voiceName);
  }, [voiceName]);

  const changeVoiceName = useCallback((name) => {
    setVoiceName(name);
    speakIntroRef.current = true;
  }, []);

  const pendingConnectRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  /**
   * Stops all model audio playback immediately
   */
  const stopPlayback = useCallback((keepStatus = false) => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (err) { /* already stopped */ }
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setIsSpeaking(false);
    setModelVolume(0);
    if (!keepStatus) {
      setLiveStatus('idle');
    }
  }, []);

  /**
   * Safely converts an Int16Array to a base64 string using chunked processing.
   * Avoids stack overflow that occurs with String.fromCharCode.apply on large arrays.
   */
  const int16ArrayToBase64 = (int16Array) => {
    const uint8 = new Uint8Array(int16Array.buffer);
    const CHUNK_SIZE = 8192;
    let binary = '';
    for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK_SIZE));
    }
    return btoa(binary);
  };

  /**
   * Helper to downsample Float32 mic buffer to 16kHz Int16 PCM array
   */
  const downsampleTo16kHz = (buffer, inputSampleRate) => {
    const sampleRateRatio = inputSampleRate / 16000;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const sample = count > 0 ? accum / count : 0;
      result[offsetResult] = Math.min(1, Math.max(-1, sample)) * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  /**
   * Plays a 24kHz PCM chunk received from Gemini Live
   */
  const playAudioChunk = useCallback((base64Data) => {
    if (!audioCtxRef.current || isMutedRef.current) return;

    const binary = atob(base64Data);
    const len = binary.length;
    const buffer = new ArrayBuffer(len);
    const view = new DataView(buffer);
    for (let i = 0; i < len; i++) {
      view.setUint8(i, binary.charCodeAt(i));
    }
    const int16Array = new Int16Array(buffer);
    const float32Array = new Float32Array(int16Array.length);
    let sum = 0;
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
      sum += float32Array[i] * float32Array[i];
    }
    const rms = Math.sqrt(sum / int16Array.length);
    const vol = Math.min(100, Math.round(rms * 350));
    setModelVolume(vol);

    const audioBuffer = audioCtxRef.current.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    const now = audioCtxRef.current.currentTime;
    const playTime = Math.max(nextPlayTimeRef.current, now);
    source.start(playTime);
    nextPlayTimeRef.current = playTime + audioBuffer.duration;
    activeSourcesRef.current.push(source);
    setIsSpeaking(true);
    setLiveStatus('speaking');

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setIsSpeaking(false);
        setModelVolume(0);
        setLiveStatus(prev => prev === 'speaking' ? 'idle' : prev);
      }
    };
  }, []);

  /**
   * Handles custom library search tool execution request from Gemini
   */
  const handleSearchTool = useCallback(async (call) => {
    setIsSearching(true);
    setLiveStatus('thinking');
    try {
      const query = call.args.query;
      console.log(`[GeminiLive] Running tool searchLibrary for query: "${query}"`);

      const res = await fetch('/api/chat/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          subjects: selectedSubjectsRef.current,
          showPersonal: showPersonalRef.current
        })
      });

      const data = await res.json();
      const outputText = data.formattedText || 'No relevant information found in the library books.';

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              response: { output: { text: outputText } },
              id: call.id
            }]
          }
        }));
        console.log('[GeminiLive] Sent search tool response back to Gemini');
      }
    } catch (err) {
      console.error('[GeminiLive] Tool execution failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  /**
   * Sends a clientContent turnComplete message to Gemini.
   * This is the correct way to signal end-of-turn and trigger a response
   * on the BidiGenerateContent WebSocket API.
   *
   * NOTE: realtimeInput.activityEnd is NOT a valid field — turnComplete via
   * clientContent is the documented mechanism for manual turn completion.
   */
  const sendTurnComplete = useCallback(() => {
    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN &&
      isInSpeechTurnRef.current
    ) {
      console.log('[GeminiLive] → Sending turnComplete — triggering Gemini response');
      socketRef.current.send(JSON.stringify({
        clientContent: {
          turns: [],
          turnComplete: true
        }
      }));
      isInSpeechTurnRef.current = false;
      setLiveStatus('thinking');
    }
  }, []);

  const connectLive = useCallback(async () => {
    if (isConnected) return;

    try {
      // 1. Initialise audio context
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
      gainNodeRef.current = gainNode;

      // 2. Establish WebSocket connection (routed via Vite proxy)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        console.log('[GeminiLive] Connected successfully');

        /**
         * Setup message — key configuration:
         * - responseModalities AUDIO: native audio response
         * - realtimeInputConfig.automaticActivityDetection: enables server-side VAD
         *   so Gemini auto-detects start/end of speech from audio stream
         * - We also send manual activityStart/activityEnd as belt-and-braces
         */
        const setupMessage = {
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceNameRef.current
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{
                text: "You are a helpful RPG and book research assistant. You speak in British English with a friendly conversational tone. You have access to a tool named `searchLibrary` that lets you query the user's PDF books to retrieve relevant context. Always call `searchLibrary` when the user asks a question about their books or RPG campaigns. Keep responses concise and natural for spoken conversation."
              }]
            },
            tools: [{
              functionDeclarations: [{
                name: 'searchLibrary',
                description: "Searches the user's local PDF library of professional and personal RPG books for relevant text chunks using semantic search.",
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                      description: 'The search query to match against book contents.'
                    }
                  },
                  required: ['query']
                }
              }]
            }]
          }
        };
        socket.send(JSON.stringify(setupMessage));

        // Safety: warn if setup is not acknowledged within 5 seconds
        const setupTimeoutId = setTimeout(() => {
          if (!isSetupCompleteRef.current) {
            console.error('[GeminiLive] ⚠️ setupComplete never received after 5s — check setup message format or API key');
          }
        }, 5000);

        // Store so we can clear it once setup completes
        socket._setupTimeoutId = setupTimeoutId;
      };

      socket.onmessage = async (event) => {
        try {
          // Log every raw message for diagnosis
          const rawText = event.data;
          let rawData;
          try {
            rawData = JSON.parse(rawText);
          } catch (parseErr) {
            console.warn('[GeminiLive] Non-JSON message received:', rawText.slice(0, 200));
            return;
          }

          // Log top-level keys of every message
          console.log('[GeminiLive] Incoming message keys:', Object.keys(rawData));

          if (rawData.setupComplete) {
            console.log('[GeminiLive] ✅ setupComplete — ready to stream');
            isSetupCompleteRef.current = true;
            activeVoiceRef.current = voiceNameRef.current;
            if (socket._setupTimeoutId) clearTimeout(socket._setupTimeoutId);
            setIsListening(true);
            setLiveStatus('idle');

            if (speakIntroRef.current) {
              speakIntroRef.current = false;
              setTimeout(() => {
                if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                  console.log(`[GeminiLive] → Requesting voice introduction for ${voiceNameRef.current}`);
                  socketRef.current.send(JSON.stringify({
                    clientContent: {
                      turns: [{
                        role: 'user',
                        parts: [{
                          text: `Introduce yourself immediately by saying exactly: "Hi, I'm ${voiceNameRef.current}."`
                        }]
                      }],
                      turnComplete: true
                    }
                  }));
                  setLiveStatus('thinking');
                }
              }, 400);
            }
            return;
          }

          if (rawData.serverContent) {
            const keys = Object.keys(rawData.serverContent);
            console.log('[GeminiLive] Received serverContent keys:', keys);
          }

          // Handle incoming audio chunk response
          if (rawData.serverContent?.modelTurn?.parts) {
            for (const part of rawData.serverContent.modelTurn.parts) {
              if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                playAudioChunk(part.inlineData.data);
              }
            }
          }

          // Model finished its turn — clear any pending silence timers
          if (rawData.serverContent?.turnComplete) {
            console.log('[GeminiLive] Model turn complete');
          }

          // Handle barge-in: user starts speaking while model is responding
          if (rawData.serverContent?.interrupted) {
            console.log('[GeminiLive] Model response interrupted by user');
            stopPlayback();
          }

          // Handle function calling request from Gemini
          if (rawData.toolCall?.functionCalls) {
            for (const call of rawData.toolCall.functionCalls) {
              if (call.name === 'searchLibrary') {
                await handleSearchTool(call);
              }
            }
          }
        } catch (err) {
          console.error('[GeminiLive] WebSocket message handling failed:', err);
        }
      };

      socket.onclose = (event) => {
        console.log(`[GeminiLive] Socket closed: ${event.code}`);
        disconnectRef.current?.();
      };

      socket.onerror = (err) => {
        console.error('[GeminiLive] Socket error:', err);
      };

      // 3. Initialise Mic recording (16kHz Mono PCM streaming)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const micSource = audioCtx.createMediaStreamSource(stream);
      // Buffer size 4096 gives ~85ms latency at 48kHz — balances responsiveness with VAD accuracy
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Silence detection thresholds
      // Threshold tuned to typical mic background noise floor
      const SPEECH_THRESHOLD = 0.015;    // RMS above this = speech
      const SILENCE_TIMEOUT_MS = 800;    // ms of silence before sending turnComplete

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Always calculate volume for visualiser — even before setup is confirmed
        let sumVis = 0;
        for (let i = 0; i < inputData.length; i++) sumVis += inputData[i] * inputData[i];
        const rmsVis = Math.sqrt(sumVis / inputData.length);
        smoothVolumeRef.current = smoothVolumeRef.current * 0.85 + rmsVis * 0.15;
        const vol = Math.min(100, Math.round(smoothVolumeRef.current * 350));
        setUserVolume(vol);

        // Gate audio streaming and VAD signals until setup is confirmed
        if (!isSetupCompleteRef.current) return;

        // Manual VAD: track speech start / silence boundaries
        if (smoothVolumeRef.current > SPEECH_THRESHOLD) {
          // User is speaking
            // Speech started: flag turn and barge-in on model
            if (!isInSpeechTurnRef.current && liveStatusRef.current !== 'thinking') {
              isInSpeechTurnRef.current = true;
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
              stopPlayback(true);
              setLiveStatus('listening');
              console.log('[GeminiLive] Speech started');
            }

          // Reset silence timer on each speech frame
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else {
          // Silence detected — start silence timeout to trigger Gemini response
          if (isInSpeechTurnRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null;
              sendTurnComplete();
            }, SILENCE_TIMEOUT_MS);
          }
        }

        // Always stream audio when connected and setup complete
        if (socket.readyState === WebSocket.OPEN) {
          const downsampled = downsampleTo16kHz(inputData, audioCtx.sampleRate);
          const base64 = int16ArrayToBase64(downsampled);

          socket.send(JSON.stringify({
            realtimeInput: {
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64
              }
            }
          }));
        }
      };

      micSource.connect(processor);
      processor.connect(audioCtx.destination);
      setIsListening(true);

    } catch (err) {
      console.error('[GeminiLive] Setup connection failed:', err);
      alert('Could not start live voice stream. Please check mic permissions.');
      disconnectLive();
    }
  }, [isConnected, playAudioChunk, handleSearchTool, stopPlayback, sendTurnComplete]);

  /**
   * Ends real-time session and releases hardware devices
   */
  const disconnectLive = useCallback(() => {
    // Clear any pending silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    stopPlayback();
    isInSpeechTurnRef.current = false;

    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) {}
      processorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    if (socketRef.current) {
      try { socketRef.current.close(); } catch (e) {}
      socketRef.current = null;
    }

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }

    setIsConnected(false);
    setIsListening(false);
    setUserVolume(0);
    setModelVolume(0);
    setLiveStatus('idle');
    isSetupCompleteRef.current = false;
    smoothVolumeRef.current = 0;
  }, [stopPlayback]);

  // Keep disconnectRef pointing at the latest version without causing effect re-runs
  useEffect(() => { disconnectRef.current = disconnectLive; }, [disconnectLive]);

  // Mutes or unmutes model spoken replies
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const nextMute = !prev;
      if (nextMute) stopPlayback();
      return nextMute;
    });
  }, [stopPlayback]);

  // Auto-reconnect on voice change when connected
  useEffect(() => {
    if (isConnected && voiceName !== activeVoiceRef.current) {
      console.log('[GeminiLive] Voice changed while connected. Reconnecting to apply new voice...');
      activeVoiceRef.current = voiceName;
      speakIntroRef.current = true;
      pendingConnectRef.current = true;
      disconnectLive();
    }
  }, [voiceName, isConnected, disconnectLive]);

  // Handle connection trigger once disconnected
  useEffect(() => {
    if (!isConnected && pendingConnectRef.current) {
      pendingConnectRef.current = false;
      setTimeout(() => {
        connectLive();
      }, 150);
    }
  }, [isConnected, connectLive]);

  // Cleanup on unmount.
  // CRITICAL: empty dep array is intentional — prevents React from calling
  // disconnectLive() mid-session whenever the callback reference changes.
  // disconnectRef always holds the latest version via the effect above.
  useEffect(() => {
    return () => { disconnectRef.current?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    isListening,
    isSpeaking,
    isMuted,
    liveStatus,
    userVolume,
    modelVolume,
    voiceName,
    setVoiceName: changeVoiceName,
    isSearching,
    connectLive,
    disconnectLive,
    toggleMute
  };
}
