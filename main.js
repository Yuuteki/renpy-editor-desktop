const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function sanitizeCharacter(character = {}) {
  return {
    id: typeof character.id === 'string' ? character.id : '',
    displayName: typeof character.displayName === 'string' ? character.displayName : '',
    color: typeof character.color === 'string' && character.color.trim() ? character.color.trim() : '#ffffff'
  };
}

function coerceBooleanValue(value) {
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return Boolean(value);
}

function sanitizeVariable(variable = {}) {
  const type = ['int', 'bool', 'string'].includes(variable.type) ? variable.type : 'int';
  let defaultValue = variable.defaultValue;

  if (type === 'int') {
    const parsed = Number(defaultValue);
    defaultValue = Number.isFinite(parsed) ? parsed : 0;
  } else if (type === 'bool') {
    defaultValue = coerceBooleanValue(defaultValue);
  } else if (typeof defaultValue !== 'string') {
    defaultValue = defaultValue == null ? '' : String(defaultValue);
  }

  return {
    id: typeof variable.id === 'string' ? variable.id : '',
    type,
    defaultValue
  };
}

function sanitizeScene(scene = {}) {
  return {
    id: typeof scene.id === 'string' ? scene.id : '',
    title: typeof scene.title === 'string' ? scene.title : '',
    background: typeof scene.background === 'string' ? scene.background : '',
    music: typeof scene.music === 'string' ? scene.music : '',
    summary: typeof scene.summary === 'string' ? scene.summary : '',
    nodes: Array.isArray(scene.nodes) ? scene.nodes.map(sanitizeSceneNode) : []
  };
}

function sanitizeSceneChoice(choice = {}) {
  return {
    label: typeof choice.label === 'string' ? choice.label : '',
    nextNodeId: typeof choice.nextNodeId === 'string' ? choice.nextNodeId : ''
  };
}

function sanitizeSceneNode(node = {}) {
  return {
    id: typeof node.id === 'string' ? node.id : '',
    type: ['dialogue', 'narration', 'jump', 'choice'].includes(node.type) ? node.type : 'dialogue',
    speakerId: typeof node.speakerId === 'string' ? node.speakerId : '',
    text: typeof node.text === 'string' ? node.text : '',
    nextNodeId: typeof node.nextNodeId === 'string' ? node.nextNodeId : '',
    conditionVarId: typeof node.conditionVarId === 'string' ? node.conditionVarId : '',
    conditionValue: typeof node.conditionValue === 'string' ? node.conditionValue : '',
    choices: Array.isArray(node.choices) ? node.choices.map(sanitizeSceneChoice) : []
  };
}

function sanitizeAsset(asset = {}) {
  return {
    id: typeof asset.id === 'string' ? asset.id : '',
    type: ['background', 'sprite', 'cg', 'bgm', 'sfx', 'ui', 'other'].includes(asset.type) ? asset.type : 'other',
    label: typeof asset.label === 'string' ? asset.label : '',
    path: typeof asset.path === 'string' ? asset.path : '',
    notes: typeof asset.notes === 'string' ? asset.notes : ''
  };
}

function sanitizeProjectData(projectData = {}, projectFilePath = null) {
  const source = projectData && typeof projectData === 'object' ? projectData : {};
  const projectDir = source.meta?.projectDir || (projectFilePath ? path.dirname(projectFilePath) : '');
  const fallbackName = projectDir ? path.basename(projectDir) : '未命名项目';

  const width = Number(source.project?.resolution?.width);
  const height = Number(source.project?.resolution?.height);

  return {
    meta: {
      projectName: source.meta?.projectName || fallbackName,
      projectDir,
      version: source.meta?.version || '0.1.0'
    },
    project: {
      resolution: {
        width: Number.isFinite(width) && width > 0 ? width : 1920,
        height: Number.isFinite(height) && height > 0 ? height : 1080
      },
      entrySceneId: source.project?.entrySceneId ?? null
    },
    characters: Array.isArray(source.characters) ? source.characters.map(sanitizeCharacter) : [],
    variables: Array.isArray(source.variables) ? source.variables.map(sanitizeVariable) : [],
    scenes: Array.isArray(source.scenes) ? source.scenes.map(sanitizeScene) : [],
    assets: Array.isArray(source.assets) ? source.assets.map(sanitizeAsset) : []
  };
}

