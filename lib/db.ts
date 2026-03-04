import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { TORRENT_CATEGORIES } from "@/lib/categories";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

const dataDir = path.join(process.cwd(), "data");
const isBuildMode =
  process.env.BTSHARE_BUILD_MODE === "1" ||
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.argv.join(" ").includes("next build");
const dbPath = isBuildMode ? ":memory:" : path.join(dataDir, "btshare.sqlite");

if (!isBuildMode) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "banned" | "deleted";
export type TorrentStatus = "active" | "deleted_user" | "deleted_admin";
export type OfflineJobStatus = "queued" | "downloading" | "completed" | "failed" | "expired";
export type HlsStatus = "none" | "pending" | "running" | "ready" | "failed";
export type HlsUpgradeState = "none" | "queued" | "running" | "failed";
export type PosterStatus = "none" | "queued" | "running" | "ready" | "failed";

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
  updated_at: string;
  is_trusted: number;
  is_free_download: number;
  uploader_name: string;
  is_anonymous: number;
  uploader_user_id: number | null;
  file_path: string;
  info_hash: string | null;
  magnet_uri: string | null;
  status: TorrentStatus;
  tracker_last_checked_at: string | null;
  tracker_source: string | null;
  tracker_state: string;
  deleted_at: string | null;
  deleted_by_user_id: number | null;
  assets_cleaned_at: string | null;
};

export type TorrentTrackerRow = {
  id: number;
  torrent_id: number;
  tier: number;
  announce_url: string;
  scrape_url: string;
  is_primary: number;
  last_checked_at: string | null;
  last_error: string;
};

export type TorrentFileRow = {
  id: number;
  torrent_id: number;
  file_path: string;
  file_size_bytes: number;
  sort_order: number;
};

export type TorrentImageRow = {
  id: number;
  torrent_id: number;
  image_path: string;
  sort_order: number;
  created_at: string;
};

export type TorrentDetail = {
  torrent: TorrentRow;
  trackers: TorrentTrackerRow[];
  files: TorrentFileRow[];
  images: TorrentImageRow[];
};

export type OfflineJobRow = {
  id: number;
  torrent_id: number;
  requested_by_user_id: number;
  status: OfflineJobStatus;
  qb_hash: string;
  save_path: string;
  total_bytes: number;
  downloaded_bytes: number;
  progress: number;
  download_speed: number;
  eta_seconds: number | null;
  error_message: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  last_accessed_at: string;
  expires_at: string | null;
};

export type OfflineFileRow = {
  id: number;
  job_id: number;
  torrent_file_id: number | null;
  relative_path: string;
  size_bytes: number;
  mime_type: string;
  is_video: number;
  hls_status: HlsStatus;
  hls_progress: number;
  hls_variant_count: number;
  hls_upgrade_state: HlsUpgradeState;
  hls_upgrade_error: string;
  poster_path: string;
  poster_status: PosterStatus;
  poster_error: string;
  poster_score: number;
  poster_pick_time: number;
  poster_generated_at: string;
  hls_playlist_path: string;
  hls_error: string;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
};

export type OfflineJobDetail = {
  job: OfflineJobRow;
  files: OfflineFileRow[];
};

export type AuthUser = {
  id: number;
  username: string;
  avatar_path: string;
  bio: string;
  role: UserRole;
  status: UserStatus;
};

export type UserRow = AuthUser & {
  password_hash: string;
  created_at: string;
  updated_at: string;
};

export type SessionWithUser = {
  session_id: number;
  token_hash: string;
  user_id: number;
  expires_at: string;
  last_seen_at: string;
  username: string;
  avatar_path: string;
  bio: string;
  role: UserRole;
  status: UserStatus;
};

export type SiteBranding = {
  titleText: string;
  logoPath: string;
};

export type SiteFeatureFlags = {
  allowGuestUpload: boolean;
  allowUserDeleteTorrent: boolean;
  allowGuestTorrentImageUpload: boolean;
  allowUserRegister: boolean;
};

export type UploadPolicy = {
  maxAvatarUploadMb: number;
  maxTorrentImageUploadMb: number;
  guestTorrentFileMaxMb: number;
  userTorrentFileMaxMb: number;
  allowGuestTorrentImageUpload: boolean;
};

export type AuthCaptchaPolicy = {
  enableLoginCaptcha: boolean;
  enableRegisterCaptcha: boolean;
};

export type SiteSettings = SiteBranding &
  SiteFeatureFlags &
  UploadPolicy &
  AuthCaptchaPolicy;

export type CaptchaPurpose = "login" | "register";

export type CaptchaChallengeRow = {
  id: string;
  purpose: CaptchaPurpose;
  answer_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  client_ip: string;
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
  uploaderUserId: number | null;
  filePath: string;
};

type CreateTorrentWithMetaInput = InsertTorrentInput & {
  infoHash: string;
  magnetUri: string;
  trackers: Array<{
    tier: number;
    announceUrl: string;
    scrapeUrl: string;
    isPrimary: boolean;
  }>;
  files: Array<{
    path: string;
    sizeBytes: number;
  }>;
  imagePaths: string[];
};

const db = new Database(dbPath, { create: true });

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 10000;

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

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_path TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'banned', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  title_text TEXT NOT NULL DEFAULT 'Sukebei.dl',
  logo_path TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS torrent_trackers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torrent_id INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  announce_url TEXT NOT NULL,
  scrape_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(torrent_id) REFERENCES torrents(id)
);

CREATE TABLE IF NOT EXISTS torrent_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torrent_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY(torrent_id) REFERENCES torrents(id)
);

CREATE TABLE IF NOT EXISTS torrent_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torrent_id INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(torrent_id) REFERENCES torrents(id)
);

