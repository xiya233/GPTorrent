import dgram from "node:dgram";
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
    if (timer) clearTimeout(timer);
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

function percentEncodeInfoHash(infoHashHex: string) {
  const buf = Buffer.from(infoHashHex, "hex");
  return Array.from(buf)
    .map((n) => `%${n.toString(16).padStart(2, "0")}`)
    .join("");
}

function extractHttpScrapeStats(decoded: unknown, infoHashHex: string) {
  const root = (decoded ?? {}) as Record<string, unknown>;

  const failure = toErrorText(root["failure reason"]);
  if (failure) {
    throw new Error(failure);
  }

  const files = root.files;
  if (files && typeof files === "object") {
    const infoBuf = Buffer.from(infoHashHex, "hex");
    const entries = Object.entries(files as Record<string, unknown>);

    for (const [key, value] of entries) {
      const kBuf = Buffer.from(key, "binary");
      if (kBuf.length === 20 && kBuf.equals(infoBuf)) {
        const obj = value as Record<string, unknown>;
        return {
          seeds: Math.max(0, toNumber(obj.complete)),
          leechers: Math.max(0, toNumber(obj.incomplete)),
          completed: Math.max(0, toNumber(obj.downloaded)),
        };
      }
    }

    if (entries.length > 0) {
      const obj = entries[0][1] as Record<string, unknown>;
      return {
        seeds: Math.max(0, toNumber(obj.complete)),
        leechers: Math.max(0, toNumber(obj.incomplete)),
        completed: Math.max(0, toNumber(obj.downloaded)),
      };
    }
  }

  return {
    seeds: Math.max(0, toNumber(root.complete)),
    leechers: Math.max(0, toNumber(root.incomplete)),
    completed: Math.max(0, toNumber(root.downloaded)),
  };
}

async function scrapeHttp(tracker: TorrentTrackerRow, infoHashHex: string): Promise<ScrapeResult> {
  const infoHashParam = percentEncodeInfoHash(infoHashHex);
  const base = tracker.scrape_url || tracker.announce_url;
  const url = `${base}${base.includes("?") ? "&" : "?"}info_hash=${infoHashParam}`;

  const response = await timeoutPromise(fetch(url), 12000, "tracker http scrape timeout");
  if (!response.ok) {
    throw new Error(`http status ${response.status}`);
  }

  const raw = new Uint8Array(await response.arrayBuffer());
  const decoded = bencode.decode(Buffer.from(raw));
  const stats = extractHttpScrapeStats(decoded, infoHashHex);

  return {
    ...stats,
    trackerSource: tracker.announce_url,
  };
}

function sendUdp(socket: dgram.Socket, payload: Buffer, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    socket.send(payload, port, host, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function scrapeUdp(tracker: TorrentTrackerRow, infoHashHex: string): Promise<ScrapeResult> {
  const target = new URL(tracker.announce_url);
  const host = target.hostname;
  const port = Number(target.port || "80");

  const socket = dgram.createSocket("udp4");

  try {
    const connectTx = Math.floor(Math.random() * 0xffffffff);

    const connectReq = Buffer.alloc(16);
    connectReq.writeUInt32BE(0x00000417, 0);
    connectReq.writeUInt32BE(0x27101980, 4);
    connectReq.writeUInt32BE(0, 8);
    connectReq.writeUInt32BE(connectTx, 12);

    const connectRes = await timeoutPromise(
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
        await sendUdp(socket, connectReq, port, host);
      }),
      8000,
      "udp connect timeout",
    );

    if (connectRes.length < 16 || connectRes.readUInt32BE(0) !== 0 || connectRes.readUInt32BE(4) !== connectTx) {
      throw new Error("udp connect invalid response");
    }

    const connectionId = connectRes.subarray(8, 16);

    const scrapeTx = Math.floor(Math.random() * 0xffffffff);
    const scrapeReq = Buffer.alloc(36);
    connectionId.copy(scrapeReq, 0);
    scrapeReq.writeUInt32BE(2, 8);
    scrapeReq.writeUInt32BE(scrapeTx, 12);
    Buffer.from(infoHashHex, "hex").copy(scrapeReq, 16);

    const scrapeRes = await timeoutPromise(
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
        await sendUdp(socket, scrapeReq, port, host);
      }),
      10000,
      "udp scrape timeout",
    );

    if (scrapeRes.length < 20 || scrapeRes.readUInt32BE(0) !== 2 || scrapeRes.readUInt32BE(4) !== scrapeTx) {
      throw new Error("udp scrape invalid response");
    }

    const seeds = scrapeRes.readUInt32BE(8);
    const completed = scrapeRes.readUInt32BE(12);
    const leechers = scrapeRes.readUInt32BE(16);

    return {
      seeds,
      leechers,
      completed,
      trackerSource: tracker.announce_url,
    };
  } finally {
    socket.close();
  }
}

async function scrapeTracker(tracker: TorrentTrackerRow, infoHashHex: string): Promise<ScrapeResult> {
  if (/^https?:\/\//i.test(tracker.scrape_url || tracker.announce_url)) {
    return scrapeHttp(tracker, infoHashHex);
  }

  if (/^udp:\/\//i.test(tracker.announce_url)) {
    return scrapeUdp(tracker, infoHashHex);
  }

  throw new Error("unsupported tracker protocol");
}

async function tryScrape(trackers: TorrentTrackerRow[], infoHash: string) {
  for (const tracker of trackers) {
    try {
      const result = await scrapeTracker(tracker, infoHash);
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
      if (!hasSupported) unsupported += 1;
      else failed += 1;
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
