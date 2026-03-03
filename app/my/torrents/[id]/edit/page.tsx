import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditTorrentForm } from "@/app/my/torrents/[id]/edit/edit-form";
import { requireActiveUser } from "@/lib/auth";
import { getTorrentDetailById, getUploadPolicy } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTorrentPage({ params }: EditPageProps) {
  const user = await requireActiveUser();
  const uploadPolicy = getUploadPolicy();
  const { id } = await params;
  const torrentId = Number(id);

  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    notFound();
  }

  const detail = getTorrentDetailById(torrentId);
  if (!detail) {
    notFound();
  }

  const isOwner = detail.torrent.uploader_user_id === user.id;
  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) {
    redirect("/my/torrents");
  }

  if (detail.torrent.status !== "active") {
    redirect("/my/torrents");
  }

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>编辑种子</h1>
        <Link className="secondary-btn" href={`/torrent/${detail.torrent.id}`}>
          返回详情
        </Link>
      </div>

      <EditTorrentForm
        actionUrl={`/api/torrents/${detail.torrent.id}/update`}
        description={detail.torrent.description}
        images={detail.images
          .map((img) => ({
            id: img.id,
            url: toMediaUrl(img.image_path),
          }))
          .filter((img) => Boolean(img.url))}
        name={detail.torrent.name}
        tags={detail.torrent.tags}
        maxTorrentImageUploadMb={uploadPolicy.maxTorrentImageUploadMb}
      />
    </div>
  );
}
