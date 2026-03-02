import Link from "next/link";
import { Download, Link2 } from "lucide-react";
import { listTorrents, type TorrentRow } from "@/lib/db";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
  }>;
};

const badgeClass: Record<string, string> = {
  动画: "badge-red",
  音乐: "badge-purple",
  电影: "badge-blue",
  游戏: "badge-green",
  书籍: "badge-yellow",
  软件: "badge-indigo",
};

function formatRelativeTime(value: string) {
  const date = new Date(value.replace(" ", "T"));
  const diffMs = Date.now() - date.getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (diffMs < hour) {
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
    .filter(Boolean)
    .slice(0, 2);

  return (
    <div className="tag-list">
      <span className="small-tag">免费下载</span>
      {row.is_trusted ? <span className="small-tag trusted">信任种子</span> : null}
      {tags.map((tag) => (
        <span className="small-tag" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const torrents = listTorrents({ q, category, limit: 120 });

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>最近更新</h1>
        <Link className="primary-btn" href="/upload">
          上传种子
        </Link>
      </div>

      {(q || category) && (
        <p className="filter-hint">
          当前筛选: {q ? `关键词 “${q}”` : "全部关键词"}
          {category ? ` · 分类 “${category}”` : " · 全部分类"}
        </p>
      )}

      <section className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th className="align-center">下载</th>
                <th className="align-right">大小</th>
                <th className="align-right">日期</th>
                <th className="align-center">↑</th>
                <th className="align-center">↓</th>
                <th className="align-center">✓</th>
              </tr>
            </thead>
            <tbody>
              {torrents.length === 0 ? (
                <tr>
                  <td className="empty-row" colSpan={8}>
                    没有匹配的种子
                  </td>
                </tr>
              ) : (
                torrents.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={`type-badge ${badgeClass[row.category] ?? "badge-gray"}`}>
                        {row.category}
                      </span>
                    </td>
                    <td>
                      <div className="torrent-name-wrap">
                        <strong>{row.name}</strong>
                        {renderTags(row)}
                      </div>
                    </td>
                    <td className="align-center">
                      <div className="action-icons">
                        <button aria-label="下载" className="icon-button tiny" type="button">
                          <Download size={16} />
                        </button>
                        <button aria-label="复制链接" className="icon-button tiny" type="button">
                          <Link2 size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="align-right muted">{row.size_display}</td>
                    <td className="align-right muted">{formatRelativeTime(row.created_at)}</td>
                    <td className="align-center seeds">{row.seeds.toLocaleString("zh-CN")}</td>
                    <td className="align-center leechers">{row.leechers.toLocaleString("zh-CN")}</td>
                    <td className="align-center muted">{row.completed.toLocaleString("zh-CN")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
