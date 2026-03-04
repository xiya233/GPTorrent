import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtOfflinePlayer } from "@/components/art-offline-player";
import { requireActiveUser } from "@/lib/auth";
import { getOfflineFileWithJob, hasActiveOfflineJobAccess } from "@/lib/db";

type OfflinePlayPageProps = {
  params: Promise<{ fileId: string }>;
};

export default async function OfflinePlayPage({ params }: OfflinePlayPageProps) {
  const user = await requireActiveUser();
  const { fileId } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    notFound();
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file || file.job_status !== "completed" || file.is_video !== 1) {
    notFound();
  }
  if (user.role !== "admin" && !hasActiveOfflineJobAccess(user.id, file.job_id)) {
    notFound();
  }

  return (
    <div className="container page-content offline-player-page">
      <div className="page-heading-row">
        <h1>在线播放</h1>
        <Link className="secondary-btn" href={`/torrent/${file.job_torrent_id}`}>
          返回种子详情
        </Link>
      </div>

      <section className="card offline-player-card">
        <p className="muted offline-player-file">文件: {file.relative_path}</p>
        <ArtOfflinePlayer
          fileId={file.id}
          initialDownloadUrl={`/offline/files/${file.id}/download`}
          initialError={file.hls_error}
          initialFileName={file.relative_path}
          initialProgress={file.hls_progress}
          initialStatus={file.hls_status}
        />
      </section>
    </div>
  );
}
