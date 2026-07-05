import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

let db: Database.Database | null = null;

export function initDatabase(): void {
  const dbPath = path.join(os.homedir(), '.image-vault', 'vault.db');
  const dbDir = path.dirname(dbPath);

  const fs = require('fs');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      folder TEXT NOT NULL,
      extension TEXT NOT NULL,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      date_modified TEXT,
      date_taken TEXT,
      camera_make TEXT,
      camera_model TEXT,
      lens TEXT,
      focal_length TEXT,
      aperture TEXT,
      shutter_speed TEXT,
      iso INTEGER,
      gps_lat REAL,
      gps_lng REAL,
      rating INTEGER DEFAULT 0,
      flag INTEGER DEFAULT 0,
      color_label TEXT DEFAULT '',
      description TEXT DEFAULT '',
      hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      parent_id INTEGER,
      color TEXT DEFAULT '#888888',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_tags (
      image_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (image_id, tag_id),
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_images (
      collection_id INTEGER NOT NULL,
      image_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      PRIMARY KEY (collection_id, image_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_path ON images(path);
    CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder);
    CREATE INDEX IF NOT EXISTS idx_images_rating ON images(rating);
    CREATE INDEX IF NOT EXISTS idx_images_flag ON images(flag);
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);
  `);
}

export function getDb(): Database.Database | null {
  return db;
}