CREATE TABLE IF NOT EXISTS captcha_challenges (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK(purpose IN ('login', 'register')),
  answer_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  client_ip TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS offline_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torrent_id INTEGER NOT NULL,
  requested_by_user_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'downloading', 'completed', 'failed', 'expired')),
  qb_hash TEXT NOT NULL DEFAULT '',
  save_path TEXT NOT NULL,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  downloaded_bytes INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  download_speed INTEGER NOT NULL DEFAULT 0,
  eta_seconds INTEGER,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  last_accessed_at TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY(torrent_id) REFERENCES torrents(id),
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS offline_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  torrent_file_id INTEGER,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  is_video INTEGER NOT NULL DEFAULT 0,
  hls_status TEXT NOT NULL DEFAULT 'none' CHECK(hls_status IN ('none', 'pending', 'running', 'ready', 'failed')),
  hls_progress REAL NOT NULL DEFAULT 0,
  hls_variant_count INTEGER NOT NULL DEFAULT 1,
  hls_upgrade_state TEXT NOT NULL DEFAULT 'none' CHECK(hls_upgrade_state IN ('none', 'queued', 'running', 'failed')),
  hls_upgrade_error TEXT NOT NULL DEFAULT '',
  poster_path TEXT NOT NULL DEFAULT '',
  poster_status TEXT NOT NULL DEFAULT 'none' CHECK(poster_status IN ('none', 'queued', 'running', 'ready', 'failed')),
  poster_error TEXT NOT NULL DEFAULT '',
  poster_score REAL NOT NULL DEFAULT 0,
  poster_pick_time REAL NOT NULL DEFAULT 0,
  poster_generated_at TEXT NOT NULL DEFAULT '',
  hls_playlist_path TEXT NOT NULL DEFAULT '',
  hls_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES offline_jobs(id),
  FOREIGN KEY(torrent_file_id) REFERENCES torrent_files(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_torrent_trackers_torrent_id ON torrent_trackers(torrent_id);
CREATE INDEX IF NOT EXISTS idx_torrent_files_torrent_id ON torrent_files(torrent_id);
CREATE INDEX IF NOT EXISTS idx_torrent_images_torrent_id ON torrent_images(torrent_id);
CREATE INDEX IF NOT EXISTS idx_captcha_expires_at ON captcha_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_offline_jobs_torrent_id ON offline_jobs(torrent_id);
CREATE INDEX IF NOT EXISTS idx_offline_jobs_status ON offline_jobs(status);
CREATE INDEX IF NOT EXISTS idx_offline_files_job_id ON offline_files(job_id);
CREATE INDEX IF NOT EXISTS idx_offline_files_hls_status ON offline_files(hls_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_files_job_path_unique ON offline_files(job_id, relative_path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_jobs_active_torrent_unique
  ON offline_jobs(torrent_id)
  WHERE status IN ('queued', 'downloading', 'completed');
`);

function ensureColumn(table: string, column: string, alterSql: string) {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    try {
      db.exec(alterSql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate column name")) {
        throw error;
      }
    }
  }
}

ensureColumn("torrents", "uploader_user_id", "ALTER TABLE torrents ADD COLUMN uploader_user_id INTEGER");
ensureColumn("torrents", "info_hash", "ALTER TABLE torrents ADD COLUMN info_hash TEXT");
ensureColumn("torrents", "magnet_uri", "ALTER TABLE torrents ADD COLUMN magnet_uri TEXT");
ensureColumn("torrents", "status", "ALTER TABLE torrents ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
ensureColumn("torrents", "tracker_last_checked_at", "ALTER TABLE torrents ADD COLUMN tracker_last_checked_at TEXT");
ensureColumn("torrents", "tracker_source", "ALTER TABLE torrents ADD COLUMN tracker_source TEXT");
ensureColumn("torrents", "tracker_state", "ALTER TABLE torrents ADD COLUMN tracker_state TEXT NOT NULL DEFAULT 'pending'");
ensureColumn("torrents", "deleted_at", "ALTER TABLE torrents ADD COLUMN deleted_at TEXT");
ensureColumn("torrents", "deleted_by_user_id", "ALTER TABLE torrents ADD COLUMN deleted_by_user_id INTEGER");
ensureColumn("torrents", "assets_cleaned_at", "ALTER TABLE torrents ADD COLUMN assets_cleaned_at TEXT");
ensureColumn("torrents", "updated_at", "ALTER TABLE torrents ADD COLUMN updated_at TEXT");
ensureColumn(
  "site_settings",
  "allow_guest_upload",
  "ALTER TABLE site_settings ADD COLUMN allow_guest_upload INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "site_settings",
  "allow_user_delete_torrent",
  "ALTER TABLE site_settings ADD COLUMN allow_user_delete_torrent INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "site_settings",
  "enable_login_captcha",
  "ALTER TABLE site_settings ADD COLUMN enable_login_captcha INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "site_settings",
  "enable_register_captcha",
  "ALTER TABLE site_settings ADD COLUMN enable_register_captcha INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "site_settings",
  "max_avatar_upload_mb",
  "ALTER TABLE site_settings ADD COLUMN max_avatar_upload_mb INTEGER NOT NULL DEFAULT 2",
);
ensureColumn(
  "site_settings",
  "max_torrent_image_upload_mb",
  "ALTER TABLE site_settings ADD COLUMN max_torrent_image_upload_mb INTEGER NOT NULL DEFAULT 2",
);
ensureColumn(
  "site_settings",
  "allow_guest_torrent_image_upload",
  "ALTER TABLE site_settings ADD COLUMN allow_guest_torrent_image_upload INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "site_settings",
  "guest_torrent_file_max_mb",
  "ALTER TABLE site_settings ADD COLUMN guest_torrent_file_max_mb INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "site_settings",
  "user_torrent_file_max_mb",
  "ALTER TABLE site_settings ADD COLUMN user_torrent_file_max_mb INTEGER NOT NULL DEFAULT 10",
);
ensureColumn(
  "site_settings",
  "allow_user_register",
  "ALTER TABLE site_settings ADD COLUMN allow_user_register INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "offline_files",
  "hls_progress",
  "ALTER TABLE offline_files ADD COLUMN hls_progress REAL NOT NULL DEFAULT 0",
);
ensureColumn(
  "offline_files",
  "hls_variant_count",
  "ALTER TABLE offline_files ADD COLUMN hls_variant_count INTEGER NOT NULL DEFAULT 1",
);
ensureColumn(
  "offline_files",
  "hls_upgrade_state",
  "ALTER TABLE offline_files ADD COLUMN hls_upgrade_state TEXT NOT NULL DEFAULT 'none'",
);
ensureColumn(
  "offline_files",
  "hls_upgrade_error",
  "ALTER TABLE offline_files ADD COLUMN hls_upgrade_error TEXT NOT NULL DEFAULT ''",
);
ensureColumn(
  "offline_files",
  "poster_path",
  "ALTER TABLE offline_files ADD COLUMN poster_path TEXT NOT NULL DEFAULT ''",
);
ensureColumn(
  "offline_files",
  "poster_status",
  "ALTER TABLE offline_files ADD COLUMN poster_status TEXT NOT NULL DEFAULT 'none'",
);
ensureColumn(
  "offline_files",
  "poster_error",
  "ALTER TABLE offline_files ADD COLUMN poster_error TEXT NOT NULL DEFAULT ''",
);
ensureColumn(
  "offline_files",
  "poster_score",
  "ALTER TABLE offline_files ADD COLUMN poster_score REAL NOT NULL DEFAULT 0",
);
ensureColumn(
  "offline_files",
  "poster_pick_time",
  "ALTER TABLE offline_files ADD COLUMN poster_pick_time REAL NOT NULL DEFAULT 0",
);
ensureColumn(
  "offline_files",
  "poster_generated_at",
  "ALTER TABLE offline_files ADD COLUMN poster_generated_at TEXT NOT NULL DEFAULT ''",
);

db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_torrents_info_hash_unique ON torrents(info_hash) WHERE status = 'active' AND info_hash IS NOT NULL AND info_hash != ''",
);
db.exec("CREATE INDEX IF NOT EXISTS idx_offline_files_poster_status ON offline_files(poster_status)");

const settingsExists = db.query("SELECT id FROM site_settings WHERE id = 1").get() as { id: number } | null;
if (!settingsExists) {
  db.query(
    "INSERT INTO site_settings (id, title_text, logo_path, allow_guest_upload, allow_user_delete_torrent, enable_login_captcha, enable_register_captcha, max_avatar_upload_mb, max_torrent_image_upload_mb, allow_guest_torrent_image_upload, guest_torrent_file_max_mb, user_torrent_file_max_mb, allow_user_register, updated_at) VALUES (1, 'Sukebei.dl', '', 1, 1, 1, 1, 2, 2, 1, 1, 10, 1, ?)",
  ).run(new Date().toISOString());
}

seedTorrentsIfNeeded();
cleanupExpiredSessions();
bootstrapAdminUser();

function seedTorrentsIfNeeded() {
  const seedCount = db.query("SELECT COUNT(1) AS count FROM torrents").get() as { count: number };
  if (seedCount.count > 0) {
    return;
  }

  const seedRows = [
    ["[SubDesu] 咒术回战 - S2E14 [1080p] [HEVC]", "动画", 1503238554, "1.4 GiB", "1080p,HEVC", "默认示例数据", 2402, 124, 582, "2026-03-02 11:00:00", 1, 1, "system", 0, null, "samples/sample-1.torrent", "active", "2026-03-02 11:00:00"],
    ["(Hi-Res) 宇多田光 - Science Fiction [FLAC 24bit/96kHz]", "音乐", 933232640, "890 MiB", "FLAC,Hi-Res", "默认示例数据", 156, 12, 45, "2026-03-02 08:00:00", 0, 1, "system", 0, null, "samples/sample-2.torrent", "active", "2026-03-02 08:00:00"],
    ["奥本海默 (2023) [2160p] [4K] [HDR] [x265]", "电影", 19756849562, "18.4 GiB", "4K,HDR,x265", "默认示例数据", 5892, 845, 2100, "2026-03-01 23:00:00", 1, 1, "system", 0, null, "samples/sample-3.torrent", "active", "2026-03-01 23:00:00"],
    ["博德之门 3 - 豪华版 [v4.1.1.3622274] + DLCs", "游戏", 130996502528, "122 GiB", "RPG,DLC", "默认示例数据", 1203, 450, 890, "2026-03-01 10:00:00", 0, 1, "system", 0, null, "samples/sample-4.torrent", "active", "2026-03-01 10:00:00"],
    ["设计系统手册 (2024版) - PDF/EPUB", "书籍", 47185920, "45 MiB", "PDF,EPUB", "默认示例数据", 88, 2, 12, "2026-03-01 09:00:00", 0, 1, "system", 0, null, "samples/sample-5.torrent", "active", "2026-03-01 09:00:00"],
  ] as const;

  const stmt = db.query(`
    INSERT INTO torrents (
      name, category, size_bytes, size_display, tags, description,
      seeds, leechers, completed, created_at, is_trusted, is_free_download,
      uploader_name, is_anonymous, uploader_user_id, file_path, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of seedRows) {
    stmt.run(...row);
  }
}

function cleanupExpiredSessions() {
  db.query("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run();
}

function bootstrapAdminUser() {
  const username = (process.env.ADMIN_USERNAME ?? "").trim();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!username || !password) {
    return;
  }

  const passwordErr = validatePasswordStrength(password);
  if (passwordErr) {
    console.warn(`ADMIN_PASSWORD 不符合安全策略: ${passwordErr}`);
    return;
  }

  const existing = getUserByUsername(username);
  if (existing) {
    if (existing.role !== "admin" || existing.status !== "active") {
      db.query(
        "UPDATE users SET role = 'admin', status = 'active', updated_at = ? WHERE id = ?",
      ).run(new Date().toISOString(), existing.id);
    }
    return;
  }

  createUser({ username, passwordHash: hashPassword(password), role: "admin" });
}

function splitTags(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function addDaysIso(baseIso: string, days: number) {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
  return new Date(Date.parse(baseIso) + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

export function expireOfflineJobsByNow(nowIso = new Date().toISOString()) {
  db.query(
    "UPDATE offline_jobs SET status = 'expired', updated_at = ? WHERE status = 'completed' AND expires_at IS NOT NULL AND expires_at <= ?",
  ).run(nowIso, nowIso);
}

export function listTorrents(params: { q?: string; category?: string; limit?: number } = {}) {
  const q = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 300);

  const rows = db
    .query(`
      SELECT *
      FROM torrents
      WHERE status = 'active'
        AND ($q = '' OR name LIKE '%' || $q || '%' OR tags LIKE '%' || $q || '%')
        AND ($category = '' OR category = $category)
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT $limit
    `)
    .all({ $q: q, $category: category, $limit: limit });

  return rows as TorrentRow[];
}

export function listCategoryStats() {
  const rows = db
    .query(`
      SELECT category, COUNT(1) AS count
      FROM torrents
      WHERE status = 'active'
      GROUP BY category
    `)
    .all() as Array<{ category: string; count: number }>;

  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.category, row.count));

  const ordered: Array<{ category: string; count: number }> = TORRENT_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
  const knownCategories = new Set<string>(TORRENT_CATEGORIES);

  rows.forEach((row) => {
    if (knownCategories.has(row.category)) {
      return;
    }
    ordered.push({
      category: row.category,
      count: row.count,
    });
  });

  return ordered;
}

export function listTagStats() {
  const rows = db
    .query(`
      SELECT tags
      FROM torrents
      WHERE status = 'active'
        AND tags != ''
    `)
    .all() as Array<{ tags: string }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    const uniqueTags = new Set(splitTags(row.tags));
    uniqueTags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.tag.localeCompare(b.tag, "zh-CN");
    });
}

