import React, { useState, useEffect, useRef } from 'react';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
  isFirstLaunch: boolean;
}

function SettingsModal({ onClose, isFirstLaunch }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electronAPI.settings.get('opencode_api_key').then((val: string | null) => {
      if (val) setApiKey(val);
    });
    inputRef.current?.focus();
  }, []);

  const handleSave = async () => {
    const key = apiKey.trim();
    if (!key) return;
    await window.electronAPI.settings.set('opencode_api_key', key);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape' && !isFirstLaunch) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={isFirstLaunch ? undefined : onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2 className="settings-title">Settings</h2>
          {!isFirstLaunch && (
            <button className="settings-close-btn" onClick={onClose}>×</button>
          )}
        </div>

        <div className="settings-body">
          {isFirstLaunch && (
            <p className="settings-welcome">
              Enter your OpenCode API key to get started.
            </p>
          )}
          <label className="settings-label">OpenCode API Key</label>
          <input
            ref={inputRef}
            className="settings-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="sk-..."
          />
          <p className="settings-hint">Get your key at opencode.ai</p>
        </div>

        <div className="settings-footer">
          <button
            className="settings-save-btn"
            onClick={handleSave}
            disabled={!apiKey.trim() || saved}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
