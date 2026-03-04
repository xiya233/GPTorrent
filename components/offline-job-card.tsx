"use client";

import { useEffect, useMemo, useState } from "react";

type OfflineJobStatus = "queued" | "downloading" | "completed" | "failed" | "expired";

type OfflineJob = {
  id: number;
  status: OfflineJobStatus;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  download_speed: number;
  eta_seconds: number | null;
  error_message: string;
};

type OfflineJobCardProps = {
  torrentId: number;
  canStart: boolean;
  initialJob: OfflineJob | null;
};

function formatBytes(size: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Math.max(0, size);
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = idx <= 1 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

function formatEta(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export function OfflineJobCard({ torrentId, canStart, initialJob }: OfflineJobCardProps) {
  const [job, setJob] = useState<OfflineJob | null>(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pending = useMemo(() => job?.status === "queued" || job?.status === "downloading", [job]);

  async function refreshStatus() {
    const response = await fetch(`/api/torrents/${torrentId}/offline/status`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; job?: OfflineJob | null };
    if (!response.ok) {
      throw new Error(payload.error || "获取离线状态失败");
    }
    setJob(payload.job ?? null);
  }

  async function startOffline() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/torrents/${torrentId}/offline/start`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; job?: OfflineJob };
      if (!response.ok || !payload.job) {
        throw new Error(payload.error || "创建离线任务失败");
      }
      setJob(payload.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建离线任务失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = setInterval(() => {
      refreshStatus().catch((err) => {
        setError(err instanceof Error ? err.message : "获取离线状态失败");
      });
    }, 2500);

    return () => clearInterval(timer);
  }, [pending, torrentId]);

  return (
    <div className="offline-job-card">
      <div className="offline-job-header">
        <strong>离线下载</strong>
        <div className="offline-job-actions">
          <button className="secondary-btn tiny-btn" onClick={() => refreshStatus().catch(() => {})} type="button">
            刷新
          </button>
          {canStart ? (
            <button className="primary-btn tiny-btn" disabled={busy || pending} onClick={startOffline} type="button">
              {job ? "重新拉取状态" : "开始离线下载"}
            </button>
          ) : null}
        </div>
      </div>

      {!canStart && !job ? <p className="muted">登录后可发起离线下载任务。</p> : null}

      {job ? (
        <div className="offline-job-meta">
          <p>状态：{job.status}</p>
          <p>
            已下载：{formatBytes(job.downloaded_bytes)} / {formatBytes(job.total_bytes)}
          </p>
          <p>
            速度：{formatBytes(job.download_speed)}/s · ETA：{formatEta(job.eta_seconds)}
          </p>
          <div className="offline-progress-track">
            <div className="offline-progress-bar" style={{ width: `${Math.round(Math.max(0, Math.min(1, job.progress)) * 100)}%` }} />
          </div>
          {job.status === "failed" && job.error_message ? <p className="form-error">{job.error_message}</p> : null}
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
