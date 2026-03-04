import path from "node:path";

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function getOfflineMaxConcurrency() {
  return parsePositiveInt(process.env.OFFLINE_MAX_CONCURRENCY, 2);
}

export function getOfflineRetentionDays() {
  return parsePositiveInt(process.env.OFFLINE_RETENTION_DAYS, 7);
}

export function getFfmpegBin() {
  return (process.env.FFMPEG_BIN || "ffmpeg").trim() || "ffmpeg";
}

export function getFfprobeBin() {
  return (process.env.FFPROBE_BIN || "ffprobe").trim() || "ffprobe";
}

export function getDataRoot() {
  return path.resolve(process.cwd(), "data");
}

export function getOfflineRawRoot() {
  return path.resolve(getDataRoot(), "offline", "raw");
}

export function getOfflineHlsRoot() {
  return path.resolve(getDataRoot(), "offline", "hls");
}

export type QbConfig = {
  baseUrl: string;
  username: string;
  password: string;
};

export function getQbConfig(): QbConfig {
  const baseUrl = (process.env.QBITTORRENT_URL || "").trim();
  const username = (process.env.QBITTORRENT_USERNAME || "").trim();
  const password = process.env.QBITTORRENT_PASSWORD || "";

  if (!baseUrl || !username || !password) {
    throw new Error("缺少 qBittorrent 配置，请设置 QBITTORRENT_URL / QBITTORRENT_USERNAME / QBITTORRENT_PASSWORD");
  }

  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return {
    baseUrl: normalized,
    username,
    password,
  };
}
