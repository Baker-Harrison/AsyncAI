// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './TerminalView.css';

function TerminalView({ agent, onBack }) {
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const fitAddonRef  = useRef(null);

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background:  '#0d0e10',
        foreground:  '#d1d2d3',
        cursor:      '#d1d2d3',
        black:       '#1a1d21',
        brightBlack: '#616061',
      },
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current     = term;
    fitAddonRef.current = fitAddon;

    window.electronAPI.terminal.create(agent.id);

    const unsubData = window.electronAPI.terminal.onData(({ agentId, data }) => {
      if (agentId === agent.id) term.write(data);
    });

    const unsubExit = window.electronAPI.terminal.onExit(({ agentId }) => {
      if (agentId === agent.id) {
        term.write('\r\n\x1b[33m[Process exited — press any key to dismiss]\x1b[0m\r\n');
      }
    });

    term.onData((data) => {
      window.electronAPI.terminal.input(agent.id, data);
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      window.electronAPI.terminal.resize(agent.id, term.cols, term.rows);
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      unsubData();
      unsubExit();
      window.electronAPI.terminal.destroy(agent.id);
      term.dispose();
    };
  }, [agent.id]);

  return (
    <div className="terminal-view">
      <div className="terminal-header">
        <button className="terminal-back-btn" onClick={onBack}>
          ← Chat
        </button>
        <span className="terminal-title">{agent.name}</span>
      </div>
      <div className="terminal-container" ref={containerRef} />
    </div>
  );
}

export default TerminalView;
