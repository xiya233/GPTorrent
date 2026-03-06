import Image from "next/image";
import { notFound } from "next/navigation";
import { TorrentTable } from "@/components/torrent-table";
import { enforceSingleUserModeForGuestPage, getCurrentUser } from "@/lib/auth";
import { getUserProfileByUsername } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

type UserProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  await enforceSingleUserModeForGuestPage();
  const { username } = await params;
  let decoded = username;
  try {
    decoded = decodeURIComponent(username);
  } catch {
    decoded = username;
  }

  const normalized = decoded.trim();
  if (!normalized) {
    notFound();
  }

  const profile = getUserProfileByUsername(normalized);
  if (!profile) {
    notFound();
  }

  const viewer = await getCurrentUser();
  const canViewProfile =
    profile.user.is_profile_public === 1 || viewer?.id === profile.user.id || viewer?.role === "admin";

  if (!canViewProfile) {
    return (
      <div className="container page-content">
        <div className="page-heading-row">
          <h1>{profile.user.username} 的个人资料</h1>
        </div>
        <section className="card">
          <p className="muted">该用户设置了隐私，无法查看个人资料</p>
        </section>
      </div>
    );
  }

  const avatarUrl = toMediaUrl(profile.user.avatar_path);

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>{profile.user.username} 的个人资料</h1>
      </div>

      <section className="card profile-hero">
        <div className="avatar-wrap">
          {avatarUrl ? (
            <Image alt={`${profile.user.username} avatar`} fill sizes="64px" src={avatarUrl} unoptimized />
          ) : (
            <span>{profile.user.username.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div>
          <strong>{profile.user.username}</strong>
          <p>{profile.user.bio || "这个用户还没有填写 bio"}</p>
        </div>
      </section>

      <div className="page-heading-row">
        <h2>公开发布的种子</h2>
      </div>
      <TorrentTable emptyText="该用户暂无公开发布的种子" torrents={profile.torrents} />
    </div>
  );
}
