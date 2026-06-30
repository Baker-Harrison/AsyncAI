// @ts-nocheck
import React, { useState, useEffect } from 'react';
import './UpdateBanner.css';

function UpdateBanner() {
  const [state, setState] = useState(null); // null | 'available' | 'downloading' | 'ready'
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const { update } = window.electronAPI;
    update.onAvailable(({ version }) => {
      setVersion(version);
      setState('available');
    });
    update.onProgress(({ percent }) => {
      setPercent(percent);
      setState('downloading');
    });
    update.onDownloaded(({ version }) => {
      setVersion(version);
      setState('ready');
    });
  }, []);

  if (!state) return null;

  return (
    <div className={`update-banner update-banner--${state}`}>
      {state === 'available' && (
        <>
          <span className="update-banner-text">v{version} is available — downloading…</span>
        </>
      )}
      {state === 'downloading' && (
        <>
          <span className="update-banner-text">Downloading v{version}…</span>
          <div className="update-progress-track">
            <div className="update-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="update-banner-pct">{percent}%</span>
        </>
      )}
      {state === 'ready' && (
        <>
          <span className="update-banner-text">v{version} ready</span>
          <button
            className="update-install-btn"
            onClick={() => window.electronAPI.update.install()}
          >
            Restart & Update
          </button>
        </>
      )}
    </div>
  );
}

export default UpdateBanner;
