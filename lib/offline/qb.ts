import { getQbConfig } from "@/lib/offline/config";

export type QbTorrentInfo = {
  hash: string;
  progress: number;
  total_size: number;
  dlspeed: number;
  eta: number;
  state: string;
  completion_on: number;
  save_path?: string;
  name?: string;
  added_on?: number;
  tags?: string;
};

export type QbTorrentFile = {
  name: string;
  size: number;
  progress: number;
};

type RequestInitLike = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
};

class QbClient {
  private cookie = "";
  private readonly config = getQbConfig();

  private async login() {
    const params = new URLSearchParams();
    params.set("username", this.config.username);
    params.set("password", this.config.password);

    const response = await fetch(`${this.config.baseUrl}/api/v2/auth/login`, {
      method: "POST",
      body: params,
    });

    if (!response.ok) {
      throw new Error(`qB 登录失败: http ${response.status}`);
    }

    const rawText = (await response.text()).trim();
    // qBittorrent may return "Ok." on some versions/locales.
    const normalized = rawText.toLowerCase();
    if (!/^ok(?:\.)?$/.test(normalized)) {
      throw new Error(`qB 登录失败: ${normalized || "unknown"}`);
    }

    const setCookie = response.headers.get("set-cookie") || "";
    const sidPair = setCookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("SID="));

    if (!sidPair) {
      throw new Error("qB 登录失败: 未返回 SID");
    }

    this.cookie = sidPair;
  }

  private async request(pathname: string, init: RequestInitLike = {}, allowRetry = true): Promise<Response> {
    if (!this.cookie) {
      await this.login();
    }

    const response = await fetch(`${this.config.baseUrl}${pathname}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.headers ?? {}),
        Cookie: this.cookie,
      },
      body: init.body ?? null,
    });

    if ((response.status === 401 || response.status === 403) && allowRetry) {
      await this.login();
      return this.request(pathname, init, false);
    }

    return response;
  }

  async addMagnet(input: { magnetUri: string; savePathAbs: string; tags?: string[] }) {
    const form = new FormData();
    form.set("urls", input.magnetUri);
    form.set("savepath", input.savePathAbs);
    form.set("paused", "false");
    form.set("sequentialDownload", "false");
    if (input.tags && input.tags.length > 0) {
      form.set("tags", input.tags.join(","));
    }

    const response = await this.request("/api/v2/torrents/add", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw new Error(`qB 添加任务失败: http ${response.status}`);
    }
  }

  async getTorrentInfo(hash: string) {
    const response = await this.request(`/api/v2/torrents/info?hashes=${encodeURIComponent(hash)}`);
    if (!response.ok) {
      throw new Error(`qB 获取任务失败: http ${response.status}`);
    }

    const rows = (await response.json()) as QbTorrentInfo[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  async listTorrentsByTag(tag?: string) {
    const params = new URLSearchParams();
    if (tag && tag.trim()) {
      params.set("tag", tag.trim());
    }
    const query = params.toString();
    const response = await this.request(`/api/v2/torrents/info${query ? `?${query}` : ""}`);
    if (!response.ok) {
      throw new Error(`qB 获取任务列表失败: http ${response.status}`);
    }
    const rows = (await response.json()) as QbTorrentInfo[];
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows;
  }

  async findTorrentHashBySavePath(savePathAbs: string, tag?: string) {
    const expected = normalizePath(savePathAbs);
    if (!expected) {
      return null;
    }

    const rows = await this.listTorrentsByTag(tag);
    for (const row of rows) {
      const savePath = normalizePath(row.save_path || "");
      if (savePath === expected) {
        const hash = String(row.hash || "").trim().toLowerCase();
        if (hash) {
          return hash;
        }
      }
    }
    return null;
  }

  async getTorrentFiles(hash: string) {
    const response = await this.request(`/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`);
    if (!response.ok) {
      throw new Error(`qB 获取文件列表失败: http ${response.status}`);
    }

    const rows = (await response.json()) as QbTorrentFile[];
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows;
  }

  async deleteTorrent(hash: string, deleteFiles = false) {
    const form = new URLSearchParams();
    form.set("hashes", hash);
    form.set("deleteFiles", deleteFiles ? "true" : "false");

    const response = await this.request("/api/v2/torrents/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`qB 删除任务失败: http ${response.status}`);
    }
  }
}

function normalizePath(raw: string) {
  return raw.replace(/\\/g, "/").replace(/\/+$/, "").trim();
}

let client: QbClient | null = null;

export function getQbClient() {
  if (!client) {
    client = new QbClient();
  }
  return client;
}
