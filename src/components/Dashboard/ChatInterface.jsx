import React, { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, Bot, Sparkles, Image as ImageIcon, Camera, X, AudioLines, Volume2, VolumeX, MicOff, FileText, Paperclip, Play, Lock, Unlock } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { Tooltip } from './CursorHover';

const GEMINI_VOICES = [
  { name: 'Achernar', desc: 'Soft' },
  { name: 'Achird', desc: 'Friendly' },
  { name: 'Algenib', desc: 'Gravelly' },
  { name: 'Algieba', desc: 'Smooth' },
  { name: 'Alnilam', desc: 'Firm' },
  { name: 'Aoede', desc: 'Breezy' },
  { name: 'Autonoe', desc: 'Bright' },
  { name: 'Callirrhoe', desc: 'Easy-going' },
  { name: 'Charon', desc: 'Informative' },
  { name: 'Despina', desc: 'Smooth' },
  { name: 'Enceladus', desc: 'Breathy' },
  { name: 'Erinome', desc: 'Clear' },
  { name: 'Fenrir', desc: 'Excitable' },
  { name: 'Gacrux', desc: 'Mature' },
  { name: 'Iapetus', desc: 'Clear' },
  { name: 'Kore', desc: 'Firm' },
  { name: 'Laomedeia', desc: 'Upbeat' },
  { name: 'Leda', desc: 'Youthful' },
  { name: 'Orus', desc: 'Firm' },
  { name: 'Puck', desc: 'Upbeat' },
  { name: 'Pulcherrima', desc: 'Forward' },
  { name: 'Rasalgethi', desc: 'Informative' },
  { name: 'Sadachbia', desc: 'Lively' },
  { name: 'Sadaltager', desc: 'Knowledgeable' },
  { name: 'Schedar', desc: 'Even' },
  { name: 'Sulafat', desc: 'Warm' },
  { name: 'Umbriel', desc: 'Easy-going' },
  { name: 'Vindemiatrix', desc: 'Gentle' },
  { name: 'Zephyr', desc: 'Bright' },
  { name: 'Zubenelgenubi', desc: 'Casual' }
];

