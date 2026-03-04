"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type OfflineStartButtonProps = {
  torrentId: number;
  isLoggedIn: boolean;
};

export function OfflineStartButton({ torrentId, isLoggedIn }: OfflineStartButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onStart() {
    if (pending) {
      return;
    }

    if (!isLoggedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(`/torrent/${torrentId}`)}`);
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/torrents/${torrentId}/offline/start`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "创建离线任务失败");
      }
      router.push("/my/offline");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建离线任务失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="offline-start-wrap">
      <button className="primary-btn" disabled={pending} onClick={onStart} type="button">
        {pending ? "加入中..." : "离线下载"}
      </button>
      {error ? <p className="form-error offline-start-error">{error}</p> : null}
    </div>
  );
}
