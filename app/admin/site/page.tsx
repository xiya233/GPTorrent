import Image from "next/image";
import Link from "next/link";
import { SiteForm } from "@/app/admin/site/site-form";
import { requireAdminUser } from "@/lib/auth";
import { getSiteBranding, getSiteSettings } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

export default async function AdminSitePage() {
  await requireAdminUser();
  const branding = getSiteBranding();
  const settings = getSiteSettings();
  const logoUrl = toMediaUrl(branding.logoPath);

  return (
    <div className="container page-content admin-page">
      <div className="page-heading-row">
        <h1>管理员面板 / 站点配置</h1>
        <Link className="primary-btn" href="/admin">
          返回后台首页
        </Link>
      </div>

      <div className="admin-grid site-grid">
        <SiteForm
          allowGuestUpload={settings.allowGuestUpload}
          allowGuestTorrentImageUpload={settings.allowGuestTorrentImageUpload}
          allowUserRegister={settings.allowUserRegister}
          allowUserDeleteTorrent={settings.allowUserDeleteTorrent}
          descriptionText={branding.descriptionText}
          enableLoginCaptcha={settings.enableLoginCaptcha}
          enableRegisterCaptcha={settings.enableRegisterCaptcha}
          guestTorrentFileMaxMb={settings.guestTorrentFileMaxMb}
          hasLogo={Boolean(branding.logoPath)}
          maxAvatarUploadMb={settings.maxAvatarUploadMb}
          maxTorrentImageUploadMb={settings.maxTorrentImageUploadMb}
          singleUserMode={settings.singleUserMode}
          titleText={branding.titleText}
          userTorrentFileMaxMb={settings.userTorrentFileMaxMb}
        />

        <section className="card site-preview">
          <h2>预览</h2>
          <div className="preview-brand">
            {logoUrl ? (
              <Image alt="site logo" className="preview-logo" height={48} src={logoUrl} unoptimized width={48} />
            ) : (
              <span className="brand-dot" />
            )}
            <strong>{branding.titleText}</strong>
          </div>
        </section>
      </div>
    </div>
  );
}
