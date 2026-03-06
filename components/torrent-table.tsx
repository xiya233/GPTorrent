import Link from "next/link";
import { Download } from "lucide-react";
import { MagnetCopyButton } from "@/components/magnet-copy-button";
import { type TorrentRow } from "@/lib/db";

type TorrentTableProps = {
  torrents: TorrentRow[];
  emptyText?: string;
};

const badgeClass: Record<string, string> = {
  动画: "badge-red",
  音乐: "badge-purple",
  电影: "badge-blue",
  电视剧: "badge-cyan",
  游戏: "badge-green",
  书籍: "badge-yellow",
  软件: "badge-indigo",
  成人: "badge-pink",
  其他: "badge-slate",
};

function parseDateMaybeUtc(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "刚刚";
  }
  const date = parseDateMaybeUtc(value);
  const diffMs = Date.now() - date.getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (Number.isNaN(date.getTime()) || diffMs < hour) {
    return "刚刚";
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} 小时前`;
  }
  return `${Math.floor(diffMs / day)} 天前`;
}

function renderTags(row: TorrentRow) {
  const tags = row.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const visibleTags = tags.slice(0, 4);
  const hiddenTagCount = Math.max(tags.length - visibleTags.length, 0);

  return (
    <div className="tag-list">
      {tags.length === 0 && row.is_free_download ? <span className="small-tag">免费下载</span> : null}
      {row.is_trusted ? <span className="small-tag trusted">信任种子</span> : null}
      {row.tracker_last_checked_at ? (
        <span className="small-tag">抓取: {formatRelativeTime(row.tracker_last_checked_at)}</span>
      ) : (
        <span className="small-tag">抓取: 待更新</span>
      )}
      {visibleTags.map((tag) => (
        <span className="small-tag tag-user" key={tag} title={tag}>
          {tag}
        </span>
      ))}
      {hiddenTagCount > 0 ? (
        <span className="small-tag tag-more" title={`还有 ${hiddenTagCount} 个标签`}>
          +{hiddenTagCount}
        </span>
      ) : null}
    </div>
  );
}

function getUploaderName(row: TorrentRow) {
  if (row.is_anonymous === 1) {
    return "匿名用户";
  }
  return row.uploader_name || "访客";
}

function getUploaderProfileHref(row: TorrentRow) {
  if (row.is_anonymous === 1 || row.uploader_user_id === null) {
    return "";
  }
  const name = getUploaderName(row);
  if (!name || name === "访客" || name === "匿名用户") {
    return "";
  }
  return `/u/${encodeURIComponent(name)}`;
}

export function TorrentTable({ torrents, emptyText = "没有匹配的种子" }: TorrentTableProps) {
  return (
    <section className="card table-card">
      <div className="table-wrap">
        <table className="torrent-list-table">
          <thead>
            <tr>
              <th className="torrent-col-type torrent-col-head-center">类型</th>
              <th className="torrent-col-name torrent-col-head-center">名称</th>
              <th className="torrent-col-uploader">发布者</th>
              <th className="align-center torrent-col-download torrent-col-head-center">下载</th>
              <th className="align-right torrent-col-size">大小</th>
              <th className="align-right torrent-col-date">日期</th>
              <th className="align-center torrent-col-stats">↑</th>
              <th className="align-center torrent-col-stats">↓</th>
              <th className="align-center torrent-col-stats">✓</th>
            </tr>
          </thead>
          <tbody>
            {torrents.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={9}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              torrents.map((row) => (
                <tr key={row.id}>
                  <td className="torrent-col-type align-center">
                    <Link href={`/categories/${row.category}`}>
                      <span className={`type-badge ${badgeClass[row.category] ?? "badge-gray"}`}>{row.category}</span>
                    </Link>
                  </td>
                  <td className="torrent-title-cell">
                    <div className="torrent-name-wrap">
                      <strong>
                        <Link className="torrent-title-link" href={`/torrent/${row.id}`} title={row.name}>
                          {row.name}
                        </Link>
                      </strong>
                      {renderTags(row)}
                    </div>
                  </td>
                  <td className="muted uploader-name torrent-col-uploader" title={getUploaderName(row)}>
                    {getUploaderProfileHref(row) ? (
                      <Link className="uploader-profile-link" href={getUploaderProfileHref(row)}>
                        {getUploaderName(row)}
                      </Link>
                    ) : (
                      getUploaderName(row)
                    )}
                  </td>
                  <td className="align-center torrent-col-download">
                    <div className="action-icons">
                      <a aria-label="下载" className="icon-button tiny" href={`/download/${row.id}`}>
                        <Download size={16} />
                      </a>
                      <MagnetCopyButton magnetUri={row.magnet_uri} />
                    </div>
                  </td>
                  <td className="align-right muted torrent-col-size">{row.size_display}</td>
                  <td className="align-right muted torrent-col-date">{formatRelativeTime(row.created_at)}</td>
                  <td className="align-center seeds torrent-col-stats">{row.seeds.toLocaleString("zh-CN")}</td>
                  <td className="align-center leechers torrent-col-stats">{row.leechers.toLocaleString("zh-CN")}</td>
                  <td className="align-center muted torrent-col-stats">{row.completed.toLocaleString("zh-CN")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
