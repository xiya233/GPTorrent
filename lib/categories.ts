export const TORRENT_CATEGORIES = [
  "动画",
  "电影",
  "电视剧",
  "音乐",
  "游戏",
  "软件",
  "书籍",
  "成人",
  "其他",
] as const;

export type TorrentCategory = (typeof TORRENT_CATEGORIES)[number];

export function isValidTorrentCategory(value: string): value is TorrentCategory {
  return TORRENT_CATEGORIES.includes(value as TorrentCategory);
}
