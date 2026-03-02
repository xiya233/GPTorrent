import { refreshTrackerBatch, type TrackerRefreshEvent } from "../lib/tracker/refresh";

const DEFAULT_SLEEP_MS = 2 * 60 * 1000;
const DEFAULT_LIMIT = 80;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(prefix: string) {
  const item = process.argv.find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

function toPositiveInt(raw: string, fallback: number) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function printVerboseEvent(event: TrackerRefreshEvent) {
  if (event.type === "candidate_start") {
    console.log(
      `[tracker-worker][verbose] torrent=${event.torrentId} name=${event.name} trackers=${event.trackerCount} info_hash=${event.infoHash}`,
    );
    return;
  }

  if (event.type === "tracker_try") {
    console.log(
      `[tracker-worker][verbose] try torrent=${event.torrentId} tracker=${event.announceUrl} attempt=${event.attempt}`,
    );
    return;
  }

  if (event.type === "tracker_fail") {
    console.log(
      `[tracker-worker][verbose] fail torrent=${event.torrentId} tracker=${event.announceUrl} attempt=${event.attempt} reason=${event.message}`,
    );
    return;
  }

  if (event.type === "candidate_success") {
    console.log(
      `[tracker-worker][verbose] ok torrent=${event.torrentId} source=${event.announceUrl} seeds=${event.seeds} leechers=${event.leechers} completed=${event.completed}`,
    );
    return;
  }

  console.log(
    `[tracker-worker][verbose] candidate-fail torrent=${event.torrentId} reason=${event.reason} message=${event.message}`,
  );
}

async function run() {
  const argSet = new Set(process.argv.slice(2));
  const once = argSet.has("--once");
  const verbose = argSet.has("--verbose");
  const limit = toPositiveInt(getArgValue("--limit="), DEFAULT_LIMIT);
  const sleepMs = toPositiveInt(getArgValue("--interval-ms="), DEFAULT_SLEEP_MS);

  console.log(
    `[tracker-worker] started once=${once} verbose=${verbose} limit=${limit} intervalMs=${sleepMs}`,
  );

  while (true) {
    try {
      const stat = await refreshTrackerBatch(limit, {
        onEvent: verbose ? printVerboseEvent : undefined,
      });
      console.log(
        `[tracker-worker] total=${stat.total} ok=${stat.ok} failed=${stat.failed} unsupported=${stat.unsupported}`,
      );
    } catch (error) {
      console.error("[tracker-worker] loop error:", error);
    }

    if (once) {
      break;
    }
    await sleep(sleepMs);
  }
}

run().catch((err) => {
  console.error("[tracker-worker] fatal:", err);
  process.exit(1);
});
