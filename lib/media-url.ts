export function toMediaUrl(relativePath: string) {
  if (!relativePath) {
    return "";
  }

  const fileName = relativePath.split("/").pop();
  if (!fileName) {
    return "";
  }

  if (relativePath.startsWith("avatars/")) {
    return `/media/avatars/${encodeURIComponent(fileName)}`;
  }

  if (relativePath.startsWith("site/")) {
    return `/media/site/${encodeURIComponent(fileName)}`;
  }

  if (relativePath.startsWith("torrent-images/")) {
    return `/media/torrent-images/${encodeURIComponent(fileName)}`;
  }

  return "";
}
