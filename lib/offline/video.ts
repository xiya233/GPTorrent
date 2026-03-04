import path from "node:path";

const VIDEO_EXTS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".ts",
  ".m2ts",
  ".mpg",
  ".mpeg",
  ".3gp",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".3gp": "video/3gpp",
  ".m3u8": "application/vnd.apple.mpegurl",
};

export function getFileExtension(filePath: string) {
  return path.extname(filePath || "").toLowerCase();
}

export function guessMimeType(filePath: string) {
  const ext = getFileExtension(filePath);
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function isVideoPath(filePath: string) {
  return VIDEO_EXTS.has(getFileExtension(filePath));
}
