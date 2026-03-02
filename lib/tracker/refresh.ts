import dgram from "node:dgram";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import bencode from "bencode";
import {
  listTrackerRefreshCandidates,
  markTorrentTrackerError,
  type TorrentTrackerRow,
  updateTorrentTrackerSnapshot,
} from "../db";

type ScrapeResult = {
  seeds: number;
  leechers: number;
  completed: number;
  trackerSource: string;
};

function timeoutPromise<T>(promise: Promise<T>, ms: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

function toNumber(v: unknown) {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (Buffer.isBuffer(v)) {
    const n = Number(v.toString());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toErrorText(v: unknown) {
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString();
  return "";
}

function encodeBufferAsPercentValue(buf: Buffer) {
  return Array.from(buf)
    .map((n) => `%${n.toString(16).padStart(2, "0")}`)
    .join("");
}

function percentEncodeInfoHash(infoHashHex: string) {
  return encodeBufferAsPercentValue(Buffer.from(infoHashHex, "hex"));
}

function buildHttpScrapeUrlFromAnnounce(announceUrl: string) {
  if (!/^https?:\/\//i.test(announceUrl)) {
    return "";
  }

  const idx = announceUrl.lastIndexOf("/announce");
  if (idx <= 0) {
    return "";
  }

  return `${announceUrl.slice(0, idx)}/scrape${announceUrl.slice(idx + "/announce".length)}`;
}

function getHttpScrapeCandidates(tracker: TorrentTrackerRow) {
  const urls = [tracker.scrape_url, buildHttpScrapeUrlFromAnnounce(tracker.announce_url)].filter((item) =>
    /^https?:\/\//i.test(item || ""),
  ) as string[];

  return Array.from(new Set(urls));
}

function extractScrapeFileStats(payload: unknown) {
  const obj = (payload ?? {}) as Record<string, unknown>;
  return {
    seeds: Math.max(0, toNumber(obj.complete)),
    leechers: Math.max(0, toNumber(obj.incomplete)),
    completed: Math.max(0, toNumber(obj.downloaded)),
  };
}

function extractHttpScrapeStats(decoded: unknown, infoHashHex: string) {
  const root = (decoded ?? {}) as Record<string, unknown>;

  const failure = toErrorText(root["failure reason"]);
  if (failure) {
    throw new Error(failure);
  }

  const files = root.files;
  if (files && typeof files === "object") {
    const entries = Object.entries(files as Record<string, unknown>);
    if (entries.length > 0) {
      const infoHashBuf = Buffer.from(infoHashHex, "hex");
      for (const [key, value] of entries) {
        const keyBuf = Buffer.from(key, "binary");
        if (keyBuf.length === 20 && keyBuf.equals(infoHashBuf)) {
          return extractScrapeFileStats(value);
        }
      }

      return extractScrapeFileStats(entries[0][1]);
    }
  }

  return {
    seeds: Math.max(0, toNumber(root.complete)),
    leechers: Math.max(0, toNumber(root.incomplete)),
    completed: Math.max(0, toNumber(root.downloaded)),
  };
}

function extractHttpAnnounceStats(decoded: unknown) {
  const root = (decoded ?? {}) as Record<string, unknown>;

  const failure = toErrorText(root["failure reason"]);
  if (failure) {
    throw new Error(failure);
  }

  const warning = toErrorText(root["warning message"]);
  if (warning) {
    // Tracker warning is non-fatal for stats retrieval.
  }

  return {
    seeds: Math.max(0, toNumber(root.complete)),
    leechers: Math.max(0, toNumber(root.incomplete)),
    completed: Math.max(0, toNumber(root.downloaded)),
  };
}

async function fetchBencoded(url: string, timeoutMs: number) {
  const response = await timeoutPromise(
    fetch(url, {
      headers: {
        "user-agent": "btshare-tracker-worker/1.1",
      },
    }),
    timeoutMs,
    "tracker request timeout",
  );

  if (!response.ok) {
    throw new Error(`http status ${response.status}`);
  }

  const raw = Buffer.from(await response.arrayBuffer());
  return bencode.decode(raw);
}

function buildHttpAnnounceUrl(announceUrl: string, infoHashHex: string) {
  const peerId = Buffer.concat([Buffer.from("-BTSH01-"), randomBytes(12)]);

  const qs = [
    `info_hash=${percentEncodeInfoHash(infoHashHex)}`,
    `peer_id=${encodeBufferAsPercentValue(peerId)}`,
    "port=6881",
    "uploaded=0",
    "downloaded=0",
    "left=0",
    "compact=1",
    "numwant=0",
    "event=started",
  ].join("&");

  return `${announceUrl}${announceUrl.includes("?") ? "&" : "?"}${qs}`;
}

async function scrapeHttp(tracker: TorrentTrackerRow, infoHashHex: string): Promise<ScrapeResult> {
  const scrapeCandidates = getHttpScrapeCandidates(tracker);
  const errors: string[] = [];

  for (const scrapeUrl of scrapeCandidates) {
    try {
      const url = `${scrapeUrl}${scrapeUrl.includes("?") ? "&" : "?"}info_hash=${percentEncodeInfoHash(infoHashHex)}`;
      const decoded = await fetchBencoded(url, 12000);
      const stats = extractHttpScrapeStats(decoded, infoHashHex);

      return {
        ...stats,
        trackerSource: tracker.announce_url,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "http scrape failed";
      errors.push(`scrape:${msg}`);
    }
  }

  if (/^https?:\/\//i.test(tracker.announce_url)) {
    try {
      const url = buildHttpAnnounceUrl(tracker.announce_url, infoHashHex);
      const decoded = await fetchBencoded(url, 12000);
      const stats = extractHttpAnnounceStats(decoded);

      return {
        ...stats,
        trackerSource: tracker.announce_url,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "http announce failed";
      errors.push(`announce:${msg}`);
    }
  }

  throw new Error(errors.join(" | ").slice(0, 320) || "http tracker failed");
}

function sendUdp(socket: dgram.Socket, payload: Buffer, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    socket.send(payload, port, host, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function randomTxId() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

async function udpRequest(socket: dgram.Socket, payload: Buffer, host: string, port: number, timeoutMs: number) {
  const response = await timeoutPromise(
    new Promise<Buffer>(async (resolve, reject) => {
      const onMessage = (msg: Buffer) => {
        socket.off("error", onError);
        resolve(msg);
      };
      const onError = (err: Error) => {
        socket.off("message", onMessage);
        reject(err);
      };

      socket.once("message", onMessage);
      socket.once("error", onError);

      try {
        await sendUdp(socket, payload, port, host);
      } catch (err) {
        socket.off("message", onMessage);
        socket.off("error", onError);
        reject(err instanceof Error ? err : new Error("udp send failed"));
      }
    }),
    timeoutMs,
    "udp request timeout",
  );

  return response;
}

async function udpConnect(socket: dgram.Socket, host: string, port: number) {
  const tx = randomTxId();
  const req = Buffer.alloc(16);
  req.writeUInt32BE(0x00000417, 0);
  req.writeUInt32BE(0x27101980, 4);
  req.writeUInt32BE(0, 8);
  req.writeUInt32BE(tx, 12);

  const res = await udpRequest(socket, req, host, port, 8000);
  if (res.length < 16) {
    throw new Error("udp connect short response");
  }

  const action = res.readUInt32BE(0);
  const resTx = res.readUInt32BE(4);

  if (action === 3) {
    throw new Error(`udp connect error: ${res.subarray(8).toString()}`);
  }
  if (action !== 0 || resTx !== tx) {
    throw new Error("udp connect invalid response");
  }

  return res.subarray(8, 16);
}

async function udpScrape(
  socket: dgram.Socket,
  host: string,
  port: number,
  connectionId: Buffer,
  infoHashHex: string,
) {
  const tx = randomTxId();
  const req = Buffer.alloc(36);
  connectionId.copy(req, 0);
  req.writeUInt32BE(2, 8);
  req.writeUInt32BE(tx, 12);
  Buffer.from(infoHashHex, "hex").copy(req, 16);

  const res = await udpRequest(socket, req, host, port, 10000);
  if (res.length < 8) {
    throw new Error("udp scrape short response");
  }

  const action = res.readUInt32BE(0);
  const resTx = res.readUInt32BE(4);

  if (action === 3) {
    throw new Error(`udp scrape error: ${res.subarray(8).toString()}`);
  }
  if (action !== 2 || resTx !== tx || res.length < 20) {
    throw new Error("udp scrape invalid response");
  }

  return {
    seeds: Math.max(0, res.readUInt32BE(8)),
    completed: Math.max(0, res.readUInt32BE(12)),
    leechers: Math.max(0, res.readUInt32BE(16)),
  };
}

async function udpAnnounce(
  socket: dgram.Socket,
  host: string,
  port: number,
  connectionId: Buffer,
  infoHashHex: string,
) {
  const tx = randomTxId();
  const req = Buffer.alloc(98);
  connectionId.copy(req, 0);
  req.writeUInt32BE(1, 8);
  req.writeUInt32BE(tx, 12);
  Buffer.from(infoHashHex, "hex").copy(req, 16);

  const peerId = Buffer.concat([Buffer.from("-BTSH01-"), randomBytes(12)]);
  peerId.copy(req, 36);

  // downloaded/left/uploaded remain 0 because Buffer.alloc() already zero-fills.
  req.writeUInt32BE(0, 80);
  req.writeUInt32BE(0, 84);
  req.writeUInt32BE(randomTxId(), 88);
  req.writeInt32BE(-1, 92);
  req.writeUInt16BE(6881, 96);

  const res = await udpRequest(socket, req, host, port, 10000);
  if (res.length < 8) {
    throw new Error("udp announce short response");
  }

  const action = res.readUInt32BE(0);
  const resTx = res.readUInt32BE(4);

  if (action === 3) {
    throw new Error(`udp announce error: ${res.subarray(8).toString()}`);
  }
  if (action !== 1 || resTx !== tx || res.length < 20) {
    throw new Error("udp announce invalid response");
  }

  return {
    leechers: Math.max(0, res.readUInt32BE(12)),
    seeds: Math.max(0, res.readUInt32BE(16)),
  };
}

async function resolveTrackerAddresses(hostname: string) {
  try {
    const rows = await lookup(hostname, { all: true, verbatim: true });
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // fallback to direct hostname
  }

  return [{ address: hostname, family: 4 as const }];
}

async function scrapeUdp(tracker: TorrentTrackerRow, infoHashHex: string): Promise<ScrapeResult> {
  const target = new URL(tracker.announce_url);
  const host = target.hostname;
  const port = Number(target.port || "80");

  const addresses = await resolveTrackerAddresses(host);
  const errors: string[] = [];

  for (const addressInfo of addresses) {
    const socket = dgram.createSocket(addressInfo.family === 6 ? "udp6" : "udp4");

    try {
      const connectionId = await udpConnect(socket, addressInfo.address, port);

      try {
        const scrapeStats = await udpScrape(socket, addressInfo.address, port, connectionId, infoHashHex);
        return {
          ...scrapeStats,
          trackerSource: tracker.announce_url,
        };
      } catch {
        const announceStats = await udpAnnounce(socket, addressInfo.address, port, connectionId, infoHashHex);
        return {
          seeds: announceStats.seeds,
          leechers: announceStats.leechers,
          completed: 0,
          trackerSource: tracker.announce_url,
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "udp failed";
      errors.push(`${addressInfo.address}:${msg}`);
    } finally {
      socket.close();
    }
  }

  throw new Error(errors.join(" | ").slice(0, 320) || "udp tracker failed");
}

async function scrapeTracker(tracker: TorrentTrackerRow, infoHashHex: string): Promise<ScrapeResult> {
  if (/^https?:\/\//i.test(tracker.announce_url) || /^https?:\/\//i.test(tracker.scrape_url || "")) {
    return scrapeHttp(tracker, infoHashHex);
  }

  if (/^udp:\/\//i.test(tracker.announce_url)) {
    return scrapeUdp(tracker, infoHashHex);
  }

  throw new Error("unsupported tracker protocol");
}

async function scrapeTrackerWithRetry(tracker: TorrentTrackerRow, infoHash: string, maxAttempts = 2) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await scrapeTracker(tracker, infoHash);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("tracker scrape failed");
}

async function tryScrape(trackers: TorrentTrackerRow[], infoHash: string) {
  for (const tracker of trackers) {
    try {
      const result = await scrapeTrackerWithRetry(tracker, infoHash, 2);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "tracker scrape failed";
      const state = message.includes("unsupported") ? "unsupported" : "error";
      markTorrentTrackerError(tracker.torrent_id, tracker.announce_url, message, state);
    }
  }

  return null;
}

export async function refreshTrackerBatch(limit = 60) {
  const candidates = listTrackerRefreshCandidates(limit);

  let ok = 0;
  let failed = 0;
  let unsupported = 0;

  for (const candidate of candidates) {
    const trackers = candidate.trackers;
    if (!candidate.info_hash || trackers.length === 0) {
      markTorrentTrackerError(candidate.id, "", "no tracker", "unsupported");
      unsupported += 1;
      continue;
    }

    const result = await tryScrape(trackers, candidate.info_hash);
    if (!result) {
      const hasSupported = trackers.some((tracker) => {
        return /^https?:\/\//i.test(tracker.scrape_url || tracker.announce_url) || /^udp:\/\//i.test(tracker.announce_url);
      });
      if (!hasSupported) {
        unsupported += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    updateTorrentTrackerSnapshot(candidate.id, {
      seeds: result.seeds,
      leechers: result.leechers,
      completed: result.completed,
      trackerSource: result.trackerSource,
      trackerState: "ok",
      trackerError: "",
    });
    ok += 1;
  }

  return {
    total: candidates.length,
    ok,
    failed,
    unsupported,
  };
}
