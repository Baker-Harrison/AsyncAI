'use strict';

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const LLM_BASE_URL  = 'https://opencode.ai/zen/go/v1';
const LLM_MODEL     = 'deepseek-v4-flash';
const FETCH_TIMEOUT = 120_000;

// ── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a bash command on the agent\'s computer. Full shell access — use this for anything: running code, managing files, installing packages, git, curl, etc. Working directory is /home/agent unless you cd elsewhere.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read a file from the computer. Use absolute paths.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Write or overwrite a file. Use absolute paths. Parent directories are created automatically.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Replace an exact unique string in a file. old_str must appear exactly once.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string' },
          old_str: { type: 'string' },
          new_str: { type: 'string' },
        },
        required: ['path', 'old_str', 'new_str'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_history',
      description: 'Search through archived past conversations for context you don\'t have in the current session. Use this when the user references something you don\'t recognise, or when you need context from a previous session. If nothing relevant is found, say you don\'t know and ask the user — never guess.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Keywords to search for in past conversations.' } },
        required: ['query'],
      },
    },
  },
];

const systemPrompt = (name) =>
  `You are ${name}, a capable AI assistant with your own computer. ` +
  `Use your tools to get things done — run commands, write code, browse with curl, work with git and GitHub, manage files, whatever the user needs. ` +
  `Your home directory is /home/agent.\n\n` +
  `## Context rules\n` +
  `- Your current session is what's in this conversation. Past sessions are archived.\n` +
  `- Use \`search_history\` when the user references something you don't have context for — search before admitting you don't know.\n` +
  `- If \`search_history\` returns nothing relevant, say you don't know and ask the user. Never guess or invent context.`;

// ── SSE parser ─────────────────────────────────────────────────────────────

function parseSSE(chunk) {
  const lines = chunk.split('\n');
  const events = [];
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        events.push({ type: 'done' });
      } else {
        try {
          events.push({ type: 'data', json: JSON.parse(data) });
        } catch { /* skip malformed */ }
      }
    }
  }
  return events;
}

// ── AgentHarness ───────────────────────────────────────────────────────────

class AgentHarness {
  constructor({ agentId, containerName, agentName, sessionId, history, onEvent, saveMessage, searchHistory, onClear }) {
    this.agentId       = agentId;
    this.containerName = containerName;
    this.agentName     = agentName;
    this.sessionId     = sessionId;
    this.onEvent       = onEvent;
    this.saveMessage   = saveMessage;
    this.searchHistory = searchHistory;
    this.onClear       = onClear;
    this._running      = false;
    this._aborted      = false;

    this.modelHistory = history.map((m) => JSON.parse(m.model_json));
    // Tracks whether the final 'text' event was emitted after streaming.
    // Reset at the start of each streaming call; set to true once emitted
    // so _loop() doesn't double-emit the full content.
    this._streamedTextFinalEmitted = false;
  }

  async clear() {
    await this.onClear(this.sessionId);
    this.modelHistory = [];
  }

  abort() { this._aborted = true; }

  async chat(userText) {
    if (this._running) return;
    this._running = true;
    this._aborted = false;

    try {
      // Persist and record user message
      const userMsg = { role: 'user', content: userText };
      await this.saveMessage({ role: 'user', sessionId: this.sessionId, modelJson: JSON.stringify(userMsg), displayText: userText });
      this.modelHistory.push(userMsg);

      this.onEvent({ type: 'thinking' });
      await this._loop();
    } catch (e) {
      this.onEvent({ type: 'error', message: e.message });
    } finally {
      this._running = false;
      this.onEvent({ type: 'done' });
    }
  }

