const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const IS_PACKAGED = app.isPackaged;
const APP_DIR = IS_PACKAGED ? app.getAppPath() : path.join(__dirname, '..');
const CORE_DIR = IS_PACKAGED ? path.join(process.resourcesPath, 'core') : path.join(APP_DIR, 'core');
const CRM_DIR = IS_PACKAGED
  ? path.join(APP_DIR + '.unpacked', 'electron', 'crm-server')
  : path.join(APP_DIR, 'electron', 'crm-server');
const NODE_BIN = IS_PACKAGED
  ? path.join(process.resourcesPath, 'node', 'node.exe')
  : path.join(APP_DIR, 'resources', 'node', 'node.exe');
const CORE_PORT = 2785;
const CRM_PORT = 3100;

let coreProc = null;
let crmProc = null;
let win = null;
let coreReady = false;
let shuttingDown = false;

function log(tag, data) {
  console.log(`[${tag}]`, String(data).trim().slice(0, 500));
}

function getNodeBinary() {
  const candidates = [
    path.join(process.resourcesPath, 'node', 'node.exe'),
    path.join(process.resourcesPath, 'resources', 'node', 'node.exe'),
    path.join(APP_DIR, 'resources', 'node', 'node.exe'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'node', 'node.exe'),
  ];
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return { bin, isElectron: false };
  }
  // Fall back to Electron binary as Node.js runtime via ELECTRON_RUN_AS_NODE
  return { bin: process.execPath, isElectron: true };
}

function startCore() {
  const distMain = path.join(CORE_DIR, 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.error('[wacrm] core dist/main.js not found. Run `npm run build` inside core/ first.');
    return;
  }
  const { bin, isElectron } = getNodeBinary();
  const env = { ...process.env, PORT: String(CORE_PORT) };
  if (isElectron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  try {
    coreProc = spawn(bin, [distMain], {
      cwd: CORE_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    coreProc.on('error', (err) => {
      console.error('[wacrm] coreProc spawn error:', err);
      coreProc = null;
    });
    coreProc.stdout.on('data', (d) => {
      const line = d.toString();
      log('core', line);
      if (!coreReady && /listen|started|Nest application|OpenAPI|ready/i.test(line)) {
        coreReady = true;
      }
    });
    coreProc.stderr.on('data', (d) => log('core:err', d.toString()));
    coreProc.on('exit', (code) => {
      console.log(`[wacrm] core exited with code ${code}`);
      coreProc = null;
      if (!shuttingDown) {
        coreReady = false;
        setTimeout(() => {
          if (!shuttingDown && !coreProc) startCore();
        }, 2000);
      }
    });
  } catch (e) {
    console.error('[wacrm] core spawn exception:', e);
  }
}

function startCrm() {
  const { bin, isElectron } = getNodeBinary();
  const env = {
    ...process.env,
    CRM_PORT: String(CRM_PORT),
    OPENWA_PORT: String(CORE_PORT),
    WACRM_DATA_DIR: path.join(app.getPath('userData'), 'data'),
    WACRM_RESOURCES_PATH: IS_PACKAGED ? process.resourcesPath : '',
  };
  if (isElectron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  try {
    crmProc = spawn(bin, [path.join(CRM_DIR, 'index.js')], {
      cwd: CRM_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    crmProc.on('error', (err) => {
      console.error('[wacrm] crmProc spawn error:', err);
      crmProc = null;
    });
    crmProc.stdout.on('data', (d) => log('crm', d.toString()));
    crmProc.stderr.on('data', (d) => log('crm:err', d.toString()));
    crmProc.on('exit', (code) => {
      console.log(`[wacrm] crm-server exited with code ${code}`);
      crmProc = null;
      if (!shuttingDown) {
        setTimeout(() => {
          if (!shuttingDown && !crmProc) startCrm();
        }, 2000);
      }
    });
  } catch (e) {
    console.error('[wacrm] crm spawn exception:', e);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${CRM_PORT}`);

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.warn(`[wacrm] window load failed (${errorCode}: ${errorDescription}), retrying in 1.5s...`);
    setTimeout(() => {
      if (win) win.loadURL(`http://127.0.0.1:${CRM_PORT}`);
    }, 1500);
  });

  win.on('closed', () => {
    win = null;
  });
}

function waitForCrm(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const probe = () => {
      const http = require('http');
      const reqCrm = http.get(
        { host: '127.0.0.1', port: CRM_PORT, path: '/api/status', timeout: 2000 },
        (resCrm) => {
          resCrm.resume();
          resolve(true);
        },
      );
      reqCrm.on('error', retry);
      reqCrm.on('timeout', () => {
        reqCrm.destroy();
        retry();
      });

      function retry() {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(probe, 500);
      }
    };
    probe();
  });
}

app.whenReady().then(async () => {
  startCore();
  startCrm();
  const ok = await waitForCrm();
  if (!ok) console.warn('[wacrm] crm-server did not become ready in time');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  shuttingDown = true;
  if (coreProc) coreProc.kill();
  if (crmProc) crmProc.kill();
  coreProc = null;
  crmProc = null;
});
