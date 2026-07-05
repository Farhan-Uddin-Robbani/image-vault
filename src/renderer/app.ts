interface VaultAPI {
  selectFolder: () => Promise<string | null>;
  scanFolder: (folderPath: string) => Promise<{ count?: number; error?: string }>;
  listImages: (folder: string) => Promise<any[]>;
  getImage: (id: number) => Promise<any>;
  readImageFile: (filePath: string) => Promise<{ data: string; mime: string } | { error: string }>;
  thumbnailFile: (filePath: string) => Promise<{ data: string; mime: string } | null>;
  getTags: () => Promise<any[]>;
  createTag: (name: string, parentId: number | null, color: string) => Promise<any>;
  deleteTag: (tagId: number) => Promise<{ success: boolean }>;
  getImageTags: (imageId: number) => Promise<any[]>;
  addImageTag: (imageId: number, tagId: number) => Promise<any>;
  removeImageTag: (imageId: number, tagId: number) => Promise<any>;
  searchImages: (query: string) => Promise<any[]>;
  advancedSearch: (filters: any) => Promise<any[]>;
  updateImageMetadata: (id: number, metadata: any) => Promise<any>;
  extractExif: (filePath: string) => Promise<any>;
  listFolders: () => Promise<any[]>;
  getTheme: () => Promise<string>;
  collectionsList: () => Promise<any[]>;
  collectionCreate: (name: string, description: string) => Promise<any>;
  collectionAddImages: (collectionId: number, imageIds: number[]) => Promise<any>;
  collectionImages: (collectionId: number) => Promise<any[]>;
  savedSearchesList: () => Promise<any[]>;
}

declare global {
  interface Window {
    vault: VaultAPI;
  }
}
export {};

// ─── State ───────────────────────────────────────────────
interface AppState {
  currentFolder: string | null;
  images: any[];
  selectedImageId: number | null;
  currentImage: any | null;
  tags: any[];
  currentImageTags: any[];
  theme: 'dark' | 'light';
  thumbSize: 'sm' | 'md' | 'lg';
  sortBy: 'name' | 'date';
  currentView: 'grid' | 'search' | 'collection';
  zoomLevel: number;
  panX: number;
  panY: number;
}

const state: AppState = {
  currentFolder: null,
  images: [],
  selectedImageId: null,
  currentImage: null,
  tags: [],
  currentImageTags: [],
  theme: 'dark',
  thumbSize: 'md',
  sortBy: 'name',
  currentView: 'grid',
  zoomLevel: 1,
  panX: 0,
  panY: 0,
};

// ─── DOM refs ────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id);
const folderList = $('folder-list')!;
const tagTree = $('tag-tree')!;
const collectionList = $('collection-list')!;
const thumbnailGrid = $('thumbnail-grid')!;
const previewImage = $('preview-image') as HTMLImageElement;
const previewPlaceholder = $('preview-placeholder')!;
const previewFilename = $('preview-filename')!;
const tagList = $('tag-list')!;
const tagInput = $('tag-input') as HTMLInputElement;
const previewExif = $('preview-exif')!;
const imageCount = $('image-count')!;
const searchInput = $('search-input') as HTMLInputElement;

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  state.theme = (await window.vault.getTheme()) as 'dark' | 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  await loadTags();
  await loadCollections();
  bindEvents();
});

// ─── Events ──────────────────────────────────────────────
function bindEvents(): void {
  $('btn-open-folder')!.onclick = openFolder;
  $('btn-search')!.onclick = doSearch;
  searchInput.onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
  $('btn-advanced-search')!.onclick = () => showModal('advanced-search-modal');
  $('btn-theme')!.onclick = toggleTheme;
  $('btn-add-tag')!.onclick = () => showModal('tag-modal');
  $('btn-add-collection')!.onclick = () => showModal('collection-modal');
  $('btn-fullscreen')!.onclick = toggleFullscreen;
  $('btn-slideshow')!.onclick = startSlideshow;

  $('btn-thumb-sm')!.onclick = () => setThumbSize('sm');
  $('btn-thumb-md')!.onclick = () => setThumbSize('md');
  $('btn-thumb-lg')!.onclick = () => setThumbSize('lg');
  $('btn-sort-name')!.onclick = () => setSort('name');
  $('btn-sort-date')!.onclick = () => setSort('date');

  tagInput.onkeydown = (e) => { if (e.key === 'Enter') addTagFromInput(); };
  previewImage.onwheel = handleZoom;

  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => closeModals());
  });

  $('tag-save')!.onclick = createTagFromModal;
  $('collection-save')!.onclick = createCollectionFromModal;
  $('as-search')!.onclick = doAdvancedSearch;
  $('as-clear')!.onclick = clearAdvancedSearch;
  $('#rating-stars')!.onclick = handleRating;

  document.addEventListener('keydown', handleKeyboard);
}

