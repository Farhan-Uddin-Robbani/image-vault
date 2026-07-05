import { ipcMain, dialog, nativeImage, nativeTheme } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDb } from './database';
import { getImageMetadata } from './scanner';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.tiff', '.tif',
]);

function walkDir(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch { }
  return results;
}

export function registerIpcHandlers(): void {
  const db = getDb();
  if (!db) return;

  // ─── Vault management ──────────────────────────────────
  ipcMain.handle('list-vaults', async () => {
    return db.prepare('SELECT * FROM vaults ORDER BY name').all();
  });

  ipcMain.handle('add-vault', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select image folder to add as vault',
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const vaultPath = result.filePaths[0];
    const vaultName = path.basename(vaultPath);

    try {
      const existing = db.prepare('SELECT id FROM vaults WHERE path = ?').get(vaultPath) as any;
      if (existing) return { id: existing.id, name: vaultName, path: vaultPath };

      const ins = db.prepare('INSERT INTO vaults (name, path) VALUES (?, ?)').run(vaultName, vaultPath);
      return { id: ins.lastInsertRowid, name: vaultName, path: vaultPath };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('remove-vault', async (_event, vaultId: number) => {
    const vault = db.prepare('SELECT path FROM vaults WHERE id = ?').get(vaultId) as any;
    if (!vault) return { error: 'Vault not found' };

    db.transaction(() => {
      const folderPrefix = vault.path.replace(/\\/g, '\\\\');
      db.prepare(`DELETE FROM image_tags WHERE image_id IN (SELECT id FROM images WHERE folder LIKE ?)`).run(`${folderPrefix}%`);
      db.prepare(`DELETE FROM images WHERE folder LIKE ?`).run(`${folderPrefix}%`);
      db.prepare('DELETE FROM vaults WHERE id = ?').run(vaultId);
    })();

    return { success: true };
  });

  ipcMain.handle('scan-vault', async (_event, vaultPath: string) => {
    try {
      const stmt = db.prepare(`INSERT OR IGNORE INTO images (path, filename, folder, extension, file_size, date_modified)
        VALUES (?, ?, ?, ?, ?, ?)`);

      const files = walkDir(vaultPath);
      const insertMany = db.transaction(() => {
        for (const filePath of files) {
          try {
            const stat = fs.statSync(filePath);
            const folder = path.dirname(filePath);
            stmt.run(filePath, path.basename(filePath), folder, path.extname(filePath).toLowerCase(), stat.size, stat.mtime.toISOString());
          } catch { }
        }
      });

      insertMany();
      return { count: files.length };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('list-images-by-folder', async (_event, folder: string) => {
    return db.prepare('SELECT * FROM images WHERE folder = ? ORDER BY filename').all(folder);
  });

  ipcMain.handle('list-vault-folders', async (_event, vaultPath: string) => {
    const prefix = vaultPath.replace(/\\/g, '\\\\');
    return db.prepare('SELECT DISTINCT folder FROM images WHERE folder LIKE ? ORDER BY folder').all(`${prefix}%`);
  });

  ipcMain.handle('get-image', async (_event, id: number) => {
    return db.prepare('SELECT * FROM images WHERE id = ?').get(id);
  });

  ipcMain.handle('read-image-file', async (_event, filePath: string) => {
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'png' ? 'image/png'
        : ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
        : ext === 'bmp' ? 'image/bmp'
        : `image/${ext}`;
      return { data: data.toString('base64'), mime };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('thumbnail-file', async (_event, filePath: string) => {
    try {
      const data = fs.readFileSync(filePath);
      const img = nativeImage.createFromBuffer(data);
      const resized = img.resize({ width: 250, height: 250, quality: 'good' });
      return { data: resized.toJPEG(80).toString('base64'), mime: 'image/jpeg' };
    } catch {
      return null;
    }
  });

  ipcMain.handle('get-tags', async () => {
    return db.prepare('SELECT * FROM tags ORDER BY sort_order, name').all();
  });

  ipcMain.handle('create-tag', async (_event, name: string, parentId: number | null, color: string) => {
    try {
      const result = db.prepare('INSERT INTO tags (name, parent_id, color) VALUES (?, ?, ?)').run(name, parentId, color);
      return { id: result.lastInsertRowid, name, parent_id: parentId, color };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('delete-tag', async (_event, tagId: number) => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
    return { success: true };
  });

  ipcMain.handle('get-image-tags', async (_event, imageId: number) => {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN image_tags it ON t.id = it.tag_id
      WHERE it.image_id = ?
      ORDER BY t.name
    `).all(imageId);
  });

  ipcMain.handle('add-image-tag', async (_event, imageId: number, tagId: number) => {
    try {
      db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)').run(imageId, tagId);
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('remove-image-tag', async (_event, imageId: number, tagId: number) => {
    db.prepare('DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?').run(imageId, tagId);
    return { success: true };
  });

  ipcMain.handle('search-images', async (_event, query: string) => {
    try {
      const q = `%${query}%`;
      const rows = db.prepare(`
        SELECT DISTINCT i.* FROM images i
        LEFT JOIN image_tags it ON i.id = it.image_id
        LEFT JOIN tags t ON it.tag_id = t.id
        WHERE i.filename LIKE ? OR i.description LIKE ? OR t.name LIKE ?
        ORDER BY i.filename
        LIMIT 200
      `).all(q, q, q);
      return rows;
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('advanced-search', async (_event, filters: any) => {
    try {
      let sql = 'SELECT DISTINCT i.* FROM images i';
      const params: any[] = [];
      const conditions: string[] = [];

      if (filters.text) {
        sql += ' LEFT JOIN image_tags it ON i.id = it.image_id LEFT JOIN tags t ON it.tag_id = t.id';
        const q = `%${filters.text}%`;
        conditions.push('(i.filename LIKE ? OR t.name LIKE ? OR i.description LIKE ?)');
        params.push(q, q, q);
      }
      if (filters.rating) {
        conditions.push('i.rating >= ?');
        params.push(filters.rating);
      }
      if (filters.flag !== undefined) {
        conditions.push('i.flag = ?');
        params.push(filters.flag);
      }
      if (filters.dateFrom) {
        conditions.push('(i.date_taken >= ? OR i.date_modified >= ?)');
        params.push(filters.dateFrom, filters.dateFrom);
      }
      if (filters.dateTo) {
        conditions.push('(i.date_taken <= ? OR i.date_modified <= ?)');
        params.push(filters.dateTo, filters.dateTo);
      }
      if (filters.camera) {
        conditions.push('i.camera_model LIKE ?');
        params.push(`%${filters.camera}%`);
      }
      if (filters.tags && filters.tags.length > 0) {
        for (const tagId of filters.tags) {
          sql += ` JOIN image_tags it${tagId} ON i.id = it${tagId}.image_id AND it${tagId}.tag_id = ${tagId}`;
        }
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY i.filename LIMIT 200';

      return db.prepare(sql).all(...params);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('update-image-metadata', async (_event, id: number, metadata: any) => {
    try {
      const fields: string[] = [];
      const params: any[] = [];
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined) {
          fields.push(`${key} = ?`);
          params.push(value);
        }
      }
      fields.push("updated_at = datetime('now')");
      params.push(id);
      db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(...params);
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('extract-exif', async (_event, filePath: string) => {
    try {
      return await getImageMetadata(filePath);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('get-theme', async () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  ipcMain.handle('collections-list', async () => {
    return db.prepare('SELECT * FROM collections ORDER BY name').all();
  });

  ipcMain.handle('collection-create', async (_event, name: string, description: string) => {
    const result = db.prepare('INSERT INTO collections (name, description) VALUES (?, ?)').run(name, description);
    return { id: result.lastInsertRowid, name, description };
  });

  ipcMain.handle('collection-add-images', async (_event, collectionId: number, imageIds: number[]) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO collection_images (collection_id, image_id) VALUES (?, ?)');
    const tx = db.transaction(() => {
      for (const imageId of imageIds) {
        stmt.run(collectionId, imageId);
      }
    });
    tx();
    return { success: true };
  });

  ipcMain.handle('collection-images', async (_event, collectionId: number) => {
    return db.prepare(`
      SELECT i.* FROM images i
      JOIN collection_images ci ON i.id = ci.image_id
      WHERE ci.collection_id = ?
      ORDER BY ci.sort_order, i.filename
    `).all(collectionId);
  });

  ipcMain.handle('saved-searches-list', async () => {
    return db.prepare('SELECT * FROM saved_searches ORDER BY name').all();
  });
}
