const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  openBundleDialog: () => ipcRenderer.invoke('dialog:openBundle'),
  openFileDialog: (title, extensions) => ipcRenderer.invoke('dialog:openFile', title, extensions),
  saveBundleDialog: (defaultPath) => ipcRenderer.invoke('dialog:saveBundle', defaultPath),
  pickDirDialog: (title) => ipcRenderer.invoke('dialog:pickDir', title),

  readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
  writeFile: (p, data) => ipcRenderer.invoke('fs:writeFile', p, data),
  mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
  tempDir: () => ipcRenderer.invoke('fs:tempDir'),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setWindowTheme: (theme) => ipcRenderer.invoke('win:setTheme', theme),

  ffmpegCheck: () => ipcRenderer.invoke('ffmpeg:check'),
  ffmpegRun: (args) => ipcRenderer.invoke('ffmpeg:run', args),
  ffmpegStart: (args) => ipcRenderer.invoke('ffmpeg:start', args),
  ffmpegWrite: (id, chunk) => ipcRenderer.invoke('ffmpeg:write', id, chunk),
  ffmpegClose: (id) => ipcRenderer.invoke('ffmpeg:close', id),
  ffmpegKill: (id) => ipcRenderer.invoke('ffmpeg:kill', id),
});
