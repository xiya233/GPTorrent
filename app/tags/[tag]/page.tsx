import Link from "next/link";
import { notFound } from "next/navigation";
import { TorrentTable } from "@/components/torrent-table";
import { listTorrentsByTag } from "@/lib/db";

type TagPageProps = {
  params: Promise<{
    tag: string;
  }>;
};

export default async function TagDetailPage({ params }: TagPageProps) {
  const { tag } = await params;
  let decoded = tag;
  try {
    decoded = decodeURIComponent(tag);
  } catch {
    decoded = tag;
  }
  const normalized = decoded.trim();
  if (!normalized) {
    notFound();
  }

  const torrents = listTorrentsByTag(normalized, 120);

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>标签：{normalized}</h1>
        <Link className="secondary-btn" href="/tags">
          返回标签
        </Link>
      </div>

      <TorrentTable emptyText="该标签下暂无种子" torrents={torrents} />
    </div>
  );
}
