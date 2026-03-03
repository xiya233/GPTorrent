import Link from "next/link";
import { notFound } from "next/navigation";
import { TorrentTable } from "@/components/torrent-table";
import { isValidTorrentCategory } from "@/lib/categories";
import { listTorrents } from "@/lib/db";

type CategoryPageProps = {
  params: Promise<{
    category: string;
  }>;
};

export default async function CategoryDetailPage({ params }: CategoryPageProps) {
  const { category } = await params;
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
    limit: 120,
  });

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>分类：{normalized}</h1>
        <Link className="secondary-btn" href="/categories">
          返回分类
        </Link>
      </div>

      <TorrentTable emptyText="该分类下暂无种子" torrents={torrents} />
    </div>
  );
}
