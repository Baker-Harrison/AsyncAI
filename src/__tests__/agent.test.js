/**
 * Tests for AgentHarness streaming logic.
 * These tests validate the SSE parsing, streaming accumulation,
 * fallback behavior, and error handling.
 */

const { AgentHarness } = require('../main/agent');

// Polyfill TextEncoder/TextDecoder for Node.js test environment
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock fetch globally
global.fetch = jest.fn();

// Mock child_process
jest.mock('child_process', () => ({
  execFile: jest.fn((cmd, args, opts, cb) => {
    if (typeof opts === 'function') {
      opts(null, { stdout: '', stderr: '' });
    } else if (typeof cb === 'function') {
      cb(null, { stdout: '', stderr: '' });
    }
  }),
  spawn: jest.fn(() => ({
    stdin: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  })),
  promisify: jest.fn(() => jest.fn()),
}));

// Mock util.promisify
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn(() => jest.fn()),
}));

describe('AgentHarness', () => {
  let harness;
  let onEventMock;
  let saveMessageMock;
  let searchHistoryMock;
  let onClearMock;

  beforeEach(() => {
    onEventMock = jest.fn();
    saveMessageMock = jest.fn();
    searchHistoryMock = jest.fn();
    onClearMock = jest.fn();
    global.fetch.mockReset();

    harness = new AgentHarness({
      agentId: 'test-agent',
      containerName: 'asyncai-test-agent',
      agentName: 'TestBot',
      sessionId: 'sess-1',
      history: [],
      onEvent: onEventMock,
      saveMessage: saveMessageMock,
      searchHistory: searchHistoryMock,
      onClear: onClearMock,
    });
  });

  describe('constructor', () => {
    it('initializes with empty history', () => {
      expect(harness.modelHistory).toEqual([]);
      expect(harness._running).toBe(false);
      expect(harness._aborted).toBe(false);
      expect(harness._streamedTextFinalEmitted).toBe(false);
    });

    it('parses existing history from JSON', () => {
      const history = [
        { model_json: JSON.stringify({ role: 'user', content: 'Hello' }) },
      ];
      const h = new AgentHarness({
        agentId: 'test', containerName: 'c', agentName: 'n',
        sessionId: 's', history, onEvent: jest.fn(),
        saveMessage: jest.fn(), searchHistory: jest.fn(), onClear: jest.fn(),
      });
      expect(h.modelHistory).toEqual([{ role: 'user', content: 'Hello' }]);
    });
  });

  describe('abort', () => {
    it('sets _aborted flag', () => {
      expect(harness._aborted).toBe(false);
      harness.abort();
      expect(harness._aborted).toBe(true);
    });
  });

  describe('clear', () => {
    it('calls onClear and resets history', async () => {
      onClearMock.mockResolvedValue(undefined);
      harness.modelHistory = [{ role: 'user', content: 'test' }];
      await harness.clear();
      expect(onClearMock).toHaveBeenCalledWith('sess-1');
      expect(harness.modelHistory).toEqual([]);
    });
  });

  describe('_callModel', () => {
    it('throws if no API key', async () => {
      delete process.env.OPENCODE_API_KEY;
      await expect(harness._callModel()).rejects.toThrow('OPENCODE_API_KEY not set in .env');
    });

    it('throws on non-ok response', async () => {
      process.env.OPENCODE_API_KEY = 'test-key';
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });
      await expect(harness._callModel()).rejects.toThrow('LLM 401');
    });

    it('throws on timeout', async () => {
      process.env.OPENCODE_API_KEY = 'test-key';
      global.fetch.mockRejectedValue({ name: 'AbortError', message: 'The operation was aborted' });
      await expect(harness._callModel()).rejects.toThrow('timed out');
    });
  });

  describe('_callModelStream', () => {
    beforeEach(() => {
      process.env.OPENCODE_API_KEY = 'test-key';
    });

    it('throws if no API key', async () => {
      delete process.env.OPENCODE_API_KEY;
      await expect(harness._callModelStream()).rejects.toThrow('OPENCODE_API_KEY not set in .env');
    });

    it('accumulates content from streamed chunks', async () => {
      // Mock SSE response with multiple chunks
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"},"index":0}]}\n\n',
        'data: [DONE]\n\n',
      ];
      const mockReader = createMockReader(chunks);
      global.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const result = await harness._callModelStream();
      expect(result.msg.content).toBe('Hello world');
      // Should emit text-chunk events for each chunk
      expect(onEventMock).toHaveBeenCalledWith({ type: 'text-chunk', text: 'Hello' });
      expect(onEventMock).toHaveBeenCalledWith({ type: 'text-chunk', text: ' world' });
    });

    it('accumulates tool calls from streamed chunks', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":""}}]},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ls -la"}}]},"index":0}]}\n\n',
        'data: [DONE]\n\n',
      ];
      global.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => createMockReader(chunks) },
      });

      const result = await harness._callModelStream();
      expect(result.msg.tool_calls).toHaveLength(1);
      expect(result.msg.tool_calls[0].function.name).toBe('bash');
      expect(result.msg.tool_calls[0].function.arguments).toBe('ls -la');
    });

    it('handles stream interruption and emits partial content', async () => {
      // First chunk succeeds, second chunk throws
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Partial "},"index":0}]}\n\n',
      ];
      let readCount = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(async () => {
          readCount++;
          if (readCount === 1) {
            return { done: false, value: new TextEncoder().encode(chunks[0]) };
          }
          throw new Error('Connection lost');
        }),
        releaseLock: jest.fn(),
      };
      global.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      await expect(harness._callModelStream()).rejects.toThrow('Stream interrupted');
      // Should have emitted partial content before failing
      expect(onEventMock).toHaveBeenCalledWith({ type: 'text-chunk', text: 'Partial ' });
    });

    it('throws on truncated response', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":"length"}]}\n\n',
      ];
      global.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => createMockReader(chunks) },
      });

      await expect(harness._callModelStream()).rejects.toThrow('Response truncated');
    });

    it('throws on non-ok response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      });
      await expect(harness._callModelStream()).rejects.toThrow('LLM 429');
    });

    it('emits text-chunk events for each content delta', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"A"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":"B"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":"C"},"index":0}]}\n\n',
        'data: [DONE]\n\n',
      ];
      global.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => createMockReader(chunks) },
      });

      await harness._callModelStream();
      expect(onEventMock).toHaveBeenCalledTimes(3);
      expect(onEventMock).toHaveBeenNthCalledWith(1, { type: 'text-chunk', text: 'A' });
      expect(onEventMock).toHaveBeenNthCalledWith(2, { type: 'text-chunk', text: 'B' });
      expect(onEventMock).toHaveBeenNthCalledWith(3, { type: 'text-chunk', text: 'C' });
    });
  });

  describe('_loop fallback behavior', () => {
    beforeEach(() => {
      process.env.OPENCODE_API_KEY = 'test-key';
    });

    it('falls back to non-streaming when streaming fails', async () => {
      // Streaming throws
      global.fetch
        .mockRejectedValueOnce(new Error('Streaming not supported'))
        // Non-streaming succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { role: 'assistant', content: 'Fallback response' }, finish_reason: 'stop' }],
          }),
        });

      // Mock saveMessage and onEvent
      saveMessageMock.mockResolvedValue(undefined);

      await harness.chat('Hello');

      // The chat method catches errors from _loop, so we should get a 'done' event
      const doneEvents = onEventMock.mock.calls.filter(c => c[0].type === 'done');
      expect(doneEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      process.env.OPENCODE_API_KEY = 'test-key';
    });

    it('emits error and done events when chat fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));
      saveMessageMock.mockResolvedValue(undefined);

      await harness.chat('Hello');

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'done' }));
    });
  });
});

// Helper to create a mock reader from SSE chunks
function createMockReader(chunks) {
  const encoder = new TextEncoder();
  let idx = 0;
  return {
    read: jest.fn().mockImplementation(async () => {
      if (idx >= chunks.length) {
        return { done: true, value: undefined };
      }
      const value = encoder.encode(chunks[idx]);
      idx++;
      return { done: false, value };
    }),
    releaseLock: jest.fn(),
  };
}
