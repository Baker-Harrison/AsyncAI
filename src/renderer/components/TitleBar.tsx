import React, { useState, useEffect } from 'react';
import './TitleBar.css';

interface TitleBarProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

function TitleBar({ onToggleSidebar, sidebarCollapsed }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState('win32');

  useEffect(() => {
    if (!window.electronAPI) return;

    setPlatform(window.electronAPI.platform);

    window.electronAPI.isMaximized().then(setIsMaximized);
    window.electronAPI.onMaximizedChange(setIsMaximized);
  }, []);

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  const isMac = platform === 'darwin';

  return (
    <div className="titlebar">
      <div className={`titlebar-sidebar-region ${sidebarCollapsed ? 'titlebar-sidebar-region--collapsed' : ''}`}>
        <button
          className="titlebar-toggle-btn"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <div className="titlebar-label">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect width="4" height="4" rx="1" fill="#36C5F0" />
            <rect x="6" width="4" height="4" rx="1" fill="#2EB67D" />
            <rect x="12" width="4" height="4" rx="1" fill="#E01E5A" />
            <rect y="6" width="4" height="4" rx="1" fill="#ECB22E" />
            <rect x="12" y="6" width="4" height="4" rx="1" fill="#E01E5A" />
            <rect y="12" width="4" height="4" rx="1" fill="#ECB22E" />
            <rect x="6" y="12" width="4" height="4" rx="1" fill="#2EB67D" />
            <rect x="12" y="12" width="4" height="4" rx="1" fill="#36C5F0" />
          </svg>
          <span>AsyncAI</span>
        </div>
      </div>

      <div className="titlebar-main-region" />

      {!isMac && (
        <div className="titlebar-controls">
          <button className="titlebar-btn titlebar-btn--minimize" onClick={handleMinimize} aria-label="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect y="4.5" width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button className="titlebar-btn titlebar-btn--maximize" onClick={handleMaximize} aria-label="Maximize">
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect y="2" width="8" height="8" rx="1" fill="#1a1d21" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button className="titlebar-btn titlebar-btn--close" onClick={handleClose} aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default TitleBar;