export function listTorrentsByTag(tag: string, limit = 120) {
  const target = tag.trim();
  if (!target) {
    return [] as TorrentRow[];
  }

  const rows = db
    .query(`
      SELECT *
      FROM torrents
      WHERE status = 'active'
      ORDER BY datetime(created_at) DESC, id DESC
    `)
    .all() as TorrentRow[];

  const matched = rows.filter((row) => splitTags(row.tags).some((item) => item === target));
  const safeLimit = Math.min(Math.max(limit, 1), 300);
  return matched.slice(0, safeLimit);
}

export function listMyTorrents(userId: number) {
  const rows = db
    .query(`
      SELECT *
      FROM torrents
      WHERE uploader_user_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 500
    `)
    .all(userId);

  return rows as TorrentRow[];
}

export function listAdminTorrents(params: { q?: string; uploader?: string; status?: string } = {}) {
  const q = params.q?.trim() ?? "";
  const uploader = params.uploader?.trim() ?? "";
  const status = params.status?.trim() ?? "";

  const rows = db
    .query(`
      SELECT
        t.*,
        COALESCE(u.username, t.uploader_name) AS uploader_display
      FROM torrents t
      LEFT JOIN users u ON u.id = t.uploader_user_id
      WHERE ($q = '' OR t.name LIKE '%' || $q || '%' OR t.tags LIKE '%' || $q || '%')
        AND ($uploader = '' OR COALESCE(u.username, t.uploader_name) LIKE '%' || $uploader || '%')
        AND ($status = '' OR t.status = $status)
      ORDER BY datetime(t.created_at) DESC, t.id DESC
      LIMIT 500
    `)
    .all({ $q: q, $uploader: uploader, $status: status });

  return rows as Array<TorrentRow & { uploader_display: string }>;
}

export function getTorrentById(id: number) {
  const row = db.query("SELECT * FROM torrents WHERE id = ? LIMIT 1").get(id);
  return (row as TorrentRow | null) ?? null;
}

export function getTorrentByInfoHash(infoHash: string) {
  const row = db.query("SELECT * FROM torrents WHERE info_hash = ? LIMIT 1").get(infoHash);
  return (row as TorrentRow | null) ?? null;
}

export function getActiveTorrentByInfoHash(infoHash: string) {
  const row = db.query("SELECT * FROM torrents WHERE info_hash = ? AND status = 'active' LIMIT 1").get(infoHash);
  return (row as TorrentRow | null) ?? null;
}

export function getTorrentDetailById(id: number) {
  const torrent = getTorrentById(id);
  if (!torrent) {
    return null;
  }

  const trackers = db
    .query("SELECT * FROM torrent_trackers WHERE torrent_id = ? ORDER BY tier ASC, id ASC")
    .all(id) as TorrentTrackerRow[];
  const files = db
    .query("SELECT * FROM torrent_files WHERE torrent_id = ? ORDER BY sort_order ASC, id ASC")
    .all(id) as TorrentFileRow[];
  const images = db
    .query("SELECT * FROM torrent_images WHERE torrent_id = ? ORDER BY sort_order ASC, id ASC")
    .all(id) as TorrentImageRow[];

  return {
    torrent,
    trackers,
    files,
    images,
  } as TorrentDetail;
}

export function getOfflineJobById(jobId: number) {
  expireOfflineJobsByNow();
  const row = db.query("SELECT * FROM offline_jobs WHERE id = ? LIMIT 1").get(jobId);
  return (row as OfflineJobRow | null) ?? null;
}

export function getLatestOfflineJobByTorrentId(torrentId: number) {
  expireOfflineJobsByNow();
  const row = db
    .query(
      "SELECT * FROM offline_jobs WHERE torrent_id = ? AND status != 'expired' ORDER BY id DESC LIMIT 1",
    )
    .get(torrentId);
  return (row as OfflineJobRow | null) ?? null;
}

export function getActiveOfflineJobByTorrentId(torrentId: number) {
  expireOfflineJobsByNow();
  const row = db
    .query(
      "SELECT * FROM offline_jobs WHERE torrent_id = ? AND status IN ('queued', 'downloading', 'completed') ORDER BY id DESC LIMIT 1",
    )
    .get(torrentId);
  return (row as OfflineJobRow | null) ?? null;
}

export function listOfflineFilesByJobId(jobId: number) {
  const rows = db
    .query("SELECT * FROM offline_files WHERE job_id = ? ORDER BY id ASC")
    .all(jobId) as OfflineFileRow[];
  return rows;
}

export function getOfflineJobDetailByTorrentId(torrentId: number): OfflineJobDetail | null {
  const job = getLatestOfflineJobByTorrentId(torrentId);
  if (!job) {
    return null;
  }
  const files = listOfflineFilesByJobId(job.id);
  return { job, files };
}

