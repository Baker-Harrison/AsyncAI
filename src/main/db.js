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

    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT    NOT NULL,
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

// ── Messages ────────────────────────────────────────────────────────────────

async function addMessage({ agentId, role, modelJson, displayText, toolCallId, toolName, toolParams, toolOutput, toolStatus }) {
  const d = await getDb();
  d.run(
    `INSERT INTO messages
       (agent_id, role, model_json, display_text, tool_call_id, tool_name, tool_params, tool_output, tool_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agentId, role, modelJson,
      displayText ?? null,
      toolCallId  ?? null,
      toolName    ?? null,
      toolParams  ?? null,
      toolOutput  ?? null,
      toolStatus  ?? null,
      Date.now(),
    ]
  );
  persist();
}

async function getMessages(agentId) {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM messages WHERE agent_id = ? ORDER BY created_at ASC');
  stmt.bind([agentId]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = { createAgent, listAgents, addMessage, getMessages };
