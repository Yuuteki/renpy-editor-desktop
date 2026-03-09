const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Ren'Py Visual Editor",
    backgroundColor: "#1e1e1e",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();

    // 延迟一小下，等窗口真正成为前台窗口后再抢焦点
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.focus();
        win.webContents.focus();
      }
    }, 80);
  });

  // 每次窗口重新获得焦点，都把焦点给回渲染页面
  win.on('focus', () => {
    if (!win.isDestroyed()) {
      win.webContents.focus();
    }
  });
}

function createDefaultProject(projectName, baseDir) {
  return {
    meta: {
      projectName,
      projectDir: baseDir,
      version: "0.1.0"
    },
    project: {
      resolution: {
        width: 1920,
        height: 1080
      },
      entrySceneId: null
    },
    characters: [],
    variables: [],
    scenes: [],
    assets: []
  };
}

function ensureProjectFolders(projectDir) {
  const folders = [
    projectDir,
    path.join(projectDir, 'assets'),
    path.join(projectDir, 'assets', 'backgrounds'),
    path.join(projectDir, 'assets', 'sprites'),
    path.join(projectDir, 'assets', 'bgm'),
    path.join(projectDir, 'assets', 'sfx')
  ];

  for (const folder of folders) {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  }
}

ipcMain.handle('project:create', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择新项目存放位置',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '用户取消了创建项目。' };
  }

  const selectedDir = result.filePaths[0];
  const projectName = path.basename(selectedDir);

  ensureProjectFolders(selectedDir);

  const projectData = createDefaultProject(projectName, selectedDir);
  const projectFilePath = path.join(selectedDir, 'project.json');

  fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2), 'utf-8');

  return {
    success: true,
    project: projectData,
    projectFilePath
  };
});

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog({
    title: '打开项目文件',
    filters: [
      { name: 'Project JSON', extensions: ['json'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '用户取消了打开项目。' };
  }

  const projectFilePath = result.filePaths[0];

  try {
    const raw = fs.readFileSync(projectFilePath, 'utf-8');
    const projectData = JSON.parse(raw);

    if (!projectData.meta) {
      projectData.meta = {};
    }

    projectData.meta.projectDir = path.dirname(projectFilePath);

    return {
      success: true,
      project: projectData,
      projectFilePath
    };
  } catch (error) {
    return {
      success: false,
      message: `打开项目失败：${error.message}`
    };
  }
});

ipcMain.handle('project:save', async (_event, projectData) => {
  try {
    if (!projectData?.meta?.projectDir) {
      return { success: false, message: '项目目录不存在，无法保存。' };
    }

    const projectFilePath = path.join(projectData.meta.projectDir, 'project.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2), 'utf-8');

    return {
      success: true,
      projectFilePath
    };
  } catch (error) {
    return {
      success: false,
      message: `保存项目失败：${error.message}`
    };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});