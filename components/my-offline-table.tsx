"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OfflineRowActionMenu } from "@/components/offline-row-action-menu";

type OfflineFileLite = {
  id: number;
  relative_path: string;
  size_bytes: number;
  is_video: number;
};

type OfflineQuotaSnapshot = {
  limitBytes: number;
  usedBytes: number;
  remainingBytes: number;
};

type MyOfflineJobRow = {
  user_job_id: number;
  user_job_status: "active" | "removed";
  reserved_bytes: number;
  billed_bytes: number;
  user_job_created_at: string;
  user_job_updated_at: string;
  job_id: number;
  torrent_id: number;
  job_status: "queued" | "downloading" | "completed" | "failed" | "expired";
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  download_speed: number;
  eta_seconds: number | null;
  error_message: string;
  last_error_source: "queued" | "downloading" | "cancel" | "";
  job_created_at: string;
  job_updated_at: string;
  completed_at: string | null;
  torrent_name: string;
  torrent_category: string;
  torrent_status: string;
  files: OfflineFileLite[];
};

type MyOfflineTableProps = {
  initialItems: MyOfflineJobRow[];
  initialQuota: OfflineQuotaSnapshot;
  initialQ: string;
  initialStatus: string;
};

function formatBytes(size: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Math.max(0, Number(size) || 0);
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
  return `${Math.floor(m / 60)}h`;
}

export function MyOfflineTable({ initialItems, initialQuota, initialQ, initialStatus }: MyOfflineTableProps) {
  const [items, setItems] = useState(initialItems);
  const [quota, setQuota] = useState(initialQuota);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canRefresh = useMemo(
    () => items.some((item) => item.job_status === "queued" || item.job_status === "downloading"),
    [items],
  );

  async function refreshList() {
    setOpenMenuId(null);
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const query = new URLSearchParams();
      if (initialQ) query.set("q", initialQ);
      if (initialStatus) query.set("status", initialStatus);
      const response = await fetch(`/api/my/offline?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        items?: MyOfflineJobRow[];
        quota?: OfflineQuotaSnapshot;
      };
      if (!response.ok || !payload.items || !payload.quota) {
        throw new Error(payload.error || "刷新离线任务失败");
      }
      setItems(payload.items);
      setQuota(payload.quota);
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新离线任务失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function removeJob(userJobId: number) {
    setOpenMenuId(null);
    setBusyId(userJobId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/my/offline/${userJobId}/remove`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; quota?: OfflineQuotaSnapshot; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "移除任务失败");
      }
      setItems((prev) => prev.filter((item) => item.user_job_id !== userJobId));
      if (payload.quota) {
        setQuota(payload.quota);
      }
      if (payload.message) {
        setNotice(payload.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除任务失败");
    } finally {
      setBusyId(null);
    }
  }

  async function retryJob(userJobId: number) {
    setOpenMenuId(null);
    setRetryingId(userJobId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/my/offline/${userJobId}/retry`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        quota?: OfflineQuotaSnapshot;
        quotaUsedBytes?: number;
        quotaLimitBytes?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || "重试离线任务失败");
      }

      await refreshList();
      setNotice("任务已重新加入离线队列，请稍后刷新状态。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试离线任务失败");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <section className="card offline-quota-card">
        <div>
          <span className="muted">离线存储配额</span>
          <p>
            已用 <strong>{formatBytes(quota.usedBytes)}</strong> / 总量 <strong>{formatBytes(quota.limitBytes)}</strong>
          </p>
          <p className="muted">剩余 {formatBytes(quota.remainingBytes)}</p>
        </div>
        <button className="secondary-btn" disabled={refreshing} onClick={() => refreshList()} type="button">
          {refreshing ? "刷新中..." : canRefresh ? "刷新状态" : "刷新列表"}
        </button>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <section className="card admin-users-list my-offline-list">
        <h2>我的离线任务</h2>
        <div className="table-wrap">
          <table className="my-offline-table">
            <thead>
              <tr>
                <th className="col-id">ID</th>
                <th className="col-torrent">种子</th>
                <th className="col-status">状态</th>
                <th className="col-progress">进度</th>
                <th className="col-speed">速度 / ETA</th>
                <th className="col-updated">更新时间</th>
                <th className="align-right col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="empty-row" colSpan={7}>
                    暂无离线任务
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const progress = `${Math.round(Math.max(0, Math.min(1, Number(item.progress || 0))) * 100)}%`;
                  const firstFile = item.files[0] ?? null;
                  const firstVideo = item.files.find((file) => file.is_video === 1) ?? null;

                  return (
                    <tr key={item.user_job_id}>
                      <td className="col-id">{item.job_id}</td>
                      <td className="torrent-title-cell col-torrent">
                        <Link className="torrent-title-link" href={`/torrent/${item.torrent_id}`} title={item.torrent_name}>
                          {item.torrent_name}
                        </Link>
                      </td>
                      <td className="col-status">
                        <div className="cell-stack">
                          <span
                            className="cell-main text-chip"
                            title={item.job_status === "failed" && item.error_message ? item.error_message : undefined}
                          >
                            {item.job_status}
                          </span>
                        </div>
                      </td>
                      <td className="col-progress">
                        <div className="cell-stack">
                          <span className="cell-main">{progress}</span>
                        </div>
                      </td>
                      <td className="col-speed">
                        <div className="cell-stack">
                          <span className="cell-main">{formatBytes(item.download_speed)}/s</span>
                          <span className="cell-sub">ETA {formatEta(item.eta_seconds)}</span>
                        </div>
                      </td>
                      <td className="muted col-updated" title={new Date(item.job_updated_at).toLocaleString("zh-CN")}>
                        {new Date(item.job_updated_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="align-right col-actions">
                        <OfflineRowActionMenu
                          canDownload={item.job_status === "completed" && Boolean(firstFile)}
                          canPlay={item.job_status === "completed" && Boolean(firstVideo)}
                          canRetry={item.job_status === "failed"}
                          downloadHref={firstFile ? `/offline/files/${firstFile.id}/download` : "#"}
                          onClose={() => setOpenMenuId(null)}
                          onRemove={() => removeJob(item.user_job_id)}
                          onRetry={() => retryJob(item.user_job_id)}
                          onToggle={() => setOpenMenuId((prev) => (prev === item.user_job_id ? null : item.user_job_id))}
                          open={openMenuId === item.user_job_id}
                          playHref={firstVideo ? `/offline/play/${firstVideo.id}` : "#"}
                          retryDisabled={retryingId === item.user_job_id || busyId === item.user_job_id}
                          retryLabel={retryingId === item.user_job_id ? "重试中..." : "重试"}
                          removeDisabled={busyId === item.user_job_id}
                          removeLabel={busyId === item.user_job_id ? "移除中..." : "移除任务"}
                          rowId={item.user_job_id}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
