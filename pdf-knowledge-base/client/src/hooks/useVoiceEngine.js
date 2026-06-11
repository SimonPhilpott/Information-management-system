import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * useVoiceEngine provides integrated Speech-to-Text and Text-to-Speech capabilities.
 * It leverages the Web Speech API, which is powered by Google's engines in supported browsers.
 */
export function useVoiceEngine() {
  const [isListening, setIsListening] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(() => localStorage.getItem('voice-tts-enabled') === 'true');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef({ recognition: null, audio: null });

  // Initialize Speech Recognition and Voices
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-GB';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event) => {
        console.error('[VoiceEngine] Recognition error:', event.error);
        setIsListening(false);
      };
      recognitionRef.current.recognition = recognition;
    }

    // Warm up voices
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    // Cleanup audio ref on unmount
    return () => {
      if (recognitionRef.current?.audio) {
        try {
          recognitionRef.current.audio.pause();
        } catch (err) {
          // ignore
        }
      }
    };
  }, []);

  /**
   * Stop all current AI speech immediately.
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
   * Toggle the microphone for voice input.
   * @param {Object} options Configuration for the listening session.
   * @param {Function} options.onResult Callback with the final transcript string.
   * @param {boolean} options.autoSubmit If true, triggers onResult immediately on speech end.
   */
  const toggleListening = useCallback((options = {}) => {
    const { onResult, autoSubmit = false } = options;

    if (isListening) {
      recognitionRef.current?.recognition?.stop();
    } else {
      // INTERRUPT: Stop AI speaking when user starts talking
      interrupt();

      if (recognitionRef.current?.recognition) {
        recognitionRef.current.recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          if (onResult) onResult(transcript, autoSubmit);
        };
        recognitionRef.current.recognition.start();
      } else {
        alert('Speech recognition is not supported in this browser. Please use Chrome for the full Gemini voice experience.');
      }
    }
  }, [isListening, interrupt]);

  /**
   * Convert text to audible speech using premium neural cloud-based voices.
   * @param {string} text The content to speak.
   * @param {string} tone The active tone setting (friendly, professional, investigator, direct).
   * @param {boolean} force If true, bypasses the isTtsEnabled check.
   */
  const speak = useCallback(async (text, tone = 'friendly', force = false) => {
    if ((!isTtsEnabled && !force) || !text) return;

    try {
      interrupt(); // Stop any currently playing audio
      setIsSpeaking(true);

      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tone })
      });

      if (!response.ok) {
        throw new Error(`TTS service returned status code ${response.status}`);
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
      console.error('[VoiceEngine] Failed to synthesize or play neural TTS:', err);
      setIsSpeaking(false);
    }
  }, [isTtsEnabled, interrupt]);

  /**
   * Toggle automated text-to-speech for assistant responses.
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