function stripUtf8Bom(text) {
  if (typeof text !== 'string') {
    return text;
  }

  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function toRenpyQuotedString(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')}"`;
}

function toRenpyIdentifier(value, fallback) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_');

  if (!normalized) {
    return fallback;
  }

  if (/^[0-9]/.test(normalized)) {
    return `id_${normalized}`;
  }

  return normalized;
}

function toRenpyValue(value, type) {
  if (type === 'bool') {
    return value ? 'True' : 'False';
  }

  if (type === 'int') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : '0';
  }

  return toRenpyQuotedString(value ?? '');
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function clearDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function slugifyName(value, fallback = 'project') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function resolveAssetSourcePath(asset, projectDir) {
  if (!asset?.path) {
    return null;
  }

  if (path.isAbsolute(asset.path)) {
    return asset.path;
  }

  if (!projectDir) {
    return null;
  }

  return path.join(projectDir, asset.path);
}

function buildPreviewAssets(projectData, previewGameDir) {
  const copiedAssets = new Map();
  const generatedAssetsRoot = path.join(previewGameDir, 'editor_preview_assets');

  ensureDirectory(generatedAssetsRoot);
  clearDirectory(generatedAssetsRoot);

  for (const asset of projectData.assets) {
    const sourcePath = resolveAssetSourcePath(asset, projectData.meta.projectDir);
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }

    const extension = path.extname(sourcePath);
    const safeFileName = `${toRenpyIdentifier(asset.id || asset.label || 'asset', 'asset')}${extension}`;
    const subdirName = asset.type === 'bgm' ? 'audio' : asset.type === 'sfx' ? 'audio' : 'images';
    const targetDir = path.join(generatedAssetsRoot, subdirName);
    const targetPath = path.join(targetDir, safeFileName);

    ensureDirectory(targetDir);
    fs.copyFileSync(sourcePath, targetPath);

    copiedAssets.set(asset.id, `editor_preview_assets/${subdirName}/${safeFileName}`.replace(/\\/g, '/'));
  }

  return copiedAssets;
}