  async _loop() {
    while (!this._aborted) {
      this.onEvent({ type: 'thinking' });

      // Try streaming first, fall back to non-streaming
      let result;
      try {
        result = await this._callModelStream();
      } catch (e) {
        // If streaming fails (e.g. not supported), fall back to non-streaming
        console.warn('[agent] streaming failed, falling back to non-streaming:', e.message);
        const res = await this._callModel();
        const choice = res.choices?.[0];
        if (!choice) throw new Error('Empty response from model');
        if (choice.finish_reason === 'length') throw new Error('Response truncated — try a shorter request');
        result = { msg: choice.message, finishReason: choice.finish_reason };
      }

      const msg       = result.msg;
      const toolCalls = msg.tool_calls ?? [];

      // Emit final text if we streamed but didn't emit a final 'text' event yet
      if (msg.content && !this._streamedTextFinalEmitted) {
        this.onEvent({ type: 'text', text: msg.content });
      }
      this._streamedTextFinalEmitted = false;

      // Persist assistant message
      await this.saveMessage({
        role:        'assistant',
        sessionId:   this.sessionId,
        modelJson:   JSON.stringify(msg),
        displayText: msg.content || null,
      });
      this.modelHistory.push(msg);

      if (toolCalls.length === 0) return; // model is done

      // Execute tools
      const results = [];
      for (const tc of toolCalls) {
        if (this._aborted) break;

        const tool = tc.function.name;
        let params;
        try { params = JSON.parse(tc.function.arguments); } catch { params = {}; }

        this.onEvent({ type: 'tool-start', id: tc.id, tool, params });

        let output, status = 'ok';
        try {
          output = await this._executeTool(tool, params);
        } catch (e) {
          output = `Error: ${e.message}`;
          status = 'error';
        }

        const MAX     = 20_000;
        const display = output.length > MAX
          ? output.slice(0, MAX) + `\n...[truncated ${output.length - MAX} chars]`
          : output;

        const toolMsg = { role: 'tool', tool_call_id: tc.id, content: display };
        await this.saveMessage({
          role:        'tool',
          sessionId:   this.sessionId,
          modelJson:   JSON.stringify(toolMsg),
          displayText: null,
          toolCallId:  tc.id,
          toolName:    tool,
          toolParams:  JSON.stringify(params),
          toolOutput:  display,
          toolStatus:  status,
        });

        this.onEvent({ type: 'tool-done', id: tc.id, tool, output: display, status });
        results.push(toolMsg);
      }

      this.modelHistory.push(...results);
    }
  }

  // ── Streaming API call ─────────────────────────────────────────────────
  //
  // Makes a streaming request to the LLM API, emitting 'text-chunk' events
  // as content arrives, and accumulating tool_calls from delta chunks.
  // On success, returns the assembled message object.
  // On error, throws so _loop() can fall back or surface the error.
  //
  // The _streamedTextFinalEmitted flag prevents _loop() from double-emitting
  // the full content as a 'text' event (since chunks were already streamed).

  async _callModelStream() {
    const apiKey = process.env.OPENCODE_API_KEY;
    if (!apiKey) throw new Error('OPENCODE_API_KEY not set in .env');

    this._streamedTextFinalEmitted = false;

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    let res;
    try {
      res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body:    JSON.stringify({
          model:      LLM_MODEL,
          messages:   [{ role: 'system', content: systemPrompt(this.agentName) }, ...this.modelHistory],
          tools:      TOOLS,
          tool_choice: 'auto',
          max_tokens: 8192,
          stream:     true,
        }),
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error(`Request timed out after ${FETCH_TIMEOUT / 1000}s`);
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulated results
    let content = '';
    const toolCalls = {}; // index -> { id, type, function: { name, arguments } }
    let streamError = null;

    try {
      while (true) {
        let chunk;
        try {
          const { done, value } = await reader.read();
          if (done) break;
          chunk = value;
        } catch (e) {
          // Stream read error (e.g. network interruption mid-stream)
          streamError = new Error(`Stream interrupted: ${e.message}`);
          // Emit whatever content we got so far before failing
          if (content) {
            this.onEvent({ type: 'text', text: content });
            this._streamedTextFinalEmitted = true;
          }
          break;
        }

        if (this._aborted) {
          controller.abort();
          // Emit partial content if we have any
          if (content) {
            this.onEvent({ type: 'text', text: content });
            this._streamedTextFinalEmitted = true;
          }
          throw new Error('Aborted');
        }

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          let parsed;
          try { parsed = JSON.parse(payload); } catch { continue; }

          const choice = parsed.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason === 'length') {
            streamError = new Error('Response truncated — try a shorter request');
            break;
          }

          const delta = choice.delta || {};

          // Accumulate and emit text chunks as they arrive
          if (delta.content) {
            content += delta.content;
            this.onEvent({ type: 'text-chunk', text: delta.content });
          }

          // Accumulate tool calls (streaming tool_calls come as index-based deltas)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id += tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }

        if (streamError) break;
      }
    } finally {
      // Always release the reader lock to prevent resource leaks
      try { reader.releaseLock(); } catch { /* ignore */ }
    }

    if (streamError) {
      // If we accumulated partial content, emit it before throwing
      if (content && !this._streamedTextFinalEmitted) {
        this.onEvent({ type: 'text', text: content });
        this._streamedTextFinalEmitted = true;
      }
      throw streamError;
    }

    // Build the final message from accumulated content and tool calls
    const finalToolCalls = Object.values(toolCalls);

    // _streamedTextFinalEmitted is left as false so _loop() will emit
    // the final 'text' event with the complete content.
    // If we already emitted chunks, _loop() will skip the duplicate.

    return {
      msg: {
        role: 'assistant',
        content: content || null,
        tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      },
      finishReason: 'stop',
    };
  }

