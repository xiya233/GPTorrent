import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { logoutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { TORRENT_CATEGORIES } from "@/lib/categories";
import { getSiteBranding } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

const categories = ["", ...TORRENT_CATEGORIES];

export async function SiteHeader() {
  const [user, branding] = await Promise.all([getCurrentUser(), Promise.resolve(getSiteBranding())]);
  const logoUrl = toMediaUrl(branding.logoPath);
  const avatarUrl = user ? toMediaUrl(user.avatar_path) : "";

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand-wrap">
          {logoUrl ? (
            <Image alt="site logo" className="header-logo" height={24} src={logoUrl} unoptimized width={24} />
          ) : (
            <span className="brand-dot" />
          )}
          <Link className="brand" href="/">
            {branding.titleText}
          </Link>
        </div>

        <nav className="top-nav">
          <Link className="nav-link" href="/">
            种子
          </Link>
          <Link className="nav-link" href="/upload">
            上传
          </Link>
          {user ? (
            <Link className="nav-link" href="/settings/profile">
              账号设置
            </Link>
          ) : null}
          {user ? (
            <Link className="nav-link" href="/my/torrents">
              我的种子
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link className="nav-link" href="/admin">
              管理后台
            </Link>
          ) : null}
        </nav>

        <form action="/" className="search-bar" method="GET">
          <Search size={16} />
          <input name="q" placeholder="搜索种子..." type="search" />
          <div className="search-divider" />
          <select aria-label="分类" name="category">
            {categories.map((category) => (
              <option key={category || "all"} value={category}>
                {category || "所有分类"}
              </option>
            ))}
          </select>
        </form>

        <div className="header-actions">
          <ThemeToggle />

          {user ? (
            <>
              <div className="mini-user">
                <div className="mini-avatar">
                  {avatarUrl ? (
                    <Image alt={`${user.username} avatar`} fill sizes="32px" src={avatarUrl} unoptimized />
                  ) : (
                    <span>{user.username.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <span>{user.username}</span>
              </div>
              <form action={logoutAction}>
                <button className="secondary-btn tiny-btn" type="submit">
                  登出
                </button>
              </form>
            </>
          ) : (
            <div className="auth-links">
              <Link className="secondary-btn tiny-btn" href="/auth/login">
                登录
              </Link>
              <Link className="primary-btn tiny-btn" href="/auth/register">
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
