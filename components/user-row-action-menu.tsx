"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type UserStatus = "active" | "banned" | "deleted";

type UserRowActionMenuProps = {
  rowId: number;
  quotaGb: number;
  userStatus: UserStatus;
  onSaveQuota: (formData: FormData) => void | Promise<void>;
  onBan: () => void | Promise<void>;
  onUnban: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export function UserRowActionMenu({
  rowId,
  quotaGb,
  userStatus,
  onSaveQuota,
  onBan,
  onUnban,
  onDelete,
}: UserRowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 156,
  });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    const updatePos = () => {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, 156);
      const estimatedHeight = menuRef.current?.getBoundingClientRect().height || 220;
      const gap = 6;

      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      let top = rect.bottom + gap;

      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        top = rect.top - estimatedHeight - gap;
      }

      if (top + estimatedHeight > window.innerHeight - 8) {
        top = window.innerHeight - estimatedHeight - 8;
      }
      top = Math.max(8, top);

      let left = rect.right - menuWidth;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      left = Math.max(8, left);

      setMenuPos({ top, left, width: menuWidth });
    };

    const frame = requestAnimationFrame(updatePos);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, userStatus]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = rootRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
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

  return (
    <div className="user-row-menu" ref={rootRef}>
      <button
        aria-controls={open ? `user-row-menu-${rowId}` : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className="secondary-btn tiny-btn table-action-btn fixed-action-btn"
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        操作
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="user-row-menu-dropdown-floating"
              id={`user-row-menu-${rowId}`}
              ref={menuRef}
              role="menu"
              style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, minWidth: `${menuPos.width}px` }}
            >
              <form
                action={onSaveQuota}
                className="user-row-menu-quota-form"
                onSubmit={() => {
                  setOpen(false);
                }}
              >
                <input defaultValue={quotaGb} min={1} name="offlineQuotaGb" title="离线配额(GB)" type="number" />
                <button className="user-row-menu-item" type="submit">
                  保存配额
                </button>
              </form>

              {userStatus === "active" ? (
                <form
                  action={onBan}
                  onSubmit={() => {
                    setOpen(false);
                  }}
                >
                  <button className="user-row-menu-item" type="submit">
                    封禁
                  </button>
                </form>
              ) : null}

              {userStatus === "banned" ? (
                <form
                  action={onUnban}
                  onSubmit={() => {
                    setOpen(false);
                  }}
                >
                  <button className="user-row-menu-item" type="submit">
                    解封
                  </button>
                </form>
              ) : null}

              {userStatus !== "deleted" ? (
                <form
                  action={onDelete}
                  onSubmit={() => {
                    setOpen(false);
                  }}
                >
                  <button className="user-row-menu-item is-danger" type="submit">
                    删除
                  </button>
                </form>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
