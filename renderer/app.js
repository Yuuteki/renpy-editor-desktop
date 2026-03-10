const navButtons = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const statusViewName = document.getElementById('status-view-name');
const inspectorContent = document.getElementById('inspector-content');
const toolbarButtons = document.querySelectorAll('.toolbar-btn[data-action]');

const VIEW_TITLES = {
  dashboard: '编辑页',
  characters: '角色',
  variables: '变量',
  scenes: '场景',
  assets: '资源',
  export: '导出'
};

let currentProject = null;
let currentProjectFilePath = null;
let selectedCharacterIndex = null;
let selectedVariableIndex = null;
let selectedSceneIndex = null;
let selectedSceneNodeIndex = null;
let selectedAssetIndex = null;

function deriveProjectDir(projectFilePath) {
  if (!projectFilePath) {
    return '';
  }

  return projectFilePath.replace(/[\\/][^\\/]+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function normalizeProjectData(project, projectFilePath = null) {
  const source = project && typeof project === 'object' ? project : {};
  const projectDir = source.meta?.projectDir || deriveProjectDir(projectFilePath);
  const projectName = source.meta?.projectName || (projectDir ? projectDir.split(/[\\/]/).pop() : '未命名项目');
  const width = Number(source.project?.resolution?.width);
  const height = Number(source.project?.resolution?.height);

  return {
    meta: {
      projectName,
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

function getCurrentViewName() {
  return document.querySelector('.nav-item.active')?.dataset.view || 'dashboard';
}

function renderDefaultInspector(viewName) {
  if (viewName === 'dashboard') {
    inspectorContent.innerHTML = `
      <p>这里现在是主编辑页。</p>
      <p>中间区域集中放项目设置、角色速览、变量速览和模块跳转。需要细节编辑时，再进入角色页或变量页。</p>
    `;
    return;
  }

  const currentTitle = VIEW_TITLES[viewName] || viewName;
  inspectorContent.innerHTML = `
    <p>当前模块：${currentTitle}</p>
    <p>这里会显示 <strong>${currentTitle}</strong> 模块的详细属性、编辑表单或补充信息。</p>
  `;
}

function switchView(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });

  views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  const currentTitle = VIEW_TITLES[viewName] || viewName;
  statusViewName.textContent = `当前页面：${currentTitle}`;
  renderDefaultInspector(viewName);

  if (viewName === 'dashboard') {
    updateDashboard();
  }

  if (viewName === 'characters') {
    renderCharacterList();
    renderCharacterInspector();
  }

  if (viewName === 'variables') {
    renderVariableList();
    renderVariableInspector();
  }

  if (viewName === 'scenes') {
    renderSceneList();
    renderSceneNodeList();
    renderSceneInspector();
  }

  if (viewName === 'assets') {
    renderAssetList();
    renderAssetInspector();
  }
}

function buildDashboardCharacterPreview() {
  if (!currentProject || currentProject.characters.length === 0) {
    return '<p class="muted-text">还没有角色，先从这里新增一个。</p>';
  }

  return currentProject.characters
    .slice(0, 6)
    .map((character, index) => {
      const name = escapeHtml(character.displayName || '未命名角色');
      const id = escapeHtml(character.id || '未设置');
      const color = escapeHtml(character.color || '#ffffff');

      return `
        <button class="mini-list-item" data-dashboard-character-index="${index}">
          <span class="mini-list-text">
            <strong>${name}</strong>
            <small>${id}</small>
          </span>
          <span class="mini-list-badge">${color}</span>
        </button>
      `;
    })
    .join('');
}

function buildDashboardVariablePreview() {
  if (!currentProject || currentProject.variables.length === 0) {
    return '<p class="muted-text">还没有变量，先定义基础状态。</p>';
  }

  return currentProject.variables
    .slice(0, 6)
    .map((variable, index) => {
      const id = escapeHtml(variable.id || '未命名变量');
      const type = escapeHtml(variable.type || 'int');
      const value = escapeHtml(String(variable.defaultValue));

      return `
        <button class="mini-list-item" data-dashboard-variable-index="${index}">
          <span class="mini-list-text">
            <strong>${id}</strong>
            <small>${type}</small>
          </span>
          <span class="mini-list-badge">${value}</span>
        </button>
      `;
    })
    .join('');
}

function bindDashboardEmptyStateActions() {
  document.getElementById('dashboard-create-project')?.addEventListener('click', handleCreateProject);
  document.getElementById('dashboard-open-project')?.addEventListener('click', handleOpenProject);
}

function handleApplyProjectSettings() {
  if (!currentProject) {
    return;
  }

  const projectNameInput = document.getElementById('project-name');
  const projectVersionInput = document.getElementById('project-version');
  const resolutionWidthInput = document.getElementById('project-width');
  const resolutionHeightInput = document.getElementById('project-height');
  const entrySceneInput = document.getElementById('project-entry-scene');

  const nextWidth = Number(resolutionWidthInput?.value);
  const nextHeight = Number(resolutionHeightInput?.value);

  currentProject.meta.projectName = projectNameInput?.value.trim() || '未命名项目';
  currentProject.meta.version = projectVersionInput?.value.trim() || '0.1.0';
  currentProject.project.resolution.width = Number.isFinite(nextWidth) && nextWidth > 0 ? nextWidth : 1920;
  currentProject.project.resolution.height = Number.isFinite(nextHeight) && nextHeight > 0 ? nextHeight : 1080;
  currentProject.project.entrySceneId = entrySceneInput?.value.trim() || null;

  updateDashboard();
  renderDefaultInspector('dashboard');
}

function bindDashboardEditorActions() {
  const projectNameInput = document.getElementById('project-name');
  const projectVersionInput = document.getElementById('project-version');
  const resolutionWidthInput = document.getElementById('project-width');
  const resolutionHeightInput = document.getElementById('project-height');
  const entrySceneInput = document.getElementById('project-entry-scene');

  if (projectNameInput) {
    projectNameInput.value = currentProject?.meta.projectName || '';
  }

  if (projectVersionInput) {
    projectVersionInput.value = currentProject?.meta.version || '0.1.0';
  }

  if (resolutionWidthInput) {
    resolutionWidthInput.value = String(currentProject?.project.resolution.width || 1920);
  }

  if (resolutionHeightInput) {
    resolutionHeightInput.value = String(currentProject?.project.resolution.height || 1080);
  }

  if (entrySceneInput) {
    entrySceneInput.value = currentProject?.project.entrySceneId || '';
  }

  document.getElementById('btn-apply-project-settings')?.addEventListener('click', handleApplyProjectSettings);
  document.getElementById('dashboard-save-project')?.addEventListener('click', handleSaveProject);
  document.getElementById('dashboard-preview-project')?.addEventListener('click', handlePreviewProject);
  document.getElementById('dashboard-add-character')?.addEventListener('click', handleAddCharacterFromDashboard);
  document.getElementById('dashboard-add-variable')?.addEventListener('click', handleAddVariableFromDashboard);
  document.getElementById('dashboard-add-scene')?.addEventListener('click', handleAddSceneFromDashboard);
  document.getElementById('dashboard-add-asset')?.addEventListener('click', handleAddAssetFromDashboard);
  document.querySelectorAll('[data-dashboard-switch-view]').forEach((button) => {
    button.addEventListener('click', () => {
      switchView(button.dataset.dashboardSwitchView);
    });
  });

  document.querySelectorAll('[data-dashboard-character-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedCharacterIndex = Number(item.dataset.dashboardCharacterIndex);
      switchView('characters');
    });
  });

  document.querySelectorAll('[data-dashboard-variable-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedVariableIndex = Number(item.dataset.dashboardVariableIndex);
      switchView('variables');
    });
  });
}

