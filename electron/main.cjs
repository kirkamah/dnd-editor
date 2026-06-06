/**
 * Главный процесс DnD Editor: окно + IPC-мост для диалогов, файловой системы
 * и ffmpeg (спавн дочерних процессов со стримингом кадров в stdin).
 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#0b0d11',
    autoHideMenuBar: true,
    title: 'DnD Editor',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ---------- диалоги ----------

ipcMain.handle('dialog:openBundle', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Открыть сессию',
    filters: [{ name: 'D&D Session', extensions: ['dndsession', 'zip'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:openFile', async (_e, title, extensions) => {
  const r = await dialog.showOpenDialog(win, {
    title,
    filters: [{ name: title, extensions }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:saveBundle', async (_e, defaultPath) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Сохранить сессию',
    defaultPath,
    filters: [{ name: 'D&D Session', extensions: ['dndsession'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('dialog:pickDir', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, {
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- файловая система ----------

ipcMain.handle('fs:readFile', async (_e, p) => {
  const buf = await fs.promises.readFile(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle('fs:writeFile', async (_e, p, data) => {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, Buffer.from(data));
});

ipcMain.handle('fs:mkdir', (_e, p) => fs.promises.mkdir(p, { recursive: true }));

ipcMain.handle('fs:tempDir', () => {
  const dir = path.join(app.getPath('temp'), 'dnd-editor');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
});

ipcMain.handle('shell:showInFolder', (_e, p) => {
  require('electron').shell.showItemInFolder(p);
});

// ---------- ffmpeg ----------

ipcMain.handle('ffmpeg:check', () => {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (err, stdout) =>
      resolve(err ? null : stdout.split('\n')[0]),
    );
  });
});

/** Одноразовый запуск (конвертации без стриминга). */
ipcMain.handle('ffmpeg:run', (_e, args) => {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('close', (code) => resolve({ code, stderr: stderr.slice(-2000) }));
    proc.on('error', (e) => resolve({ code: -1, stderr: String(e) }));
  });
});

/** Стриминговые задачи: кадры сырым RGBA в stdin. */
const jobs = new Map();
let jobSeq = 0;

ipcMain.handle('ffmpeg:start', (_e, args) => {
  const id = ++jobSeq;
  const proc = spawn('ffmpeg', args, { windowsHide: true });
  const job = { proc, stderr: '', exit: null };
  proc.stderr.on('data', (d) => {
    job.stderr += d.toString();
    if (job.stderr.length > 8000) job.stderr = job.stderr.slice(-8000);
  });
  job.exitPromise = new Promise((resolve) => {
    proc.on('close', (code) => {
      job.exit = code;
      resolve(code);
    });
    proc.on('error', () => {
      job.exit = -1;
      resolve(-1);
    });
  });
  jobs.set(id, job);
  return id;
});

ipcMain.handle('ffmpeg:write', (_e, id, chunk) => {
  const job = jobs.get(id);
  if (!job || job.exit !== null) throw new Error(`ffmpeg #${id} уже завершился: ${job?.stderr?.slice(-500)}`);
  return new Promise((resolve, reject) => {
    job.proc.stdin.write(Buffer.from(chunk), (err) => (err ? reject(err) : resolve()));
  });
});

ipcMain.handle('ffmpeg:close', async (_e, id) => {
  const job = jobs.get(id);
  if (!job) return { code: -1, stderr: 'нет такой задачи' };
  job.proc.stdin.end();
  const code = await job.exitPromise;
  jobs.delete(id);
  return { code, stderr: job.stderr.slice(-2000) };
});

ipcMain.handle('ffmpeg:kill', (_e, id) => {
  jobs.get(id)?.proc.kill();
  jobs.delete(id);
});