function generateCharactersScript(projectData) {
  const lines = ['# Auto-generated by RenPy Editor Desktop', ''];

  for (const character of projectData.characters) {
    if (!character.id) {
      continue;
    }

    const identifier = toRenpyIdentifier(character.id, 'character_id');
    const displayName = character.displayName || character.id;
    lines.push(`define ${identifier} = Character(${toRenpyQuotedString(displayName)}, who_color=${toRenpyQuotedString(character.color || '#ffffff')})`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function generateVariablesScript(projectData) {
  const lines = ['default persistent._editor_boot = True'];

  for (const variable of projectData.variables) {
    if (!variable.id) {
      continue;
    }

    lines.push(`default ${toRenpyIdentifier(variable.id, 'var_id')} = ${toRenpyValue(variable.defaultValue, variable.type)}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildSceneLabelMap(projectData) {
  const labelMap = new Map();

  projectData.scenes.forEach((scene, index) => {
    const fallback = `scene_${String(index + 1).padStart(3, '0')}`;
    labelMap.set(scene.id, toRenpyIdentifier(scene.id || fallback, fallback));
  });

  return labelMap;
}

function buildNodeLabelMap(scene) {
  const labelMap = new Map();

  scene.nodes.forEach((node, index) => {
    const fallback = `node_${String(index + 1).padStart(3, '0')}`;
    labelMap.set(node.id, toRenpyIdentifier(node.id || fallback, fallback));
  });

  return labelMap;
}

function generateSceneScript(projectData, copiedAssets) {
  const lines = ['# Auto-generated preview script', ''];
  const sceneLabelMap = buildSceneLabelMap(projectData);
  const entrySceneId = projectData.project.entrySceneId || projectData.scenes[0]?.id || null;
  const entryLabel = sceneLabelMap.get(entrySceneId) || 'editor_empty_preview';

  lines.push('label start:');
  lines.push(`    jump ${entryLabel}`);
  lines.push('');

  if (projectData.scenes.length === 0) {
    lines.push('label editor_empty_preview:');
    lines.push(`    "还没有可预览的场景。先创建场景和节点。"`); 
    lines.push('    return');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  for (const scene of projectData.scenes) {
    const sceneLabel = sceneLabelMap.get(scene.id) || 'editor_scene';
    const nodeLabelMap = buildNodeLabelMap(scene);

    lines.push(`label ${sceneLabel}:`);

    if (scene.background && copiedAssets.get(scene.background)) {
      lines.push(`    scene expression ${toRenpyQuotedString(copiedAssets.get(scene.background))}`);
    } else {
      lines.push('    scene black');
    }

    if (scene.music && copiedAssets.get(scene.music)) {
      lines.push(`    play music ${toRenpyQuotedString(copiedAssets.get(scene.music))}`);
    }

    if (scene.summary) {
      lines.push(`    # ${scene.summary.replace(/\r?\n/g, ' ')}`);
    }

    if (scene.nodes.length === 0) {
      lines.push(`    "场景 ${scene.title || scene.id || sceneLabel} 还没有剧情节点。"`); 
      lines.push('    return');
      lines.push('');
      continue;
    }

    const firstNodeLabel = nodeLabelMap.get(scene.nodes[0].id) || 'editor_node';
    lines.push(`    jump ${firstNodeLabel}`);
    lines.push('');

    for (const node of scene.nodes) {
      const nodeLabel = nodeLabelMap.get(node.id) || 'editor_node';
      const nextLabel = node.nextNodeId ? nodeLabelMap.get(node.nextNodeId) : null;
      const conditionPrefix = node.conditionVarId
        ? `if ${toRenpyIdentifier(node.conditionVarId, 'condition_var')} == ${toRenpyValue(node.conditionValue, 'string')}: `
        : '';

      lines.push(`label ${nodeLabel}:`);

      if (node.type === 'dialogue') {
        const speaker = node.speakerId ? toRenpyIdentifier(node.speakerId, 'narrator') : null;
        const statement = speaker ? `${speaker} ${toRenpyQuotedString(node.text || '...')}` : `${toRenpyQuotedString(node.text || '...')}`;
        lines.push(`    ${conditionPrefix}${statement}`);
      } else if (node.type === 'narration') {
        lines.push(`    ${conditionPrefix}${toRenpyQuotedString(node.text || '...')}`);
      } else if (node.type === 'jump') {
        if (nextLabel) {
          lines.push(`    ${conditionPrefix}jump ${nextLabel}`);
          lines.push('');
          continue;
        }
        lines.push(`    ${toRenpyQuotedString(node.text || '这个跳转节点没有目标。')}`);
      } else if (node.type === 'choice') {
        if (node.text) {
          lines.push(`    ${toRenpyQuotedString(node.text)}`);
        }
        lines.push('    menu:');

        if (node.choices.length === 0) {
          lines.push(`        ${toRenpyQuotedString('继续')}:`);
          if (nextLabel) {
            lines.push(`            jump ${nextLabel}`);
          } else {
            lines.push('            return');
          }
        } else {
          for (const choice of node.choices) {
            const choiceTarget = choice.nextNodeId ? nodeLabelMap.get(choice.nextNodeId) : nextLabel;
            lines.push(`        ${toRenpyQuotedString(choice.label || '继续')}:`);
            if (choiceTarget) {
              lines.push(`            jump ${choiceTarget}`);
            } else {
              lines.push('            return');
            }
          }
        }

        lines.push('');
        continue;
      }

      if (nextLabel) {
        lines.push(`    jump ${nextLabel}`);
      } else {
        lines.push('    return');
      }

      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function writePreviewProject(projectData) {
  const safeProject = sanitizeProjectData(projectData);
  if (!safeProject.meta.projectDir) {
    throw new Error('当前项目缺少 projectDir，无法写入预览脚本。');
  }

  const projectRoot = safeProject.meta.projectDir;
  const previewGameDir = path.join(projectRoot, 'game');

  ensureDirectory(previewGameDir);

  const copiedAssets = buildPreviewAssets(safeProject, previewGameDir);

  const optionsLines = [
    '# Auto-generated by RenPy Editor Desktop',
    `define config.name = ${toRenpyQuotedString(safeProject.meta.projectName || 'RenPy Preview')}`,
    `define config.version = ${toRenpyQuotedString(safeProject.meta.version || '0.1.0')}`,
    `define config.window_title = ${toRenpyQuotedString(safeProject.meta.projectName || 'RenPy Preview')}`,
    `define config.screen_width = ${safeProject.project.resolution.width}`,
    `define config.screen_height = ${safeProject.project.resolution.height}`,
    ''
  ];

  fs.writeFileSync(path.join(previewGameDir, 'editor_options.rpy'), `${optionsLines.join('\n')}\n`, 'utf-8');
  fs.writeFileSync(path.join(previewGameDir, 'characters.rpy'), generateCharactersScript(safeProject), 'utf-8');
  fs.writeFileSync(path.join(previewGameDir, 'variables.rpy'), generateVariablesScript(safeProject), 'utf-8');
  fs.writeFileSync(path.join(previewGameDir, 'script.rpy'), generateSceneScript(safeProject, copiedAssets), 'utf-8');

  return projectRoot;
}

function getRenpyExecutablePath() {
  return path.join(__dirname, 'runtime', 'renpy', 'renpy.exe');
}

function launchPreviewProject(projectDir) {
  const executablePath = getRenpyExecutablePath();

  if (!fs.existsSync(executablePath)) {
    throw new Error(`未找到内置 Ren'Py：${executablePath}`);
  }

  const child = spawn(executablePath, [projectDir, 'run'], {
    cwd: path.dirname(executablePath),
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });

  child.unref();
}

function isProjectData(projectData) {
  if (!projectData || typeof projectData !== 'object') {
    return false;
  }

  return [
    'meta',
    'project',
    'characters',
    'variables',
    'scenes',
    'assets'
  ].some((key) => key in projectData);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Ren'Py Visual Editor",
    backgroundColor: '#1e1e1e',
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

    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.focus();
        win.webContents.focus();
      }
    }, 80);
  });

  win.on('focus', () => {
    if (!win.isDestroyed()) {
      win.webContents.focus();
    }
  });
}

function createDefaultProject(projectName, baseDir) {
  return sanitizeProjectData(
    {
      meta: {
        projectName,
        projectDir: baseDir,
        version: '0.1.0'
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
    },
    path.join(baseDir, 'project.json')
  );
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

  folders.forEach((folder) => {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  });
}

ipcMain.handle('project:create', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择新项目保存位置',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
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
    filters: [{ name: 'Project JSON', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const projectFilePath = result.filePaths[0];

  try {
    const raw = fs.readFileSync(projectFilePath, 'utf-8');
    const projectData = JSON.parse(stripUtf8Bom(raw));

    if (!isProjectData(projectData)) {
      return {
        success: false,
        message: '选中的文件不是有效的项目文件。'
      };
    }

    return {
      success: true,
      project: sanitizeProjectData(projectData, projectFilePath),
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
    const normalizedProject = sanitizeProjectData(projectData);

    if (!normalizedProject.meta.projectDir) {
      return {
        success: false,
        message: '项目目录不存在，无法保存。'
      };
    }

    ensureProjectFolders(normalizedProject.meta.projectDir);

    const projectFilePath = path.join(normalizedProject.meta.projectDir, 'project.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(normalizedProject, null, 2), 'utf-8');

    return {
      success: true,
      project: normalizedProject,
      projectFilePath
    };
  } catch (error) {
    return {
      success: false,
      message: `保存项目失败：${error.message}`
    };
  }
});

ipcMain.handle('project:preview', async (_event, projectData) => {
  try {
    const normalizedProject = sanitizeProjectData(projectData);
    const previewProjectDir = writePreviewProject(normalizedProject);
    launchPreviewProject(previewProjectDir);

    return {
      success: true,
      previewProjectDir
    };
  } catch (error) {
    return {
      success: false,
      message: `预览启动失败：${error.message}`
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