function updateDashboard() {
  const dashboardView = document.getElementById('view-dashboard');
  if (!dashboardView) {
    return;
  }

  if (!currentProject) {
    dashboardView.innerHTML = `
      <div class="section-header section-header-stacked">
        <div>
          <h2>项目编辑页</h2>
          <p class="section-caption">这里是主工作台。先创建或打开一个项目，然后再开始编辑角色、变量和场景。</p>
        </div>
        <div class="inline-actions">
          <button class="toolbar-btn" id="dashboard-create-project">新建项目</button>
          <button class="toolbar-btn" id="dashboard-open-project">打开项目</button>
        </div>
      </div>

      <div class="editor-empty-state">
        <div class="card editor-panel">
          <h3>现在可以做什么</h3>
          <p>创建项目目录，自动生成 <code>project.json</code> 和资源文件夹结构。</p>
          <p>打开已有项目后，这里会切换成主编辑页面，包含项目设置、角色速览、变量速览和快捷入口。</p>
        </div>
        <div class="card editor-panel">
          <h3>接下来的编辑流</h3>
          <p>先设置项目名称与分辨率，再补角色和变量，之后继续接场景和资源。</p>
        </div>
      </div>
    `;

    bindDashboardEmptyStateActions();
    return;
  }

  const projectName = escapeHtml(currentProject.meta.projectName || '未命名项目');
  const projectDir = escapeHtml(currentProject.meta.projectDir || '未记录');
  const projectVersion = escapeHtml(currentProject.meta.version || '0.1.0');
  const entryScene = escapeHtml(currentProject.project.entrySceneId || '未设置');
  const projectPath = escapeHtml(currentProjectFilePath || '未记录');

  dashboardView.innerHTML = `
    <div class="section-header section-header-stacked">
      <div>
        <h2>项目编辑页</h2>
        <p class="section-caption">现在点开的首页就是主编辑区。常用的项目设置和内容入口都集中在这里。</p>
      </div>
      <div class="inline-actions">
        <button class="toolbar-btn" id="dashboard-save-project">保存项目</button>
        <button class="toolbar-btn primary" id="dashboard-preview-project">预览</button>
      </div>
    </div>

    <div class="editor-layout">
      <div class="editor-main-column">
        <section class="card editor-panel">
          <div class="editor-panel-header">
            <div>
              <h3>项目设置</h3>
              <p>这里处理项目名、版本号、分辨率和入口场景。</p>
            </div>
            <div class="stat-chip">${currentProject.characters.length} 角色 / ${currentProject.variables.length} 变量 / ${currentProject.scenes.length} 场景 / ${currentProject.assets.length} 资源</div>
          </div>

          <div class="project-settings-grid">
            <div class="form-group">
              <label for="project-name">项目名称</label>
              <input id="project-name" type="text" />
            </div>
            <div class="form-group">
              <label for="project-version">项目版本</label>
              <input id="project-version" type="text" />
            </div>
            <div class="form-group">
              <label for="project-width">分辨率宽度</label>
              <input id="project-width" type="number" min="1" />
            </div>
            <div class="form-group">
              <label for="project-height">分辨率高度</label>
              <input id="project-height" type="number" min="1" />
            </div>
            <div class="form-group form-group-wide">
              <label for="project-entry-scene">入口场景 ID</label>
              <input id="project-entry-scene" type="text" list="scene-id-options" />
            </div>
          </div>

          <datalist id="scene-id-options">
            ${currentProject.scenes
              .filter((scene) => scene.id)
              .map((scene) => `<option value="${escapeHtml(scene.id)}"></option>`)
              .join('')}
          </datalist>

          <div class="inline-actions">
            <button class="toolbar-btn" id="btn-apply-project-settings">应用项目设置</button>
            <button class="toolbar-btn" id="dashboard-add-scene">新增场景</button>
            <button class="toolbar-btn subtle-btn" data-dashboard-switch-view="scenes">进入场景页</button>
          </div>
        </section>

        <div class="editor-dual-grid">
          <section class="card editor-panel">
            <div class="editor-panel-header">
              <div>
                <h3>角色速览</h3>
                <p>常用角色先在这里看，细节再进角色页。</p>
              </div>
              <div class="inline-actions compact-actions">
                <button class="toolbar-btn" id="dashboard-add-character">新增角色</button>
                <button class="toolbar-btn subtle-btn" data-dashboard-switch-view="characters">进入角色页</button>
              </div>
            </div>

            <div class="mini-list">
              ${buildDashboardCharacterPreview()}
            </div>
          </section>

          <section class="card editor-panel">
            <div class="editor-panel-header">
              <div>
                <h3>变量速览</h3>
                <p>先定义状态变量，后续场景分支会直接依赖这里。</p>
              </div>
              <div class="inline-actions compact-actions">
                <button class="toolbar-btn" id="dashboard-add-variable">新增变量</button>
                <button class="toolbar-btn subtle-btn" data-dashboard-switch-view="variables">进入变量页</button>
              </div>
            </div>

            <div class="mini-list">
              ${buildDashboardVariablePreview()}
            </div>
          </section>
        </div>

        <section class="card editor-panel">
          <div class="editor-panel-header">
            <div>
              <h3>场景与资源</h3>
              <p>场景负责剧情流，资源负责背景、音乐、立绘等引用。</p>
            </div>
            <div class="inline-actions compact-actions">
              <button class="toolbar-btn" id="dashboard-add-asset">新增资源</button>
              <button class="toolbar-btn subtle-btn" data-dashboard-switch-view="assets">进入资源页</button>
            </div>
          </div>

          <div class="stat-list compact-stat-list">
            <div class="stat-row">
              <span>场景</span>
              <strong>${currentProject.scenes.length}</strong>
            </div>
            <div class="stat-row">
              <span>剧情节点</span>
              <strong>${currentProject.scenes.reduce((sum, scene) => sum + scene.nodes.length, 0)}</strong>
            </div>
            <div class="stat-row">
              <span>资源</span>
              <strong>${currentProject.assets.length}</strong>
            </div>
          </div>
        </section>
      </div>

      <div class="editor-side-column">
        <section class="card editor-panel">
          <div class="editor-panel-header">
            <div>
              <h3>项目状态</h3>
              <p>当前编辑会话的关键摘要。</p>
            </div>
          </div>

          <div class="stat-list">
            <div class="stat-row">
              <span>项目名称</span>
              <strong>${projectName}</strong>
            </div>
            <div class="stat-row">
              <span>版本</span>
              <strong>${projectVersion}</strong>
            </div>
            <div class="stat-row">
              <span>分辨率</span>
              <strong>${currentProject.project.resolution.width} x ${currentProject.project.resolution.height}</strong>
            </div>
            <div class="stat-row">
              <span>入口场景</span>
              <strong>${entryScene}</strong>
            </div>
            <div class="stat-row">
              <span>场景数</span>
              <strong>${currentProject.scenes.length}</strong>
            </div>
            <div class="stat-row">
              <span>资源数</span>
              <strong>${currentProject.assets.length}</strong>
            </div>
          </div>

          <div class="path-block">
            <label>项目目录</label>
            <p>${projectDir}</p>
          </div>

          <div class="path-block">
            <label>项目文件</label>
            <p>${projectPath}</p>
          </div>
        </section>

        <section class="card editor-panel">
          <div class="editor-panel-header">
            <div>
              <h3>模块入口</h3>
              <p>从编辑页直接切到对应模块。</p>
            </div>
          </div>

          <div class="editor-quick-grid">
            <button class="quick-link" data-dashboard-switch-view="characters">角色编辑</button>
            <button class="quick-link" data-dashboard-switch-view="variables">变量编辑</button>
            <button class="quick-link" data-dashboard-switch-view="scenes">场景编辑</button>
            <button class="quick-link" data-dashboard-switch-view="assets">资源管理</button>
            <button class="quick-link" data-dashboard-switch-view="export">导出构建</button>
          </div>
        </section>
      </div>
    </div>
  `;

  bindDashboardEditorActions();
}

