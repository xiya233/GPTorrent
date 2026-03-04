"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OfflinePlayStatusResponse, OfflinePlayerState, OfflinePosterState } from "@/lib/offline/player";

type ArtOfflinePlayerProps = {
  fileId: number;
  initialStatus: OfflinePlayerState;
  initialError: string;
  initialProgress: number;
  initialFileName: string;
  initialDownloadUrl: string;
};

type PreparePlayResponse = {
  ok: boolean;
  hlsStatus: OfflinePlayerState;
  error: string;
  playlistUrl: string;
  hlsProgress?: number;
  hlsVariantCount?: number;
  hlsUpgradeState?: "none" | "queued" | "running" | "failed";
  hlsUpgradeError?: string;
  posterUrl?: string;
  posterStatus?: OfflinePosterState;
  posterError?: string;
  posterScore?: number;
  posterPickTime?: number;
  posterGeneratedAt?: string;
};

const QUALITY_SETTING_NAME = "hls-quality-switch";

type QualityOption = {
  value: number;
  label: string;
};

function isSafariBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const hasSafari = /Safari/i.test(ua);
  const excluded = /Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/i.test(ua);
  return hasSafari && !excluded;
}

function formatPercent(progress: number) {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

function formatDateTime(value: string) {
  if (!value) {
    return "--";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "--";
  }
  return d.toLocaleString("zh-CN", { hour12: false });
}

function normalizeQualityLevel(level: number) {
  return Number.isFinite(level) && level >= 0 ? Math.floor(level) : -1;
}

function buildQualityOptions(hls: any): QualityOption[] {
  const options: QualityOption[] = [{ value: -1, label: "自动" }];
  (hls.levels || []).forEach((level: any, index: number) => {
    const label =
      level?.height && Number.isFinite(level.height)
        ? `${level.height}p`
        : level?.bitrate
          ? `${Math.round(level.bitrate / 1000)} kbps`
          : `清晰度 ${index + 1}`;
    options.push({ value: index, label });
  });
  return options;
}

function syncQualitySetting(art: any, hls: any) {
  const options = buildQualityOptions(hls);
  const currentLevel = normalizeQualityLevel(Number(hls.currentLevel));
  const tooltip = options.find((item) => item.value === currentLevel)?.label || "自动";

  try {
    art.setting.remove(QUALITY_SETTING_NAME);
  } catch {
    // ignore remove errors when setting does not exist
  }

  if (options.length <= 1) {
    return;
  }

  art.setting.add({
    name: QUALITY_SETTING_NAME,
    html: "清晰度",
    tooltip,
    selector: options.map((item) => ({
      html: item.label,
      value: item.value,
      default: item.value === currentLevel,
    })),
    onSelect: (item: { value?: number | string }, element: HTMLDivElement, event: Event) => {
      const target = event.currentTarget as HTMLDivElement | null;
      const nextRaw = item?.value ?? target?.dataset?.value ?? element?.dataset?.value ?? "";
      const next = Number(nextRaw);
      if (!Number.isFinite(next)) {
        return;
      }
      hls.currentLevel = next;
      hls.nextLevel = next;
    },
  });
}

export function ArtOfflinePlayer({
  fileId,
  initialStatus,
  initialError,
  initialProgress,
  initialFileName,
  initialDownloadUrl,
}: ArtOfflinePlayerProps) {
  const [status, setStatus] = useState<OfflinePlayerState>(initialStatus);
  const [error, setError] = useState(initialError);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [hlsProgress, setHlsProgress] = useState(Math.max(0, Math.min(1, initialProgress || 0)));
  const [fileName, setFileName] = useState(initialFileName);
  const [downloadUrl, setDownloadUrl] = useState(initialDownloadUrl);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [hlsVariantCount, setHlsVariantCount] = useState(1);
  const [hlsUpgradeState, setHlsUpgradeState] = useState<"none" | "queued" | "running" | "failed">("none");
  const [hlsUpgradeError, setHlsUpgradeError] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterStatus, setPosterStatus] = useState<OfflinePosterState>("none");
  const [posterError, setPosterError] = useState("");
  const [posterScore, setPosterScore] = useState(0);
  const [posterPickTime, setPosterPickTime] = useState(0);

  const artContainerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const retrySeedRef = useRef(0);
  const retrySeed = retrySeedRef.current;

  const pending = useMemo(() => status === "pending" || status === "running", [status]);
  const canRenderPlayer = status === "ready" && Boolean(playlistUrl);

  async function fetchStatus() {
    const response = await fetch(`/api/offline/files/${fileId}/status`, {
      method: "GET",
      cache: "no-store",
    });

    const payload = (await response.json()) as OfflinePlayStatusResponse | { error?: string };
    if (!response.ok) {
      throw new Error((payload as { error?: string }).error || "状态获取失败");
    }

    const data = payload as OfflinePlayStatusResponse;
    setStatus(data.hlsStatus);
    setError(data.error || "");
    setPlaylistUrl(data.playlistUrl || "");
    setHlsProgress(Math.max(0, Math.min(1, data.hlsProgress || 0)));
    setFileName(data.fileName || initialFileName);
    setDownloadUrl(data.downloadUrl || initialDownloadUrl);
    setLastUpdatedAt(data.lastUpdatedAt || "");
    setHlsVariantCount(Math.max(1, Math.floor(Number(data.hlsVariantCount || 1))));
    setHlsUpgradeState(data.hlsUpgradeState || "none");
    setHlsUpgradeError(data.hlsUpgradeError || "");
    setPosterUrl(data.posterUrl || "");
    setPosterStatus(data.posterStatus || "none");
    setPosterError(data.posterError || "");
    setPosterScore(Math.max(0, Number(data.posterScore || 0)));
    setPosterPickTime(Math.max(0, Number(data.posterPickTime || 0)));
    return data;
  }

  async function preparePlay() {
    setBusy(true);
    try {
      const response = await fetch(`/api/offline/files/${fileId}/prepare-play`, {
        method: "POST",
      });
      const payload = (await response.json()) as PreparePlayResponse | { error?: string };
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || "准备播放失败");
      }

      const data = payload as PreparePlayResponse;
      setStatus(data.hlsStatus);
      setError(data.error || "");
      setPlaylistUrl(data.playlistUrl || "");
      if (typeof data.hlsProgress === "number") {
        setHlsProgress(Math.max(0, Math.min(1, data.hlsProgress)));
      }
      if (typeof data.hlsVariantCount === "number") {
        setHlsVariantCount(Math.max(1, Math.floor(data.hlsVariantCount)));
      }
      if (data.hlsUpgradeState) {
        setHlsUpgradeState(data.hlsUpgradeState);
      }
      setHlsUpgradeError(data.hlsUpgradeError || "");
      setPosterUrl(data.posterUrl || "");
      setPosterStatus(data.posterStatus || "none");
      setPosterError(data.posterError || "");
      if (typeof data.posterScore === "number") {
        setPosterScore(Math.max(0, Number(data.posterScore)));
      }
      if (typeof data.posterPickTime === "number") {
        setPosterPickTime(Math.max(0, Number(data.posterPickTime)));
      }
      retrySeedRef.current += 1;
    } catch (err) {
      setError(err instanceof Error ? err.message : "准备播放失败");
    } finally {
      setBusy(false);
    }
  }

  async function regeneratePoster() {
    setBusy(true);
    try {
      const response = await fetch(`/api/offline/files/${fileId}/poster/regenerate`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; posterStatus?: OfflinePosterState };
      if (!response.ok) {
        throw new Error(payload.error || "重选封面失败");
      }
      setPosterStatus(payload.posterStatus || "queued");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重选封面失败");
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
    const shouldPollPoster = status === "ready" && (posterStatus === "queued" || posterStatus === "running");
    if (!pending && status !== "none" && !shouldPollPoster) {
      return;
    }

    const timer = setInterval(() => {
      fetchStatus().catch((err) => {
        setError(err instanceof Error ? err.message : "状态获取失败");
      });
    }, 2000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, status, fileId, posterStatus]);

  useEffect(() => {
    if (!canRenderPlayer || !artContainerRef.current) {
      return;
    }

    let cancelled = false;
    let saveTimer: ReturnType<typeof setInterval> | null = null;
    const playbackKey = `btshare:play:${fileId}`;

    const cleanup = () => {
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
      try {
        hlsRef.current?.destroy?.();
      } catch {
        // ignore
      }
      hlsRef.current = null;

      try {
        artRef.current?.destroy?.(false);
      } catch {
        // ignore
      }
      artRef.current = null;
    };

    void (async () => {
      try {
        const [{ default: Artplayer }, { default: Hls }] = await Promise.all([import("artplayer"), import("hls.js")]);
        if (cancelled || !artContainerRef.current) {
          return;
        }

        const art = new Artplayer({
          container: artContainerRef.current,
          url: playlistUrl,
          type: "m3u8",
          poster: posterUrl || "",
          autoplay: false,
          autoSize: false,
          pip: true,
          screenshot: true,
          setting: true,
          hotkey: true,
          mutex: true,
          playbackRate: true,
          fullscreen: true,
          fullscreenWeb: true,
          miniProgressBar: true,
          lock: true,
          backdrop: true,
          playsInline: true,
          customType: {
            m3u8: function (video: HTMLVideoElement, url: string) {
              const player = this as any;
              const canNative = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
              const preferNative = isSafariBrowser() && canNative;

              if (preferNative) {
                try {
                  player.setting.remove(QUALITY_SETTING_NAME);
                } catch {
                  // ignore
                }
                video.src = url;
                return;
              }

              if (Hls.isSupported()) {
                const hls = new Hls({
                  enableWorker: true,
                  lowLatencyMode: false,
                });
                hlsRef.current = hls;

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  syncQualitySetting(player, hls);
                });

                hls.on(Hls.Events.LEVEL_SWITCHED, () => {
                  syncQualitySetting(player, hls);
                });

                hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal?: boolean; details?: string }) => {
                  if (data?.fatal) {
                    setError(`播放器错误：${data.details || "HLS_FATAL"}`);
                  }
                });

                hls.loadSource(url);
                hls.attachMedia(video);
                return;
              }

              if (canNative) {
                try {
                  player.setting.remove(QUALITY_SETTING_NAME);
                } catch {
                  // ignore
                }
                video.src = url;
                return;
              }

              setError("当前浏览器不支持 HLS 播放");
            },
          },
        });

        artRef.current = art;

        const saveProgress = () => {
          try {
            const current = Number(art.currentTime || 0);
            if (Number.isFinite(current) && current > 0) {
              localStorage.setItem(playbackKey, String(Math.floor(current)));
            }
          } catch {
            // ignore storage failures
          }
        };

        art.on("ready", () => {
          try {
            const raw = localStorage.getItem(playbackKey);
            const saved = Number(raw || 0);
            if (Number.isFinite(saved) && saved > 3) {
              const duration = Number(art.duration || 0);
              if (!Number.isFinite(duration) || saved < duration - 5) {
                art.currentTime = saved;
              }
            }
          } catch {
            // ignore storage failures
          }
        });

        art.on("pause", saveProgress);
        art.on("video:ended", () => {
          try {
            localStorage.removeItem(playbackKey);
          } catch {
            // ignore
          }
        });
        art.on("destroy", () => {
          try {
            hlsRef.current?.destroy?.();
          } catch {
            // ignore
          }
          hlsRef.current = null;
        });

        saveTimer = setInterval(saveProgress, 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "播放器加载失败");
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [canRenderPlayer, fileId, playlistUrl, retrySeed]);

  useEffect(() => {
    if (!canRenderPlayer || !posterUrl || !artRef.current) {
      return;
    }
    try {
      artRef.current.poster = posterUrl;
    } catch {
      // ignore setter failures
    }
  }, [canRenderPlayer, posterUrl]);

  return (
    <div className="art-player-shell">
      <div className="art-player-toolbar">
        <div className="art-player-meta">
          <p className="art-player-file" title={fileName}>
            文件：{fileName}
          </p>
          <p className="muted">状态更新时间：{formatDateTime(lastUpdatedAt)}</p>
        </div>
        <div className="art-player-tools">
          <a className="secondary-btn tiny-btn" href={downloadUrl}>
            下载文件
          </a>
        </div>
      </div>

      {canRenderPlayer ? <div className="art-player-container" ref={artContainerRef} /> : null}

      {canRenderPlayer ? null : (
        <div className="art-player-status">
          {pending ? <p>正在转码视频，准备播放资源...</p> : null}
          {status === "none" ? <p>等待转码任务启动...</p> : null}
          {status === "failed" ? <p className="form-error">转码失败：{error || "未知错误"}</p> : null}
          <div className="art-progress-track">
            <div className="art-progress-bar" style={{ width: formatPercent(hlsProgress) }} />
          </div>
          <p className="muted">转码进度：{formatPercent(hlsProgress)}</p>
        </div>
      )}

      <div className="art-player-actions">
        <button className="secondary-btn" disabled={busy} onClick={() => fetchStatus().catch(() => {})} type="button">
          刷新状态
        </button>
        <button className="secondary-btn" disabled={busy || status !== "ready"} onClick={regeneratePoster} type="button">
          重选封面
        </button>
        <button className="primary-btn" disabled={busy} onClick={preparePlay} type="button">
          重试播放
        </button>
      </div>

      {status === "ready" && hlsVariantCount <= 1 && (hlsUpgradeState === "queued" || hlsUpgradeState === "running") ? (
        <p className="muted">后台升级多码率中，稍后可切换清晰度。</p>
      ) : null}
      {status === "ready" && hlsVariantCount <= 1 && hlsUpgradeState === "failed" && hlsUpgradeError ? (
        <p className="form-error">多码率升级失败：{hlsUpgradeError}</p>
      ) : null}
      {status === "ready" && (posterStatus === "queued" || posterStatus === "running") ? (
        <p className="muted">正在生成视频封面...</p>
      ) : null}
      {status === "ready" && posterStatus === "failed" && posterError ? (
        <p className="form-error">封面生成失败：{posterError}</p>
      ) : null}
      {status === "ready" && posterStatus === "ready" ? (
        <p className="muted">封面评分：{posterScore.toFixed(3)}，采样时间：{posterPickTime.toFixed(2)}s</p>
      ) : null}
      {error && status !== "failed" ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
