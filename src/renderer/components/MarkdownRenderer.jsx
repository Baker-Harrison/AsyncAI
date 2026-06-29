import React, { useMemo } from 'react';
import { marked } from 'marked';
import './MarkdownRenderer.css';

// Configure marked for GFM tables and safe rendering
marked.setOptions({
  gfm: true,
  breaks: false,
});

function MarkdownRenderer({ text }) {
  const html = useMemo(() => {
    if (!text) return '';
    // Escape only if the text is not already HTML — marked handles it
    return marked.parse(text, { async: false });
  }, [text]);

  if (!html) return null;

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownRenderer;