// ─── Folder ──────────────────────────────────────────────
async function openFolder(): Promise<void> {
  const folder = await window.vault.selectFolder();
  if (!folder) return;

  const result = await window.vault.scanFolder(folder);
  if (result.error) {
    console.error(result.error);
    return;
  }

  state.currentFolder = folder;
  state.currentView = 'grid';
  await loadFolderImages(folder);
  await loadFolders();
}

async function loadFolderImages(folder: string): Promise<void> {
  const images = await window.vault.listImages(folder);
  state.images = images;
  sortImages();
  renderThumbnails();
}

async function loadFolders(): Promise<void> {
  const folders = await window.vault.listFolders() as any[];
  folderList.innerHTML = folders.map((f: any) =>
    `<div class="sidebar-item${f.folder === state.currentFolder ? ' active' : ''}" data-folder="${f.folder}">📁 ${f.folder}</div>`
  ).join('');

  folderList.querySelectorAll('.sidebar-item').forEach((el) => {
    el.addEventListener('click', () => {
      const folder = (el as HTMLElement).dataset.folder!;
      state.currentFolder = folder;
      state.currentView = 'grid';
      loadFolderImages(folder);
      folderList.querySelectorAll('.sidebar-item').forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

// ─── Thumbnails ──────────────────────────────────────────
function renderThumbnails(): void {
  imageCount.textContent = `${state.images.length} images`;
  thumbnailGrid.innerHTML = '';

  thumbnailGrid.className = `thumb-${state.thumbSize}`;

  for (const img of state.images) {
    const div = document.createElement('div');
    div.className = `thumb-item${img.id === state.selectedImageId ? ' active' : ''}`;
    div.dataset.id = img.id;

    const imgEl = document.createElement('img');
    imgEl.alt = img.filename;
    div.appendChild(imgEl);

    const overlay = document.createElement('div');
    overlay.className = 'thumb-overlay';
    overlay.textContent = img.filename;
    div.appendChild(overlay);

    if (img.rating > 0) {
      const badge = document.createElement('div');
      badge.className = 'thumb-badge';
      badge.style.background = '#cca700';
      div.appendChild(badge);
    }
    if (img.flag > 0) {
      const badge = document.createElement('div');
      badge.className = 'thumb-badge';
      badge.style.background = '#f44747';
      badge.style.right = '16px';
      div.appendChild(badge);
    }

    div.onclick = () => selectImage(img);
    div.ondblclick = () => openFullscreen(img);

    thumbnailGrid.appendChild(div);

    loadThumbnail(img.path, imgEl);
  }
}

async function loadThumbnail(filePath: string, imgEl: HTMLImageElement): Promise<void> {
  const result = await window.vault.thumbnailFile(filePath);
  if (result) {
    imgEl.src = `data:${result.mime};base64,${result.data}`;
  }
}

function sortImages(): void {
  if (state.sortBy === 'name') {
    state.images.sort((a, b) => a.filename.localeCompare(b.filename));
  } else {
    state.images.sort((a, b) => {
      const da = a.date_taken || a.date_modified || '';
      const db = b.date_taken || b.date_modified || '';
      return db.localeCompare(da);
    });
  }
}

// ─── Image Selection & Preview ───────────────────────────
async function selectImage(img: any): Promise<void> {
  state.selectedImageId = img.id;
  state.currentImage = img;
  state.zoomLevel = 1;
  state.panX = 0;
  state.panY = 0;

  document.querySelectorAll('.thumb-item').forEach((el) => {
    el.classList.toggle('active', Number((el as HTMLElement).dataset.id) === img.id);
  });

  previewFilename.textContent = img.filename;
  previewPlaceholder.style.display = 'none';
  previewImage.style.display = 'block';

  const result = await window.vault.readImageFile(img.path);
  if ('data' in result) {
    previewImage.src = `data:${result.mime};base64,${result.data}`;
  }

  loadImageTags(img.id);

  const exif = await window.vault.extractExif(img.path);
  if (exif && !exif.error) {
    renderExif(exif);
    await updateImageExif(img.id, exif);
  }

  updateRatingUI(img.rating || 0);
  $('btn-flag')!.textContent = img.flag ? '🚩' : '🏳';
}

async function loadImageTags(imageId: number): Promise<void> {
  const tags = await window.vault.getImageTags(imageId);
  state.currentImageTags = tags;
  renderTags();
}

function renderTags(): void {
  tagList.innerHTML = state.currentImageTags.map((t: any) =>
    `<span class="tag-badge" data-tag-id="${t.id}" style="border-left: 3px solid ${t.color}">
      ${t.name}
      <span class="tag-remove" data-tag-id="${t.id}">✕</span>
    </span>`
  ).join('');

  tagList.querySelectorAll('.tag-remove').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tagId = Number((el as HTMLElement).dataset.tagId);
      if (state.currentImage) {
        await window.vault.removeImageTag(state.currentImage.id, tagId);
        await loadImageTags(state.currentImage.id);
      }
    });
  });
}

async function addTagFromInput(): Promise<void> {
  const name = tagInput.value.trim();
  if (!name || !state.currentImage) return;

  const existing = state.tags.find((t) => t.name === name);
  if (existing) {
    await window.vault.addImageTag(state.currentImage.id, existing.id);
  } else {
    const result = await window.vault.createTag(name, null, '#4a9eff');
    if (result.id) {
      await window.vault.addImageTag(state.currentImage.id, result.id);
      await loadTags();
    }
  }
  tagInput.value = '';
  await loadImageTags(state.currentImage.id);
}

async function updateImageExif(id: number, exif: any): Promise<void> {
  if (exif.width || exif.height || exif.dateTaken || exif.cameraMake || exif.cameraModel) {
    await window.vault.updateImageMetadata(id, {
      width: exif.width,
      height: exif.height,
      date_taken: exif.dateTaken,
      camera_make: exif.cameraMake,
      camera_model: exif.cameraModel,
      lens: exif.lens,
      focal_length: exif.focalLength,
      aperture: exif.aperture,
      shutter_speed: exif.shutterSpeed,
      iso: exif.iso,
      gps_lat: exif.gpsLat,
      gps_lng: exif.gpsLng,
    });
  }
}

function renderExif(exif: any): void {
  const rows: Array<{ label: string; value: string }> = [];
  if (exif.dateTaken) rows.push({ label: 'Date Taken', value: new Date(exif.dateTaken).toLocaleString() });
  if (exif.cameraMake || exif.cameraModel) rows.push({ label: 'Camera', value: [exif.cameraMake, exif.cameraModel].filter(Boolean).join(' ') });
  if (exif.lens) rows.push({ label: 'Lens', value: exif.lens });
  if (exif.focalLength) rows.push({ label: 'Focal Length', value: exif.focalLength });
  if (exif.aperture) rows.push({ label: 'Aperture', value: exif.aperture });
  if (exif.shutterSpeed) rows.push({ label: 'Shutter', value: exif.shutterSpeed });
  if (exif.iso) rows.push({ label: 'ISO', value: String(exif.iso) });
  if (exif.width && exif.height) rows.push({ label: 'Dimensions', value: `${exif.width} × ${exif.height}` });
  if (exif.gpsLat && exif.gpsLng) {
    rows.push({ label: 'GPS', value: `${exif.gpsLat.toFixed(4)}, ${exif.gpsLng.toFixed(4)}` });
  }

  previewExif.innerHTML = rows.map((r) =>
    `<div class="exif-row"><span class="exif-label">${r.label}</span><span class="exif-value">${r.value}</span></div>`
  ).join('');
}

// ─── Tags ────────────────────────────────────────────────
async function loadTags(): Promise<void> {
  state.tags = await window.vault.getTags();
  renderTagTree();
}

function renderTagTree(): void {
  const rootTags = state.tags.filter((t) => !t.parent_id);
  const childTags = (parentId: number) => state.tags.filter((t) => t.parent_id === parentId);

  tagTree.innerHTML = rootTags.map((tag: any) => {
    const children = childTags(tag.id);
    const childHtml = children.map((c: any) =>
      `<div class="tag-item" data-tag-id="${c.id}" style="padding-left: 24px">
        <span class="tag-color-dot" style="background:${c.color}"></span>
        ${c.name}
      </div>`
    ).join('');

    return `<div class="tag-item" data-tag-id="${tag.id}">
      <span class="tag-color-dot" style="background:${tag.color}"></span>
      ${tag.name}
    </div>${childHtml}`;
  }).join('');

  tagTree.querySelectorAll('.tag-item').forEach((el) => {
    el.addEventListener('click', () => {
      const tagId = Number((el as HTMLElement).dataset.tagId);
      filterByTag(tagId);
    });
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const tagId = Number((el as HTMLElement).dataset.tagId);
      if (confirm('Delete this tag?')) {
        await window.vault.deleteTag(tagId);
        await loadTags();
      }
    });
  });
}

