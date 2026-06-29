'use strict';

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { AgentHarness } = require('./agent');
const db = require('./db');

const execFileAsync = promisify(execFile);

// ── Env ────────────────────────────────────────────────────────────────────

const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && v && !k.startsWith('#') && !process.env[k]) process.env[k] = v;
    }
  });
}

// ── Docker ─────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const IMAGE_NAME   = 'asyncai-agent';

async function buildImageIfNeeded() {
  try {
    await execFileAsync('docker', ['image', 'inspect', IMAGE_NAME]);
  } catch {
    console.log('[docker] building image…');
    await execFileAsync('docker', ['build', '-t', IMAGE_NAME, '.'], { cwd: PROJECT_ROOT });
  }
}

function containerName(agentId) {
  return `asyncai-${agentId}`;
}

// Ensure the agent's container exists and is running. Returns when ready.
async function ensureContainer(agentId) {
  const name = containerName(agentId);

  // Check if container exists
  try {
    const { stdout } = await execFileAsync('docker', ['inspect', '--format', '{{.State.Status}}', name]);
    const status = stdout.trim();
    if (status === 'running') return; // already up
    // Exists but stopped — restart it
    await execFileAsync('docker', ['start', name]);
  } catch {
    // Container doesn't exist — create it
    await execFileAsync('docker', [
      'run', '-d', '--name', name,
      '-e', `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
      IMAGE_NAME,
    ]);
  }
}

async function stopContainer(agentId) {
  try {
    await execFileAsync('docker', ['stop', containerName(agentId)]);
  } catch { /* ignore */ }
}

// ── Harness store ──────────────────────────────────────────────────────────

const harnesses = new Map(); // agentId → AgentHarness

async function buildHarness(agent) {
  const messages = await db.getMessages(agent.id);
  const harness = new AgentHarness({
    agentId:       agent.id,
    containerName: containerName(agent.id),
    agentName:     agent.name,
    history:       messages,
    onEvent: (event) => mainWindow?.webContents.send('agent-event', { agentId: agent.id, ...event }),
    saveMessage: (msg) => db.addMessage({ agentId: agent.id, ...msg }),
  });
  harnesses.set(agent.id, harness);
  return harness;
}

// Convert a DB message row to the shape the renderer expects
function dbMsgToUI(m) {
  if (m.role === 'user') {
    return { id: m.id, role: 'user', text: m.display_text, time: fmtTime(m.created_at) };
  }
  if (m.role === 'assistant' && m.display_text) {
    return { id: m.id, role: 'assistant', text: m.display_text, time: fmtTime(m.created_at) };
  }
  if (m.role === 'tool') {
    return {
      id:     m.id,
      role:   'tool',
      tool:   m.tool_name,
      params: JSON.parse(m.tool_params || '{}'),
      output: m.tool_output,
      status: m.tool_status,
      time:   fmtTime(m.created_at),
    };
  }
  return null; // assistant-with-only-tool_calls — no UI row needed
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.handle('agent:list', async () => {
  const agents = await db.listAgents();
  return Promise.all(agents.map(async (agent) => {
    const msgs = await db.getMessages(agent.id);
    return {
      id:       agent.id,
      name:     agent.name,
      status:   'ready', // optimistic — container startup is handled separately
      messages: msgs.map(dbMsgToUI).filter(Boolean),
    };
  }));
});

ipcMain.handle('agent:create', async (_, { name }) => {
  const id = `agent-${Date.now()}`;
  await db.createAgent({ id, name });

  // Fire-and-forget container start; send status events when done
  const send = (status, error) =>
    mainWindow?.webContents.send('agent-status', { agentId: id, status, error });

  send('starting');
  buildImageIfNeeded()
    .then(() => ensureContainer(id))
    .then(async () => {
      await buildHarness({ id, name });
      send('ready');
    })
    .catch((e) => {
      console.error('[agent:create] container error:', e.message);
      send('error', e.message);
    });

  return { id, name, status: 'starting', messages: [] };
});

ipcMain.handle('agent:chat', async (_, { agentId, text }) => {
  const harness = harnesses.get(agentId);
  if (!harness) throw new Error(`No harness for agent ${agentId}`);
  await harness.chat(text);
});

ipcMain.handle('agent:abort', (_, { agentId }) => {
  harnesses.get(agentId)?.abort();
});

// ── Window ─────────────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1d21',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  mainWindow.on('maximize',   () => mainWindow.webContents.send('window-maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-changed', false));
  mainWindow.on('closed',     () => { mainWindow = null; });
}

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

// ── Startup / shutdown ─────────────────────────────────────────────────────

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  createWindow();

  // Load existing agents and (re)start their containers
  let agents = [];
  try {
    agents = await db.listAgents();
  } catch (e) {
    console.error('[startup] db error:', e.message);
  }

  await buildImageIfNeeded().catch((e) => console.error('[startup] image build failed:', e.message));

  for (const agent of agents) {
    const send = (status, error) =>
      mainWindow?.webContents.send('agent-status', { agentId: agent.id, status, error });
    send('starting');
    ensureContainer(agent.id)
      .then(() => buildHarness(agent))
      .then(() => send('ready'))
      .catch((e) => {
        console.error(`[startup] container error for ${agent.id}:`, e.message);
        send('error', e.message);
      });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Stop all containers cleanly on quit
app.on('before-quit', async () => {
  const agents = await db.listAgents().catch(() => []);
  await Promise.allSettled(agents.map((a) => stopContainer(a.id)));
});
