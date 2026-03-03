import Link from "next/link";
import { TorrentTable } from "@/components/torrent-table";
import { listTorrents } from "@/lib/db";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
  }>;
};

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

      <TorrentTable torrents={torrents} />
    </div>
  );
}
