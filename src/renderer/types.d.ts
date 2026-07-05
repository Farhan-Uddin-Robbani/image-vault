interface VaultAPI {
  listVaults: () => Promise<any[]>;
  addVault: () => Promise<any>;
  removeVault: (vaultId: number) => Promise<any>;
  scanVault: (vaultPath: string) => Promise<{ count?: number; error?: string }>;
  listVaultFolders: (vaultPath: string) => Promise<any[]>;
  listImagesByFolder: (folder: string) => Promise<any[]>;
  getImage: (id: number) => Promise<any>;
  readImageFile: (filePath: string) => Promise<{ data: string; mime: string } | { error: string }>;
  thumbnailFile: (filePath: string) => Promise<{ data: string; mime: string } | null>;
  extractExif: (filePath: string) => Promise<any>;
  updateImageMetadata: (id: number, metadata: any) => Promise<any>;
  getTags: () => Promise<any[]>;
  createTag: (name: string, parentId: number | null, color: string) => Promise<any>;
  deleteTag: (tagId: number) => Promise<{ success: boolean }>;
  getImageTags: (imageId: number) => Promise<any[]>;
  addImageTag: (imageId: number, tagId: number) => Promise<any>;
  removeImageTag: (imageId: number, tagId: number) => Promise<any>;
  searchImages: (query: string) => Promise<any[]>;
  advancedSearch: (filters: any) => Promise<any[]>;
  collectionsList: () => Promise<any[]>;
  collectionCreate: (name: string, description: string) => Promise<any>;
  collectionAddImages: (collectionId: number, imageIds: number[]) => Promise<any>;
  collectionImages: (collectionId: number) => Promise<any[]>;
  savedSearchesList: () => Promise<any[]>;
  getTheme: () => Promise<string>;
}

interface Window {
  vault: VaultAPI;
}
