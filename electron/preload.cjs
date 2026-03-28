const { contextBridge, ipcRenderer } = require("electron");

const WINDOW_CONTROLS_RIGHT_PX = process.platform === "win32" ? 138 : 0;

contextBridge.exposeInMainWorld("electronApp", {
  platform: process.platform,
  windowControlsRightInset: WINDOW_CONTROLS_RIGHT_PX,
  getWindowControlsInset: () => ipcRenderer.invoke("shell:window-controls-inset")
});