function setCurrentProject(project, projectFilePath) {
  currentProject = normalizeProjectData(project, projectFilePath);
  currentProjectFilePath = projectFilePath || null;
  selectedCharacterIndex = null;
  selectedVariableIndex = null;
  selectedSceneIndex = null;
  selectedSceneNodeIndex = null;
  selectedAssetIndex = null;

  updateDashboard();
  renderCharacterList();
  renderCharacterInspector();
  renderVariableList();
  renderVariableInspector();
  renderSceneList();
  renderSceneNodeList();
  renderSceneInspector();
  renderAssetList();
  renderAssetInspector();
}

async function handleCreateProject() {
  try {
    const result = await window.editorAPI.createProject();

    if (result.canceled) {
      return;
    }

    if (!result.success) {
      alert(result.message || '创建项目失败。');
      return;
    }

    setCurrentProject(result.project, result.projectFilePath);
    switchView('dashboard');
    alert('项目创建成功。');
  } catch (error) {
    alert(`创建项目时发生错误：${error.message}`);
  }
}

async function handleOpenProject() {
  try {
    const result = await window.editorAPI.openProject();

    if (result.canceled) {
      return;
    }

    if (!result.success) {
      alert(result.message || '打开项目失败。');
      return;
    }

    setCurrentProject(result.project, result.projectFilePath);
    switchView('dashboard');
    alert('项目打开成功。');
  } catch (error) {
    alert(`打开项目时发生错误：${error.message}`);
  }
}

async function handleSaveProject() {
  if (!currentProject) {
    alert('当前没有打开的项目。');
    return;
  }

  try {
    const result = await window.editorAPI.saveProject(currentProject);

    if (!result.success) {
      alert(result.message || '保存失败。');
      return;
    }

    if (result.projectFilePath) {
      currentProjectFilePath = result.projectFilePath;
      updateDashboard();
    }

    alert('项目保存成功。');
  } catch (error) {
    alert(`保存项目时发生错误：${error.message}`);
  }
}

function handlePreviewProject() {
  if (!currentProject) {
    alert('当前没有打开的项目。');
    return;
  }

  window.editorAPI.previewProject(currentProject)
    .then((result) => {
      if (!result?.success) {
        alert(result?.message || '预览启动失败。');
      }
    })
    .catch((error) => {
      alert(`预览启动失败：${error.message}`);
    });
}

function createCharacterEntry() {
  if (!currentProject) {
    return null;
  }

  const index = currentProject.characters.length + 1;
  const character = sanitizeCharacter({
    id: `char_${String(index).padStart(3, '0')}`,
    displayName: `新角色 ${index}`,
    color: '#ffffff'
  });

  currentProject.characters.push(character);
  selectedCharacterIndex = currentProject.characters.length - 1;

  return character;
}

function createVariableEntry() {
  if (!currentProject) {
    return null;
  }

  const index = currentProject.variables.length + 1;
  const variable = sanitizeVariable({
    id: `var_${String(index).padStart(3, '0')}`,
    type: 'int',
    defaultValue: 0
  });

  currentProject.variables.push(variable);
  selectedVariableIndex = currentProject.variables.length - 1;

  return variable;
}

function createSceneEntry() {
  if (!currentProject) {
    return null;
  }

  const index = currentProject.scenes.length + 1;
  const scene = sanitizeScene({
    id: `scene_${String(index).padStart(3, '0')}`,
    title: `场景 ${index}`,
    background: '',
    music: '',
    summary: '',
    nodes: []
  });

  currentProject.scenes.push(scene);
  selectedSceneIndex = currentProject.scenes.length - 1;

  return scene;
}