export function createOfflineJob(input: {
  torrentId: number;
  requestedByUserId: number;
  savePath: string;
  retentionDays: number;
}) {
  const now = new Date().toISOString();
  expireOfflineJobsByNow(now);

  const tx = db.transaction(() => {
    const existing = db
      .query(
        "SELECT * FROM offline_jobs WHERE torrent_id = ? AND status IN ('queued', 'downloading', 'completed') ORDER BY id DESC LIMIT 1",
      )
      .get(input.torrentId) as OfflineJobRow | null;

    if (existing) {
      return { created: false, job: existing };
    }

    const expiresAt = addDaysIso(now, input.retentionDays);

    db.query(
      `
      INSERT INTO offline_jobs (
        torrent_id,
        requested_by_user_id,
        status,
        qb_hash,
        save_path,
        total_bytes,
        downloaded_bytes,
        progress,
        download_speed,
        eta_seconds,
        error_message,
        created_at,
        updated_at,
        completed_at,
        last_accessed_at,
        expires_at
      ) VALUES (?, ?, 'queued', '', ?, 0, 0, 0, 0, NULL, '', ?, ?, NULL, ?, ?)
      `,
    ).run(input.torrentId, input.requestedByUserId, input.savePath, now, now, now, expiresAt);

    const row = db.query("SELECT last_insert_rowid() AS id").get() as { id: number };
    const job = db.query("SELECT * FROM offline_jobs WHERE id = ? LIMIT 1").get(row.id) as OfflineJobRow;

    return { created: true, job };
  });

  return tx();
}

export function countOfflineDownloadingJobs() {
  const row = db
    .query("SELECT COUNT(1) AS count FROM offline_jobs WHERE status = 'downloading'")
    .get() as { count: number };
  return row.count;
}

export function listQueuedOfflineJobs(limit = 20) {
  const rows = db
    .query(
      `
      SELECT
        j.*,
        t.name AS torrent_name,
        t.info_hash AS torrent_info_hash,
        t.magnet_uri AS torrent_magnet_uri,
        t.status AS torrent_status
      FROM offline_jobs j
      JOIN torrents t ON t.id = j.torrent_id
      WHERE j.status = 'queued'
      ORDER BY datetime(j.created_at) ASC, j.id ASC
      LIMIT ?
      `,
    )
    .all(limit);

  return rows as Array<
    OfflineJobRow & {
      torrent_name: string;
      torrent_info_hash: string | null;
      torrent_magnet_uri: string | null;
      torrent_status: TorrentStatus;
    }
  >;
}

export function listDownloadingOfflineJobs(limit = 200) {
  const rows = db
    .query(
      `
      SELECT
        j.*,
        t.name AS torrent_name,
        t.info_hash AS torrent_info_hash,
        t.magnet_uri AS torrent_magnet_uri,
        t.status AS torrent_status
      FROM offline_jobs j
      JOIN torrents t ON t.id = j.torrent_id
      WHERE j.status = 'downloading'
      ORDER BY datetime(j.updated_at) ASC, j.id ASC
      LIMIT ?
      `,
    )
    .all(limit);

  return rows as Array<
    OfflineJobRow & {
      torrent_name: string;
      torrent_info_hash: string | null;
      torrent_magnet_uri: string | null;
      torrent_status: TorrentStatus;
    }
  >;
}

export function markOfflineJobDownloading(jobId: number, qbHash: string) {
  const now = new Date().toISOString();
  const result = db
    .query(
      "UPDATE offline_jobs SET status = 'downloading', qb_hash = ?, updated_at = ?, error_message = '' WHERE id = ? AND status = 'queued'",
    )
    .run(qbHash, now, jobId);
  return result.changes > 0;
}

export function updateOfflineJobProgress(
  jobId: number,
  input: {
    totalBytes: number;
    downloadedBytes: number;
    progress: number;
    downloadSpeed: number;
    etaSeconds: number | null;
  },
) {
  const now = new Date().toISOString();
  db.query(
    "UPDATE offline_jobs SET total_bytes = ?, downloaded_bytes = ?, progress = ?, download_speed = ?, eta_seconds = ?, updated_at = ? WHERE id = ?",
  ).run(
    Math.max(0, Math.floor(input.totalBytes)),
    Math.max(0, Math.floor(input.downloadedBytes)),
    Math.max(0, Math.min(1, input.progress)),
    Math.max(0, Math.floor(input.downloadSpeed)),
    input.etaSeconds !== null ? Math.max(0, Math.floor(input.etaSeconds)) : null,
    now,
    jobId,
  );
}

export function markOfflineJobCompleted(
  jobId: number,
  input: {
    totalBytes: number;
    downloadedBytes: number;
    retentionDays: number;
  },
) {
  const now = new Date().toISOString();
  const expiresAt = addDaysIso(now, input.retentionDays);
  db.query(
    "UPDATE offline_jobs SET status = 'completed', total_bytes = ?, downloaded_bytes = ?, progress = 1, download_speed = 0, eta_seconds = 0, error_message = '', completed_at = ?, updated_at = ?, last_accessed_at = ?, expires_at = ? WHERE id = ?",
  ).run(
    Math.max(0, Math.floor(input.totalBytes)),
    Math.max(0, Math.floor(input.downloadedBytes)),
    now,
    now,
    now,
    expiresAt,
    jobId,
  );
}

export function markOfflineJobFailed(jobId: number, message: string) {
  const now = new Date().toISOString();
  db.query(
    "UPDATE offline_jobs SET status = 'failed', error_message = ?, download_speed = 0, eta_seconds = NULL, updated_at = ? WHERE id = ?",
  ).run(message.slice(0, 300), now, jobId);
}

export function touchOfflineJobAccess(jobId: number, retentionDays: number) {
  const now = new Date().toISOString();
  const expiresAt = addDaysIso(now, retentionDays);
  db.query("UPDATE offline_jobs SET last_accessed_at = ?, expires_at = ?, updated_at = ? WHERE id = ?").run(
    now,
    expiresAt,
    now,
    jobId,
  );
}

export function getOfflineFileById(fileId: number) {
  const row = db.query("SELECT * FROM offline_files WHERE id = ? LIMIT 1").get(fileId);
  return (row as OfflineFileRow | null) ?? null;
}

export function getOfflineFileWithJob(fileId: number) {
  expireOfflineJobsByNow();
  const row = db
    .query(
      `
      SELECT
        f.*,
        j.status AS job_status,
        j.expires_at AS job_expires_at,
        j.torrent_id AS job_torrent_id
      FROM offline_files f
      JOIN offline_jobs j ON j.id = f.job_id
      WHERE f.id = ?
      LIMIT 1
      `,
    )
    .get(fileId);

  return (
    row as
      | (OfflineFileRow & {
          job_status: OfflineJobStatus;
          job_expires_at: string | null;
          job_torrent_id: number;
        })
      | null
  );
}

export function replaceOfflineFiles(
  jobId: number,
  files: Array<{
    torrentFileId: number | null;
    relativePath: string;
    sizeBytes: number;
    mimeType: string;
    isVideo: boolean;
  }>,
) {
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.query("DELETE FROM offline_files WHERE job_id = ?").run(jobId);

    const stmt = db.query(
      "INSERT INTO offline_files (job_id, torrent_file_id, relative_path, size_bytes, mime_type, is_video, hls_status, hls_progress, hls_variant_count, hls_upgrade_state, hls_upgrade_error, poster_path, poster_status, poster_error, poster_score, poster_pick_time, poster_generated_at, hls_playlist_path, hls_error, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, 'none', 0, 1, 'none', '', '', 'none', '', 0, 0, '', '', '', ?, ?, ?)",
    );

    files.forEach((file) => {
      stmt.run(
        jobId,
        file.torrentFileId,
        file.relativePath,
        Math.max(0, Math.floor(file.sizeBytes)),
        file.mimeType,
        file.isVideo ? 1 : 0,
        now,
        now,
        now,
      );
    });
  });

  tx();
}

