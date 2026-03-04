"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type OfflinePlayerProps = {
  fileId: number;
  initialStatus: "none" | "pending" | "running" | "ready" | "failed";
  initialError: string;
};

type FileStatusResponse = {
  ok: boolean;
  hlsStatus: "none" | "pending" | "running" | "ready" | "failed";
  error: string;
  playlistUrl: string;
};

export function OfflinePlayer({ fileId, initialStatus, initialError }: OfflinePlayerProps) {
  const [status, setStatus] = useState<OfflinePlayerProps["initialStatus"]>(initialStatus);
  const [error, setError] = useState(initialError);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const pending = useMemo(() => status === "pending" || status === "running", [status]);

  async function fetchStatus() {
    const response = await fetch(`/api/offline/files/${fileId}/status`, {
      method: "GET",
      cache: "no-store",
    });

    const payload = (await response.json()) as FileStatusResponse | { error?: string };
    if (!response.ok) {
      throw new Error((payload as { error?: string }).error || "状态获取失败");
    }

    const data = payload as FileStatusResponse;
    setStatus(data.hlsStatus);
    setError(data.error || "");
    setPlaylistUrl(data.playlistUrl || "");
    return data;
  }

  async function preparePlay() {
    setBusy(true);
    try {
      const response = await fetch(`/api/offline/files/${fileId}/prepare-play`, {
        method: "POST",
      });
      const payload = (await response.json()) as
        | { ok: boolean; hlsStatus: OfflinePlayerProps["initialStatus"]; error: string; playlistUrl: string }
        | { error?: string };

      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || "准备播放失败");
      }

      const data = payload as { ok: boolean; hlsStatus: OfflinePlayerProps["initialStatus"]; error: string; playlistUrl: string };
      setStatus(data.hlsStatus);
      setError(data.error || "");
      setPlaylistUrl(data.playlistUrl || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "准备播放失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (status === "none" || status === "failed") {
      preparePlay();
      return;
    }
    if (status === "ready" && !playlistUrl) {
      fetchStatus().catch((err) => {
        setError(err instanceof Error ? err.message : "状态获取失败");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    if (!pending && status !== "none") {
      return;
    }

    const timer = setInterval(() => {
      fetchStatus().catch((err) => {
        setError(err instanceof Error ? err.message : "状态获取失败");
      });
    }, 2500);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, status, fileId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || status !== "ready" || !playlistUrl) {
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      return;
    }

    let cancelled = false;
    let hlsInstance: { destroy: () => void } | null = null;

    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) {
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(playlistUrl);
          hls.attachMedia(video);
          hlsInstance = hls;
        } else {
          video.src = playlistUrl;
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "播放器加载失败");
      });

    return () => {
      cancelled = true;
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [playlistUrl, status]);

  return (
    <div className="offline-player-wrap">
      {status === "ready" ? <video className="offline-video" controls ref={videoRef} /> : null}
      {status === "ready" ? null : (
        <div className="offline-player-status">
          {pending ? <p>正在准备播放资源，请稍候...</p> : null}
          {busy ? <p>正在提交转码任务...</p> : null}
          {status === "failed" ? <p className="form-error">转码失败：{error || "未知错误"}</p> : null}
          {status === "none" ? <p>等待转码任务启动...</p> : null}
        </div>
      )}

      <div className="offline-player-actions">
        <button className="secondary-btn" disabled={busy} onClick={() => fetchStatus().catch(() => {})} type="button">
          刷新状态
        </button>
        <button className="primary-btn" disabled={busy} onClick={preparePlay} type="button">
          重新准备播放
        </button>
      </div>
    </div>
  );
}