function createSceneNodeEntry(sceneIndex = selectedSceneIndex) {
  if (!currentProject || sceneIndex === null || !currentProject.scenes[sceneIndex]) {
    return null;
  }

  const scene = currentProject.scenes[sceneIndex];
  const index = scene.nodes.length + 1;
  const node = sanitizeSceneNode({
    id: `node_${String(index).padStart(3, '0')}`,
    type: 'dialogue',
    speakerId: '',
    text: '',
    nextNodeId: '',
    conditionVarId: '',
    conditionValue: '',
    choices: []
  });

  scene.nodes.push(node);
  selectedSceneNodeIndex = scene.nodes.length - 1;
  return node;
}

function createAssetEntry() {
  if (!currentProject) {
    return null;
  }

  const index = currentProject.assets.length + 1;
  const asset = sanitizeAsset({
    id: `asset_${String(index).padStart(3, '0')}`,
    type: 'other',
    label: `资源 ${index}`,
    path: '',
    notes: ''
  });

  currentProject.assets.push(asset);
  selectedAssetIndex = currentProject.assets.length - 1;
  return asset;
}

function getSceneAssetOptions(type) {
  if (!currentProject) {
    return '';
  }

  return currentProject.assets
    .filter((asset) => asset.type === type)
    .map((asset) => `<option value="${escapeHtml(asset.id)}"></option>`)
    .join('');
}

function getCharacterOptions() {
  if (!currentProject) {
    return '';
  }

  return currentProject.characters
    .map((character) => `<option value="${escapeHtml(character.id)}"></option>`)
    .join('');
}

function getVariableOptions() {
  if (!currentProject) {
    return '';
  }

  return currentProject.variables
    .map((variable) => `<option value="${escapeHtml(variable.id)}"></option>`)
    .join('');
}

function getNodeOptions(sceneIndex = selectedSceneIndex) {
  if (!currentProject || sceneIndex === null || !currentProject.scenes[sceneIndex]) {
    return '';
  }

  return currentProject.scenes[sceneIndex].nodes
    .map((node) => `<option value="${escapeHtml(node.id)}"></option>`)
    .join('');
}

function serializeChoices(choices = []) {
  return choices
    .map((choice) => `${choice.label} => ${choice.nextNodeId}`)
    .join('\n');
}

function parseChoices(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, nextNodeId] = line.split(/\s*=>\s*/);
      return sanitizeSceneChoice({
        label: label || '',
        nextNodeId: nextNodeId || ''
      });
    })
    .filter((choice) => choice.label || choice.nextNodeId);
}

function renderCharacterList() {
  const characterList = document.getElementById('character-list');
  if (!characterList) {
    return;
  }

  if (!currentProject) {
    characterList.innerHTML = '<p class="muted-text">请先新建或打开一个项目。</p>';
    return;
  }

  if (currentProject.characters.length === 0) {
    characterList.innerHTML = '<p class="muted-text">当前还没有角色，点击“新增角色”开始创建。</p>';
    return;
  }

  characterList.innerHTML = currentProject.characters
    .map((character, index) => {
      const activeClass = selectedCharacterIndex === index ? 'active' : '';
      const displayName = escapeHtml(character.displayName || '未命名角色');
      const id = escapeHtml(character.id || '未设置');
      const color = escapeHtml(character.color || '#ffffff');

      return `
        <div class="list-item ${activeClass}" data-character-index="${index}">
          <div class="list-item-title">${displayName}</div>
          <div class="list-item-subtitle">ID: ${id} | 颜色: ${color}</div>
        </div>
      `;
    })
    .join('');

  characterList.querySelectorAll('[data-character-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedCharacterIndex = Number(item.dataset.characterIndex);
      renderCharacterList();
      renderCharacterInspector();
    });
  });
}

function renderCharacterInspector() {
  if (
    selectedCharacterIndex === null ||
    !currentProject ||
    !currentProject.characters[selectedCharacterIndex]
  ) {
    if (getCurrentViewName() === 'characters') {
      inspectorContent.innerHTML = `
        <p>当前未选中任何角色。</p>
        <p>在左侧角色列表里点击一个角色后，这里会显示它的属性。</p>
      `;
    }
    return;
  }

  const character = currentProject.characters[selectedCharacterIndex];

  inspectorContent.innerHTML = `
    <h3 style="margin-top:0; margin-bottom:16px;">角色属性</h3>

    <div class="form-group">
      <label for="char-id">角色 ID</label>
      <input id="char-id" type="text" />
    </div>

    <div class="form-group">
      <label for="char-name">显示名</label>
      <input id="char-name" type="text" />
    </div>

    <div class="form-group">
      <label for="char-color">文字颜色</label>
      <input id="char-color" type="text" />
    </div>

    <div class="inspector-actions">
      <button class="toolbar-btn" id="btn-apply-character">应用修改</button>
      <button class="toolbar-btn" id="btn-delete-character">删除角色</button>
    </div>
  `;

  const charIdInput = document.getElementById('char-id');
  const charNameInput = document.getElementById('char-name');
  const charColorInput = document.getElementById('char-color');
  const applyButton = document.getElementById('btn-apply-character');
  const deleteButton = document.getElementById('btn-delete-character');

  charIdInput.value = character.id;
  charNameInput.value = character.displayName;
  charColorInput.value = character.color;

  applyButton.addEventListener('click', () => {
    currentProject.characters[selectedCharacterIndex] = sanitizeCharacter({
      ...character,
      id: charIdInput.value.trim(),
      displayName: charNameInput.value.trim(),
      color: charColorInput.value.trim()
    });

    renderCharacterList();
    renderCharacterInspector();
    updateDashboard();
  });

  deleteButton.addEventListener('click', () => {
    const confirmed = confirm('确定要删除这个角色吗？');
    if (!confirmed) {
      return;
    }

    currentProject.characters.splice(selectedCharacterIndex, 1);
    selectedCharacterIndex = null;

    renderCharacterList();
    renderCharacterInspector();
    updateDashboard();
  });
}

function handleAddCharacter() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createCharacterEntry();
  switchView('characters');
  renderCharacterList();
  renderCharacterInspector();
  updateDashboard();
}

