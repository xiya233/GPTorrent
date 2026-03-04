"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type HeaderUserMenuProps = {
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
  logoutAction: () => void;
};

export function HeaderUserMenu({ username, avatarUrl, isAdmin, logoutAction }: HeaderUserMenuProps) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="user-menu-root" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`user-menu-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <div className="mini-avatar">
          {avatarUrl ? (
            <Image alt={`${username} avatar`} fill sizes="36px" src={avatarUrl} unoptimized />
          ) : (
            <span>{username.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <span className="user-menu-name">{username}</span>
        <ChevronDown className="user-menu-chevron" size={16} />
      </button>

      {open ? (
        <div className="user-menu-dropdown" role="menu">
          <Link
            className={`user-menu-item${pathname.startsWith("/settings/profile") ? " is-active" : ""}`}
            href="/settings/profile"
            role="menuitem"
          >
            账号设置
          </Link>
          <Link
            className={`user-menu-item${pathname.startsWith("/my/offline") ? " is-active" : ""}`}
            href="/my/offline"
            role="menuitem"
          >
            离线下载
          </Link>
          <Link
            className={`user-menu-item${pathname.startsWith("/my/torrents") ? " is-active" : ""}`}
            href="/my/torrents"
            role="menuitem"
          >
            我的种子
          </Link>
          {isAdmin ? (
            <Link
              className={`user-menu-item${pathname.startsWith("/admin") ? " is-active" : ""}`}
              href="/admin"
              role="menuitem"
            >
              管理后台
            </Link>
          ) : null}
          <div className="user-menu-separator" />
          <form action={logoutAction}>
            <button className="user-menu-item user-menu-logout" type="submit">
              退出登录
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
