"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type OfflineRowActionMenuProps = {
  rowId: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  canDownload: boolean;
  downloadHref: string;
  canPlay: boolean;
  playHref: string;
  canRetry: boolean;
  retryDisabled: boolean;
  retryLabel: string;
  onRetry: () => void;
  removeDisabled: boolean;
  removeLabel: string;
  onRemove: () => void;
};

export function OfflineRowActionMenu({
  rowId,
  open,
  onToggle,
  onClose,
  canDownload,
  downloadHref,
  canPlay,
  playHref,
  canRetry,
  retryDisabled,
  retryLabel,
  onRetry,
  removeDisabled,
  removeLabel,
  onRemove,
}: OfflineRowActionMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 136,
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
      const menuWidth = Math.max(rect.width, 136);
      const estimatedHeight = menuRef.current?.getBoundingClientRect().height || 168;
      const gap = 6;

      let top = rect.bottom + gap;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - gap);
      }

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
  }, [open, canDownload, canPlay, canRetry]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = rootRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        onClose();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  return (
    <div className="row-action-menu-root" ref={rootRef}>
      <button
        aria-controls={open ? `offline-row-action-menu-${rowId}` : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className="secondary-btn tiny-btn table-action-btn row-action-trigger"
        onClick={onToggle}
        ref={triggerRef}
        type="button"
      >
        操作
      </button>

      {open ? (
        createPortal(
          <div
            className="row-action-menu-dropdown"
            id={`offline-row-action-menu-${rowId}`}
            ref={menuRef}
            role="menu"
            style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, minWidth: `${menuPos.width}px` }}
          >
            {canDownload ? (
              <Link className="row-action-menu-item" href={downloadHref} onClick={onClose} role="menuitem">
                下载
              </Link>
            ) : (
              <button
                aria-disabled="true"
                className="row-action-menu-item is-disabled"
                disabled
                title="任务未完成，暂不可用"
                type="button"
              >
                下载
              </button>
            )}

            {canPlay ? (
              <Link className="row-action-menu-item" href={playHref} onClick={onClose} role="menuitem">
                播放
              </Link>
            ) : (
              <button
                aria-disabled="true"
                className="row-action-menu-item is-disabled"
                disabled
                title="任务未完成，暂不可用"
                type="button"
              >
                播放
              </button>
            )}

            {canRetry ? (
              <button
                className="row-action-menu-item"
                disabled={retryDisabled}
                onClick={() => {
                  onClose();
                  onRetry();
                }}
                type="button"
              >
                {retryLabel}
              </button>
            ) : null}

            <button
              className="row-action-menu-item is-danger"
              disabled={removeDisabled}
              onClick={() => {
                onClose();
                onRemove();
              }}
              type="button"
            >
              {removeLabel}
            </button>
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}
