const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, execFile } = require('child_process');

// ── Env ────────────────────────────────────────────────────────────────────

const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  });
}

// ── Opencode client factory ────────────────────────────────────────────────

let createOpencodeClient = null;

async function getClientFactory() {
  if (!createOpencodeClient) {
    ({ createOpencodeClient } = await import('@opencode-ai/sdk/client'));
  }
  return createOpencodeClient;
}

// Maps sessionId → serverUrl so send-message knows which container to hit
const sessionServers = new Map();

// ── Local opencode connection (for auth setup / fallback) ──────────────────

const DEFAULT_URL = 'http://127.0.0.1:4096';
let localClient = null;

async function connectLocalOpencode() {
  try {
    const factory = await getClientFactory();
    const probe = factory({ baseUrl: DEFAULT_URL });
    await probe.session.list();
    localClient = probe;

    const apiKey = process.env.OPENCODE_API_KEY;
    if (apiKey) {
      await localClient.auth.set({
        path: { id: 'opencode' },
        body: { type: 'api', key: apiKey },
      });
    }
    console.log('[opencode] connected to local server');
  } catch (e) {
    console.warn('[opencode] no local server:', e.message);
  }
}

// ── Docker helpers ─────────────────────────────────────────────────────────

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const IMAGE_NAME = 'asyncai-agent';
const usedPorts = new Set([4096, 4747]);

function nextPort() {
  let p = 5000;
  while (usedPorts.has(p)) p++;
  usedPorts.add(p);
  return p;
}

function buildImageIfNeeded() {
  try {
    execSync(`docker image inspect ${IMAGE_NAME}`, { stdio: 'ignore' });
    console.log('[docker] image exists');
  } catch {
    console.log('[docker] building image...');
    execSync(`docker build -t ${IMAGE_NAME} .`, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }
}

async function waitForContainer(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/session`);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Container at ${url} not ready after ${timeoutMs / 1000}s`);
}

// ── IPC: start container ───────────────────────────────────────────────────

ipcMain.handle('opencode:start-container', async (_, repo, taskId) => {
  const factory = await getClientFactory();
  const apiKey = process.env.OPENCODE_API_KEY;
  const configJson = JSON.stringify({
    provider: { opencode: { options: { apiKey } } },
  });

  buildImageIfNeeded();

  const port = nextPort();
  const containerName = `asyncai-${taskId}`;
  const serverUrl = `http://127.0.0.1:${port}`;

  const containerId = execSync(
    [
      'docker', 'run', '-d',
      '--name', containerName,
      '-p', `${port}:4096`,
      '-e', `GITHUB_REPO=${repo}`,
      '-e', `OPENCODE_CONFIG_CONTENT=${configJson}`,
      IMAGE_NAME,
    ].join(' ')
  ).toString().trim();

  console.log(`[docker] container ${containerId.slice(0, 12)} started on port ${port}`);

  await waitForContainer(serverUrl);

  // Set auth explicitly on the container's opencode server
  const containerClient = factory({ baseUrl: serverUrl });
  if (apiKey) {
    await containerClient.auth.set({
      path: { id: 'opencode' },
      body: { type: 'api', key: apiKey },
    });
  }

  // Create the session
  const sessionResult = await containerClient.session.create();
  if (sessionResult.error) throw new Error(JSON.stringify(sessionResult.error));
  const sessionId = sessionResult.data.id;

  sessionServers.set(sessionId, serverUrl);

  return { containerId, port, sessionId };
});

// ── IPC: send message ──────────────────────────────────────────────────────

ipcMain.handle('opencode:send-message', async (_, sessionId, text) => {
  const factory = await getClientFactory();
  const serverUrl = sessionServers.get(sessionId) ?? DEFAULT_URL;
  const client = factory({ baseUrl: serverUrl });

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      model: { providerID: 'opencode', modelID: 'deepseek-v4-flash' },
      parts: [{ type: 'text', text }],
    },
  });

  if (result.error) throw new Error(JSON.stringify(result.error));

  const textParts = (result.data.parts ?? []).filter((p) => p.type === 'text');
  return textParts.map((p) => p.text).join('');
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

  mainWindow.on('maximize', () =>
    mainWindow.webContents.send('window-maximized-changed', true)
  );
  mainWindow.on('unmaximize', () =>
    mainWindow.webContents.send('window-maximized-changed', false)
  );
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  await connectLocalOpencode();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
