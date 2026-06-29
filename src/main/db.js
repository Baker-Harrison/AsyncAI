'use strict';

const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

let db = null;
let SQL = null;
let dbPath = null;

async function getDb() {
  if (db) return db;

  const initSqlJs = require('sql.js');
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
  });

  dbPath = path.join(app.getPath('userData'), 'asyncai.db');

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id         TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT    PRIMARY KEY,
      agent_id   TEXT    NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT    NOT NULL,
      session_id   TEXT,
      role         TEXT    NOT NULL,
      model_json   TEXT    NOT NULL,
      display_text TEXT,
      tool_call_id TEXT,
      tool_name    TEXT,
      tool_params  TEXT,
      tool_output  TEXT,
      tool_status  TEXT,
      created_at   INTEGER NOT NULL
    );
  `);

  // Migrate existing messages table if session_id column is missing
  try {
    db.run('ALTER TABLE messages ADD COLUMN session_id TEXT');
  } catch { /* column already exists */ }

  persist();
  return db;
}

function persist() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// ── Agents ─────────────────────────────────────────────────────────────────

async function createAgent({ id, name }) {
  const d = await getDb();
  d.run('INSERT INTO agents (id, name, created_at) VALUES (?, ?, ?)', [id, name, Date.now()]);
  persist();
}

async function listAgents() {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM agents ORDER BY created_at ASC');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── Sessions ────────────────────────────────────────────────────────────────

async function createSession(agentId) {
  const d  = await getDb();
  const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  d.run('INSERT INTO sessions (id, agent_id, started_at) VALUES (?, ?, ?)', [id, agentId, Date.now()]);
  persist();
  return id;
}

async function endSession(sessionId) {
  const d = await getDb();
  d.run('UPDATE sessions SET ended_at = ? WHERE id = ?', [Date.now(), sessionId]);
  persist();
}

async function getCurrentSession(agentId) {
  const d    = await getDb();
  const stmt = d.prepare('SELECT * FROM sessions WHERE agent_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1');
  stmt.bind([agentId]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// ── Messages ────────────────────────────────────────────────────────────────

async function addMessage({ agentId, sessionId, role, modelJson, displayText, toolCallId, toolName, toolParams, toolOutput, toolStatus }) {
  const d = await getDb();
  d.run(
    `INSERT INTO messages
       (agent_id, session_id, role, model_json, display_text, tool_call_id, tool_name, tool_params, tool_output, tool_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agentId,
      sessionId    ?? null,
      role,
      modelJson,
      displayText  ?? null,
      toolCallId   ?? null,
      toolName     ?? null,
      toolParams   ?? null,
      toolOutput   ?? null,
      toolStatus   ?? null,
      Date.now(),
    ]
  );
  persist();
}

// Only load messages from the current (open) session for model history + UI
async function getMessages(agentId) {
  const d    = await getDb();
  const sess = await getCurrentSession(agentId);
  if (!sess) return [];
  const stmt = d.prepare('SELECT * FROM messages WHERE agent_id = ? AND session_id = ? ORDER BY created_at ASC');
  stmt.bind([agentId, sess.id]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── History search ──────────────────────────────────────────────────────────

async function searchHistory(agentId, query) {
  const d        = await getDb();
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Get all ended sessions for this agent
  const sessStmt = d.prepare('SELECT * FROM sessions WHERE agent_id = ? AND ended_at IS NOT NULL ORDER BY started_at DESC');
  sessStmt.bind([agentId]);
  const sessions = [];
  while (sessStmt.step()) sessions.push(sessStmt.getAsObject());
  sessStmt.free();

  const results = [];

  for (const session of sessions) {
    // Load all messages for this session
    const msgStmt = d.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
    msgStmt.bind([session.id]);
    const msgs = [];
    while (msgStmt.step()) msgs.push(msgStmt.getAsObject());
    msgStmt.free();

    // Find matching message indices
    const matchIndices = new Set();
    msgs.forEach((m, i) => {
      const text = (m.display_text || m.tool_output || '').toLowerCase();
      if (keywords.some((kw) => text.includes(kw))) matchIndices.add(i);
    });

    if (matchIndices.size === 0) continue;

    // Expand each match with 2 messages of surrounding context
    const contextIndices = new Set();
    for (const i of matchIndices) {
      for (let j = Math.max(0, i - 2); j <= Math.min(msgs.length - 1, i + 2); j++) {
        contextIndices.add(j);
      }
    }

    const contextMsgs = [...contextIndices].sort((a, b) => a - b).map((i) => msgs[i]);
    results.push({ session, messages: contextMsgs });
  }

  return results;
}

module.exports = {
  createAgent, listAgents,
  createSession, endSession, getCurrentSession,
  addMessage, getMessages,
  searchHistory,
};
