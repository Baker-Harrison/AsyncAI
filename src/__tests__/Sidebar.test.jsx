/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Sidebar from '../renderer/components/Sidebar';

describe('Sidebar', () => {
  const agents = [
    { id: 'agent-1', name: 'Alex', status: 'ready', messages: [] },
    { id: 'agent-2', name: 'Bob', status: 'starting', messages: [] },
  ];

  const baseProps = {
    agents,
    activeAgentId: 'agent-1',
    onAgentSelect: jest.fn(),
    onNewAgent: jest.fn(),
    onOpenSettings: jest.fn(),
    onDeleteAgent: jest.fn(),
    onRenameAgent: jest.fn(),
    collapsed: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('expanded sidebar', () => {
    it('renders agent names', () => {
      render(<Sidebar {...baseProps} />);
      expect(screen.getByText('Alex')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('highlights active agent', () => {
      render(<Sidebar {...baseProps} />);
      const items = screen.getAllByRole('listitem');
      expect(items[0].classList.contains('active')).toBe(true);
      expect(items[1].classList.contains('active')).toBe(false);
    });

    it('calls onAgentSelect on click', () => {
      render(<Sidebar {...baseProps} />);
      fireEvent.click(screen.getByText('Bob'));
      expect(baseProps.onAgentSelect).toHaveBeenCalledWith('agent-2');
    });

    it('calls onNewAgent when clicking + button', () => {
      render(<Sidebar {...baseProps} />);
      fireEvent.click(screen.getByTitle('New Agent'));
      expect(baseProps.onNewAgent).toHaveBeenCalled();
    });

    it('calls onOpenSettings when clicking gear', () => {
      render(<Sidebar {...baseProps} />);
      fireEvent.click(screen.getByTitle('Settings'));
      expect(baseProps.onOpenSettings).toHaveBeenCalled();
    });

    describe('delete operation', () => {
      it('shows delete button on hover', () => {
        render(<Sidebar {...baseProps} />);
        const deleteBtns = screen.getAllByTitle('Delete agent');
        expect(deleteBtns).toHaveLength(2);
      });

      it('calls onDeleteAgent with confirmation', () => {
        window.confirm = jest.fn(() => true);
        render(<Sidebar {...baseProps} />);
        const deleteBtns = screen.getAllByTitle('Delete agent');
        fireEvent.click(deleteBtns[0]);
        expect(window.confirm).toHaveBeenCalled();
        expect(baseProps.onDeleteAgent).toHaveBeenCalledWith('agent-1');
      });

      it('does not delete if cancelled', () => {
        window.confirm = jest.fn(() => false);
        render(<Sidebar {...baseProps} />);
        const deleteBtns = screen.getAllByTitle('Delete agent');
        fireEvent.click(deleteBtns[0]);
        expect(baseProps.onDeleteAgent).not.toHaveBeenCalled();
      });
    });

    describe('rename operation', () => {
      it('starts editing on double-click', () => {
        render(<Sidebar {...baseProps} />);
        fireEvent.doubleClick(screen.getByText('Alex'));
        const input = screen.getByDisplayValue('Alex');
        expect(input).toBeInTheDocument();
      });

      it('calls onRenameAgent on Enter', () => {
        render(<Sidebar {...baseProps} />);
        fireEvent.doubleClick(screen.getByText('Alex'));
        const input = screen.getByDisplayValue('Alex');
        fireEvent.change(input, { target: { value: 'Alex2' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(baseProps.onRenameAgent).toHaveBeenCalledWith('agent-1', 'Alex2');
      });

      it('cancels rename on Escape', () => {
        render(<Sidebar {...baseProps} />);
        fireEvent.doubleClick(screen.getByText('Alex'));
        const input = screen.getByDisplayValue('Alex');
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(baseProps.onRenameAgent).not.toHaveBeenCalled();
        // Should show text again
        expect(screen.getByText('Alex')).toBeInTheDocument();
      });

      it('calls onRenameAgent on blur', () => {
        render(<Sidebar {...baseProps} />);
        fireEvent.doubleClick(screen.getByText('Alex'));
        const input = screen.getByDisplayValue('Alex');
        fireEvent.change(input, { target: { value: 'Alex3' } });
        fireEvent.blur(input);
        expect(baseProps.onRenameAgent).toHaveBeenCalledWith('agent-1', 'Alex3');
      });
    });

    it('shows status dot for starting agents', () => {
      render(<Sidebar {...baseProps} />);
      const statusDots = document.querySelectorAll('.status-dot--starting');
      expect(statusDots).toHaveLength(1); // Bob is starting
    });
  });

  describe('collapsed sidebar', () => {
    const collapsedProps = { ...baseProps, collapsed: true };

    it('shows agent initials instead of names', () => {
      render(<Sidebar {...collapsedProps} />);
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('does not show agent names', () => {
      render(<Sidebar {...collapsedProps} />);
      expect(screen.queryByText('Alex')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    it('has collapsed class', () => {
      const { container } = render(<Sidebar {...collapsedProps} />);
      expect(container.querySelector('.sidebar--collapsed')).toBeInTheDocument();
    });

    it('calls onAgentSelect when clicking icon', () => {
      render(<Sidebar {...collapsedProps} />);
      fireEvent.click(screen.getByText('B'));
      expect(baseProps.onAgentSelect).toHaveBeenCalledWith('agent-2');
    });

    it('shows add button', () => {
      render(<Sidebar {...collapsedProps} />);
      expect(screen.getByText('+')).toBeInTheDocument();
    });
  });
});
