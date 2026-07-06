const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  // Vault management
  listVaults: () => ipcRenderer.invoke('list-vaults'),
  addVault: () => ipcRenderer.invoke('add-vault'),
  removeVault: (vaultId: number) => ipcRenderer.invoke('remove-vault', vaultId),
  scanVault: (vaultPath: string) => ipcRenderer.invoke('scan-vault', vaultPath),
  listVaultFolders: (vaultPath: string) => ipcRenderer.invoke('list-vault-folders', vaultPath),
  listImagesByFolder: (folder: string) => ipcRenderer.invoke('list-images-by-folder', folder),

  // Image
  getImage: (id: number) => ipcRenderer.invoke('get-image', id),
  readImageFile: (filePath: string) => ipcRenderer.invoke('read-image-file', filePath),
  thumbnailFile: (filePath: string) => ipcRenderer.invoke('thumbnail-file', filePath),
  extractExif: (filePath: string) => ipcRenderer.invoke('extract-exif', filePath),
  updateImageMetadata: (id: number, metadata: any) => ipcRenderer.invoke('update-image-metadata', id, metadata),

  // Tags
  getTags: () => ipcRenderer.invoke('get-tags'),
  createTag: (name: string, parentId: number | null, color: string) => ipcRenderer.invoke('create-tag', name, parentId, color),
  deleteTag: (tagId: number) => ipcRenderer.invoke('delete-tag', tagId),
  getImageTags: (imageId: number) => ipcRenderer.invoke('get-image-tags', imageId),
  addImageTag: (imageId: number, tagId: number) => ipcRenderer.invoke('add-image-tag', imageId, tagId),
  removeImageTag: (imageId: number, tagId: number) => ipcRenderer.invoke('remove-image-tag', imageId, tagId),

  // Search
  searchImages: (query: string) => ipcRenderer.invoke('search-images', query),
  advancedSearch: (filters: any) => ipcRenderer.invoke('advanced-search', filters),

  // Collections
  collectionsList: () => ipcRenderer.invoke('collections-list'),
  collectionCreate: (name: string, description: string) => ipcRenderer.invoke('collection-create', name, description),
  collectionAddImages: (collectionId: number, imageIds: number[]) => ipcRenderer.invoke('collection-add-images', collectionId, imageIds),
  collectionImages: (collectionId: number) => ipcRenderer.invoke('collection-images', collectionId),
  savedSearchesList: () => ipcRenderer.invoke('saved-searches-list'),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximized: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized));
  },
});
