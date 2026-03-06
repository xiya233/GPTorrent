import Image from "next/image";
import { ProfileForms } from "@/app/settings/profile/profile-forms";
import { requireActiveUser } from "@/lib/auth";
import { getUploadPolicy } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

export default async function ProfilePage() {
  const user = await requireActiveUser();
  const uploadPolicy = getUploadPolicy();
  const avatarUrl = toMediaUrl(user.avatar_path);

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>账号设置</h1>
      </div>

      <section className="card profile-hero">
        <div className="avatar-wrap">
          {avatarUrl ? (
            <Image alt={`${user.username} avatar`} fill sizes="64px" src={avatarUrl} unoptimized />
          ) : (
            <span>{user.username.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div>
          <strong>{user.username}</strong>
          <p>{user.bio || "这个用户还没有填写 bio"}</p>
        </div>
      </section>

      <ProfileForms
        bio={user.bio}
        isProfilePublic={user.is_profile_public === 1}
        maxAvatarUploadMb={uploadPolicy.maxAvatarUploadMb}
        username={user.username}
      />
    </div>
  );
}
