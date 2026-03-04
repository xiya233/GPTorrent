import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { logoutAction } from "@/app/auth/actions";
import { HeaderUserMenu } from "@/components/header-user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { TORRENT_CATEGORIES } from "@/lib/categories";
import { getSiteBranding, getSiteSettings } from "@/lib/db";
import { toMediaUrl } from "@/lib/media-url";

const categories = ["", ...TORRENT_CATEGORIES];

export async function SiteHeader() {
  const [user, branding, settings] = await Promise.all([
    getCurrentUser(),
    Promise.resolve(getSiteBranding()),
    Promise.resolve(getSiteSettings()),
  ]);
  const logoUrl = toMediaUrl(branding.logoPath);
  const avatarUrl = user ? toMediaUrl(user.avatar_path) : "";

  return (
    <header className="site-header">
      <div className={`container header-inner${!user ? " header-inner-guest" : ""}`}>
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
          <Link className="nav-link" href="/categories">
            分类
          </Link>
          <Link className="nav-link" href="/tags">
            标签
          </Link>
          <Link className="nav-link" href="/upload">
            上传
          </Link>
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
          <div className="search-divider" />
          <select aria-label="信任筛选" name="trusted">
            <option value="">全部种子</option>
            <option value="1">仅信任</option>
          </select>
        </form>

        <div className="header-actions">
          <ThemeToggle />

          {user ? (
            <HeaderUserMenu
              avatarUrl={avatarUrl}
              isAdmin={user.role === "admin"}
              logoutAction={logoutAction}
              username={user.username}
            />
          ) : (
            <div className="auth-links">
              <Link className="secondary-btn header-auth-btn" href="/auth/login">
                登录
              </Link>
              {settings.allowUserRegister ? (
                <Link className="primary-btn header-auth-btn" href="/auth/register">
                  注册
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
