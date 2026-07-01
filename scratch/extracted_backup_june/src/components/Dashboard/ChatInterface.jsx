import React, { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, Bot, Sparkles, Image as ImageIcon, Camera, X, Mic, Volume2, VolumeX, MicOff } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { Tooltip } from './CursorHover';

export default function ChatInterface({ 
  messages, isTyping, onSendMessage, onOpenPdf, 
  suggestions, onTopicClick, appMode, onToggleCanvas, onOpenCanvas,
  onPin, pinnedItems = [],
  voiceEngine,
  showCitations
}) {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (messages.length > 0 || isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, isTyping]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isTyping) return;
    
    onSendMessage(input.trim(), null, selectedImage);
    setInput('');
    setSelectedImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="chat-empty">
          <BookOpen size={64} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h2>{appMode === 'kb' ? 'Ask Your Information Library' : 'Gemini Suite'}</h2>
          <p>
            {appMode === 'kb' 
              ? 'Ask questions about your enterprise documents, query synced files, and get AI-powered answers.'
              : 'Chat with Gemini, generate images, or perform deep research.'}
          </p>
          {suggestions && suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', width: '100%', maxWidth: '800px', marginTop: '12px' }}>
              {suggestions.slice(0, 4).map((s, i) => (
                <Tooltip 
                  key={i} 
                  content={
                    <div className="flex flex-col gap-1">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--accent-indigo)] font-bold opacity-80">Topic Context</div>
                      <div className="text-[12px] font-bold mb-1">{s.topic || 'Suggested Exploration'}</div>
                      <div className="flex items-center gap-2 text-[10px] opacity-70">
                        <span className="font-bold" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Book:</span> {s.filename || 'Knowledge Base'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] opacity-70">
                        <span className="font-bold" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Subject:</span> {s.subject || 'General Research'}
                      </div>
                    </div>
                  }
                >
                  <button
                    className="topic-chip user-message-style"
                    onClick={() => onTopicClick(s.suggested_question)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'flex-start', 
                      gap: '4px',
                      padding: '12px 16px',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.5px',
                      color: 'var(--accent-indigo)',
                      opacity: 0.8
                    }}>
                      {s.filename || 'Source Document'}
                    </span>
                    <span style={{ fontSize: '13px', font500: 500, lineHeight: 1.4 }}>
                      {s.suggested_question}
                    </span>
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              onOpenPdf={onOpenPdf}
              onPin={onPin}
              pinnedItems={pinnedItems}
              onOpenCanvas={onOpenCanvas}
              showCitations={showCitations}
            />
          ))}
          {isTyping && (
            <div className="message assistant">
              <div className="message-avatar">
                <Bot size={16} />
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="chat-input-area">
        {selectedImage && (
          <div className="upload-preview-container">
            <div style={{ position: 'relative' }}>
              <img src={selectedImage} alt="Upload preview" className="image-preview-thumb" />
              <button 
                className="remove-upload-btn" 
                onClick={() => setSelectedImage(null)}
                title="Remove image"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
        
        <form 
          onSubmit={handleSubmit} 
          className="chat-input-wrapper"
          style={window.innerWidth <= 768 ? { flexWrap: 'wrap', padding: '12px' } : {}}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageSelect} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
          
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={selectedImage ? "Describe this image or ask a question..." : (appMode === 'kb' ? "Ask about your documents..." : "Ask Gemini anything...")}
            rows={1}
            disabled={isTyping}
            id="chat-input"
            style={window.innerWidth <= 768 ? { flexBasis: '100%', width: '100%', marginBottom: '8px' } : {}}
          />
          <div 
            className="input-tools"
            style={window.innerWidth <= 768 ? { borderRight: 'none', flex: 1, paddingRight: 0, marginRight: 0 } : {}}
          >
            <Tooltip text="Take Photo / Upload Image">
              <button 
                type="button" 
                className="tool-btn" 
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={16} />
              </button>
            </Tooltip>

            <Tooltip text="Open Canvas">
              <button 
                type="button" 
                className="tool-btn" 
                onClick={() => onToggleCanvas(undefined)}
              >
                <Sparkles size={16} />
              </button>
            </Tooltip>

            {voiceEngine && (
              <div className="voice-tools" style={{ display: 'flex', gap: '4px', marginLeft: '4px', paddingLeft: '8px', borderLeft: '1px solid var(--glass-border)' }}>
                <Tooltip text={voiceEngine.isListening ? "Stop Listening" : "Hands-Free Research (Auto-Send)"}>
                  <button
                    type="button"
                    className={`tool-btn voice-mic-btn ${voiceEngine.isListening ? 'active-listening' : ''}`}
                    onClick={() => voiceEngine.toggleListening({
                      onResult: (transcript, autoSubmit) => {
                        if (autoSubmit && transcript.trim()) {
                          onSendMessage(transcript);
                          setInput('');
                        } else {
                          setInput(prev => prev + (prev ? ' ' : '') + transcript);
                        }
                      },
                      autoSubmit: true
                    })}
                  >
                    {voiceEngine.isListening ? (
                      <div className="flex items-center gap-1">
                        <Mic size={16} className="animate-pulse text-red-500" />
                        <Sparkles size={10} className="animate-spin text-[var(--accent-indigo)]" />
                      </div>
                    ) : <Mic size={16} />}
                  </button>
                </Tooltip>
                
                <Tooltip text={voiceEngine.isTtsEnabled ? "Disable Voice Responses" : "Enable Voice Responses"}>
                  <button
                    type="button"
                    className={`tool-btn ${voiceEngine.isTtsEnabled ? 'text-[var(--accent-indigo)]' : 'text-[var(--text-muted)]'}`}
                    onClick={() => voiceEngine.toggleTts()}
                  >
                    {voiceEngine.isTtsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
          <button
            type="submit"
            className="chat-send-btn"
            disabled={(!input.trim() && !selectedImage) || isTyping}
            id="chat-send-btn"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
