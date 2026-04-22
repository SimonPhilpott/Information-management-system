import React, { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, Bot } from 'lucide-react';
import MessageBubble from './MessageBubble';

export default function ChatInterface({ messages, isTyping, onSendMessage, onOpenPdf, suggestions, onTopicClick }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    onSendMessage(input.trim());
    setInput('');
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
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="chat-empty">
          <BookOpen size={64} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h2>Ask Your PDF Library</h2>
          <p>
            Ask questions about your documents and get AI-powered answers with direct citations to the source pages.
          </p>
          {suggestions && suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '600px' }}>
              {suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  className="topic-chip"
                  onClick={() => onTopicClick(s.suggested_question)}
                  title={s.topic}
                >
                  {s.suggested_question?.length > 50
                    ? s.suggested_question.substring(0, 50) + '...'
                    : s.suggested_question}
                </button>
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
        <form onSubmit={handleSubmit} className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your PDFs..."
            rows={1}
            disabled={isTyping}
            id="chat-input"
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim() || isTyping}
            id="chat-send-btn"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
