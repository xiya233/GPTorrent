import Link from "next/link";
import { notFound } from "next/navigation";
import { TorrentTable } from "@/components/torrent-table";
import { isValidTorrentCategory } from "@/lib/categories";
import { listTorrents } from "@/lib/db";

type CategoryPageProps = {
  params: Promise<{
    category: string;
  }>;
  searchParams: Promise<{
    trusted?: string;
  }>;
};

export default async function CategoryDetailPage({ params, searchParams }: CategoryPageProps) {
  const { category } = await params;
  const search = await searchParams;
  const trustedOnly = search.trusted?.trim() === "1";
  let decoded = category;
  try {
    decoded = decodeURIComponent(category);
  } catch {
    decoded = category;
  }
  const normalized = decoded.trim();

  if (!isValidTorrentCategory(normalized)) {
    notFound();
  }

  const torrents = listTorrents({
    category: normalized,
    trustedOnly,
    limit: 120,
  });

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>分类：{normalized}</h1>
        <div className="page-heading-actions">
          <Link className="primary-btn" href={`/rss.xml?category=${encodeURIComponent(normalized)}`}>
            RSS 订阅（本分类）
          </Link>
          <Link className="primary-btn" href="/categories">
            返回分类
          </Link>
        </div>
      </div>

      {trustedOnly ? <p className="filter-hint">当前筛选：仅信任</p> : null}

      <TorrentTable emptyText="该分类下暂无种子" torrents={torrents} />
    </div>
  );
}