export function touchOfflineFileAccess(fileId: number) {
  const now = new Date().toISOString();
  db.query("UPDATE offline_files SET last_accessed_at = ?, updated_at = ? WHERE id = ?").run(now, now, fileId);
}

export function markOfflineFileHlsStatus(
  fileId: number,
  input: {
    status: HlsStatus;
    playlistPath?: string;
    error?: string;
  },
) {
  const now = new Date().toISOString();
  const playlistPath = input.playlistPath ?? "";
  const error = input.error ?? "";
  db.query(
    "UPDATE offline_files SET hls_status = ?, hls_playlist_path = ?, hls_error = ?, updated_at = ? WHERE id = ?",
  ).run(input.status, playlistPath, error.slice(0, 300), now, fileId);
}

export function updateOfflineFileHlsProgress(fileId: number, progress: number) {
  const now = new Date().toISOString();
  db.query("UPDATE offline_files SET hls_progress = ?, updated_at = ? WHERE id = ?").run(
    Math.max(0, Math.min(1, progress)),
    now,
    fileId,
  );
}

export function updateOfflineFileVariantCount(fileId: number, variantCount: number) {
  const now = new Date().toISOString();
  db.query("UPDATE offline_files SET hls_variant_count = ?, updated_at = ? WHERE id = ?").run(
    Math.max(1, Math.floor(variantCount)),
    now,
    fileId,
  );
}

export function setOfflineFileUpgradeState(fileId: number, state: HlsUpgradeState, error = "") {
  const now = new Date().toISOString();
  db.query("UPDATE offline_files SET hls_upgrade_state = ?, hls_upgrade_error = ?, updated_at = ? WHERE id = ?").run(
    state,
    error.slice(0, 300),
    now,
    fileId,
  );
}

export function queueOfflineFileUpgrade(fileId: number) {
  const now = new Date().toISOString();
  const result = db.query(
    "UPDATE offline_files SET hls_upgrade_state = 'queued', hls_upgrade_error = '', updated_at = ? WHERE id = ? AND is_video = 1 AND hls_status = 'ready' AND hls_variant_count <= 1 AND hls_upgrade_state IN ('none', 'failed')",
  ).run(now, fileId);
  return result.changes > 0;
}

export function queueOfflineFilePoster(fileId: number, options?: { force?: boolean }) {
  const now = new Date().toISOString();
  const force = options?.force === true;
  const result = force
    ? db
        .query(
          "UPDATE offline_files SET poster_status = 'queued', poster_error = '', poster_score = 0, poster_pick_time = 0, poster_generated_at = '', updated_at = ? WHERE id = ? AND is_video = 1 AND hls_status = 'ready'",
        )
        .run(now, fileId)
    : db
        .query(
          "UPDATE offline_files SET poster_status = 'queued', poster_error = '', poster_score = 0, poster_pick_time = 0, poster_generated_at = '', updated_at = ? WHERE id = ? AND is_video = 1 AND hls_status = 'ready' AND (poster_path = '' OR poster_status IN ('none', 'failed'))",
        )
        .run(now, fileId);
  return result.changes > 0;
}

export function claimQueuedOfflineFilePoster(fileId: number) {
  const now = new Date().toISOString();
  const result = db.query(
    "UPDATE offline_files SET poster_status = 'running', poster_error = '', updated_at = ? WHERE id = ? AND poster_status = 'queued' AND hls_status = 'ready' AND is_video = 1",
  ).run(now, fileId);
  return result.changes > 0;
}

export function setOfflineFilePosterState(
  fileId: number,
  input: {
    status: PosterStatus;
    posterPath?: string;
    error?: string;
    score?: number;
    pickTime?: number;
  },
) {
  const now = new Date().toISOString();
  const generatedAt = input.status === "ready" ? now : "";
  const score = Number.isFinite(input.score) ? Math.max(0, Number(input.score)) : 0;
  const pickTime = Number.isFinite(input.pickTime) ? Math.max(0, Number(input.pickTime)) : 0;
  db.query(
    "UPDATE offline_files SET poster_status = ?, poster_path = ?, poster_error = ?, poster_score = ?, poster_pick_time = ?, poster_generated_at = ?, updated_at = ? WHERE id = ?",
  ).run(
    input.status,
    (input.posterPath ?? "").slice(0, 400),
    (input.error ?? "").slice(0, 300),
    score,
    pickTime,
    generatedAt,
    now,
    fileId,
  );
}

export function claimQueuedOfflineFileUpgrade(fileId: number) {
  const now = new Date().toISOString();
  const result = db.query(
    "UPDATE offline_files SET hls_upgrade_state = 'running', hls_upgrade_error = '', updated_at = ? WHERE id = ? AND hls_upgrade_state = 'queued' AND hls_status = 'ready'",
  ).run(now, fileId);
  return result.changes > 0;
}

export function listPendingHlsOfflineFiles(limit = 10) {
  const rows = db
    .query(
      `
      SELECT
        f.*,
        j.status AS job_status,
        j.expires_at AS job_expires_at
      FROM offline_files f
      JOIN offline_jobs j ON j.id = f.job_id
      WHERE f.hls_status = 'pending'
        AND f.is_video = 1
        AND j.status = 'completed'
      ORDER BY datetime(f.updated_at) ASC, f.id ASC
      LIMIT ?
      `,
    )
    .all(limit);

  return rows as Array<
    OfflineFileRow & {
      job_status: OfflineJobStatus;
      job_expires_at: string | null;
    }
  >;
}

export function listQueuedOfflineFileUpgrades(limit = 10) {
  const rows = db
    .query(
      `
      SELECT
        f.*,
        j.status AS job_status,
        j.expires_at AS job_expires_at
      FROM offline_files f
      JOIN offline_jobs j ON j.id = f.job_id
      WHERE f.is_video = 1
        AND f.hls_status = 'ready'
        AND f.hls_variant_count <= 1
        AND f.hls_upgrade_state = 'queued'
        AND j.status = 'completed'
      ORDER BY datetime(f.updated_at) ASC, f.id ASC
      LIMIT ?
      `,
    )
    .all(limit);

  return rows as Array<
    OfflineFileRow & {
      job_status: OfflineJobStatus;
      job_expires_at: string | null;
    }
  >;
}

export function listQueuedOfflineFilePosters(limit = 10) {
  const rows = db
    .query(
      `
      SELECT
        f.*,
        j.status AS job_status,
        j.expires_at AS job_expires_at
      FROM offline_files f
      JOIN offline_jobs j ON j.id = f.job_id
      WHERE f.is_video = 1
        AND f.hls_status = 'ready'
        AND f.poster_status = 'queued'
        AND j.status = 'completed'
      ORDER BY datetime(f.updated_at) ASC, f.id ASC
      LIMIT ?
      `,
    )
    .all(limit);

  return rows as Array<
    OfflineFileRow & {
      job_status: OfflineJobStatus;
      job_expires_at: string | null;
    }
  >;
}

export function listExpiredOfflineJobs(nowIso: string) {
  const rows = db
    .query(
      `
      SELECT *
      FROM offline_jobs
      WHERE status IN ('completed', 'expired')
        AND expires_at IS NOT NULL
        AND expires_at <= ?
      ORDER BY datetime(expires_at) ASC, id ASC
      `,
    )
    .all(nowIso);

  return rows as OfflineJobRow[];
}

export function markOfflineJobExpired(jobId: number) {
  const now = new Date().toISOString();
  db.query(
    "UPDATE offline_jobs SET status = 'expired', updated_at = ?, download_speed = 0, eta_seconds = NULL WHERE id = ?",
  ).run(now, jobId);
}

export function insertTorrent(input: InsertTorrentInput) {
  const now = new Date().toISOString();
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
      uploader_user_id,
      file_path,
      is_trusted,
      is_free_download,
      status,
      updated_at
    ) VALUES (
      $name,
      $category,
      $sizeBytes,
      $sizeDisplay,
      $tags,
      $description,
      $uploaderName,
      $isAnonymous,
      $uploaderUserId,
      $filePath,
      0,
      1,
      'active',
      $updatedAt
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
    $uploaderUserId: input.uploaderUserId,
    $filePath: input.filePath,
    $updatedAt: now,
  });
}

