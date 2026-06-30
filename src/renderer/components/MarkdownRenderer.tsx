import React, { useMemo, useRef, useEffect } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import './MarkdownRenderer.css';

// Configure marked for GFM tables
// Note: marked v12+ uses `marked.setOptions` with a new API.
// `highlight` is not part of the official options but marked uses it
// internally via the `highlight` option in `marked.parse` or via
// a custom renderer. We handle highlighting manually below.
marked.setOptions({
  gfm: true,
  breaks: false,
});

interface MarkdownRendererProps {
  text: string;
}

function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!text) return '';
    // Use marked to parse markdown to HTML, then apply syntax highlighting
    // to code blocks by post-processing
    const raw = marked.parse(text, { async: false }) as string;
    return raw;
  }, [text]);

  // After render, apply syntax highlighting and inject copy buttons
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Apply syntax highlighting to all code blocks
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      const el = block as HTMLElement;
      // Determine language from class (e.g. "language-js")
      const langClass = Array.from(el.classList).find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : '';
      let highlighted: string;
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(el.textContent || '', { language: lang }).value;
        } catch {
          highlighted = hljs.highlightAuto(el.textContent || '').value;
        }
      } else {
        try {
          highlighted = hljs.highlightAuto(el.textContent || '').value;
        } catch {
          highlighted = el.textContent || '';
        }
      }
      el.innerHTML = highlighted;
    });

    // Inject copy buttons into pre blocks
    const preBlocks = container.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
      const preEl = pre as HTMLPreElement;
      // Check if already wrapped
      if (preEl.parentElement?.classList.contains('code-block-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(preEl.textContent || '');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        } catch {
          btn.textContent = 'Failed';
        }
      });

      preEl.parentNode?.insertBefore(wrapper, preEl);
      wrapper.appendChild(btn);
      wrapper.appendChild(preEl);
    });
  }, [html]);

  if (!html) return null;

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownRenderer;
