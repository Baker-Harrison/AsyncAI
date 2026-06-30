'use strict';

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: process.execPath,
    watchRenderer: true,
  });
}

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { AgentHarness } = require('./agent');
const db = require('./db');

const execFileAsync = promisify(execFile);

// ── Env (.env for dev, DB key takes precedence at runtime) ─────────────────

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
  // Get or create the current session
  let session = await db.getCurrentSession(agent.id);
  if (!session) session = { id: await db.createSession(agent.id) };

  const messages = await db.getMessages(agent.id);
  const harness = new AgentHarness({
    agentId:       agent.id,
    containerName: containerName(agent.id),
    agentName:     agent.name,
    sessionId:     session.id,
    history:       messages,
    onEvent:       (event) => mainWindow?.webContents.send('agent-event', { agentId: agent.id, ...event }),
    saveMessage:   (msg)   => db.addMessage({ agentId: agent.id, ...msg }),
    searchHistory: (agentId, query) => db.searchHistory(agentId, query),
    onClear: async (oldSessionId) => {
      await db.endSession(oldSessionId);
      const newSessionId = await db.createSession(agent.id);
      harness.sessionId = newSessionId;
      mainWindow?.webContents.send('agent-cleared', { agentId: agent.id });
    },
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
      status:   'starting', // will flip to 'ready' once container is confirmed running
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

ipcMain.handle('agent:chat', async (_, { agentId, text, files }) => {
  const harness = harnesses.get(agentId);
  if (!harness) throw new Error(`No harness for agent ${agentId}`);

  // If there are files, copy them into the container first
  if (files && files.length > 0) {
    for (const file of files) {
      const destPath = `/home/agent/${file.name}`;
      // Use docker cp to copy file into container
      try {
        const tempFile = path.join(app.getPath('temp'), file.name);
        // Write the base64-decoded content to a temp file, then docker cp it
        const buf = Buffer.from(file.data, 'base64');
        fs.writeFileSync(tempFile, buf);
        await execFileAsync('docker', ['cp', tempFile, `${containerName(agentId)}:${destPath}`]);
        fs.unlinkSync(tempFile);
      } catch (e) {
        console.error('[agent:chat] file upload error:', e.message);
        throw new Error(`Failed to upload file ${file.name}: ${e.message}`);
      }
    }
  }

  await harness.chat(text);
});

ipcMain.handle('agent:abort', (_, { agentId }) => {
  harnesses.get(agentId)?.abort();
});

ipcMain.handle('agent:clear', async (_, { agentId }) => {
  const harness = harnesses.get(agentId);
  if (!harness) throw new Error(`No harness for agent ${agentId}`);
  await harness.clear();
});

ipcMain.handle('agent:delete', async (_, { agentId }) => {
  // Stop & remove container
  try {
    await execFileAsync('docker', ['stop', containerName(agentId)]);
  } catch { /* ignore */ }
  try {
    await execFileAsync('docker', ['rm', '-f', containerName(agentId)]);
  } catch { /* ignore */ }

  // Remove harness
  harnesses.delete(agentId);

  // Remove from DB
  await db.deleteAgent(agentId);

  mainWindow?.webContents.send('agent-deleted', { agentId });
});

ipcMain.handle('agent:rename', async (_, { agentId, name }) => {
  await db.renameAgent(agentId, name);
  // Update harness if it exists
  const harness = harnesses.get(agentId);
  if (harness) harness.agentName = name;
  mainWindow?.webContents.send('agent-renamed', { agentId, name });
});

// ── Settings ───────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', async (_, key) => {
  return db.getSetting(key);
});

ipcMain.handle('settings:set', async (_, key, value) => {
  await db.setSetting(key, value);
  if (key === 'opencode_api_key') process.env.OPENCODE_API_KEY = value;
});

// ── Terminal ───────────────────────────────────────────────────────────────

const pty = require('node-pty');
const terminals = new Map(); // agentId → pty process

ipcMain.handle('terminal:create', (_, agentId) => {
  // Kill existing terminal for this agent if any
  if (terminals.has(agentId)) {
    try { terminals.get(agentId).kill(); } catch { /* ignore */ }
    terminals.delete(agentId);
  }

  const ptyProcess = pty.spawn('docker', ['exec', '-it', containerName(agentId), 'bash'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || process.env.USERPROFILE || '/',
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  ptyProcess.onData((data) => {
    mainWindow?.webContents.send('terminal-data', { agentId, data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    terminals.delete(agentId);
    mainWindow?.webContents.send('terminal-exit', { agentId, exitCode });
  });

  terminals.set(agentId, ptyProcess);
});

ipcMain.on('terminal:input',  (_, { agentId, data })       => terminals.get(agentId)?.write(data));
ipcMain.on('terminal:resize', (_, { agentId, cols, rows }) => terminals.get(agentId)?.resize(cols, rows));
ipcMain.on('terminal:destroy', (_, agentId) => {
  try { terminals.get(agentId)?.kill(); } catch { /* ignore */ }
  terminals.delete(agentId);
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
ipcMain.on('update:install', () => autoUpdater.quitAndInstall());

// ── Auto-updater ───────────────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', { version: info.version });
  });

  autoUpdater.on('error', (e) => {
    console.error('[updater]', e.message);
  });
}

// ── Startup / shutdown ─────────────────────────────────────────────────────

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  // Load stored API key (overrides .env)
  const storedKey = await db.getSetting('opencode_api_key').catch(() => null);
  if (storedKey) process.env.OPENCODE_API_KEY = storedKey;

  createWindow();

  // Check for updates in production only
  if (process.env.NODE_ENV !== 'development') {
    setupAutoUpdater();
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

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

// Stop all containers and terminals cleanly on quit
app.on('before-quit', async () => {
  for (const ptyProcess of terminals.values()) {
    try { ptyProcess.kill(); } catch { /* ignore */ }
  }
  terminals.clear();
  const agents = await db.listAgents().catch(() => []);
  await Promise.allSettled(agents.map((a) => stopContainer(a.id)));
});