export function createTorrentWithMeta(input: CreateTorrentWithMetaInput) {
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
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
        uploader_user_id,
        file_path,
        is_trusted,
        is_free_download,
        info_hash,
        magnet_uri,
        status,
        tracker_state,
        tracker_source,
        updated_at
      ) VALUES (
        $name,
        $category,
        $sizeBytes,
        $sizeDisplay,
        $tags,
        $description,
        $uploaderName,
        $isAnonymous,
        $uploaderUserId,
        $filePath,
        0,
        1,
        $infoHash,
        $magnetUri,
        'active',
        'pending',
        $trackerSource,
        $updatedAt
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
      $uploaderUserId: input.uploaderUserId,
      $filePath: input.filePath,
      $infoHash: input.infoHash,
      $magnetUri: input.magnetUri,
      $trackerSource: input.trackers[0]?.announceUrl ?? "",
      $updatedAt: now,
    });

    const row = db.query("SELECT last_insert_rowid() AS id").get() as { id: number };
    const torrentId = row.id;

    const trackerStmt = db.query(`
      INSERT INTO torrent_trackers (
        torrent_id, tier, announce_url, scrape_url, is_primary, last_checked_at, last_error
      ) VALUES (?, ?, ?, ?, ?, NULL, '')
    `);
    input.trackers.forEach((tracker) => {
      trackerStmt.run(
        torrentId,
        tracker.tier,
        tracker.announceUrl,
        tracker.scrapeUrl,
        tracker.isPrimary ? 1 : 0,
      );
    });

    const fileStmt = db.query(
      "INSERT INTO torrent_files (torrent_id, file_path, file_size_bytes, sort_order) VALUES (?, ?, ?, ?)",
    );
    input.files.forEach((file, index) => {
      fileStmt.run(torrentId, file.path, file.sizeBytes, index + 1);
    });

    const imageStmt = db.query(
      "INSERT INTO torrent_images (torrent_id, image_path, sort_order, created_at) VALUES (?, ?, ?, ?)",
    );
    input.imagePaths.forEach((imagePath, index) => {
      imageStmt.run(torrentId, imagePath, index + 1, now);
    });

    return torrentId;
  });

  return tx();
}

export function updateTorrentByOwner(
  torrentId: number,
  ownerUserId: number,
  input: {
    name: string;
    tags: string[];
    description: string;
  },
) {
  const result = db.query(
    "UPDATE torrents SET name = ?, tags = ?, description = ?, updated_at = ? WHERE id = ? AND uploader_user_id = ? AND status = 'active'",
  ).run(input.name, input.tags.join(","), input.description, new Date().toISOString(), torrentId, ownerUserId);

  return result.changes > 0;
}

export function updateTorrentAsAdmin(
  torrentId: number,
  input: {
    name: string;
    tags: string[];
    description: string;
  },
) {
  const result = db.query(
    "UPDATE torrents SET name = ?, tags = ?, description = ?, updated_at = ? WHERE id = ?",
  ).run(input.name, input.tags.join(","), input.description, new Date().toISOString(), torrentId);

  return result.changes > 0;
}

export function addTorrentImages(torrentId: number, imagePaths: string[]) {
  if (imagePaths.length === 0) {
    return;
  }

  const row = db
    .query("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM torrent_images WHERE torrent_id = ?")
    .get(torrentId) as { max_sort: number };

  const start = row.max_sort ?? 0;
  const now = new Date().toISOString();

  const stmt = db.query(
    "INSERT INTO torrent_images (torrent_id, image_path, sort_order, created_at) VALUES (?, ?, ?, ?)",
  );
  imagePaths.forEach((img, index) => {
    stmt.run(torrentId, img, start + index + 1, now);
  });
}

export function deleteTorrentImagesByIds(torrentId: number, imageIds: number[]) {
  if (imageIds.length === 0) {
    return;
  }

  const placeholders = imageIds.map(() => "?").join(",");
  db.query(`DELETE FROM torrent_images WHERE torrent_id = ? AND id IN (${placeholders})`).run(
    torrentId,
    ...imageIds,
  );
}

export function listTorrentImages(torrentId: number) {
  return db
    .query("SELECT * FROM torrent_images WHERE torrent_id = ? ORDER BY sort_order ASC, id ASC")
    .all(torrentId) as TorrentImageRow[];
}

export function softDeleteTorrent(torrentId: number, deletedByUserId: number | null, mode: "user" | "admin") {
  const status: TorrentStatus = mode === "admin" ? "deleted_admin" : "deleted_user";
  const now = new Date().toISOString();

  const result = db.query(
    "UPDATE torrents SET status = ?, deleted_at = ?, deleted_by_user_id = ?, assets_cleaned_at = NULL, updated_at = ? WHERE id = ? AND status = 'active'",
  ).run(status, now, deletedByUserId, now, torrentId);

  return result.changes > 0;
}

export function listDeletedTorrentCleanupCandidates(retentionDays: number) {
  const safeDays = Number.isFinite(retentionDays) && retentionDays >= 0 ? Math.floor(retentionDays) : 0;
  const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = db
    .query(
      `
      SELECT id, file_path, deleted_at
      FROM torrents
      WHERE status IN ('deleted_user', 'deleted_admin')
        AND deleted_at IS NOT NULL
        AND deleted_at <= $cutoffIso
        AND assets_cleaned_at IS NULL
        AND (
          file_path != ''
          OR EXISTS (SELECT 1 FROM torrent_images WHERE torrent_id = torrents.id)
        )
      `,
    )
    .all({ $cutoffIso: cutoffIso });

  return rows as Array<{ id: number; file_path: string; deleted_at: string }>;
}

export function markTorrentAssetsCleaned(torrentId: number) {
  const now = new Date().toISOString();
  db.query("UPDATE torrents SET file_path = '', assets_cleaned_at = ?, updated_at = ? WHERE id = ?").run(
    now,
    now,
    torrentId,
  );
  db.query("DELETE FROM torrent_images WHERE torrent_id = ?").run(torrentId);
}

export function getTorrentsNeedingMetaBackfill(limit = 200) {
  const rows = db
    .query(
      "SELECT * FROM torrents WHERE status = 'active' AND file_path != '' AND (info_hash IS NULL OR info_hash = '' OR magnet_uri IS NULL OR magnet_uri = '') ORDER BY id ASC LIMIT ?",
    )
    .all(limit);

  return rows as TorrentRow[];
}

export function upsertTorrentMetaForExisting(
  torrentId: number,
  input: {
    infoHash: string;
    magnetUri: string;
    trackers: Array<{
      tier: number;
      announceUrl: string;
      scrapeUrl: string;
      isPrimary: boolean;
    }>;
    files: Array<{
      path: string;
      sizeBytes: number;
    }>;
  },
) {
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.query(
      "UPDATE torrents SET info_hash = ?, magnet_uri = ?, tracker_source = ?, updated_at = ? WHERE id = ?",
    ).run(input.infoHash, input.magnetUri, input.trackers[0]?.announceUrl ?? "", now, torrentId);

    db.query("DELETE FROM torrent_trackers WHERE torrent_id = ?").run(torrentId);
    db.query("DELETE FROM torrent_files WHERE torrent_id = ?").run(torrentId);

    const trackerStmt = db.query(
      "INSERT INTO torrent_trackers (torrent_id, tier, announce_url, scrape_url, is_primary, last_checked_at, last_error) VALUES (?, ?, ?, ?, ?, NULL, '')",
    );
    input.trackers.forEach((tracker) => {
      trackerStmt.run(
        torrentId,
        tracker.tier,
        tracker.announceUrl,
        tracker.scrapeUrl,
        tracker.isPrimary ? 1 : 0,
      );
    });

    const fileStmt = db.query(
      "INSERT INTO torrent_files (torrent_id, file_path, file_size_bytes, sort_order) VALUES (?, ?, ?, ?)",
    );
    input.files.forEach((file, index) => {
      fileStmt.run(torrentId, file.path, file.sizeBytes, index + 1);
    });
  });

  tx();
}

