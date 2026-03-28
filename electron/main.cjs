const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  setupTitlebar,
  attachTitlebarToWindow
} = require("@incanta/custom-electron-titlebar/main");

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let backend = null;
let win = null;

function windowControlsInsetPx() {
  if (process.platform !== "win32" || !win) return 0;
  try {
    const d = screen.getDisplayMatching(win.getBounds());
    const sf = d.scaleFactor || 1;
    return Math.round(138 * sf);
  } catch {
    return 138;
  }
}


setupTitlebar();
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

function backendEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "backend", "dist", "server.js");
  }
  return path.join(app.getAppPath(), "backend", "dist", "server.js");
}

function startBackend() {
  const serverPath = backendEntryPath();
  backend = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true
  });
}

async function isBackendAlive() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function waitForBackend(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      if (!backend || backend.exitCode !== null) {
        clearInterval(timer);
        reject(new Error("Backend process exited before app was ready."));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for backend."));
        return;
      }
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        // keep waiting
      }
    }, 300);
  });
}

async function createWindow() {
  const userDataDir = path.join(app.getPath("appData"), "citadelDOC");
  app.setPath("userData", userDataDir);

  const alive = await isBackendAlive();
  if (!alive) {
    startBackend();
    await waitForBackend();
  }

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#181818",
      symbolColor: "#d4d4d4",
      height: 34
    },
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  attachTitlebarToWindow(win);

  ipcMain.removeHandler("shell:window-controls-inset");
  ipcMain.handle("shell:window-controls-inset", () => windowControlsInsetPx());

  await win.loadURL(BASE_URL);
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("Renderer process gone:", details.reason);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("Failed to load window:", code, desc);
  });
}

function stopBackend() {
  if (!backend || backend.killed) return;
  backend.kill();
  backend = null;
}

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackend);
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow).catch((e) => {
  console.error(e);
  app.quit();
});