async function filterByTag(tagId: number): Promise<void> {
  state.currentView = 'search';
  state.images = await window.vault.advancedSearch({ tags: [tagId] });
  renderThumbnails();
}

// ─── Collections ─────────────────────────────────────────
async function loadCollections(): Promise<void> {
  const collections = await window.vault.collectionsList() as any[];
  collectionList.innerHTML = collections.map((c: any) =>
    `<div class="sidebar-item" data-collection-id="${c.id}">📚 ${c.name}</div>`
  ).join('');

  collectionList.querySelectorAll('.sidebar-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number((el as HTMLElement).dataset.collectionId);
      const images = await window.vault.collectionImages(id);
      state.images = images;
      state.currentView = 'collection';
      renderThumbnails();
    });
  });
}

// ─── Search ──────────────────────────────────────────────
async function doSearch(): Promise<void> {
  const query = searchInput.value.trim();
  if (!query) return;
  state.currentView = 'search';
  state.images = await window.vault.searchImages(query);
  renderThumbnails();
}

async function doAdvancedSearch(): Promise<void> {
  const filters: any = {};
  const text = ($('as-text') as HTMLInputElement).value.trim();
  const rating = Number(($('as-rating') as HTMLSelectElement).value);
  const dateFrom = ($('as-date-from') as HTMLInputElement).value;
  const dateTo = ($('as-date-to') as HTMLInputElement).value;
  const camera = ($('as-camera') as HTMLInputElement).value.trim();

  if (text) filters.text = text;
  if (rating > 0) filters.rating = rating;
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (camera) filters.camera = camera;

  state.currentView = 'search';
  state.images = await window.vault.advancedSearch(filters);
  renderThumbnails();
  closeModals();
}

