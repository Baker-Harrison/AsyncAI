/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MarkdownRenderer from '../renderer/components/MarkdownRenderer';

// Mock highlight.js to avoid issues in test environment
jest.mock('highlight.js', () => ({
  getLanguage: () => null,
  highlightAuto: (code) => ({ value: code }),
  configure: () => {},
}));

// Mock marked to return simple HTML
jest.mock('marked', () => ({
  marked: {
    setOptions: () => {},
    parse: (text) => `<p>${text}</p>`,
  },
}));

describe('MarkdownRenderer', () => {
  test('renders basic text', () => {
    render(<MarkdownRenderer text="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('returns null for empty text', () => {
    const { container } = render(<MarkdownRenderer text="" />);
    expect(container.innerHTML).toBe('');
  });

  test('renders markdown bold text', () => {
    const { container } = render(<MarkdownRenderer text="**bold**" />);
    expect(container.querySelector('.markdown-body')).toBeInTheDocument();
  });

  test('renders code blocks with copy button after mount', () => {
    // Override mock to return code block HTML
    const marked = require('marked').marked;
    marked.parse = (text) => '<pre><code>console.log("hello")</code></pre>';

    const { container } = render(<MarkdownRenderer text="```js\nconsole.log('hello')\n```" />);

    // Wait for useEffect to inject copy buttons
    setTimeout(() => {
      const wrapper = container.querySelector('.code-block-wrapper');
      expect(wrapper).toBeInTheDocument();
      const btn = wrapper.querySelector('.copy-btn');
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toBe('Copy');
    }, 0);
  });
});