function handleAddCharacterFromDashboard() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createCharacterEntry();
  updateDashboard();
  renderCharacterList();
}

function renderVariableList() {
  const variableList = document.getElementById('variable-list');
  if (!variableList) {
    return;
  }

  if (!currentProject) {
    variableList.innerHTML = '<p class="muted-text">请先新建或打开一个项目。</p>';
    return;
  }

  if (currentProject.variables.length === 0) {
    variableList.innerHTML = '<p class="muted-text">当前还没有变量，点击“新增变量”开始创建。</p>';
    return;
  }

  variableList.innerHTML = currentProject.variables
    .map((variable, index) => {
      const activeClass = selectedVariableIndex === index ? 'active' : '';
      const id = escapeHtml(variable.id || '未命名变量');
      const type = escapeHtml(variable.type || 'int');
      const value = escapeHtml(String(variable.defaultValue));

      return `
        <div class="list-item ${activeClass}" data-variable-index="${index}">
          <div class="list-item-title">${id}</div>
          <div class="list-item-subtitle">类型: ${type} | 默认值: ${value}</div>
        </div>
      `;
    })
    .join('');

  variableList.querySelectorAll('[data-variable-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedVariableIndex = Number(item.dataset.variableIndex);
      renderVariableList();
      renderVariableInspector();
    });
  });
}

function renderVariableInspector() {
  if (
    selectedVariableIndex === null ||
    !currentProject ||
    !currentProject.variables[selectedVariableIndex]
  ) {
    if (getCurrentViewName() === 'variables') {
      inspectorContent.innerHTML = `
        <p>当前未选中任何变量。</p>
        <p>在左侧变量列表里点击一个变量后，这里会显示它的属性。</p>
      `;
    }
    return;
  }

  const variable = currentProject.variables[selectedVariableIndex];

  inspectorContent.innerHTML = `
    <h3 style="margin-top:0; margin-bottom:16px;">变量属性</h3>

    <div class="form-group">
      <label for="var-id">变量 ID</label>
      <input id="var-id" type="text" />
    </div>

    <div class="form-group">
      <label for="var-type">变量类型</label>
      <select id="var-type" class="editor-select">
        <option value="int">int</option>
        <option value="bool">bool</option>
        <option value="string">string</option>
      </select>
    </div>

    <div class="form-group">
      <label for="var-default">默认值</label>
      <input id="var-default" type="text" />
    </div>

    <div class="inspector-actions">
      <button class="toolbar-btn" id="btn-apply-variable">应用修改</button>
      <button class="toolbar-btn" id="btn-delete-variable">删除变量</button>
    </div>
  `;

  const varIdInput = document.getElementById('var-id');
  const varTypeSelect = document.getElementById('var-type');
  const varDefaultInput = document.getElementById('var-default');
  const applyButton = document.getElementById('btn-apply-variable');
  const deleteButton = document.getElementById('btn-delete-variable');

  varIdInput.value = variable.id;
  varTypeSelect.value = variable.type;
  varDefaultInput.value = String(variable.defaultValue);

  applyButton.addEventListener('click', () => {
    let nextDefault = varDefaultInput.value.trim();

    if (varTypeSelect.value === 'int') {
      const parsed = Number(nextDefault);
      nextDefault = Number.isFinite(parsed) ? parsed : 0;
    } else if (varTypeSelect.value === 'bool') {
      nextDefault = nextDefault.toLowerCase() === 'true';
    }

    currentProject.variables[selectedVariableIndex] = sanitizeVariable({
      ...variable,
      id: varIdInput.value.trim(),
      type: varTypeSelect.value,
      defaultValue: nextDefault
    });

    renderVariableList();
    renderVariableInspector();
    updateDashboard();
  });

  deleteButton.addEventListener('click', () => {
    const confirmed = confirm('确定要删除这个变量吗？');
    if (!confirmed) {
      return;
    }

    currentProject.variables.splice(selectedVariableIndex, 1);
    selectedVariableIndex = null;

    renderVariableList();
    renderVariableInspector();
    updateDashboard();
  });
}

function handleAddVariable() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createVariableEntry();
  switchView('variables');
  renderVariableList();
  renderVariableInspector();
  updateDashboard();
}

function handleAddVariableFromDashboard() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createVariableEntry();
  updateDashboard();
  renderVariableList();
}

function renderSceneList() {
  const sceneList = document.getElementById('scene-list');
  if (!sceneList) {
    return;
  }

  if (!currentProject) {
    sceneList.innerHTML = '<p class="muted-text">请先新建或打开一个项目。</p>';
    return;
  }

  if (currentProject.scenes.length === 0) {
    sceneList.innerHTML = '<p class="muted-text">当前还没有场景，点击“新增场景”开始创建。</p>';
    const nodeList = document.getElementById('scene-node-list');
    if (nodeList) {
      nodeList.innerHTML = '<p class="muted-text">先创建并选中一个场景，才能编辑剧情节点。</p>';
    }
    return;
  }

  sceneList.innerHTML = currentProject.scenes
    .map((scene, index) => {
      const activeClass = selectedSceneIndex === index ? 'active' : '';
      const title = escapeHtml(scene.title || '未命名场景');
      const id = escapeHtml(scene.id || '未设置');
      const background = escapeHtml(scene.background || '未设置背景');
      const entryText = currentProject.project.entrySceneId === scene.id ? ' | 入口场景' : '';

      return `
        <div class="list-item ${activeClass}" data-scene-index="${index}">
          <div class="list-item-title">${title}</div>
          <div class="list-item-subtitle">ID: ${id} | 背景: ${background}${entryText}</div>
        </div>
      `;
    })
    .join('');

  sceneList.querySelectorAll('[data-scene-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedSceneIndex = Number(item.dataset.sceneIndex);
      selectedSceneNodeIndex = null;
      renderSceneList();
      renderSceneNodeList();
      renderSceneInspector();
    });
  });
}

