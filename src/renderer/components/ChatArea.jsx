import React, { useEffect, useRef } from 'react';
import './ChatArea.css';

function ChatArea({ task, onDispatch, isThinking, onNewTask }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.messages]);

  if (!task) {
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
            Plan with an AI agent, then dispatch it to work autonomously and open a PR.
          </p>
          <button className="start-screen-btn" onClick={onNewTask}>
            Start a new task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="header-title-group">
          <h2 className="channel-title">{task.name}</h2>
        </div>
        <div className="header-actions">
          {task.status === 'planning' && (
            <button className="dispatch-btn" onClick={onDispatch}>
              Dispatch →
            </button>
          )}
          {task.status === 'running' && (
            <span className="running-indicator">● Running...</span>
          )}
          {task.status === 'done' && task.prUrl && (
            <a
              href={task.prUrl}
              className="pr-link"
              target="_blank"
              rel="noreferrer"
            >
              View PR →
            </a>
          )}
        </div>
      </div>

      <div className="messages-container">
        {task.messages.map((msg, idx) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="message-system">
                <span className="message-system-text">{msg.text}</span>
                <span className="message-system-time">{msg.time}</span>
              </div>
            );
          }

          const isAI = msg.role === 'assistant';
          const showAvatar = idx === 0 || task.messages[idx - 1].role !== msg.role;

          return (
            <div
              key={msg.id}
              className={`message message--${msg.role} ${showAvatar ? 'message-first' : 'message-continued'}`}
            >
              {showAvatar ? (
                <div className={`message-avatar${isAI ? ' message-avatar--ai' : ''}`}>
                  {isAI ? 'AI' : 'Y'}
                </div>
              ) : (
                <div className="message-avatar-spacer" />
              )}
              <div className="message-content">
                {showAvatar && (
                  <div className="message-header">
                    <span className="message-user">{isAI ? 'Agent' : 'You'}</span>
                    <span className="message-time">{msg.time}</span>
                  </div>
                )}
                <div className="message-text">{msg.text}</div>
              </div>
            </div>
          );
        })}
        {isThinking && (
          <div className="message message--assistant message-first">
            <div className="message-avatar message-avatar--ai">AI</div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-user">Agent</span>
              </div>
              <div className="thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export default ChatArea;
