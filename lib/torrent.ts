import { createHash } from "node:crypto";
import parseTorrent, { toMagnetURI } from "parse-torrent";

export type ParsedTorrentTracker = {
  tier: number;
  announceUrl: string;
  scrapeUrl: string;
  isPrimary: boolean;
};

export type ParsedTorrentFile = {
  path: string;
  sizeBytes: number;
};

export type ParsedTorrentMeta = {
  infoHash: string;
  name: string;
  magnetUri: string;
  trackers: ParsedTorrentTracker[];
  files: ParsedTorrentFile[];
};

function getScrapeUrlFromAnnounce(announce: string) {
  if (/^https?:\/\//i.test(announce)) {
    const idx = announce.lastIndexOf("/announce");
    if (idx > 0) {
      return `${announce.slice(0, idx)}/scrape${announce.slice(idx + "/announce".length)}`;
    }
  }

  if (/^udp:\/\//i.test(announce)) {
    const idx = announce.lastIndexOf("/announce");
    if (idx > 0) {
      return `${announce.slice(0, idx)}/scrape${announce.slice(idx + "/announce".length)}`;
    }
  }

  return announce;
}

function normalizeTrackers(announceList: string[]) {
  const seen = new Set<string>();
  const trackers: ParsedTorrentTracker[] = [];

  announceList.forEach((url, index) => {
    const announceUrl = String(url || "").trim();
    if (!announceUrl || seen.has(announceUrl)) {
      return;
    }

    seen.add(announceUrl);
    trackers.push({
      tier: index,
      announceUrl,
      scrapeUrl: getScrapeUrlFromAnnounce(announceUrl),
      isPrimary: trackers.length === 0,
    });
  });

  return trackers;
}

export async function parseTorrentMeta(rawBytes: Uint8Array): Promise<ParsedTorrentMeta> {
  const parsed = (await parseTorrent(Buffer.from(rawBytes))) as {
    infoHash?: string;
    name?: string;
    announce?: string[];
    files?: Array<{ path: string; length: number }>;
    info?: unknown;
  };

  if (!parsed.infoHash || !parsed.name) {
    throw new Error("无法解析种子文件元数据");
  }

  const infoHash = parsed.infoHash.toLowerCase();
  const announce = Array.isArray(parsed.announce) ? parsed.announce : [];

  const files = (parsed.files ?? []).map((file) => ({
    path: file.path,
    sizeBytes: file.length,
  }));

  if (files.length === 0) {
    throw new Error("未解析到种子文件列表");
  }

  const trackers = normalizeTrackers(announce);

  const magnetUri = toMagnetURI({
    infoHash,
    name: parsed.name,
    announce,
  });

  return {
    infoHash,
    name: parsed.name,
    magnetUri,
    trackers,
    files,
  };
}

export function getInfoHashBuffer(infoHash: string) {
  const clean = infoHash.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(clean)) {
    throw new Error("非法 info_hash");
  }
  return Buffer.from(clean, "hex");
}

export function infoHashHexFromBytes(bytes: Uint8Array) {
  return createHash("sha1").update(bytes).digest("hex");
}
