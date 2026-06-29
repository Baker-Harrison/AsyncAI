import React from 'react';
import './ContainerSetup.css';

const STEPS = [
  'Building agent image',
  'Cloning repository',
  'Waiting for clone',
  'Agent ready',
];

// SVG ring circumference: 2π × r = 2π × 32 ≈ 201.06
const CIRC = 201.06;

function ContainerSetup({ step = 0, repo }) {
  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const filled = (CIRC * progress) / 100;

  return (
    <div className="cs-wrap">
      <div className="cs-ring-wrap">
        <svg className="cs-svg" viewBox="0 0 80 80" fill="none">
          {/* Track */}
          <circle cx="40" cy="40" r="32" stroke="#2a2d31" strokeWidth="7" />
          {/* Filled progress arc */}
          <circle
            cx="40" cy="40" r="32"
            stroke="#1d6aff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRC}`}
            transform="rotate(-90 40 40)"
          />
          {/* Spinning overlay arc */}
          <circle
            className="cs-spin-arc"
            cx="40" cy="40" r="32"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`18 ${CIRC - 18}`}
          />
        </svg>
        <span className="cs-pct">{progress}%</span>
      </div>

      <div className="cs-label-main">
        {repo ? `Setting up ${repo}` : 'Starting agent…'}
      </div>

      <div className="cs-steps">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className={`cs-step ${done ? 'cs-step--done' : active ? 'cs-step--active' : 'cs-step--pending'}`}>
              <span className="cs-step-icon">
                {done ? '✓' : active ? '›' : '·'}
              </span>
              <span className="cs-step-label">{label}</span>
              {active && <span className="cs-step-dots"><span /><span /><span /></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContainerSetup;