function renderSceneNodeList() {
  const nodeList = document.getElementById('scene-node-list');
  if (!nodeList) {
    return;
  }

  if (!currentProject) {
    nodeList.innerHTML = '<p class="muted-text">请先新建或打开一个项目。</p>';
    return;
  }

  if (selectedSceneIndex === null || !currentProject.scenes[selectedSceneIndex]) {
    nodeList.innerHTML = '<p class="muted-text">先选中一个场景，再编辑它的剧情节点。</p>';
    return;
  }

  const scene = currentProject.scenes[selectedSceneIndex];
  if (scene.nodes.length === 0) {
    nodeList.innerHTML = '<p class="muted-text">当前场景还没有节点，点击“新增节点”开始创建。</p>';
    return;
  }

  nodeList.innerHTML = scene.nodes
    .map((node, index) => {
      const activeClass = selectedSceneNodeIndex === index ? 'active' : '';
      const id = escapeHtml(node.id || '未设置');
      const type = escapeHtml(node.type || 'dialogue');
      const text = escapeHtml(node.text || '空内容');
      return `
        <div class="list-item ${activeClass}" data-scene-node-index="${index}">
          <div class="list-item-title">${id}</div>
          <div class="list-item-subtitle">${type} | ${text}</div>
        </div>
      `;
    })
    .join('');

  nodeList.querySelectorAll('[data-scene-node-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedSceneNodeIndex = Number(item.dataset.sceneNodeIndex);
      renderSceneNodeList();
      renderSceneInspector();
    });
  });
}

function renderSceneInspector() {
  if (
    selectedSceneIndex === null ||
    !currentProject ||
    !currentProject.scenes[selectedSceneIndex]
  ) {
    if (getCurrentViewName() === 'scenes') {
      inspectorContent.innerHTML = `
        <p>当前未选中任何场景。</p>
        <p>在左侧场景列表里点击一个场景后，这里会显示它的属性。</p>
      `;
    }
    return;
  }

  const scene = currentProject.scenes[selectedSceneIndex];
  const isEntryScene = currentProject.project.entrySceneId === scene.id;

  inspectorContent.innerHTML = `
    <h3 style="margin-top:0; margin-bottom:16px;">场景属性</h3>

    <div class="form-group">
      <label for="scene-id">场景 ID</label>
      <input id="scene-id" type="text" />
    </div>

    <div class="form-group">
      <label for="scene-title">场景标题</label>
      <input id="scene-title" type="text" />
    </div>

    <div class="form-group">
      <label for="scene-background">背景资源 ID</label>
      <input id="scene-background" type="text" list="scene-background-options" />
    </div>

    <div class="form-group">
      <label for="scene-music">BGM 资源 ID</label>
      <input id="scene-music" type="text" list="scene-music-options" />
    </div>

    <div class="form-group">
      <label for="scene-summary">场景概要</label>
      <textarea id="scene-summary" rows="6"></textarea>
    </div>

    <datalist id="scene-background-options">${getSceneAssetOptions('background')}</datalist>
    <datalist id="scene-music-options">${getSceneAssetOptions('bgm')}</datalist>

    <p class="muted-text">${isEntryScene ? '当前场景已设为入口场景。' : '可以将当前场景设为项目入口场景。'}</p>

    <div class="inspector-actions">
      <button class="toolbar-btn" id="btn-apply-scene">应用修改</button>
      <button class="toolbar-btn" id="btn-add-scene-node">新增节点</button>
      <button class="toolbar-btn" id="btn-set-entry-scene"${isEntryScene ? ' disabled' : ''}>设为入口场景</button>
      <button class="toolbar-btn" id="btn-delete-scene">删除场景</button>
    </div>
    
    ${renderSceneNodeEditorSection()}
  `;

  const sceneIdInput = document.getElementById('scene-id');
  const sceneTitleInput = document.getElementById('scene-title');
  const sceneBackgroundInput = document.getElementById('scene-background');
  const sceneMusicInput = document.getElementById('scene-music');
  const sceneSummaryInput = document.getElementById('scene-summary');
  const applyButton = document.getElementById('btn-apply-scene');
  const addNodeButton = document.getElementById('btn-add-scene-node');
  const setEntryButton = document.getElementById('btn-set-entry-scene');
  const deleteButton = document.getElementById('btn-delete-scene');

  sceneIdInput.value = scene.id;
  sceneTitleInput.value = scene.title;
  sceneBackgroundInput.value = scene.background;
  sceneMusicInput.value = scene.music;
  sceneSummaryInput.value = scene.summary;

  applyButton.addEventListener('click', () => {
    const previousId = scene.id;
    const nextScene = sanitizeScene({
      ...scene,
      id: sceneIdInput.value.trim(),
      title: sceneTitleInput.value.trim(),
      background: sceneBackgroundInput.value.trim(),
      music: sceneMusicInput.value.trim(),
      summary: sceneSummaryInput.value.trim()
    });

    currentProject.scenes[selectedSceneIndex] = nextScene;

    if (currentProject.project.entrySceneId === previousId && previousId !== nextScene.id) {
      currentProject.project.entrySceneId = nextScene.id || null;
    }

    renderSceneList();
    renderSceneNodeList();
    renderSceneInspector();
    updateDashboard();
  });

  addNodeButton?.addEventListener('click', () => {
    createSceneNodeEntry(selectedSceneIndex);
    renderSceneNodeList();
    renderSceneInspector();
    updateDashboard();
  });

  setEntryButton?.addEventListener('click', () => {
    currentProject.project.entrySceneId = currentProject.scenes[selectedSceneIndex].id || null;
    renderSceneList();
    renderSceneNodeList();
    renderSceneInspector();
    updateDashboard();
  });

  deleteButton.addEventListener('click', () => {
    const confirmed = confirm('确定要删除这个场景吗？');
    if (!confirmed) {
      return;
    }

    const deletedScene = currentProject.scenes[selectedSceneIndex];
    if (currentProject.project.entrySceneId === deletedScene.id) {
      currentProject.project.entrySceneId = null;
    }

    currentProject.scenes.splice(selectedSceneIndex, 1);
    selectedSceneIndex = null;
    selectedSceneNodeIndex = null;

    renderSceneList();
    renderSceneNodeList();
    renderSceneInspector();
    updateDashboard();
  });

  bindSceneNodeEditorActions();
}

