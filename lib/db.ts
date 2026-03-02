import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "btshare.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "banned" | "deleted";

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
  uploader_user_id: number | null;
  file_path: string;
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

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`);

function ensureColumn(table: string, column: string, alterSql: string) {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(alterSql);
  }
}

ensureColumn("torrents", "uploader_user_id", "ALTER TABLE torrents ADD COLUMN uploader_user_id INTEGER");

const settingsExists = db.query("SELECT id FROM site_settings WHERE id = 1").get() as { id: number } | null;
if (!settingsExists) {
  db.query(
    "INSERT INTO site_settings (id, title_text, logo_path, updated_at) VALUES (1, 'Sukebei.dl', '', ?)",
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
    ["[SubDesu] 咒术回战 - S2E14 [1080p] [HEVC]", "动画", 1503238554, "1.4 GiB", "1080p,HEVC", "默认示例数据", 2402, 124, 582, "2026-03-02 11:00:00", 1, 1, "system", 0, null, "samples/sample-1.torrent"],
    ["(Hi-Res) 宇多田光 - Science Fiction [FLAC 24bit/96kHz]", "音乐", 933232640, "890 MiB", "FLAC,Hi-Res", "默认示例数据", 156, 12, 45, "2026-03-02 08:00:00", 0, 1, "system", 0, null, "samples/sample-2.torrent"],
    ["奥本海默 (2023) [2160p] [4K] [HDR] [x265]", "电影", 19756849562, "18.4 GiB", "4K,HDR,x265", "默认示例数据", 5892, 845, 2100, "2026-03-01 23:00:00", 1, 1, "system", 0, null, "samples/sample-3.torrent"],
    ["博德之门 3 - 豪华版 [v4.1.1.3622274] + DLCs", "游戏", 130996502528, "122 GiB", "RPG,DLC", "默认示例数据", 1203, 450, 890, "2026-03-01 10:00:00", 0, 1, "system", 0, null, "samples/sample-4.torrent"],
    ["设计系统手册 (2024版) - PDF/EPUB", "书籍", 47185920, "45 MiB", "PDF,EPUB", "默认示例数据", 88, 2, 12, "2026-03-01 09:00:00", 0, 1, "system", 0, null, "samples/sample-5.torrent"],
  ] as const;

  const stmt = db.query(`
    INSERT INTO torrents (
      name, category, size_bytes, size_display, tags, description,
      seeds, leechers, completed, created_at, is_trusted, is_free_download,
      uploader_name, is_anonymous, uploader_user_id, file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

export function getTorrentById(id: number) {
  const row = db.query("SELECT * FROM torrents WHERE id = ? LIMIT 1").get(id);
  return (row as TorrentRow | null) ?? null;
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
      uploader_user_id,
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
      $uploaderUserId,
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
    $uploaderUserId: input.uploaderUserId,
    $filePath: input.filePath,
  });
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

export function getSiteBranding(): SiteBranding {
  const row = db
    .query("SELECT title_text AS titleText, logo_path AS logoPath FROM site_settings WHERE id = 1")
    .get() as SiteBranding | null;

  if (!row) {
    return { titleText: "Sukebei.dl", logoPath: "" };
  }
  return row;
}

export function updateSiteBranding(input: { titleText: string; logoPath?: string }) {
  if (typeof input.logoPath === "string") {
    db.query("UPDATE site_settings SET title_text = ?, logo_path = ?, updated_at = ? WHERE id = 1").run(
      input.titleText,
      input.logoPath,
      new Date().toISOString(),
    );
    return;
  }

  db.query("UPDATE site_settings SET title_text = ?, updated_at = ? WHERE id = 1").run(
    input.titleText,
    new Date().toISOString(),
  );
}

export function countUsers() {
  const row = db.query("SELECT COUNT(1) AS count FROM users WHERE status != 'deleted'").get() as {
    count: number;
  };
  return row.count;
}
