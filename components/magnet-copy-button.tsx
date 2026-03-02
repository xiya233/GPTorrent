"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

type MagnetCopyButtonProps = {
  magnetUri: string | null;
};

export function MagnetCopyButton({ magnetUri }: MagnetCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const disabled = !magnetUri;

  return (
    <button
      aria-label={disabled ? "暂无磁力链接" : "复制磁力链接"}
      className="icon-button tiny"
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
      title={copied ? "已复制" : disabled ? "暂无磁力链接" : "复制磁力链接"}
      type="button"
    >
      <Link2 size={16} />
    </button>
  );
}
