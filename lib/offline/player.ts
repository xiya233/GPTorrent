export type OfflinePlayerState = "none" | "pending" | "running" | "ready" | "failed";

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
  lastUpdatedAt: string;
};
