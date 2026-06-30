/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatArea from '../renderer/components/ChatArea';

// Mock child components
jest.mock('../renderer/components/MarkdownRenderer', () => ({ text }) => (
  <div data-testid="markdown-renderer">{text}</div>
));

jest.mock('../renderer/components/ToolCall', () => ({ tool, params, output, status }) => (
  <div data-testid="tool-call" data-tool={tool} data-status={status}>
    {tool}: {params?.command || ''}
  </div>
));

// Mock react-virtuoso with forwardRef to avoid ref warnings
jest.mock('react-virtuoso', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const Virtuoso = React.forwardRef(({ totalCount, itemContent, components }, ref) => {
    // Use useImperativeHandle to expose scrollToIndex on the ref
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: jest.fn(),
      scrollTo: jest.fn(),
    }));
    const items = [];
    for (let i = 0; i < totalCount; i++) {
      items.push(<div key={i} data-testid="virtuoso-item">{itemContent(i)}</div>);
    }
    return (
      <div data-testid="virtuoso-container">
        {items}
        {components?.Footer?.()}
      </div>
    );
  });
  Virtuoso.displayName = 'Virtuoso';
  return { Virtuoso };
});

describe('ChatArea', () => {
  const baseProps = {
    agent: null,
    isThinking: false,
    onNewAgent: jest.fn(),
    onOpenTerminal: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when no agent is selected', () => {
    it('renders the start screen', () => {
      render(<ChatArea {...baseProps} />);
      expect(screen.getByText('AsyncAI')).toBeInTheDocument();
      expect(screen.getByText('New Agent')).toBeInTheDocument();
    });
  });

  describe('when agent is starting', () => {
    it('shows the starting loader', () => {
      const agent = { id: 'test-1', name: 'TestBot', status: 'starting', messages: [] };
      render(<ChatArea {...baseProps} agent={agent} />);
      expect(screen.getByText('Starting computer…')).toBeInTheDocument();
      expect(screen.getByText('TestBot')).toBeInTheDocument();
    });
  });

  describe('when agent is ready', () => {
    const readyAgent = {
      id: 'test-1',
      name: 'TestBot',
      status: 'ready',
      messages: [
        { id: '1', role: 'user', text: 'Hello', time: '12:00' },
        { id: '2', role: 'assistant', text: 'Hi there!', time: '12:01' },
        { id: '3', role: 'tool', tool: 'bash', params: { command: 'ls -la' }, output: 'file1.txt', status: 'ok' },
      ],
    };

    it('renders messages', () => {
      render(<ChatArea {...baseProps} agent={readyAgent} />);
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
      // TestBot appears in header and message — use getAllByText
      expect(screen.getAllByText('TestBot').length).toBe(2);
    });

    it('shows thinking indicator when isThinking is true', () => {
      render(<ChatArea {...baseProps} agent={readyAgent} isThinking={true} />);
      expect(screen.getByText('TestBot is thinking…')).toBeInTheDocument();
    });

    describe('search functionality', () => {
      it('opens search bar on Cmd+F', () => {
        render(<ChatArea {...baseProps} agent={readyAgent} />);
        fireEvent.keyDown(window, { key: 'f', metaKey: true });
        expect(screen.getByPlaceholderText('Search messages…')).toBeInTheDocument();
      });

      it('highlights matching messages', () => {
        render(<ChatArea {...baseProps} agent={readyAgent} />);
        // Open search
        fireEvent.keyDown(window, { key: 'f', metaKey: true });
        const input = screen.getByPlaceholderText('Search messages…');
        // Type a query
        fireEvent.change(input, { target: { value: 'Hello' } });
        // Should show match count
        expect(screen.getByText('1/1')).toBeInTheDocument();
      });

      it('navigates to next match on Enter', () => {
        const multiMsgAgent = {
          ...readyAgent,
          messages: [
            { id: '1', role: 'user', text: 'Hello world', time: '12:00' },
            { id: '2', role: 'user', text: 'Hello again', time: '12:01' },
          ],
        };
        render(<ChatArea {...baseProps} agent={multiMsgAgent} />);
        fireEvent.keyDown(window, { key: 'f', metaKey: true });
        const input = screen.getByPlaceholderText('Search messages…');
        fireEvent.change(input, { target: { value: 'Hello' } });
        expect(screen.getByText('1/2')).toBeInTheDocument();
        // Press Enter to go to next match
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('2/2')).toBeInTheDocument();
      });

      it('navigates to previous match on Shift+Enter', () => {
        const multiMsgAgent = {
          ...readyAgent,
          messages: [
            { id: '1', role: 'user', text: 'Hello world', time: '12:00' },
            { id: '2', role: 'user', text: 'Hello again', time: '12:01' },
          ],
        };
        render(<ChatArea {...baseProps} agent={multiMsgAgent} />);
        fireEvent.keyDown(window, { key: 'f', metaKey: true });
        const input = screen.getByPlaceholderText('Search messages…');
        fireEvent.change(input, { target: { value: 'Hello' } });
        // Go to second match first
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('2/2')).toBeInTheDocument();
        // Go back with Shift+Enter
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        expect(screen.getByText('1/2')).toBeInTheDocument();
      });

      it('closes search on Escape', () => {
        render(<ChatArea {...baseProps} agent={readyAgent} />);
        fireEvent.keyDown(window, { key: 'f', metaKey: true });
        expect(screen.getByPlaceholderText('Search messages…')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByPlaceholderText('Search messages…'), { key: 'Escape' });
        expect(screen.queryByPlaceholderText('Search messages…')).not.toBeInTheDocument();
      });
    });

    describe('system messages', () => {
      it('renders system messages', () => {
        const agentWithSystem = {
          ...readyAgent,
          messages: [
            { id: '4', role: 'system', text: 'Container started', time: '12:00' },
          ],
        };
        render(<ChatArea {...baseProps} agent={agentWithSystem} />);
        expect(screen.getByText('Container started')).toBeInTheDocument();
      });
    });

    describe('streaming messages accumulation', () => {
      it('renders assistant messages with markdown', () => {
        const agentWithMarkdown = {
          ...readyAgent,
          messages: [
            { id: '5', role: 'assistant', text: '**bold** text', time: '12:00' },
          ],
        };
        render(<ChatArea {...baseProps} agent={agentWithMarkdown} />);
        // The markdown renderer is mocked to just display text
        expect(screen.getByText('**bold** text')).toBeInTheDocument();
      });
    });
  });
});
