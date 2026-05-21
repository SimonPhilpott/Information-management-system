import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook providing integrated Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities.
 * 
 * DESIGN RATIONALE:
 * - Employs the Web Speech API (speech recognition and fallback synthesis) tuned to en-GB.
 * - Prioritises user interruption: User speaking/mic starting immediately interrupts active TTS.
 * - Integrates with a premium backend neural TTS endpoint for high-fidelity responses.
 * 
 * @returns {Object} An object containing voice state and action handlers.
 */
export function useVoiceEngine() {
  const [isListening, setIsListening] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(() => localStorage.getItem('voice-tts-enabled') === 'true');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef({ recognition: null, audio: null });

  // Initialize Speech Recognition and warm up standard voices on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-GB'; // Strictly en-GB regionalisation constraint
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event) => {
        console.error('[VoiceEngine] Recognition error:', event.error);
        setIsListening(false);
      };
      recognitionRef.current.recognition = recognition;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    return () => {
      if (recognitionRef.current?.audio) {
        try {
          recognitionRef.current.audio.pause();
        } catch (err) {
          // Silent fallback to avoid unmounted state crashes
        }
      }
    };
  }, []);

  /**
   * Interrupts and halts all active speech output immediately.
   * 
   * DESIGN RATIONALE:
   * - Ensures fluid dialog dynamics where the user can immediately "barg-in" and cut off the AI.
   * - Releases audio streams and browser speech synthesiser state.
   */
  const interrupt = useCallback(() => {
    if (recognitionRef.current?.audio) {
      try {
        recognitionRef.current.audio.pause();
        recognitionRef.current.audio = null;
      } catch (err) {
        console.warn('[VoiceEngine] Failed to stop Audio element:', err);
      }
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  /**
   * Toggles speech recognition listening mode.
   * 
   * DESIGN RATIONALE:
   * - Enforces the "Voice Interruption" logic: starting user microphone immediately kills ongoing TTS.
   * 
   * @param {Object} options Configuration for callbacks and execution.
   * @param {Function} options.onResult Callback fired with final transcript.
   * @param {boolean} options.autoSubmit Trigger auto-submission immediately.
   */
  const toggleListening = useCallback((options = {}) => {
    const { onResult, autoSubmit = false } = options;

    if (isListening) {
      recognitionRef.current?.recognition?.stop();
    } else {
      // Enforce zero-latency voice interruption when user initiates speech input
      interrupt();

      if (recognitionRef.current?.recognition) {
        recognitionRef.current.recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          if (onResult) onResult(transcript, autoSubmit);
        };
        recognitionRef.current.recognition.start();
      } else {
        alert('Speech recognition is not supported in this browser. Please use Chrome/Edge.');
      }
    }
  }, [isListening, interrupt]);

  /**
   * Translates plain text into neural-synthesis audio playback.
   * 
   * DESIGN RATIONALE:
   * - Cleans formatting and removes markdown characters beforehand to produce natural speech cadence.
   * 
   * @param {string} rawText Raw textual string containing potential markdown syntax.
   * @param {string} tone Tone variable (friendly, professional, etc.) affecting voice selection.
   * @param {boolean} force Force playback even if global TTS is disabled in configuration.
   */
  const speak = useCallback(async (rawText, tone = 'friendly', force = false) => {
    if ((!isTtsEnabled && !force) || !rawText) return;

    // Strip markdown formatting symbols to ensure clean, natural sentence speech synthesis
    const cleanText = rawText
      .replace(/[*_`#~\[\]\(\)]/g, '')
      .replace(/-\s+/g, '')
      .replace(/\n+/g, ' ');

    try {
      interrupt(); // Clean existing playing elements first
      setIsSpeaking(true);

      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, tone })
      });

      if (!response.ok) {
        throw new Error(`TTS returned status ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      recognitionRef.current.audio = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        if (recognitionRef.current.audio === audio) {
          recognitionRef.current.audio = null;
        }
      };

      audio.onerror = (e) => {
        console.error('[VoiceEngine] Neural TTS Playback failure:', e);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        if (recognitionRef.current.audio === audio) {
          recognitionRef.current.audio = null;
        }
      };

      await audio.play();
    } catch (err) {
      console.error('[VoiceEngine] Premium TTS compilation failed, falling back to WebSpeech:', err);
      
      // Graceful degradation: Fall back to native local synthesis if backend service is unreachable
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'en-GB';
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
    }
  }, [isTtsEnabled, interrupt]);

  /**
   * Toggles global automatic text-to-speech option.
   */
  const toggleTts = useCallback(() => {
    setIsTtsEnabled(prev => {
      const newVal = !prev;
      localStorage.setItem('voice-tts-enabled', newVal);
      if (!newVal) {
        interrupt();
      }
      return newVal;
    });
  }, [interrupt]);

  return { isListening, isTtsEnabled, isSpeaking, toggleListening, toggleTts, speak, interrupt };
}