export function listTrackersByTorrentId(torrentId: number) {
  return db
    .query("SELECT * FROM torrent_trackers WHERE torrent_id = ? ORDER BY tier ASC, id ASC")
    .all(torrentId) as TorrentTrackerRow[];
}

export function listTrackerRefreshCandidates(limit = 60) {
  const rows = db
    .query(`
      SELECT
        id,
        name,
        info_hash,
        seeds,
        leechers,
        created_at,
        tracker_last_checked_at
      FROM torrents
      WHERE status = 'active'
        AND info_hash IS NOT NULL
        AND info_hash != ''
      ORDER BY
        CASE
          WHEN tracker_last_checked_at IS NULL THEN 0
          WHEN datetime(created_at) >= datetime('now', '-1 day') THEN 1
          WHEN (seeds + leechers) >= 50 THEN 2
          ELSE 3
        END ASC,
        datetime(COALESCE(tracker_last_checked_at, '1970-01-01T00:00:00Z')) ASC,
        id DESC
      LIMIT $limit
    `)
    .all({ $limit: limit }) as Array<{
      id: number;
      name: string;
      info_hash: string;
      seeds: number;
      leechers: number;
      created_at: string;
      tracker_last_checked_at: string | null;
    }>;

  return rows.map((row) => ({
    ...row,
    trackers: listTrackersByTorrentId(row.id),
  }));
}

export function updateTorrentTrackerSnapshot(
  torrentId: number,
  input: {
    seeds: number;
    leechers: number;
    completed: number;
    trackerSource: string;
    trackerState: "ok" | "error" | "unsupported";
    trackerError?: string;
  },
) {
  const now = new Date().toISOString();

  db.query(
    "UPDATE torrents SET seeds = ?, leechers = ?, completed = ?, tracker_last_checked_at = ?, tracker_source = ?, tracker_state = ?, updated_at = ? WHERE id = ?",
  ).run(
    input.seeds,
    input.leechers,
    input.completed,
    now,
    input.trackerSource,
    input.trackerState,
    now,
    torrentId,
  );

  db.query(
    "UPDATE torrent_trackers SET last_checked_at = ?, last_error = ? WHERE torrent_id = ? AND announce_url = ?",
  ).run(now, input.trackerError ?? "", torrentId, input.trackerSource);
}

export function markTorrentTrackerError(torrentId: number, trackerSource: string, error: string, state = "error") {
  const now = new Date().toISOString();

  db.query(
    "UPDATE torrents SET tracker_last_checked_at = ?, tracker_source = ?, tracker_state = ?, updated_at = ? WHERE id = ?",
  ).run(now, trackerSource, state, now, torrentId);

  db.query(
    "UPDATE torrent_trackers SET last_checked_at = ?, last_error = ? WHERE torrent_id = ? AND announce_url = ?",
  ).run(now, error.slice(0, 200), torrentId, trackerSource);
}

export function createUser(input: {
  username: string;
  passwordHash: string;
  role?: UserRole;
  status?: UserStatus;
  avatarPath?: string;
  bio?: string;
}) {
  const now = new Date().toISOString();
  const role = input.role ?? "user";
  const status = input.status ?? "active";

  db.query(`
    INSERT INTO users (username, password_hash, avatar_path, bio, role, status, created_at, updated_at)
    VALUES ($username, $passwordHash, $avatarPath, $bio, $role, $status, $createdAt, $updatedAt)
  `).run({
    $username: input.username,
    $passwordHash: input.passwordHash,
    $avatarPath: input.avatarPath ?? "",
    $bio: input.bio ?? "",
    $role: role,
    $status: status,
    $createdAt: now,
    $updatedAt: now,
  });

  const row = db.query("SELECT last_insert_rowid() AS id").get() as { id: number };
  return row.id;
}

export function getUserByUsername(username: string) {
  const row = db.query("SELECT * FROM users WHERE username = ? LIMIT 1").get(username);
  return (row as UserRow | null) ?? null;
}

export function getUserById(userId: number) {
  const row = db.query("SELECT * FROM users WHERE id = ? LIMIT 1").get(userId);
  return (row as UserRow | null) ?? null;
}

export function getAuthUserById(userId: number) {
  const row = db
    .query("SELECT id, username, avatar_path, bio, role, status FROM users WHERE id = ? LIMIT 1")
    .get(userId);
  return (row as AuthUser | null) ?? null;
}

export function listUsers(params: { q?: string; status?: UserStatus | "" } = {}) {
  const q = params.q?.trim() ?? "";
  const status = params.status ?? "";

  const rows = db
    .query(`
      SELECT id, username, avatar_path, bio, role, status, created_at, updated_at
      FROM users
      WHERE ($q = '' OR username LIKE '%' || $q || '%')
        AND ($status = '' OR status = $status)
      ORDER BY created_at DESC, id DESC
      LIMIT 300
    `)
    .all({ $q: q, $status: status });

  return rows as Array<
    Omit<UserRow, "password_hash"> & {
      created_at: string;
      updated_at: string;
    }
  >;
}

export function updateUserProfile(userId: number, input: { bio: string; avatarPath?: string }) {
  if (typeof input.avatarPath === "string") {
    db.query("UPDATE users SET bio = ?, avatar_path = ?, updated_at = ? WHERE id = ?").run(
      input.bio,
      input.avatarPath,
      new Date().toISOString(),
      userId,
    );
    return;
  }

  db.query("UPDATE users SET bio = ?, updated_at = ? WHERE id = ?").run(
    input.bio,
    new Date().toISOString(),
    userId,
  );
}

export function updateUserPasswordHash(userId: number, passwordHash: string) {
  db.query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    passwordHash,
    new Date().toISOString(),
    userId,
  );
}

export function setUserStatus(userId: number, status: UserStatus) {
  db.query("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    userId,
  );
}

export function setUserRole(userId: number, role: UserRole) {
  db.query("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(
    role,
    new Date().toISOString(),
    userId,
  );
}

export function softDeleteUser(userId: number) {
  db.query("UPDATE users SET status = 'deleted', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    userId,
  );
}

export function createSession(input: { tokenHash: string; userId: number; expiresAt: string }) {
  const now = new Date().toISOString();
  db.query(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.tokenHash, input.userId, input.expiresAt, now, now);
}

export function getSessionWithUserByTokenHash(tokenHash: string) {
  const row = db
    .query(`
      SELECT
        s.id AS session_id,
        s.token_hash,
        s.user_id,
        s.expires_at,
        s.last_seen_at,
        u.username,
        u.avatar_path,
        u.bio,
        u.role,
        u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $tokenHash
      LIMIT 1
    `)
    .get({ $tokenHash: tokenHash });

  return (row as SessionWithUser | null) ?? null;
}

