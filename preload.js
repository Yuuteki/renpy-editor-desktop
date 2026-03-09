const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  createProject: () => ipcRenderer.invoke('project:create'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (projectData) => ipcRenderer.invoke('project:save', projectData)
});