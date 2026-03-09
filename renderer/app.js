const navButtons = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const statusViewName = document.getElementById('status-view-name');
const inspectorContent = document.getElementById('inspector-content');
const toolbarButtons = document.querySelectorAll('.toolbar-btn');

let currentProject = null;
let currentProjectFilePath = null;
let selectedCharacterIndex = null;

function switchView(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });

  views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  const titleMap = {
    dashboard: '仪表盘',
    characters: '角色',
    variables: '变量',
    scenes: '场景',
    assets: '资源',
    export: '导出'
  };

  const currentTitle = titleMap[viewName] || viewName;
  statusViewName.textContent = `当前页面：${currentTitle}`;

  inspectorContent.innerHTML = `
    <p>当前选中的模块：${currentTitle}</p>
    <p>后面这里会显示 <strong>${currentTitle}</strong> 模块的详细属性、编辑表单或附加信息。</p>
  `;

  if (viewName === 'characters') {
    renderCharacterList();
    renderCharacterInspector();
  }
}

function updateDashboard() {
  const dashboardView = document.getElementById('view-dashboard');

  if (!dashboardView) return;

  if (!currentProject) {
    dashboardView.innerHTML = `
      <h2>仪表盘</h2>
      <div class="card-grid">
        <div class="card">
          <h3>当前项目</h3>
          <p>尚未加载项目。</p>
        </div>
        <div class="card">
          <h3>Ren'Py 集成状态</h3>
          <p>第三步仍未接入运行链路。</p>
        </div>
        <div class="card">
          <h3>开发阶段</h3>
          <p>已完成项目文件系统桥接。</p>
        </div>
      </div>
    `;
    return;
  }

  dashboardView.innerHTML = `
    <h2>仪表盘</h2>
    <div class="card-grid">
      <div class="card">
        <h3>当前项目</h3>
        <p><strong>名称：</strong>${currentProject.meta.projectName || '未命名项目'}</p>
        <p><strong>目录：</strong>${currentProject.meta.projectDir || '未知'}</p>
        <p><strong>版本：</strong>${currentProject.meta.version || '0.1.0'}</p>
      </div>
      <div class="card">
        <h3>项目统计</h3>
        <p><strong>角色数：</strong>${currentProject.characters.length}</p>
        <p><strong>变量数：</strong>${currentProject.variables.length}</p>
        <p><strong>场景数：</strong>${currentProject.scenes.length}</p>
        <p><strong>资源数：</strong>${currentProject.assets.length}</p>
      </div>
      <div class="card">
        <h3>项目文件</h3>
        <p>${currentProjectFilePath || '未记录'}</p>
      </div>
    </div>
  `;
}

function setCurrentProject(project, projectFilePath) {
  currentProject = project;
  currentProjectFilePath = projectFilePath;
  selectedCharacterIndex = null;
  updateDashboard();
  renderCharacterList();
  renderCharacterInspector();
}

async function handleCreateProject() {
  const result = await window.editorAPI.createProject();

  if (!result.success) {
    alert(result.message || '创建项目失败。');
    return;
  }

  setCurrentProject(result.project, result.projectFilePath);
  alert('项目创建成功。');
}

async function handleOpenProject() {
  const result = await window.editorAPI.openProject();

  if (!result.success) {
    alert(result.message || '打开项目失败。');
    return;
  }

  setCurrentProject(result.project, result.projectFilePath);
  alert('项目打开成功。');
}

async function handleSaveProject() {
  if (!currentProject) {
    alert('当前没有打开的项目。');
    return;
  }

  const result = await window.editorAPI.saveProject(currentProject);

  if (!result.success) {
    alert(result.message || '保存失败。');
    return;
  }

  alert('项目保存成功。');
}

function focusCharacterIdInput() {
  const tryFocus = () => {
    const input = document.getElementById('char-id');
    if (!input) return;

    // 先清掉当前活动元素
    if (document.activeElement && document.activeElement !== input) {
      document.activeElement.blur?.();
    }

    // 强制让输入框成为当前交互目标
    input.removeAttribute('disabled');
    input.focus();
    input.click();

    // 再补一次，确保 Windows/Electron 抢到焦点
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  };

  // 第一帧后执行
  requestAnimationFrame(() => {
    // 第二帧再执行，等 DOM 和点击事件都结束
    requestAnimationFrame(() => {
      tryFocus();
    });
  });
}

