"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const categories = ["", "动画", "电影", "电视剧", "音乐", "游戏", "软件", "书籍"];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand-wrap">
          <span className="brand-dot" />
          <Link className="brand" href="/">
            Sukebei<span>.dl</span>
          </Link>
        </div>

        <nav className="top-nav">
          <Link className={pathname === "/" ? "nav-link active" : "nav-link"} href="/">
            种子
          </Link>
          <Link className={pathname === "/upload" ? "nav-link active" : "nav-link"} href="/upload">
            上传
          </Link>
          <a className="nav-link" href="#">
            论坛
          </a>
          <a className="nav-link" href="#">
            规则
          </a>
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

        <ThemeToggle />
      </div>
    </header>
  );
}