export function touchSession(sessionId: number) {
  db.query("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), sessionId);
}

export function deleteSessionByTokenHash(tokenHash: string) {
  db.query("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteSessionsByUserId(userId: number) {
  db.query("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function deleteExpiredSessions() {
  db.query("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run();
}

export function createCaptchaChallenge(input: {
  id: string;
  purpose: CaptchaPurpose;
  answerHash: string;
  expiresAt: string;
  clientIp: string;
}) {
  const now = new Date().toISOString();
  db.query(
    "INSERT INTO captcha_challenges (id, purpose, answer_hash, expires_at, consumed_at, created_at, client_ip) VALUES (?, ?, ?, ?, NULL, ?, ?)",
  ).run(input.id, input.purpose, input.answerHash, input.expiresAt, now, input.clientIp);
}

export function consumeCaptchaChallenge(input: {
  id: string;
  purpose: CaptchaPurpose;
  answerHash: string;
  nowIso: string;
}) {
  const result = db.query(
    "UPDATE captcha_challenges SET consumed_at = ? WHERE id = ? AND purpose = ? AND answer_hash = ? AND consumed_at IS NULL AND expires_at > ?",
  ).run(input.nowIso, input.id, input.purpose, input.answerHash, input.nowIso);
  return result.changes > 0;
}

export function deleteExpiredCaptchaChallenges(nowIso: string) {
  const cutoffConsumedIso = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString();
  db.query(
    "DELETE FROM captcha_challenges WHERE expires_at <= ? OR (consumed_at IS NOT NULL AND consumed_at <= ?)",
  ).run(nowIso, cutoffConsumedIso);
}

export function getSiteSettings(): SiteSettings {
  const row = db
    .query(
      "SELECT title_text AS titleText, logo_path AS logoPath, allow_guest_upload AS allowGuestUpload, allow_user_delete_torrent AS allowUserDeleteTorrent, enable_login_captcha AS enableLoginCaptcha, enable_register_captcha AS enableRegisterCaptcha, max_avatar_upload_mb AS maxAvatarUploadMb, max_torrent_image_upload_mb AS maxTorrentImageUploadMb, allow_guest_torrent_image_upload AS allowGuestTorrentImageUpload, guest_torrent_file_max_mb AS guestTorrentFileMaxMb, user_torrent_file_max_mb AS userTorrentFileMaxMb, allow_user_register AS allowUserRegister FROM site_settings WHERE id = 1",
    )
    .get() as
    | {
        titleText: string;
        logoPath: string;
        allowGuestUpload: number;
        allowUserDeleteTorrent: number;
        enableLoginCaptcha: number;
        enableRegisterCaptcha: number;
        maxAvatarUploadMb: number;
        maxTorrentImageUploadMb: number;
        allowGuestTorrentImageUpload: number;
        guestTorrentFileMaxMb: number;
        userTorrentFileMaxMb: number;
        allowUserRegister: number;
      }
    | null;

  if (!row) {
    return {
      titleText: "Sukebei.dl",
      logoPath: "",
      allowGuestUpload: true,
      allowUserDeleteTorrent: true,
      enableLoginCaptcha: true,
      enableRegisterCaptcha: true,
      maxAvatarUploadMb: 2,
      maxTorrentImageUploadMb: 2,
      allowGuestTorrentImageUpload: true,
      guestTorrentFileMaxMb: 1,
      userTorrentFileMaxMb: 10,
      allowUserRegister: true,
    };
  }

  return {
    titleText: row.titleText,
    logoPath: row.logoPath,
    allowGuestUpload: row.allowGuestUpload === 1,
    allowUserDeleteTorrent: row.allowUserDeleteTorrent === 1,
    enableLoginCaptcha: row.enableLoginCaptcha === 1,
    enableRegisterCaptcha: row.enableRegisterCaptcha === 1,
    maxAvatarUploadMb: Math.max(1, row.maxAvatarUploadMb),
    maxTorrentImageUploadMb: Math.max(1, row.maxTorrentImageUploadMb),
    allowGuestTorrentImageUpload: row.allowGuestTorrentImageUpload === 1,
    guestTorrentFileMaxMb: Math.max(1, row.guestTorrentFileMaxMb),
    userTorrentFileMaxMb: Math.max(1, row.userTorrentFileMaxMb),
    allowUserRegister: row.allowUserRegister === 1,
  };
}

export function getSiteBranding(): SiteBranding {
  const s = getSiteSettings();
  return {
    titleText: s.titleText,
    logoPath: s.logoPath,
  };
}

export function getSiteFeatureFlags(): SiteFeatureFlags {
  const s = getSiteSettings();
  return {
    allowGuestUpload: s.allowGuestUpload,
    allowUserDeleteTorrent: s.allowUserDeleteTorrent,
    allowGuestTorrentImageUpload: s.allowGuestTorrentImageUpload,
    allowUserRegister: s.allowUserRegister,
  };
}

export function getUploadPolicy(): UploadPolicy {
  const s = getSiteSettings();
  return {
    maxAvatarUploadMb: s.maxAvatarUploadMb,
    maxTorrentImageUploadMb: s.maxTorrentImageUploadMb,
    guestTorrentFileMaxMb: s.guestTorrentFileMaxMb,
    userTorrentFileMaxMb: s.userTorrentFileMaxMb,
    allowGuestTorrentImageUpload: s.allowGuestTorrentImageUpload,
  };
}

export function getAuthCaptchaPolicy(): AuthCaptchaPolicy {
  const s = getSiteSettings();
  return {
    enableLoginCaptcha: s.enableLoginCaptcha,
    enableRegisterCaptcha: s.enableRegisterCaptcha,
  };
}

export function updateSiteSettings(input: {
  titleText: string;
  logoPath?: string;
  allowGuestUpload?: boolean;
  allowUserDeleteTorrent?: boolean;
  enableLoginCaptcha?: boolean;
  enableRegisterCaptcha?: boolean;
  maxAvatarUploadMb?: number;
  maxTorrentImageUploadMb?: number;
  allowGuestTorrentImageUpload?: boolean;
  guestTorrentFileMaxMb?: number;
  userTorrentFileMaxMb?: number;
  allowUserRegister?: boolean;
}) {
  const current = getSiteSettings();

  const titleText = input.titleText;
  const logoPath = typeof input.logoPath === "string" ? input.logoPath : current.logoPath;
  const allowGuestUpload =
    typeof input.allowGuestUpload === "boolean" ? input.allowGuestUpload : current.allowGuestUpload;
  const allowUserDeleteTorrent =
    typeof input.allowUserDeleteTorrent === "boolean"
      ? input.allowUserDeleteTorrent
      : current.allowUserDeleteTorrent;
  const enableLoginCaptcha =
    typeof input.enableLoginCaptcha === "boolean" ? input.enableLoginCaptcha : current.enableLoginCaptcha;
  const enableRegisterCaptcha =
    typeof input.enableRegisterCaptcha === "boolean"
      ? input.enableRegisterCaptcha
      : current.enableRegisterCaptcha;
  const maxAvatarUploadMb = Math.max(1, Math.floor(input.maxAvatarUploadMb ?? current.maxAvatarUploadMb));
  const maxTorrentImageUploadMb = Math.max(
    1,
    Math.floor(input.maxTorrentImageUploadMb ?? current.maxTorrentImageUploadMb),
  );
  const allowGuestTorrentImageUpload =
    typeof input.allowGuestTorrentImageUpload === "boolean"
      ? input.allowGuestTorrentImageUpload
      : current.allowGuestTorrentImageUpload;
  const guestTorrentFileMaxMb = Math.max(
    1,
    Math.floor(input.guestTorrentFileMaxMb ?? current.guestTorrentFileMaxMb),
  );
  const userTorrentFileMaxMb = Math.max(
    1,
    Math.floor(input.userTorrentFileMaxMb ?? current.userTorrentFileMaxMb),
  );
  const allowUserRegister =
    typeof input.allowUserRegister === "boolean" ? input.allowUserRegister : current.allowUserRegister;

  db.query(
    "UPDATE site_settings SET title_text = ?, logo_path = ?, allow_guest_upload = ?, allow_user_delete_torrent = ?, enable_login_captcha = ?, enable_register_captcha = ?, max_avatar_upload_mb = ?, max_torrent_image_upload_mb = ?, allow_guest_torrent_image_upload = ?, guest_torrent_file_max_mb = ?, user_torrent_file_max_mb = ?, allow_user_register = ?, updated_at = ? WHERE id = 1",
  ).run(
    titleText,
    logoPath,
    allowGuestUpload ? 1 : 0,
    allowUserDeleteTorrent ? 1 : 0,
    enableLoginCaptcha ? 1 : 0,
    enableRegisterCaptcha ? 1 : 0,
    maxAvatarUploadMb,
    maxTorrentImageUploadMb,
    allowGuestTorrentImageUpload ? 1 : 0,
    guestTorrentFileMaxMb,
    userTorrentFileMaxMb,
    allowUserRegister ? 1 : 0,
    new Date().toISOString(),
  );
}

export function updateSiteBranding(input: {
  titleText: string;
  logoPath?: string;
  allowGuestUpload?: boolean;
  allowUserDeleteTorrent?: boolean;
}) {
  updateSiteSettings(input);
}

export function countUsers() {
  const row = db.query("SELECT COUNT(1) AS count FROM users WHERE status != 'deleted'").get() as {
    count: number;
  };
  return row.count;
}