function renderCharacterList() {
  const characterList = document.getElementById('character-list');
  if (!characterList) return;

  if (!currentProject) {
    characterList.innerHTML = `<p class="muted-text">请先新建或打开一个项目。</p>`;
    return;
  }

  if (!currentProject.characters || currentProject.characters.length === 0) {
    characterList.innerHTML = `<p class="muted-text">当前还没有角色，点击“新增角色”开始创建。</p>`;
    return;
  }

  characterList.innerHTML = currentProject.characters
    .map((character, index) => {
      const activeClass = selectedCharacterIndex === index ? 'active' : '';
      return `
        <div class="list-item ${activeClass}" data-character-index="${index}">
          <div class="list-item-title">${character.displayName || '未命名角色'}</div>
          <div class="list-item-subtitle">
            ID: ${character.id || '未设置'} ｜ 颜色: ${character.color || '#ffffff'}
          </div>
        </div>
      `;
    })
    .join('');

  const items = characterList.querySelectorAll('[data-character-index]');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      selectedCharacterIndex = Number(item.dataset.characterIndex);
      renderCharacterList();
      renderCharacterInspector();
      focusCharacterIdInput();
    });
  });
}

function renderCharacterInspector() {
  if (
    selectedCharacterIndex === null ||
    !currentProject ||
    !currentProject.characters ||
    !currentProject.characters[selectedCharacterIndex]
  ) {
    inspectorContent.innerHTML = `
      <p>当前未选中任何角色。</p>
      <p>在左侧角色列表里点击一个角色后，这里会显示它的属性。</p>
    `;
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

  charIdInput.value = character.id || '';
  charNameInput.value = character.displayName || '';
  charColorInput.value = character.color || '#ffffff';

  charIdInput.addEventListener('mousedown', () => {
    setTimeout(() => {
      charIdInput.focus();
    }, 0);
  });

  charNameInput.addEventListener('mousedown', () => {
    setTimeout(() => {
      charNameInput.focus();
    }, 0);
  });

  charColorInput.addEventListener('mousedown', () => {
    setTimeout(() => {
      charColorInput.focus();
    }, 0);
  });

  applyButton.addEventListener('click', () => {
    const nextId = charIdInput.value.trim();
    const nextName = charNameInput.value.trim();
    const nextColor = charColorInput.value.trim();

    currentProject.characters[selectedCharacterIndex] = {
      ...currentProject.characters[selectedCharacterIndex],
      id: nextId,
      displayName: nextName,
      color: nextColor || '#ffffff'
    };

    renderCharacterList();
    renderCharacterInspector();
  });

  deleteButton.addEventListener('click', () => {
    const confirmed = confirm('确定要删除这个角色吗？');
    if (!confirmed) return;

    currentProject.characters.splice(selectedCharacterIndex, 1);
    selectedCharacterIndex = null;
    renderCharacterList();
    renderCharacterInspector();
  });
}

function handleAddCharacter() {
  if (!currentProject) {
    alert('请先新建或打开一个项目。');
    return;
  }

  const index = currentProject.characters.length + 1;
  const newCharacter = {
    id: `char_${String(index).padStart(3, '0')}`,
    displayName: `新角色${index}`,
    color: '#ffffff'
  };

  currentProject.characters.push(newCharacter);
  selectedCharacterIndex = currentProject.characters.length - 1;

  switchView('characters');
  renderCharacterList();
  renderCharacterInspector();
  focusCharacterIdInput();
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    switchView(button.dataset.view);
  });
});

toolbarButtons.forEach((button) => {
  const text = button.textContent.trim();

  if (text === '新建项目') {
    button.addEventListener('click', handleCreateProject);
  }

  if (text === '打开项目') {
    button.addEventListener('click', handleOpenProject);
  }

  if (text === '保存') {
    button.addEventListener('click', handleSaveProject);
  }
});

const addCharacterButton = document.getElementById('btn-add-character');
if (addCharacterButton) {
  addCharacterButton.addEventListener('click', handleAddCharacter);
}

switchView('dashboard');
updateDashboard();
renderCharacterList();
renderCharacterInspector();