function renderSceneNodeEditorSection() {
  if (
    selectedSceneIndex === null ||
    !currentProject ||
    !currentProject.scenes[selectedSceneIndex] ||
    selectedSceneNodeIndex === null ||
    !currentProject.scenes[selectedSceneIndex].nodes[selectedSceneNodeIndex]
  ) {
    return `
      <div class="subsection-divider"></div>
      <h3 class="subsection-title">剧情节点</h3>
      <p class="muted-text">选中一个节点后，这里会显示对白、旁白、跳转或选项分支的详细字段。</p>
    `;
  }

  const node = currentProject.scenes[selectedSceneIndex].nodes[selectedSceneNodeIndex];
  const choicesText = escapeHtml(serializeChoices(node.choices));

  return `
    <div class="subsection-divider"></div>
    <h3 class="subsection-title">剧情节点</h3>

    <div class="form-group">
      <label for="scene-node-id">节点 ID</label>
      <input id="scene-node-id" type="text" />
    </div>

    <div class="form-group">
      <label for="scene-node-type">节点类型</label>
      <select id="scene-node-type" class="editor-select">
        <option value="dialogue">dialogue</option>
        <option value="narration">narration</option>
        <option value="jump">jump</option>
        <option value="choice">choice</option>
      </select>
    </div>

    <div class="form-group">
      <label for="scene-node-speaker">说话角色 ID</label>
      <input id="scene-node-speaker" type="text" list="character-id-options" />
    </div>

    <div class="form-group">
      <label for="scene-node-text">文本内容</label>
      <textarea id="scene-node-text" rows="5"></textarea>
    </div>

    <div class="form-group">
      <label for="scene-node-next">下一个节点 ID</label>
      <input id="scene-node-next" type="text" list="scene-node-options" />
    </div>

    <div class="form-group">
      <label for="scene-node-condition-var">条件变量 ID</label>
      <input id="scene-node-condition-var" type="text" list="variable-id-options" />
    </div>

    <div class="form-group">
      <label for="scene-node-condition-value">条件值</label>
      <input id="scene-node-condition-value" type="text" />
    </div>

    <div class="form-group">
      <label for="scene-node-choices">选项分支</label>
      <textarea id="scene-node-choices" rows="5" placeholder="每行一个选项，格式：按钮文本 => node_002">${choicesText}</textarea>
    </div>

    <datalist id="character-id-options">${getCharacterOptions()}</datalist>
    <datalist id="variable-id-options">${getVariableOptions()}</datalist>
    <datalist id="scene-node-options">${getNodeOptions()}</datalist>

    <div class="inspector-actions">
      <button class="toolbar-btn" id="btn-apply-scene-node">应用节点修改</button>
      <button class="toolbar-btn" id="btn-delete-scene-node">删除节点</button>
    </div>
  `;
}

function bindSceneNodeEditorActions() {
  if (
    selectedSceneIndex === null ||
    selectedSceneNodeIndex === null ||
    !currentProject ||
    !currentProject.scenes[selectedSceneIndex] ||
    !currentProject.scenes[selectedSceneIndex].nodes[selectedSceneNodeIndex]
  ) {
    return;
  }

  const scene = currentProject.scenes[selectedSceneIndex];
  const node = scene.nodes[selectedSceneNodeIndex];
  const nodeIdInput = document.getElementById('scene-node-id');
  const nodeTypeSelect = document.getElementById('scene-node-type');
  const nodeSpeakerInput = document.getElementById('scene-node-speaker');
  const nodeTextInput = document.getElementById('scene-node-text');
  const nodeNextInput = document.getElementById('scene-node-next');
  const nodeConditionVarInput = document.getElementById('scene-node-condition-var');
  const nodeConditionValueInput = document.getElementById('scene-node-condition-value');
  const nodeChoicesInput = document.getElementById('scene-node-choices');
  const applyButton = document.getElementById('btn-apply-scene-node');
  const deleteButton = document.getElementById('btn-delete-scene-node');

  nodeIdInput.value = node.id;
  nodeTypeSelect.value = node.type;
  nodeSpeakerInput.value = node.speakerId;
  nodeTextInput.value = node.text;
  nodeNextInput.value = node.nextNodeId;
  nodeConditionVarInput.value = node.conditionVarId;
  nodeConditionValueInput.value = node.conditionValue;
  nodeChoicesInput.value = serializeChoices(node.choices);

  applyButton?.addEventListener('click', () => {
    const previousId = node.id;
    scene.nodes[selectedSceneNodeIndex] = sanitizeSceneNode({
      ...node,
      id: nodeIdInput.value.trim(),
      type: nodeTypeSelect.value,
      speakerId: nodeSpeakerInput.value.trim(),
      text: nodeTextInput.value.trim(),
      nextNodeId: nodeNextInput.value.trim(),
      conditionVarId: nodeConditionVarInput.value.trim(),
      conditionValue: nodeConditionValueInput.value.trim(),
      choices: parseChoices(nodeChoicesInput.value)
    });

    scene.nodes = scene.nodes.map((entry) => {
      const nextEntry = sanitizeSceneNode(entry);

      if (previousId && previousId !== scene.nodes[selectedSceneNodeIndex].id) {
        if (nextEntry.nextNodeId === previousId) {
          nextEntry.nextNodeId = scene.nodes[selectedSceneNodeIndex].id;
        }

        nextEntry.choices = nextEntry.choices.map((choice) =>
          sanitizeSceneChoice({
            ...choice,
            nextNodeId: choice.nextNodeId === previousId ? scene.nodes[selectedSceneNodeIndex].id : choice.nextNodeId
          })
        );
      }

      return nextEntry;
    });

    renderSceneNodeList();
    renderSceneInspector();
    updateDashboard();
  });

  deleteButton?.addEventListener('click', () => {
    const confirmed = confirm('确定要删除这个节点吗？');
    if (!confirmed) {
      return;
    }

    const deletedNode = scene.nodes[selectedSceneNodeIndex];
    scene.nodes.splice(selectedSceneNodeIndex, 1);
    scene.nodes = scene.nodes.map((entry) =>
      sanitizeSceneNode({
        ...entry,
        nextNodeId: entry.nextNodeId === deletedNode.id ? '' : entry.nextNodeId,
        choices: entry.choices.map((choice) =>
          sanitizeSceneChoice({
            ...choice,
            nextNodeId: choice.nextNodeId === deletedNode.id ? '' : choice.nextNodeId
          })
        )
      })
    );
    selectedSceneNodeIndex = null;

    renderSceneNodeList();
    renderSceneInspector();
    updateDashboard();
  });
}

