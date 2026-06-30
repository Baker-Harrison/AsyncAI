import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import ToolCall from './ToolCall';
import MarkdownRenderer from './MarkdownRenderer';
import type { Agent } from '../types';
import './ChatArea.css';

interface ChatAreaProps {
  agent: Agent | null;
  isThinking: boolean;
  onNewAgent: () => void;
  onOpenTerminal: () => void;
}

function ChatArea({ agent, isThinking, onNewAgent, onOpenTerminal }: ChatAreaProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<React.ComponentRef<typeof Virtuoso>>(null);
  const [followOutput, setFollowOutput] = useState(true);

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  // Focus input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  // Find matching messages — agent might be null so we guard with optional chaining
  const matches: { idx: number; msg: import('../types').Message; pos: number }[] = useMemo(() => {
    if (!searchQuery || !agent?.messages) return [];
    const q = searchQuery.toLowerCase();
    return agent.messages
      .map((msg, idx) => {
        const text = (msg.text || msg.output || '') as string;
        const pos = text.toLowerCase().indexOf(q);
        return pos >= 0 ? { idx, msg: msg as import('../types').Message, pos } : null;
      })
      .filter(Boolean) as { idx: number; msg: import('../types').Message; pos: number }[];
  }, [searchQuery, agent?.messages]);

  const currentMatch = matches[currentMatchIdx];

  const navigateMatch = useCallback((dir: number) => {
    if (matches.length === 0) return;
    setCurrentMatchIdx((prev) => {
      const next = prev + dir;
      if (next < 0) return matches.length - 1;
      if (next >= matches.length) return 0;
      return next;
    });
  }, [matches.length]);

  // Auto-scroll to current match
  useEffect(() => {
    if (currentMatch && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: currentMatch.idx, behavior: 'smooth', align: 'center' });
      setFollowOutput(false);
    }
  }, [currentMatch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentMatchIdx(0);
  };

  // Stop following output when user scrolls up
  const handleScroll = useCallback((e: React.UIEvent | Event) => {
    const target = (e.currentTarget || e) as HTMLElement;
    const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 50;
    setFollowOutput(atBottom);
  }, []);

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

  const renderMessage = (idx: number) => {
    const msg = agent.messages[idx];
    if (!msg) return null;

    if (msg.role === 'system') {
      return (
        <div className="message-system">
          <span className="message-system-text">{msg.text}</span>
          {msg.time && <span className="message-system-time">{msg.time}</span>}
        </div>
      );
    }

    if (msg.role === 'tool') {
      const isMatch = currentMatch?.idx === idx;
      return (
        <div className={`message-tool-row ${isMatch ? 'search-highlight' : ''}`}>
          <ToolCall
            tool={msg.tool}
            params={msg.params}
            output={msg.output}
            status={msg.status}
          />
        </div>
      );
    }

    const isAI = msg.role === 'assistant';
    const prevMsg = idx > 0 ? agent.messages[idx - 1] : null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const showAvatar = !prevMsg || (prevMsg as typeof msg).role !== msg.role || (prevMsg as Record<string, string>).role === 'tool';
    const isMatch = currentMatch?.idx === idx;

    return (
      <div
        className={`message message--${msg.role} ${showAvatar ? 'message-first' : 'message-continued'} ${isMatch ? 'search-highlight' : ''}`}
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
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="header-title-group">
          <h2 className="channel-title">{agent.name}</h2>
        </div>
        <div className="header-actions">
          <button
            className="search-toggle-btn"
            onClick={() => setSearchOpen((v) => !v)}
            title="Search messages (⌘F)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button className="terminal-btn" onClick={onOpenTerminal} title="Open terminal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="search-bar">
          <svg className="search-bar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            className="search-bar-input"
            type="text"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) navigateMatch(-1);
                else navigateMatch(1);
              }
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
              }
            }}
          />
          {matches.length > 0 && (
            <span className="search-bar-count">
              {currentMatchIdx + 1}/{matches.length}
            </span>
          )}
          <button className="search-bar-nav" onClick={() => navigateMatch(-1)} title="Previous match (⇧Enter)">
            ▲
          </button>
          <button className="search-bar-nav" onClick={() => navigateMatch(1)} title="Next match (Enter)">
            ▼
          </button>
          <button className="search-bar-close" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} title="Close search (Esc)">
            ×
          </button>
        </div>
      )}

      <div className="messages-container">
        {/*
         * react-virtuoso with overscan of 10 items to prevent layout shift
         * during fast scrolling. followOutput keeps the viewport pinned to
         * the bottom when new messages arrive. atBottomThreshold controls
         * how close to the bottom the user must be for followOutput to stay
         * active. Messages have variable height (markdown, code blocks, etc.)
         * so no fixed itemSize is specified — Virtuoso measures dynamically.
         */}
        <Virtuoso
          ref={virtuosoRef}
          className="messages-virtuoso"
          totalCount={agent!.messages.length}
          itemContent={(index) => renderMessage(index)}
          followOutput={followOutput}
          atBottomThreshold={100}
          overscan={10}
          style={{ height: '100%' }}
          components={{
            Footer: () => isThinking ? (
              <div className="thinking-row">
                <div className="thinking-spinner" />
                <span className="thinking-label">{agent.name} is thinking…</span>
              </div>
            ) : null,
          }}
        />
      </div>
    </div>
  );
}

export default ChatArea;