export default function ChatInterface({ 
  messages, isTyping, onSendMessage, onOpenPdf, 
  suggestions, onTopicClick, appMode, onToggleCanvas, onOpenCanvas,
  onPin, pinnedItems = [],
  voiceEngine,
  geminiLive,
  showCitations
}) {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  const voiceMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target)) {
        setShowVoiceMenu(false);
      }
    };
    if (showVoiceMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showVoiceMenu]);

  useEffect(() => {
    if (messages.length > 0 || isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, isTyping]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit. Please upload a smaller document.");
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    
    if (file.type.startsWith('image/')) {
      reader.onloadend = () => {
        setSelectedImage(reader.result);
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    } else {
      // Document file (txt, pdf, pptx)
      reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1];
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          mimeType: file.type || 'text/plain',
          data: base64Data
        }]);
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachedFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage && attachedFiles.length === 0) || isTyping) return;
    
    onSendMessage(input.trim(), null, selectedImage, attachedFiles);
    setInput('');
    setSelectedImage(null);
    setAttachedFiles([]);
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

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onloadend = () => {
            setSelectedImage(reader.result);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  // ── Pre-compute live bar phase config (used in JSX below) ──────────────
  const liveStatus   = geminiLive?.liveStatus || 'idle';
  const liveUserVol  = geminiLive?.userVolume || 0;
  const liveModelVol = geminiLive?.modelVolume || 0;
  const liveActiveVol = liveStatus === 'speaking' ? liveModelVol : liveUserVol;
  const isSearching = geminiLive?.isSearching || false;
  
  const livePhases = {
    idle:      { border: 'border-green-500/25',  bg: 'from-green-500/5 to-emerald-500/5',   dot: 'bg-green-500',  glow: 'rgba(34,197,94,0.5)',   ring: 'border-green-500/30',  label: 'Ready — say something…', ping: 'bg-green-400',  textCls: 'text-green-600 dark:text-green-400'  },
    listening: { border: 'border-green-400/50',  bg: 'from-green-400/10 to-emerald-400/10', dot: 'bg-green-400',  glow: 'rgba(74,222,128,0.6)',  ring: 'border-green-400/50',  label: 'Listening…',             ping: 'bg-green-300',  textCls: 'text-green-500 dark:text-green-300'  },
    thinking:  { border: 'border-amber-500/40',  bg: 'from-amber-500/8 to-yellow-500/8',    dot: 'bg-amber-500',  glow: 'rgba(245,158,11,0.5)', ring: 'border-amber-500/40',  label: 'Gemini is thinking…',    ping: 'bg-amber-400',  textCls: 'text-amber-600 dark:text-amber-400'  },
    speaking:  { border: 'border-sky-500/40',    bg: 'from-sky-500/8 to-blue-500/8',        dot: 'bg-sky-500',    glow: 'rgba(56,189,248,0.55)', ring: 'border-sky-500/40',    label: 'Gemini is speaking…',    ping: 'bg-sky-400',    textCls: 'text-sky-600 dark:text-sky-400'      },
  };
  
  const p = { ...(livePhases[liveStatus] || livePhases.idle) };

  if (isSearching && liveStatus === 'thinking') {
    p.border = 'border-purple-500/45';
    p.bg = 'from-purple-500/10 to-pink-500/10';
    p.dot = 'bg-purple-500';
    p.glow = 'rgba(168,85,247,0.6)';
    p.ring = 'border-purple-500/45';
    p.label = 'Searching your library database…';
    p.ping = 'bg-purple-400';
    p.textCls = 'text-purple-600 dark:text-purple-400 font-bold';
  }

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
              onAskGeneralChat={onSendMessage}
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

        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2.5 bg-[var(--bg-elevated)] border-b border-[var(--glass-border)]">
            {attachedFiles.map((file, index) => (
              <div 
                key={index} 
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl text-[10px] text-[var(--text-secondary)] font-medium max-w-[200px]"
              >
                <FileText size={12} className="text-[var(--accent-cyan)] flex-shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <button 
                  type="button" 
                  onClick={() => removeAttachedFile(index)}
                  className="p-0.5 hover:bg-[var(--glass-border)] rounded transition-colors text-[var(--text-muted)] hover:text-white"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <form 
          onSubmit={handleSubmit} 
          className="chat-input-wrapper"
          style={window.innerWidth <= 768 ? { flexWrap: 'wrap', padding: '12px' } : {}}
        >
          <input 
            type="file" 
            ref={imageInputRef} 
            onChange={handleFileSelect} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
          <input 
            type="file" 
            ref={docInputRef} 
            onChange={handleFileSelect} 
            accept=".txt,.pdf,.pptx" 
            style={{ display: 'none' }} 
          />
          
          {geminiLive && geminiLive.isConnected ? (
            <div className={`flex-1 flex items-center justify-between h-[42px] relative overflow-hidden bg-gradient-to-r ${p.bg} rounded-[8px] border ${p.border} px-3 transition-all duration-300`} style={{ minWidth: 0 }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at center, ${p.glow.replace(')', ', 0.15)')} 0%, transparent 70%)`, opacity: Math.max(0.2, liveActiveVol / 80) }} />
              <div className="flex items-center gap-2.5 z-10 min-w-0">
                <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${p.ping} opacity-75`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${p.dot}`} />
                </span>
                <span className={`text-[13px] font-semibold ${p.textCls} truncate`}>{p.label}</span>
              </div>
              
              {/* Live Audio Visualizer Pulse */}
              <div className="flex items-center gap-2.5 z-10 flex-shrink-0">
                <div className="flex items-center justify-center relative w-9 h-9 flex-shrink-0">
                  <div className={`absolute rounded-full border ${p.ring} transition-transform duration-75`} style={{ width: '100%', height: '100%', transform: `scale(${1 + liveActiveVol / 55})`, opacity: liveActiveVol > 4 ? 0.9 : 0 }} />
                  <div className={`absolute rounded-full border ${p.ring} transition-transform duration-100`} style={{ width: '100%', height: '100%', transform: `scale(${1.25 + liveActiveVol / 38})`, opacity: liveActiveVol > 8 ? 0.4 : 0 }} />
                  {liveStatus === 'thinking' ? (
                    <div className={`rounded-full flex items-center justify-center ${isSearching ? 'bg-purple-500' : 'bg-amber-500'}`} style={{ width: '22px', height: '22px', boxShadow: `0 0 14px ${p.glow}`, animation: 'spin 1s linear infinite' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" /></svg>
                    </div>
                  ) : (
                    <div className={`rounded-full transition-all duration-75 flex items-center justify-center ${p.dot}`} style={{ width: `${20 + liveActiveVol / 5}px`, height: `${20 + liveActiveVol / 5}px`, boxShadow: `0 0 12px ${p.glow}` }}>
                      <AudioLines size={10} className="text-white" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={selectedImage ? "Describe this image or ask a question..." : (appMode === 'kb' ? "Ask about your documents..." : "Ask Gemini anything...")}
              rows={1}
              disabled={isTyping}
              id="chat-input"
              style={window.innerWidth <= 768 ? { flexBasis: '100%', width: '100%', marginBottom: '8px' } : {}}
            />
          )}

          <div 
            className="input-tools"
            style={window.innerWidth <= 768 ? { borderRight: 'none', flex: 1, paddingRight: 0, marginRight: 0 } : {}}
          >
            <Tooltip text="Attach Document (.txt, .pdf, .pptx)">
              <button 
                type="button" 
                className="tool-btn" 
                onClick={() => docInputRef.current?.click()}
              >
                <Paperclip size={16} />
              </button>
            </Tooltip>

            <Tooltip text="Take Photo / Upload Image">
              <button 
                type="button" 
                className="tool-btn" 
                onClick={() => imageInputRef.current?.click()}
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

            {appMode === 'kb' && geminiLive && (
              <div className="voice-tools" style={{ display: 'flex', gap: '4px', marginLeft: '4px', paddingLeft: '8px', borderLeft: '1px solid var(--glass-border)' }}>
                <Tooltip text={geminiLive.isConnected ? "Disconnect Gemini Live" : "Start Gemini Live Real-time Conversation"}>
                  <button
                    type="button"
                    className={`tool-btn voice-mic-btn ${geminiLive.isConnected ? 'active-listening border-green-500/30' : ''}`}
                    onClick={() => geminiLive.isConnected ? geminiLive.disconnectLive() : geminiLive.connectLive()}
                  >
                    {geminiLive.isConnected ? (
                      <div className="flex items-center gap-1.5">
                        <AudioLines size={16} className="animate-pulse text-green-500" />
                        {geminiLive.isSpeaking && (
                          <div className="flex gap-[2px] items-center h-[12px] px-1">
                            <span className="w-[2.5px] h-[6px] bg-green-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
                            <span className="w-[2.5px] h-[10px] bg-green-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                            <span className="w-[2.5px] h-[6px] bg-green-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
                          </div>
                        )}
                      </div>
                    ) : <AudioLines size={16} />}
                  </button>
                </Tooltip>
                <div className="relative flex items-center gap-1" ref={voiceMenuRef} style={{ display: 'inline-flex' }}>
                  <Tooltip text={geminiLive.isVoiceLocked ? "Voice Choice is Locked (Click to Unlock)" : "Change Gemini Voice"}>
                    <button
                      type="button"
                      disabled={geminiLive.isVoiceLocked}
                      className={`tool-btn flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] transition-all text-[11px] font-semibold ${
                        geminiLive.isVoiceLocked 
                          ? 'opacity-75 cursor-not-allowed bg-[var(--glass-bg)] text-[var(--text-muted)]' 
                          : 'hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'
                      }`}
                      onClick={() => !geminiLive.isVoiceLocked && setShowVoiceMenu(!showVoiceMenu)}
                      style={{ height: '24px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', outline: 'none' }}
                    >
                      <span className="capitalize">{geminiLive.voiceName || 'Puck'}</span>
                      {!geminiLive.isVoiceLocked && <span className="text-[8px] opacity-60">▼</span>}
                    </button>
                  </Tooltip>

                  <Tooltip text={geminiLive.isVoiceLocked ? "Voice Locked (Click to Unlock)" : "Lock Current Voice Choice"}>
                    <button
                      type="button"
                      className={`tool-btn flex items-center justify-center p-1 rounded-[4px] transition-all ${
                        geminiLive.isVoiceLocked 
                          ? 'text-amber-500 bg-amber-500/10 border border-amber-500/30 shadow-sm' 
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] border border-transparent'
                      }`}
                      onClick={() => {
                        geminiLive.toggleVoiceLock();
                        if (!geminiLive.isVoiceLocked) {
                          setShowVoiceMenu(false);
                        }
                      }}
                      style={{ height: '24px', width: '24px', outline: 'none' }}
                      title={geminiLive.isVoiceLocked ? "Unlock Voice Choice" : "Lock Voice Choice"}
                    >
                      {geminiLive.isVoiceLocked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} className="opacity-60" />}
                    </button>
                  </Tooltip>

                  {showVoiceMenu && (
                    <div 
                      className="absolute bottom-[30px] right-0 z-50 flex flex-col p-1 rounded-[6px] border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shadow-lg min-w-[170px] animate-in fade-in slide-in-from-bottom-2 duration-150"
                      style={{ background: 'var(--glass-bg)', backdropBlur: '12px', maxHeight: '220px', overflowY: 'auto' }}
                    >
                      {GEMINI_VOICES.map((v) => (
                        <div
                          key={v.name}
                          className={`flex items-center justify-between px-2 py-1 rounded-[4px] text-[11px] font-medium transition-all ${
                            (geminiLive.voiceName || 'Puck') === v.name 
                              ? 'bg-[var(--accent-indigo)] text-white' 
                              : 'text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)]'
                          }`}
                        >
                          <button
                            type="button"
                            className="flex-1 text-left select-none outline-none font-semibold truncate mr-2"
                            onClick={() => {
                              geminiLive.setVoiceName(v.name);
                              setShowVoiceMenu(false);
                              if (!geminiLive.isConnected) {
                                geminiLive.connectLive();
                              }
                            }}
                          >
                            <span>{v.name}</span>
                            <span className={`text-[9px] font-normal ml-1.5 opacity-60`}>— {v.desc}</span>
                          </button>
                          <button
                            type="button"
                            className={`opacity-60 hover:opacity-100 hover:scale-110 transition-all p-0.5 outline-none ${
                              (geminiLive.voiceName || 'Puck') === v.name ? 'text-white' : 'text-[var(--accent-indigo)]'
                            }`}
                            title={`Play demo for ${v.name}`}
                            onClick={() => {
                              geminiLive.setVoiceName(v.name);
                              if (!geminiLive.isConnected) {
                                geminiLive.connectLive();
                              }
                            }}
                          >
                            <Play size={10} fill="currentColor" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Tooltip text={geminiLive.isMuted ? "Unmute Spoken Responses" : "Mute Spoken Responses"}>
                  <button
                    type="button"
                    className={`tool-btn ${!geminiLive.isMuted ? 'text-[var(--accent-indigo)]' : 'text-[var(--text-muted)]'}`}
                    onClick={() => geminiLive.toggleMute()}
                  >
                    {geminiLive.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
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
