import React, { useState, useRef, useEffect } from 'react';
import './MessageInput.css';

const COMMANDS = [
  { name: '/clear', description: 'Archive this conversation and start a fresh context' },
];

function MessageInput({ onSend, onCommand, disabled, placeholder }) {
  const [text, setText]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);

  // Recompute suggestions whenever text changes
  useEffect(() => {
    if (text.startsWith('/')) {
      const q = text.toLowerCase();
      const matches = COMMANDS.filter((c) => c.name.startsWith(q));
      setSuggestions(matches);
      setSelectedIdx(0);
    } else {
      setSuggestions([]);
    }
  }, [text]);

  const executeCommand = (cmd) => {
    setText('');
    setSuggestions([]);
    onCommand?.(cmd.name);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (disabled) return;

    // If autocomplete is open and user presses Enter, run the highlighted command
    if (suggestions.length > 0) {
      executeCommand(suggestions[selectedIdx]);
      return;
    }

    // Check if it's a bare slash command
    const exact = COMMANDS.find((c) => c.name === text.trim());
    if (exact) {
      executeCommand(exact);
      return;
    }

    if (text.trim()) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        setSuggestions([]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="message-input-container">
      {suggestions.length > 0 && (
        <div className="slash-menu">
          {suggestions.map((cmd, i) => (
            <div
              key={cmd.name}
              className={`slash-item ${i === selectedIdx ? 'slash-item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); executeCommand(cmd); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className="slash-item-name">{cmd.name}</span>
              <span className="slash-item-desc">{cmd.description}</span>
            </div>
          ))}
        </div>
      )}
      <form className="message-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="message-input-field"
          placeholder={placeholder ?? 'Message your agent… (type / for commands)'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!text.trim() || disabled}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3L13 9H10V13H6V9H3L8 3Z" fill="currentColor"/>
          </svg>
        </button>
      </form>
    </div>
  );
}

export default MessageInput;