function renderAssetList() {
  const assetList = document.getElementById('asset-list');
  if (!assetList) {
    return;
  }

  if (!currentProject) {
    assetList.innerHTML = '<p class="muted-text">请先新建或打开一个项目。</p>';
    return;
  }

  if (currentProject.assets.length === 0) {
    assetList.innerHTML = '<p class="muted-text">当前还没有资源，点击“新增资源”开始登记。</p>';
    return;
  }

  assetList.innerHTML = currentProject.assets
    .map((asset, index) => {
      const activeClass = selectedAssetIndex === index ? 'active' : '';
      const label = escapeHtml(asset.label || '未命名资源');
      const id = escapeHtml(asset.id || '未设置');
      const type = escapeHtml(asset.type || 'other');
      return `
        <div class="list-item ${activeClass}" data-asset-index="${index}">
          <div class="list-item-title">${label}</div>
          <div class="list-item-subtitle">${type} | ${id}</div>
        </div>
      `;
    })
    .join('');

  assetList.querySelectorAll('[data-asset-index]').forEach((item) => {
    item.addEventListener('click', () => {
      selectedAssetIndex = Number(item.dataset.assetIndex);
      renderAssetList();
      renderAssetInspector();
    });
  });
}

function renderAssetInspector() {
  if (
    selectedAssetIndex === null ||
    !currentProject ||
    !currentProject.assets[selectedAssetIndex]
  ) {
    if (getCurrentViewName() === 'assets') {
      inspectorContent.innerHTML = `
        <p>当前未选中任何资源。</p>
        <p>在左侧资源列表里点击一个资源后，这里会显示它的属性。</p>
      `;
    }
    return;
  }

  const asset = currentProject.assets[selectedAssetIndex];

  inspectorContent.innerHTML = `
    <h3 style="margin-top:0; margin-bottom:16px;">资源属性</h3>

    <div class="form-group">
      <label for="asset-id">资源 ID</label>
      <input id="asset-id" type="text" />
    </div>

    <div class="form-group">
      <label for="asset-type">资源类型</label>
      <select id="asset-type" class="editor-select">
        <option value="background">background</option>
        <option value="sprite">sprite</option>
        <option value="cg">cg</option>
        <option value="bgm">bgm</option>
        <option value="sfx">sfx</option>
        <option value="ui">ui</option>
        <option value="other">other</option>
      </select>
    </div>

    <div class="form-group">
      <label for="asset-label">显示名称</label>
      <input id="asset-label" type="text" />
    </div>

    <div class="form-group">
      <label for="asset-path">文件路径</label>
      <input id="asset-path" type="text" />
    </div>

    <div class="form-group">
      <label for="asset-notes">备注</label>
      <textarea id="asset-notes" rows="6"></textarea>
    </div>

    <div class="inspector-actions">
      <button class="toolbar-btn" id="btn-apply-asset">应用修改</button>
      <button class="toolbar-btn" id="btn-delete-asset">删除资源</button>
    </div>
  `;

  const assetIdInput = document.getElementById('asset-id');
  const assetTypeSelect = document.getElementById('asset-type');
  const assetLabelInput = document.getElementById('asset-label');
  const assetPathInput = document.getElementById('asset-path');
  const assetNotesInput = document.getElementById('asset-notes');
  const applyButton = document.getElementById('btn-apply-asset');
  const deleteButton = document.getElementById('btn-delete-asset');

  assetIdInput.value = asset.id;
  assetTypeSelect.value = asset.type;
  assetLabelInput.value = asset.label;
  assetPathInput.value = asset.path;
  assetNotesInput.value = asset.notes;

  applyButton?.addEventListener('click', () => {
    currentProject.assets[selectedAssetIndex] = sanitizeAsset({
      ...asset,
      id: assetIdInput.value.trim(),
      type: assetTypeSelect.value,
      label: assetLabelInput.value.trim(),
      path: assetPathInput.value.trim(),
      notes: assetNotesInput.value.trim()
    });

    renderAssetList();
    renderAssetInspector();
    renderSceneInspector();
    updateDashboard();
  });

  deleteButton?.addEventListener('click', () => {
    const confirmed = confirm('确定要删除这个资源吗？');
    if (!confirmed) {
      return;
    }

    const deletedAsset = currentProject.assets[selectedAssetIndex];
    currentProject.scenes = currentProject.scenes.map((scene) =>
      sanitizeScene({
        ...scene,
        background: scene.background === deletedAsset.id ? '' : scene.background,
        music: scene.music === deletedAsset.id ? '' : scene.music
      })
    );

    currentProject.assets.splice(selectedAssetIndex, 1);
    selectedAssetIndex = null;

    renderAssetList();
    renderAssetInspector();
    renderSceneList();
    renderSceneInspector();
    updateDashboard();
  });
}

function handleAddScene() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createSceneEntry();
  switchView('scenes');
  renderSceneList();
  renderSceneInspector();
  updateDashboard();
}

function handleAddSceneFromDashboard() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createSceneEntry();
  updateDashboard();
  renderSceneList();
}

function handleAddAsset() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createAssetEntry();
  switchView('assets');
  renderAssetList();
  renderAssetInspector();
  updateDashboard();
}

function handleAddAssetFromDashboard() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  createAssetEntry();
  updateDashboard();
  renderAssetList();
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    switchView(button.dataset.view);
  });
});

toolbarButtons.forEach((button) => {
  const action = button.dataset.action;

  if (action === 'create-project') {
    button.addEventListener('click', handleCreateProject);
  }

  if (action === 'open-project') {
    button.addEventListener('click', handleOpenProject);
  }

  if (action === 'save-project') {
    button.addEventListener('click', handleSaveProject);
  }

  if (action === 'preview-project') {
    button.addEventListener('click', handlePreviewProject);
  }
});

document.getElementById('btn-add-character')?.addEventListener('click', handleAddCharacter);
document.getElementById('btn-add-variable')?.addEventListener('click', handleAddVariable);
document.getElementById('btn-add-scene')?.addEventListener('click', handleAddScene);
document.getElementById('btn-add-scene-node-inline')?.addEventListener('click', () => {
  if (!currentProject || selectedSceneIndex === null) {
    alert('请先选中一个场景。');
    return;
  }

  createSceneNodeEntry(selectedSceneIndex);
  renderSceneNodeList();
  renderSceneInspector();
  updateDashboard();
});
document.getElementById('btn-add-asset')?.addEventListener('click', handleAddAsset);

switchView('dashboard');
updateDashboard();
renderCharacterList();
renderCharacterInspector();
renderVariableList();
renderVariableInspector();
renderSceneList();
renderSceneNodeList();
renderSceneInspector();
renderAssetList();
renderAssetInspector();
