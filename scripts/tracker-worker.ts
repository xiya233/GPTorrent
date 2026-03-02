import { refreshTrackerBatch } from "../lib/tracker/refresh";

const SLEEP_MS = 2 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("[tracker-worker] started");

  while (true) {
    try {
      const stat = await refreshTrackerBatch(80);
      console.log(
        `[tracker-worker] total=${stat.total} ok=${stat.ok} failed=${stat.failed} unsupported=${stat.unsupported}`,
      );
    } catch (error) {
      console.error("[tracker-worker] loop error:", error);
    }

    await sleep(SLEEP_MS);
  }
}

run().catch((err) => {
  console.error("[tracker-worker] fatal:", err);
  process.exit(1);
});
