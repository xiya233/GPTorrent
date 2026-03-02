import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "btshare.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export type TorrentRow = {
  id: number;
  name: string;
  category: string;
  size_bytes: number;
  size_display: string;
  tags: string;
  description: string;
  seeds: number;
  leechers: number;
  completed: number;
  created_at: string;
  is_trusted: number;
  is_free_download: number;
  uploader_name: string;
  is_anonymous: number;
  file_path: string;
};

type InsertTorrentInput = {
  name: string;
  category: string;
  sizeBytes: number;
  sizeDisplay: string;
  tags: string[];
  description: string;
  uploaderName: string;
  isAnonymous: boolean;
  filePath: string;
};

const db = new Database(dbPath, { create: true });

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS torrents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  size_display TEXT NOT NULL,
  tags TEXT NOT NULL,
  description TEXT NOT NULL,
  seeds INTEGER NOT NULL DEFAULT 0,
  leechers INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_trusted INTEGER NOT NULL DEFAULT 0,
  is_free_download INTEGER NOT NULL DEFAULT 1,
  uploader_name TEXT NOT NULL DEFAULT '访客',
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL
);
`);

const seedCount = db.query("SELECT COUNT(1) AS count FROM torrents").get() as { count: number };

if (seedCount.count === 0) {
  const seedRows = [
    ["[SubDesu] 咒术回战 - S2E14 [1080p] [HEVC]", "动画", 1503238554, "1.4 GiB", "1080p,HEVC", "默认示例数据", 2402, 124, 582, "2026-03-02 11:00:00", 1, 1, "system", 0, "samples/sample-1.torrent"],
    ["(Hi-Res) 宇多田光 - Science Fiction [FLAC 24bit/96kHz]", "音乐", 933232640, "890 MiB", "FLAC,Hi-Res", "默认示例数据", 156, 12, 45, "2026-03-02 08:00:00", 0, 1, "system", 0, "samples/sample-2.torrent"],
    ["奥本海默 (2023) [2160p] [4K] [HDR] [x265]", "电影", 19756849562, "18.4 GiB", "4K,HDR,x265", "默认示例数据", 5892, 845, 2100, "2026-03-01 23:00:00", 1, 1, "system", 0, "samples/sample-3.torrent"],
    ["博德之门 3 - 豪华版 [v4.1.1.3622274] + DLCs", "游戏", 130996502528, "122 GiB", "RPG,DLC", "默认示例数据", 1203, 450, 890, "2026-03-01 10:00:00", 0, 1, "system", 0, "samples/sample-4.torrent"],
    ["设计系统手册 (2024版) - PDF/EPUB", "书籍", 47185920, "45 MiB", "PDF,EPUB", "默认示例数据", 88, 2, 12, "2026-03-01 09:00:00", 0, 1, "system", 0, "samples/sample-5.torrent"]
  ] as const;

  const stmt = db.query(`
    INSERT INTO torrents (
      name, category, size_bytes, size_display, tags, description,
      seeds, leechers, completed, created_at, is_trusted, is_free_download,
      uploader_name, is_anonymous, file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of seedRows) {
    stmt.run(...row);
  }
}

export function listTorrents(params: { q?: string; category?: string; limit?: number } = {}) {
  const q = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 300);

  const rows = db
    .query(`
      SELECT *
      FROM torrents
      WHERE ($q = '' OR name LIKE '%' || $q || '%' OR tags LIKE '%' || $q || '%')
        AND ($category = '' OR category = $category)
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT $limit
    `)
    .all({ $q: q, $category: category, $limit: limit });

  return rows as TorrentRow[];
}

export function insertTorrent(input: InsertTorrentInput) {
  db.query(`
    INSERT INTO torrents (
      name,
      category,
      size_bytes,
      size_display,
      tags,
      description,
      uploader_name,
      is_anonymous,
      file_path,
      is_trusted,
      is_free_download
    ) VALUES (
      $name,
      $category,
      $sizeBytes,
      $sizeDisplay,
      $tags,
      $description,
      $uploaderName,
      $isAnonymous,
      $filePath,
      0,
      1
    )
  `).run({
    $name: input.name,
    $category: input.category,
    $sizeBytes: input.sizeBytes,
    $sizeDisplay: input.sizeDisplay,
    $tags: input.tags.join(","),
    $description: input.description,
    $uploaderName: input.uploaderName,
    $isAnonymous: input.isAnonymous ? 1 : 0,
    $filePath: input.filePath,
  });
}
