/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageInput from '../renderer/components/MessageInput';

describe('MessageInput', () => {
  const baseProps = {
    onSend: jest.fn(),
    onCommand: jest.fn(),
    disabled: false,
    placeholder: 'Type a message…',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('text input', () => {
    it('renders the textarea', () => {
      render(<MessageInput {...baseProps} />);
      expect(screen.getByPlaceholderText('Type a message…')).toBeInTheDocument();
    });

    it('calls onSend when submitting text', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: 'Hello' } });
      // Submit the form directly instead of clicking a button
      const form = input.closest('form');
      fireEvent.submit(form);
      expect(baseProps.onSend).toHaveBeenCalledWith('Hello', []);
    });

    it('does not call onSend when disabled', () => {
      render(<MessageInput {...baseProps} disabled={true} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: 'Hello' } });
      const form = input.closest('form');
      fireEvent.submit(form);
      expect(baseProps.onSend).not.toHaveBeenCalled();
    });

    it('does not send empty text', () => {
      render(<MessageInput {...baseProps} />);
      const form = screen.getByPlaceholderText('Type a message…').closest('form');
      fireEvent.submit(form);
      expect(baseProps.onSend).not.toHaveBeenCalled();
    });

    it('sends on Enter (not Shift+Enter)', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      expect(baseProps.onSend).toHaveBeenCalledWith('Hello', []);
    });

    it('does not send on Shift+Enter', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      expect(baseProps.onSend).not.toHaveBeenCalled();
    });

    it('disables send when disabled prop is true', () => {
      render(<MessageInput {...baseProps} disabled={true} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: 'Hello' } });
      const sendBtn = document.querySelector('.send-btn');
      expect(sendBtn).toBeDisabled();
    });

    it('enables send when text is entered', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: 'Hello' } });
      const sendBtn = document.querySelector('.send-btn');
      expect(sendBtn).not.toBeDisabled();
    });
  });

  describe('slash commands', () => {
    it('shows command suggestions when typing /', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: '/' } });
      expect(screen.getByText('/clear')).toBeInTheDocument();
    });

    it('executes command on click', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: '/' } });
      fireEvent.mouseDown(screen.getByText('/clear'));
      expect(baseProps.onCommand).toHaveBeenCalledWith('/clear');
    });

    it('executes command on Enter when selected', () => {
      render(<MessageInput {...baseProps} />);
      const input = screen.getByPlaceholderText('Type a message…');
      fireEvent.change(input, { target: { value: '/' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(baseProps.onCommand).toHaveBeenCalledWith('/clear');
    });
  });

  describe('file upload', () => {
    it('renders the attach button', () => {
      render(<MessageInput {...baseProps} />);
      const attachBtn = screen.getByTitle('Attach file');
      expect(attachBtn).toBeInTheDocument();
    });

    it('shows drag-over visual feedback', () => {
      render(<MessageInput {...baseProps} />);
      const container = screen.getByPlaceholderText('Type a message…')
        .closest('.message-input-container');
      fireEvent.dragOver(container);
      expect(container.classList.contains('message-input-container--drag')).toBe(true);
      fireEvent.dragLeave(container);
      expect(container.classList.contains('message-input-container--drag')).toBe(false);
    });

    it('has a send button that is disabled without text', () => {
      render(<MessageInput {...baseProps} />);
      const sendBtn = document.querySelector('.send-btn');
      expect(sendBtn).toBeDisabled();
    });
  });

  describe('disabled state', () => {
    it('disables textarea when disabled is true', () => {
      render(<MessageInput {...baseProps} disabled={true} />);
      expect(screen.getByPlaceholderText('Type a message…')).toBeDisabled();
    });

    it('shows custom placeholder', () => {
      render(<MessageInput {...baseProps} placeholder="Custom placeholder" />);
      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });
  });
});
