import React, { useEffect, useRef } from 'react';
import ToolCall from './ToolCall';
import MarkdownRenderer from './MarkdownRenderer';
import './ChatArea.css';

function ChatArea({ agent, isThinking, onNewAgent, onOpenTerminal }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agent?.messages]);

  // No agent selected
  if (!agent) {
    return (
      <div className="chat-area">
        <div className="start-screen">
          <div className="start-screen-logo">
            <svg width="40" height="40" viewBox="0 0 16 16" fill="none">
              <rect width="4" height="4" rx="1" fill="#36C5F0" />
              <rect x="6" width="4" height="4" rx="1" fill="#2EB67D" />
              <rect x="12" width="4" height="4" rx="1" fill="#E01E5A" />
              <rect y="6" width="4" height="4" rx="1" fill="#ECB22E" />
              <rect x="12" y="6" width="4" height="4" rx="1" fill="#E01E5A" />
              <rect y="12" width="4" height="4" rx="1" fill="#ECB22E" />
              <rect x="6" y="12" width="4" height="4" rx="1" fill="#2EB67D" />
              <rect x="12" y="12" width="4" height="4" rx="1" fill="#36C5F0" />
            </svg>
          </div>
          <h1 className="start-screen-title">AsyncAI</h1>
          <p className="start-screen-subtitle">
            Spawn AI agents with their own computers. Chat with them, send them off to work.
          </p>
          <button className="start-screen-btn" onClick={onNewAgent}>
            New Agent
          </button>
        </div>
      </div>
    );
  }

  if (agent.status === 'starting') {
    return (
      <div className="chat-area">
        <div className="chat-header">
          <div className="header-title-group">
            <h2 className="channel-title">{agent.name}</h2>
          </div>
        </div>
        <div className="starting-screen">
          <div className="starting-ring">
            <svg viewBox="0 0 100 100" className="starting-svg">
              <circle cx="50" cy="50" r="42" className="ring-track" />
              <circle cx="50" cy="50" r="42" className="ring-arc" />
            </svg>
          </div>
          <p className="starting-label">Starting computer…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="header-title-group">
          <h2 className="channel-title">{agent.name}</h2>
        </div>
        <button className="terminal-btn" onClick={onOpenTerminal} title="Open terminal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>

      <div className="messages-container">
        {agent.messages.map((msg, idx) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="message-system">
                <span className="message-system-text">{msg.text}</span>
                {msg.time && <span className="message-system-time">{msg.time}</span>}
              </div>
            );
          }

          if (msg.role === 'tool') {
            return (
              <div key={msg.id} className="message-tool-row">
                <ToolCall
                  tool={msg.tool}
                  params={msg.params}
                  output={msg.output}
                  status={msg.status}
                />
              </div>
            );
          }

          const isAI      = msg.role === 'assistant';
          const prevMsg   = agent.messages[idx - 1];
          const showAvatar = !prevMsg || prevMsg.role !== msg.role || prevMsg.role === 'tool';

          return (
            <div
              key={msg.id}
              className={`message message--${msg.role} ${showAvatar ? 'message-first' : 'message-continued'}`}
            >
              {showAvatar ? (
                <div className={`message-avatar${isAI ? ' message-avatar--ai' : ''}`}>
                  {isAI ? agent.name[0].toUpperCase() : 'Y'}
                </div>
              ) : (
                <div className="message-avatar-spacer" />
              )}
              <div className="message-content">
                {showAvatar && (
                  <div className="message-header">
                    <span className="message-user">{isAI ? agent.name : 'You'}</span>
                    {msg.time && <span className="message-time">{msg.time}</span>}
                  </div>
                )}
                {isAI ? (
                  <MarkdownRenderer text={msg.text} />
                ) : (
                  <div className="message-text">{msg.text}</div>
                )}
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="thinking-row">
            <div className="thinking-spinner" />
            <span className="thinking-label">{agent.name} is thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default ChatArea;