  // ── Non-streaming fallback ─────────────────────────────────────────────

  async _callModel() {
    const apiKey = process.env.OPENCODE_API_KEY;
    if (!apiKey) throw new Error('OPENCODE_API_KEY not set in .env');

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    let res;
    try {
      res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body:    JSON.stringify({
          model:      LLM_MODEL,
          messages:   [{ role: 'system', content: systemPrompt(this.agentName) }, ...this.modelHistory],
          tools:      TOOLS,
          tool_choice: 'auto',
          max_tokens: 8192,
        }),
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`Request timed out after ${FETCH_TIMEOUT / 1000}s`);
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
    }

    return res.json();
  }

  // ── Tool dispatch ─────────────────────────────────────────────────────

  async _executeTool(name, params) {
    switch (name) {
      case 'bash':     return this._bash(params.command);
      case 'read':     return this._read(params.path);
      case 'write':    return this._write(params.path, params.content);
      case 'edit':     return this._edit(params.path, params.old_str, params.new_str);
      case 'search_history': return this._searchHistory(params.query);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }

  async _searchHistory(query) {
    const results = await this.searchHistory(this.agentId, query);
    if (results.length === 0) {
      return `No past conversations found matching "${query}". You do not have this context — ask the user.`;
    }
    return results.map(({ session, messages }) => {
      const date = new Date(session.started_at).toLocaleString();
      const lines = messages.map((m) => {
        const who    = m.role === 'user' ? 'You' : m.role === 'assistant' ? this.agentName : `[${m.tool_name}]`;
        const text   = m.display_text || m.tool_output || '';
        return `  ${who}: ${text.slice(0, 300)}`;
      }).join('\n');
      return `[Session: ${date}]\n${lines}`;
    }).join('\n\n');
  }

  async _bash(command) {
    try {
      const { stdout, stderr } = await execFileAsync(
        'docker', ['exec', this.containerName, 'bash', '-c', command],
        { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 }
      );
      return [stdout, stderr].map((s) => s?.toString() ?? '').filter(Boolean).join('\n').trim() || '(no output)';
    } catch (e) {
      return [e.stdout, e.stderr].map((s) => s?.toString() ?? '').filter(Boolean).join('\n').trim() || e.message;
    }
  }

  async _read(filePath) {
    try {
      const { stdout } = await execFileAsync(
        'docker', ['exec', this.containerName, 'cat', filePath],
        { maxBuffer: 5 * 1024 * 1024 }
      );
      return stdout.toString();
    } catch (e) {
      throw new Error(`Cannot read ${filePath}: ${e.stderr?.toString().trim() || e.message}`);
    }
  }

  async _write(filePath, content) {
    await new Promise((resolve, reject) => {
      const proc = spawn('docker', [
        'exec', '-i', '-e', `WRITE_PATH=${filePath}`,
        this.containerName,
        'bash', '-c', 'mkdir -p "$(dirname "$WRITE_PATH")" && cat > "$WRITE_PATH"',
      ]);
      let stderr = '';
      proc.stdin.on('error', () => {});
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`write failed (exit ${code}): ${stderr.trim()}`));
      });
      proc.stdin.write(content, 'utf8');
      proc.stdin.end();
    });
    return `Wrote ${content.length} chars to ${filePath}`;
  }

  async _edit(filePath, oldStr, newStr) {
    const current = await this._read(filePath);
    const count   = current.split(oldStr).length - 1;
    if (count === 0) throw new Error(`old_str not found in ${filePath}`);
    if (count > 1)   throw new Error(`old_str matches ${count} times — add more surrounding lines`);
    await this._write(filePath, current.replace(oldStr, newStr));
    return `Edited ${filePath}`;
  }
}

module.exports = { AgentHarness };
