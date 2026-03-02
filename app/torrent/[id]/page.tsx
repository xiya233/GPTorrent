import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MagnetCopyButton } from "@/components/magnet-copy-button";
import { getCurrentUser } from "@/lib/auth";
import { getSiteFeatureFlags, getTorrentDetailById } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

type TorrentDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
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

  const user = await getCurrentUser();
  const flags = getSiteFeatureFlags();

  const isAdmin = user?.role === "admin";
  const isOwner = Boolean(user && detail.torrent.uploader_user_id === user.id);
  const canEdit = Boolean(isAdmin || isOwner);
  const canDelete = Boolean(canEdit && (isAdmin || flags.allowUserDeleteTorrent));

  const uploaderName = detail.torrent.is_anonymous === 1 ? "匿名用户" : detail.torrent.uploader_name;

  return (
    <div className="container page-content torrent-detail-page">
      <div className="page-heading-row">
        <h1>{detail.torrent.name}</h1>
        <div className="detail-actions">
          <a className="secondary-btn" href={`/download/${detail.torrent.id}`}>
            下载种子
          </a>
          <MagnetCopyButton magnetUri={detail.torrent.magnet_uri} />
          {canEdit ? (
            <Link className="secondary-btn" href={`/my/torrents/${detail.torrent.id}/edit`}>
              编辑
            </Link>
          ) : null}
          {canDelete ? (
            <form action={`/api/torrents/${detail.torrent.id}/delete`} method="POST">
              <input name="redirectTo" type="hidden" value="/" />
              <button className="danger-btn tiny-btn" type="submit">
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
        <h2>描述</h2>
        <p className="detail-description">{detail.torrent.description || "暂无描述"}</p>
      </section>

      <section className="card detail-section">
        <h2>种子图片</h2>
        {detail.images.length === 0 ? (
          <p className="muted">暂无图片</p>
        ) : (
          <div className="detail-image-grid">
            {detail.images.map((img) => {
              const url = toMediaUrl(img.image_path);
              if (!url) return null;
              return (
                <a className="detail-image-item" href={url} key={img.id} rel="noreferrer" target="_blank">
                  <Image alt="torrent image" fill src={url} unoptimized />
                </a>
              );
            })}
          </div>
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
                </tr>
              </thead>
              <tbody>
                {detail.files.map((file) => (
                  <tr key={file.id}>
                    <td className="file-path-cell">{file.file_path}</td>
                    <td className="align-right muted">{formatBytes(file.file_size_bytes)}</td>
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
