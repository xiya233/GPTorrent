import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MagnetCopyButton } from "@/components/magnet-copy-button";
import { OfflineJobCard } from "@/components/offline-job-card";
import { TorrentImageGallery } from "@/components/torrent-image-gallery";
import { getCurrentUser } from "@/lib/auth";
import { getOfflineJobDetailByTorrentId, getSiteFeatureFlags, getTorrentDetailById } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

type TorrentDetailPageProps = {
  params: Promise<{ id: string }>;
};

function parseDateMaybeUtc(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

function formatDate(value: string) {
  return parseDateMaybeUtc(value).toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(sizeBytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex <= 1 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function normalizeFilePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

function createOfflineFileMap(
  files: Array<{ id: number; torrent_file_id: number | null; relative_path: string; size_bytes: number; is_video: number }>,
) {
  const byTorrentFileId = new Map<number, { id: number; relative_path: string; size_bytes: number; is_video: number }>();
  const byPath = new Map<string, { id: number; relative_path: string; size_bytes: number; is_video: number }>();
  const byBaseAndSize = new Map<string, { id: number; relative_path: string; size_bytes: number; is_video: number }>();

  files.forEach((file) => {
    if (Number.isInteger(file.torrent_file_id) && file.torrent_file_id && !byTorrentFileId.has(file.torrent_file_id)) {
      byTorrentFileId.set(file.torrent_file_id, file);
    }

    const normalized = normalizeFilePath(file.relative_path);
    if (!byPath.has(normalized)) {
      byPath.set(normalized, file);
    }

    const key = `${path.basename(normalized).toLowerCase()}::${Math.floor(file.size_bytes)}`;
    if (!byBaseAndSize.has(key)) {
      byBaseAndSize.set(key, file);
    }
  });

  return {
    find(torrentFile: { id: number; file_path: string; file_size_bytes: number }) {
      const direct = byTorrentFileId.get(torrentFile.id);
      if (direct) {
        return direct;
      }

      const normalized = normalizeFilePath(torrentFile.file_path);
      const byExactPath = byPath.get(normalized);
      if (byExactPath) {
        return byExactPath;
      }

      const key = `${path.basename(normalized).toLowerCase()}::${Math.floor(torrentFile.file_size_bytes)}`;
      return byBaseAndSize.get(key) ?? null;
    },
  };
}

export default async function TorrentDetailPage({ params }: TorrentDetailPageProps) {
  const { id } = await params;
  const torrentId = Number(id);
  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    notFound();
  }

  const detail = getTorrentDetailById(torrentId);
  if (!detail || detail.torrent.status !== "active") {
    notFound();
  }
  const offlineDetail = getOfflineJobDetailByTorrentId(torrentId);

  const user = await getCurrentUser();
  const flags = getSiteFeatureFlags();

  const isAdmin = user?.role === "admin";
  const isOwner = Boolean(user && detail.torrent.uploader_user_id === user.id);
  const canEdit = Boolean(isAdmin || isOwner);
  const canDelete = Boolean(canEdit && (isAdmin || flags.allowUserDeleteTorrent));
  const canStartOffline = Boolean(user);
  const offlineFileMap =
    offlineDetail?.job.status === "completed"
      ? createOfflineFileMap(offlineDetail.files)
      : null;

  const uploaderName = detail.torrent.is_anonymous === 1 ? "匿名用户" : detail.torrent.uploader_name;

  return (
    <div className="container page-content torrent-detail-page">
      <div className="page-heading-row detail-heading-row">
        <h1 className="detail-title" title={detail.torrent.name}>
          {detail.torrent.name}
        </h1>
        <div className="detail-actions">
          <a className="primary-btn" href={`/download/${detail.torrent.id}`}>
            下载种子
          </a>
          <MagnetCopyButton magnetUri={detail.torrent.magnet_uri} variant="primary" />
          {canEdit ? (
            <Link className="primary-btn" href={`/my/torrents/${detail.torrent.id}/edit`}>
              编辑
            </Link>
          ) : null}
          {canDelete ? (
            <form action={`/api/torrents/${detail.torrent.id}/delete`} method="POST">
              <input name="redirectTo" type="hidden" value="/" />
              <button className="primary-btn" type="submit">
                删除
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <section className="card detail-meta-grid">
        <div>
          <span>分类</span>
          <strong>{detail.torrent.category}</strong>
        </div>
        <div>
          <span>上传者</span>
          <strong>{uploaderName}</strong>
        </div>
        <div>
          <span>大小</span>
          <strong>{detail.torrent.size_display}</strong>
        </div>
        <div>
          <span>上传时间</span>
          <strong>{formatDate(detail.torrent.created_at)}</strong>
        </div>
        <div>
          <span>Seeder</span>
          <strong className="seeds">{detail.torrent.seeds.toLocaleString("zh-CN")}</strong>
        </div>
        <div>
          <span>Leecher</span>
          <strong className="leechers">{detail.torrent.leechers.toLocaleString("zh-CN")}</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{detail.torrent.completed.toLocaleString("zh-CN")}</strong>
        </div>
        <div>
          <span>Tracker更新</span>
          <strong>{detail.torrent.tracker_last_checked_at ? formatDate(detail.torrent.tracker_last_checked_at) : "待抓取"}</strong>
        </div>
      </section>

      <section className="card detail-section">
        <OfflineJobCard
          canStart={canStartOffline}
          initialJob={offlineDetail?.job ?? null}
          torrentId={detail.torrent.id}
        />
      </section>

      <section className="card detail-section">
        <h2>描述</h2>
        <p className="detail-description">{detail.torrent.description || "暂无描述"}</p>
      </section>

      <section className="card detail-section">
        <h2>种子图片</h2>
        {detail.images.length === 0 ? (
          <p className="muted">暂无图片</p>
        ) : (
          <TorrentImageGallery
            images={detail.images
              .map((img) => {
                const url = toMediaUrl(img.image_path);
                if (!url) return null;
                return { id: img.id, url };
              })
              .filter((item): item is { id: number; url: string } => Boolean(item))}
          />
        )}
      </section>

      <section className="card detail-section">
        <h2>文件列表</h2>
        {detail.files.length === 0 ? (
          <p className="muted">无法解析文件列表</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>路径</th>
                  <th className="align-right">大小</th>
                  <th className="align-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {detail.files.map((file) => (
                  <tr key={file.id}>
                    <td className="file-path-cell">{file.file_path}</td>
                    <td className="align-right muted">{formatBytes(file.file_size_bytes)}</td>
                    <td className="align-center">
                      {offlineFileMap ? (
                        (() => {
                          const offlineFile = offlineFileMap.find(file);
                          if (!offlineFile) {
                            return <span className="muted">-</span>;
                          }
                          return (
                            <div className="detail-file-actions">
                              <a className="secondary-btn tiny-btn" href={`/offline/files/${offlineFile.id}/download`}>
                                下载文件
                              </a>
                              {offlineFile.is_video === 1 ? (
                                <Link className="secondary-btn tiny-btn" href={`/offline/play/${offlineFile.id}`}>
                                  在线播放
                                </Link>
                              ) : null}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="muted">离线完成后可用</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
