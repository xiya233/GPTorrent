"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

type MagnetCopyButtonProps = {
  magnetUri: string | null;
  variant?: "icon" | "primary";
};

export function MagnetCopyButton({ magnetUri, variant = "icon" }: MagnetCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const disabled = !magnetUri;
  const isPrimary = variant === "primary";
  const titleText = copied ? "已复制" : disabled ? "暂无磁力链接" : "复制磁力链接";

  return (
    <button
      aria-label={titleText}
      className={isPrimary ? "primary-btn magnet-primary-btn" : "icon-button tiny"}
      disabled={disabled}
      onClick={async () => {
        if (!magnetUri) {
          return;
        }
        try {
          await navigator.clipboard.writeText(magnetUri);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
          alert("复制失败，请手动复制");
        }
      }}
      title={titleText}
      type="button"
    >
      {isPrimary ? (
        <>
          <Link2 size={16} />
          <span>{titleText}</span>
        </>
      ) : (
        <Link2 size={16} />
      )}
    </button>
  );
}
