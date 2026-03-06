import { isValidTorrentCategory } from "@/lib/categories";
import { getSiteBranding, listTorrents } from "@/lib/db";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseDateMaybeUtc(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

function toRfc1123(value: string) {
  const date = parseDateMaybeUtc(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toUTCString();
  }
  return date.toUTCString();
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const categoryRaw = (url.searchParams.get("category") ?? "").trim();
  const category = categoryRaw;

  if (category && !isValidTorrentCategory(category)) {
    return new Response("invalid category", { status: 400 });
  }

  const branding = getSiteBranding();
  const torrents = listTorrents({
    category,
    limit: 120,
  });

  const baseUrl = `${url.protocol}//${url.host}`;
  const channelTitle = category ? `${branding.titleText} - ${category}` : branding.titleText;
  const channelDescription = branding.descriptionText || "BT 种子订阅源";
  const channelLink = category ? `${baseUrl}/categories/${encodeURIComponent(category)}` : `${baseUrl}/`;

  const itemsXml = torrents
    .map((torrent) => {
      const itemLink = `${baseUrl}/torrent/${torrent.id}`;
      const summary = [
        `分类: ${torrent.category}`,
        `大小: ${torrent.size_display}`,
        `上传者: ${torrent.is_anonymous === 1 ? "匿名用户" : torrent.uploader_name || "访客"}`,
        torrent.tags ? `标签: ${torrent.tags}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      return [
        "<item>",
        `<title>${escapeXml(torrent.name)}</title>`,
        `<link>${escapeXml(itemLink)}</link>`,
        `<guid isPermaLink="false">torrent-${torrent.id}-${escapeXml(torrent.updated_at)}</guid>`,
        `<pubDate>${escapeXml(toRfc1123(torrent.created_at))}</pubDate>`,
        `<category>${escapeXml(torrent.category)}</category>`,
        `<description>${escapeXml(summary)}</description>`,
        `<enclosure url="${escapeXml(`${baseUrl}/download/${torrent.id}`)}" length="${Math.max(0, Math.floor(torrent.size_bytes))}" type="application/x-bittorrent" />`,
        "</item>",
      ].join("");
    })
    .join("");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<rss version=\"2.0\">",
    "<channel>",
    `<title>${escapeXml(channelTitle)}</title>`,
    `<link>${escapeXml(channelLink)}</link>`,
    `<description>${escapeXml(channelDescription)}</description>`,
    `<lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>`,
    itemsXml,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