function clearAdvancedSearch(): void {
  ($('as-text') as HTMLInputElement).value = '';
  ($('as-rating') as HTMLSelectElement).value = '0';
  ($('as-date-from') as HTMLInputElement).value = '';
  ($('as-date-to') as HTMLInputElement).value = '';
  ($('as-camera') as HTMLInputElement).value = '';
}

// ─── Zoom/Pan ────────────────────────────────────────────
function handleZoom(e: WheelEvent): void {
  if (!state.currentImage) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  state.zoomLevel = Math.max(0.1, Math.min(5, state.zoomLevel + delta));
  applyTransform();
}

function applyTransform(): void {
  if (state.zoomLevel === 1 && state.panX === 0 && state.panY === 0) {
    previewImage.style.maxWidth = '100%';
    previewImage.style.maxHeight = '100%';
    previewImage.style.transform = '';
  } else {
    previewImage.style.maxWidth = 'none';
    previewImage.style.maxHeight = 'none';
    previewImage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoomLevel})`;
  }
}

// ─── Rating ──────────────────────────────────────────────
function handleRating(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.tagName !== 'SPAN' || !state.currentImage) return;
  const rating = Number(target.dataset.rating);
  window.vault.updateImageMetadata(state.currentImage.id, { rating });
  state.currentImage.rating = rating;
  updateRatingUI(rating);
}

function updateRatingUI(rating: number): void {
  document.querySelectorAll('#rating-stars span').forEach((el) => {
    const r = Number((el as HTMLElement).dataset.rating);
    (el as HTMLElement).textContent = r <= rating ? '★' : '☆';
    el.classList.toggle('active', r <= rating);
  });
}

// ─── Theme ───────────────────────────────────────────────
function toggleTheme(): void {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
}

// ─── Thumb Size / Sort ───────────────────────────────────
function setThumbSize(size: 'sm' | 'md' | 'lg'): void {
  state.thumbSize = size;
  document.querySelectorAll('.thumb-actions button').forEach((b) => b.classList.remove('active'));
  $(`btn-thumb-${size}`)!.classList.add('active');
  renderThumbnails();
}

function setSort(sort: 'name' | 'date'): void {
  state.sortBy = sort;
  document.querySelectorAll('.thumb-actions button').forEach((b) => b.classList.remove('active'));
  $(`btn-sort-${sort}`)!.classList.add('active');
  sortImages();
  renderThumbnails();
}

// ─── Fullscreen / Slideshow ──────────────────────────────
function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

async function openFullscreen(img: any): Promise<void> {
  const result = await window.vault.readImageFile(img.path);
  if (!('data' in result)) return;

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;z-index:200;cursor:pointer';
  const imgEl = document.createElement('img');
  imgEl.src = `data:${result.mime};base64,${result.data}`;
  imgEl.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain';
  el.appendChild(imgEl);
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

async function startSlideshow(): Promise<void> {
  if (state.images.length === 0) return;
  let idx = 0;
  const showNext = async () => {
    if (idx >= state.images.length) idx = 0;
    const img = state.images[idx++];
    const result = await window.vault.readImageFile(img.path);
    if (!('data' in result)) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;z-index:200';
    const imgEl = document.createElement('img');
    imgEl.src = `data:${result.mime};base64,${result.data}`;
    imgEl.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain';
    el.appendChild(imgEl);
    el.onclick = () => { el.remove(); clearInterval(timer); };
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };
  showNext();
  const timer = setInterval(showNext, 4000);
}

// ─── Keyboard ────────────────────────────────────────────
function handleKeyboard(e: KeyboardEvent): void {
  if (e.target === searchInput || e.target === tagInput) return;

  const idx = state.images.findIndex((i) => i.id === state.selectedImageId);
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault();
      if (idx < state.images.length - 1) selectImage(state.images[idx + 1]);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault();
      if (idx > 0) selectImage(state.images[idx - 1]);
      break;
    case 'f':
      toggleFullscreen();
      break;
    case 'Escape':
      closeModals();
      break;
  }
}

// ─── Modals ──────────────────────────────────────────────
function showModal(id: string): void {
  $(id)!.style.display = 'flex';
}

function closeModals(): void {
  document.querySelectorAll('.modal').forEach((m) => (m as HTMLElement).style.display = 'none');
}

async function createTagFromModal(): Promise<void> {
  const name = ($('tag-name') as HTMLInputElement).value.trim();
  const color = ($('tag-color') as HTMLInputElement).value;
  if (!name) return;
  await window.vault.createTag(name, null, color);
  await loadTags();
  ($('tag-name') as HTMLInputElement).value = '';
  closeModals();
}

async function createCollectionFromModal(): Promise<void> {
  const name = ($('collection-name') as HTMLInputElement).value.trim();
  if (!name) return;
  await window.vault.collectionCreate(name, '');
  await loadCollections();
  ($('collection-name') as HTMLInputElement).value = '';
  closeModals();
}
