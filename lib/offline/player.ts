export type OfflinePlayerState = "none" | "pending" | "running" | "ready" | "failed";
export type OfflinePosterState = "none" | "queued" | "running" | "ready" | "failed";

export type PlayerQualityOption = {
  value: number;
  label: string;
};

export type OfflinePlayStatusResponse = {
  ok: true;
  fileId: number;
  fileName: string;
  isVideo: boolean;
  hlsStatus: OfflinePlayerState;
  error: string;
  playlistUrl: string;
  downloadUrl: string;
  isReady: boolean;
  canPlay: boolean;
  canDownload: boolean;
  hlsProgress: number;
  hlsVariantCount: number;
  hlsUpgradeState: "none" | "queued" | "running" | "failed";
  hlsUpgradeError: string;
  posterUrl: string;
  posterStatus: OfflinePosterState;
  posterError: string;
  posterScore: number;
  posterPickTime: number;
  posterGeneratedAt: string;
  lastUpdatedAt: string;
};
