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
 * @param {Object} config Config properties
 * @param {string[]} config.selectedSubjects Currently selected library subjects filter
 * @param {boolean} config.showPersonal Include personal RPG books in tool search
 * @param {Function} config.onUserTranscript Callback when user speaks into microphone
 * @param {Function} config.onModelTranscript Callback when Gemini speaks or returns answers
 * @returns {Object} Live session state and control actions
 */
export function useGeminiLive({ selectedSubjects = [], showPersonal = false, onUserTranscript = null, onModelTranscript = null }) {
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
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const sessionStartTimeRef = useRef(null);
  const sessionTimerIntervalRef = useRef(null);
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('gemini-live-voice') || 'Puck');
  const [isVoiceLocked, setIsVoiceLocked] = useState(() => localStorage.getItem('gemini-live-voice-locked') === 'true');
  const [isSearching, setIsSearching] = useState(false);
  const liveStatusRef = useRef(liveStatus);

  // Precision Session Elapsed Stopwatch
  useEffect(() => {
    if (isConnected) {
      sessionStartTimeRef.current = Date.now();
      setSessionElapsedMs(0);
      sessionTimerIntervalRef.current = setInterval(() => {
        if (sessionStartTimeRef.current) {
          setSessionElapsedMs(Date.now() - sessionStartTimeRef.current);
        }
      }, 100);
    } else {
      if (sessionTimerIntervalRef.current) {
        clearInterval(sessionTimerIntervalRef.current);
        sessionTimerIntervalRef.current = null;
      }
      sessionStartTimeRef.current = null;
      setSessionElapsedMs(0);
    }

    return () => {
      if (sessionTimerIntervalRef.current) {
        clearInterval(sessionTimerIntervalRef.current);
      }
    };
  }, [isConnected]);

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
  // Audio drain debounce timer
  const drainTimerRef = useRef(null);
  // Inactivity auto-close timer (30 seconds default)
  const inactivityTimerRef = useRef(null);
  const lastActivityTimeRef = useRef(Date.now());
  // Mobile & Desktop Screen WakeLock reference to prevent screen sleep/lock
  const wakeLockRef = useRef(null);
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

  const onUserTranscriptRef = useRef(onUserTranscript);
  const onModelTranscriptRef = useRef(onModelTranscript);
  const speechRecognitionRef = useRef(null);

  useEffect(() => {
    selectedSubjectsRef.current = selectedSubjects;
    showPersonalRef.current = showPersonal;
    onUserTranscriptRef.current = onUserTranscript;
    onModelTranscriptRef.current = onModelTranscript;
  }, [selectedSubjects, showPersonal, onUserTranscript, onModelTranscript]);

  const speakIntroRef = useRef(false);

  useEffect(() => {
    voiceNameRef.current = voiceName;
    localStorage.setItem('gemini-live-voice', voiceName);
  }, [voiceName]);

  useEffect(() => {
    localStorage.setItem('gemini-live-voice-locked', String(isVoiceLocked));
  }, [isVoiceLocked]);

  const toggleVoiceLock = useCallback(() => {
    setIsVoiceLocked(prev => !prev);
  }, []);

  const changeVoiceName = useCallback((name) => {
    if (isVoiceLocked) return;
    setVoiceName(name);
    speakIntroRef.current = true;
  }, [isVoiceLocked]);

  const pendingConnectRef = useRef(false);

  const workletNodeRef = useRef(null);

  /**
   * Stops all model audio playback immediately
   */
  const stopPlayback = useCallback((keepStatus = false) => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'clear' });
    }
    setIsSpeaking(false);
    setModelVolume(0);
    if (!keepStatus) {
      setLiveStatus('idle');
    }
  }, []);

  /**
   * AudioWorklet PCM Streamer:
   * Decodes incoming 24kHz Little-Endian PCM into float buffers and pushes directly
   * to the dedicated PCMPlayerProcessor AudioWorklet on the audio rendering thread.
   */
  const playAudioChunk = useCallback((base64Data) => {
    if (!workletNodeRef.current || isMutedRef.current) return;

    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }

    const binary = atob(base64Data);
    const len = binary.length;
    const buffer = new ArrayBuffer(len);
    const view = new DataView(buffer);
    for (let i = 0; i < len; i++) {
      view.setUint8(i, binary.charCodeAt(i));
    }

    const numSamples = Math.floor(len / 2);
    if (numSamples === 0) return;

    // Decode 16-bit signed PCM (Little-Endian) to Float32 [-1.0, 1.0]
    const float32Array = new Float32Array(numSamples);
    let sum = 0;
    for (let i = 0; i < numSamples; i++) {
      const sample = view.getInt16(i * 2, true) / 32768.0;
      float32Array[i] = sample;
      sum += sample * sample;
    }

    // Measure RMS volume for UI meter
    const rms = Math.sqrt(sum / numSamples);
    const vol = Math.min(100, Math.round(rms * 350));
    setModelVolume(vol);

    // Post raw 24kHz samples directly to dedicated AudioWorklet
    workletNodeRef.current.port.postMessage({
      type: 'push',
      samples: float32Array
    });
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
   * Resets the inactivity timeout (default 30 seconds of pure idle silence).
   * Will NEVER disconnect while Gemini is speaking, thinking, or while the user is speaking.
   */
  const DEFAULT_INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds

  const resetInactivityTimer = useCallback((durationMs = DEFAULT_INACTIVITY_TIMEOUT_MS) => {
    lastActivityTimeRef.current = Date.now();
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    inactivityTimerRef.current = setTimeout(() => {
      // Safety check: verify the session is genuinely in idle silence
      const isSpeaking = activeSourcesRef.current.length > 0 || liveStatusRef.current === 'speaking';
      const isThinking = liveStatusRef.current === 'thinking';
      const isUserSpeaking = isInSpeechTurnRef.current;
      const elapsedSinceActivity = Date.now() - lastActivityTimeRef.current;

      // Only disconnect if genuinely idle with >= durationMs of dead silence
      if (!isSpeaking && !isThinking && !isUserSpeaking && elapsedSinceActivity >= (durationMs - 500)) {
        console.log(`[GeminiLive] 30s of uninterrupted idle silence reached. Auto-closing voice session.`);
        disconnectRef.current?.();
      } else {
        // Voice is actively in use or model is responding — re-arm timer safely
        resetInactivityTimer(durationMs);
      }
    }, durationMs);
  }, []);

  /**
   * Acquires a Screen WakeLock to prevent mobile/desktop screens from turning off or sleeping
   */
  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[GeminiLive] 📱 Screen WakeLock acquired (display will stay awake during voice)');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('[GeminiLive] 📱 Screen WakeLock released');
        });
      } catch (err) {
        console.warn('[GeminiLive] WakeLock request notice:', err.message);
      }
    }
  }, []);

  /**
   * Releases Screen WakeLock
   */
  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch (e) {}
      wakeLockRef.current = null;
    }
  }, []);

  /**
   * Handles keep-alive extension when the user says "hang on", "hold on", "wait", etc.
   */
  const handleExtendKeepAlive = useCallback((call) => {
    const minutes = (call.args && call.args.minutes) ? Number(call.args.minutes) : 3;
    const durationMs = Math.max(60000, minutes * 60 * 1000);
    console.log(`[GeminiLive] User requested pause/hold on. Extending voice keep-alive to ${minutes} minute(s).`);
    resetInactivityTimer(durationMs);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        toolResponse: {
          functionResponses: [{
            response: { output: { status: 'extended', durationMinutes: minutes, message: `Voice session kept open for ${minutes} minutes.` } },
            id: call.id
          }]
        }
      }));
    }
  }, [resetInactivityTimer]);

  /**
   * Handles session closure when the user says "bye", "goodbye", "exit", etc.
   */
  const handleCloseSession = useCallback((call) => {
    console.log('[GeminiLive] User said farewell / requested exit ("bye"). Closing session.');
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        toolResponse: {
          functionResponses: [{
            response: { output: { status: 'closing', message: 'Session will disconnect.' } },
            id: call.id
          }]
        }
      }));
    }
    // Allow brief farewell audio to finish, then cleanly disconnect
    setTimeout(() => {
      disconnectRef.current?.();
    }, 1800);
  }, []);

  /**
   * Handles custom library search tool execution request from Gemini
   */
  const handleSearchTool = useCallback(async (call) => {
    setIsSearching(true);
    setLiveStatus('thinking');
    resetInactivityTimer();
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
      resetInactivityTimer();
    }
  }, [resetInactivityTimer]);

  /**
   * Sends a clientContent turnComplete message to Gemini.
   * This is the correct way to signal end-of-turn and trigger a response
   * on the BidiGenerateContent WebSocket API.
   *
   * NOTE: realtimeInput.activityEnd is NOT a valid field — turnComplete via
   * clientContent is the documented mechanism for manual turn completion.
   */
  const sendTurnComplete = useCallback(() => {
    // If model is already responding/speaking, never inject a turnComplete into active generation
    if (liveStatusRef.current === 'speaking' || activeSourcesRef.current.length > 0) {
      isInSpeechTurnRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }

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
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
      gainNodeRef.current = gainNode;

      // Load PCM Player AudioWorklet (with cache buster)
      try {
        await audioCtx.audioWorklet.addModule(`/pcm-player-processor.js?v=${Date.now()}`);
        const workletNode = new AudioWorkletNode(audioCtx, 'pcm-player-processor');
        workletNode.port.onmessage = (e) => {
          if (e.data?.type === 'status') {
            if (e.data.status === 'playing') {
              setIsSpeaking(true);
              setLiveStatus('speaking');
            } else if (e.data.status === 'idle') {
              setIsSpeaking(false);
              setModelVolume(0);
              setLiveStatus(prev => prev === 'speaking' ? 'idle' : prev);
            }
          }
        };
        workletNode.connect(gainNode);
        workletNodeRef.current = workletNode;
      } catch (workletErr) {
        console.error('[GeminiLive] AudioWorklet load failed:', workletErr);
      }

      // 2. Establish WebSocket connection (routed via Vite proxy)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        console.log('[GeminiLive] Connected successfully');
        acquireWakeLock();

        /**
         * Setup message — key configuration:
         * - responseModalities AUDIO: native high-speed audio stream
         */
        const setupMessage = {
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            generationConfig: {
              responseModalities: ['AUDIO'],
              temperature: 1.0,
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
                text: "You are an intelligent knowledge assistant for the user's PDF library and document collection. You speak in natural, friendly British English. When answering questions, focus strictly on the topic the user asks about (e.g. software engineering, game design, business, RPGs, or history). NEVER bring up unrelated categories or RPG rulebooks unless the user explicitly asks about them. You have access to three tools: 1) `searchLibrary` to query the user's PDF books; 2) `extendKeepAlive` if the user asks you to wait; 3) `closeSession` if the user says goodbye."
              }]
            },
            tools: [{
              functionDeclarations: [
                {
                  name: 'searchLibrary',
                  description: "Searches the user's local PDF library of books for relevant text chunks using semantic search.",
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
                },
                {
                  name: 'extendKeepAlive',
                  description: 'Extends the voice inactivity timeout when the user says "hang on", "hold on", "wait a minute", "give me a second", or asks to pause.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      minutes: {
                        type: 'NUMBER',
                        description: 'Number of minutes to keep the voice session active while waiting (default 3).'
                      }
                    }
                  }
                },
                {
                  name: 'closeSession',
                  description: 'Closes the real-time voice session when the user says goodbye or expresses intent to end the conversation.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      reason: {
                        type: 'STRING',
                        description: 'The reason for ending the session.'
                      }
                    }
                  }
                }
              ]
            }]
          }
        };

        socket.send(JSON.stringify(setupMessage));
        console.log('[GeminiLive] Sent setup configuration with AUDIO + TEXT modalities');
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

          if (rawData.setupComplete) {
            console.log('[GeminiLive] ✅ setupComplete — ready to stream');
            isSetupCompleteRef.current = true;
            activeVoiceRef.current = voiceNameRef.current;
            if (socket._setupTimeoutId) clearTimeout(socket._setupTimeoutId);
            setIsListening(true);
            setLiveStatus('idle');
            resetInactivityTimer();

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

          // Handle incoming audio chunk and text transcript response
          if (rawData.serverContent?.modelTurn?.parts) {
            // Cancel any pending turnComplete silence timer immediately on receiving model response
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
            isInSpeechTurnRef.current = false;
            resetInactivityTimer();

            for (const part of rawData.serverContent.modelTurn.parts) {
              // Audio stream
              if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                playAudioChunk(part.inlineData.data);
              }
              // Text transcript
              if (part.text && onTranscriptRef.current) {
                onTranscriptRef.current(part.text);
              }
            }
          }

          // Model finished its turn — clear any pending silence timers
          if (rawData.serverContent?.turnComplete) {
            console.log('[GeminiLive] Model turn complete');
            resetInactivityTimer();
          }

          // Handle barge-in: user starts speaking while model is responding
          if (rawData.serverContent?.interrupted) {
            console.log('[GeminiLive] Model response interrupted by user');
            stopPlayback();
            resetInactivityTimer();
          }

          // Handle function calling request from Gemini
          if (rawData.toolCall?.functionCalls) {
            for (const call of rawData.toolCall.functionCalls) {
              if (call.name === 'searchLibrary') {
                await handleSearchTool(call);
              } else if (call.name === 'extendKeepAlive') {
                handleExtendKeepAlive(call);
              } else if (call.name === 'closeSession') {
                handleCloseSession(call);
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

      // 3. Initialise Speech Recognition in British English (en-GB) to capture live user prompts into chat history
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognizer = new SpeechRecognition();
          recognizer.lang = 'en-GB';
          recognizer.continuous = true;
          recognizer.interimResults = false;
          recognizer.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) {
                const transcript = res[0]?.transcript?.trim();
                if (transcript && onUserTranscriptRef.current) {
                  console.log('[GeminiLive] 🎙️ User spoken prompt recognized:', transcript);
                  onUserTranscriptRef.current(transcript);
                }
              }
            }
          };
          recognizer.onerror = (e) => {
            console.warn('[GeminiLive] Speech recognition notice:', e.error);
          };
          recognizer.start();
          speechRecognitionRef.current = recognizer;
        } catch (recErr) {
          console.warn('[GeminiLive] Could not start speech recognition:', recErr.message);
        }
      }

      // 4. Initialise Mic recording with Hardware Echo Cancellation and Noise Suppression
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          googEchoCancellation: { ideal: true },
          googAutoGainControl: { ideal: true },
          googNoiseSuppression: { ideal: true },
          googHighpassFilter: { ideal: true },
          channelCount: 1,
          sampleRate: 16000
        }, 
        video: false 
      });
      micStreamRef.current = stream;

      const micSource = audioCtx.createMediaStreamSource(stream);
      // Buffer size 4096 gives ~85ms latency at 48kHz
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Silence detection thresholds
      const SPEECH_THRESHOLD = 0.018;    // RMS above this = genuine user speech
      const SILENCE_TIMEOUT_MS = 900;    // ms of silence before sending turnComplete

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Always calculate volume for visualiser
        let sumVis = 0;
        for (let i = 0; i < inputData.length; i++) sumVis += inputData[i] * inputData[i];
        const rmsVis = Math.sqrt(sumVis / inputData.length);
        smoothVolumeRef.current = smoothVolumeRef.current * 0.85 + rmsVis * 0.15;
        const vol = Math.min(100, Math.round(smoothVolumeRef.current * 350));
        setUserVolume(vol);

        // Gate audio streaming and VAD signals until setup is confirmed
        if (!isSetupCompleteRef.current) return;

        const isModelSpeaking = liveStatusRef.current === 'speaking' || isSpeaking;

        // Half-Duplex Protection: When the model is speaking through the speakers,
        // suppress mic transmission to prevent Google's VAD from hearing its own voice and cutting off speech.
        if (isModelSpeaking) {
          return;
        }

        // Stream audio to Gemini when user speaks
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
  }, [isConnected, playAudioChunk, handleSearchTool, handleExtendKeepAlive, handleCloseSession, resetInactivityTimer, stopPlayback, sendTurnComplete]);

  /**
   * Ends real-time session and releases hardware devices
   */
  const disconnectLive = useCallback(() => {
    // Clear any pending silence or inactivity timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    releaseWakeLock();
    stopPlayback();
    isInSpeechTurnRef.current = false;

    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) {}
      processorRef.current = null;
    }

    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch (e) {}
      workletNodeRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
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

  // Visibility change & WakeLock re-acquisition listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isConnected && document.visibilityState === 'visible') {
        acquireWakeLock();
        // Resume audio context if mobile browser suspended it during tab switch
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, acquireWakeLock]);

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
    isVoiceLocked,
    toggleVoiceLock,
    isSearching,
    sessionElapsedMs,
    connectLive,
    disconnectLive,
    toggleMute
  };
}
