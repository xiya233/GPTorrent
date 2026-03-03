import Link from "next/link";
import { requireAdminUser } from "@/lib/auth";
import { listAdminTorrents } from "@/lib/db";

type AdminTorrentsPageProps = {
  searchParams: Promise<{
    q?: string;
    uploader?: string;
    status?: string;
  }>;
};

export default async function AdminTorrentsPage({ searchParams }: AdminTorrentsPageProps) {
  await requireAdminUser();

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const uploader = params.uploader?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const torrents = listAdminTorrents({ q, uploader, status });

  return (
    <div className="container page-content admin-page">
      <div className="page-heading-row">
        <h1>管理员面板 / 种子管理</h1>
        <Link className="secondary-btn" href="/admin">
          返回后台首页
        </Link>
      </div>

      <section className="card admin-users-list">
        <h2>种子列表</h2>

        <form className="admin-filter-row admin-filter-wide" method="GET">
          <input defaultValue={q} name="q" placeholder="搜索标题/标签" type="text" />
          <input defaultValue={uploader} name="uploader" placeholder="上传者" type="text" />
          <select defaultValue={status} name="status">
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="deleted_user">deleted_user</option>
            <option value="deleted_admin">deleted_admin</option>
          </select>
          <button className="secondary-btn" type="submit">
            筛选
          </button>
        </form>

        <div className="table-wrap">
          <table className="admin-torrents-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>上传者</th>
                <th>状态</th>
                <th>分类</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {torrents.length === 0 ? (
                <tr>
                  <td className="empty-row" colSpan={6}>
                    无匹配种子
                  </td>
                </tr>
              ) : (
                torrents.map((torrent) => (
                  <tr key={torrent.id}>
                    <td>{torrent.id}</td>
                    <td className="torrent-title-cell">
                      <Link className="torrent-title-link" href={`/torrent/${torrent.id}`} title={torrent.name}>
                        {torrent.name}
                      </Link>
                    </td>
                    <td>{torrent.uploader_display || "访客"}</td>
                    <td>{torrent.status}</td>
                    <td>{torrent.category}</td>
                    <td className="align-right">
                      <div className="admin-actions">
                        {torrent.status === "active" ? (
                          <form action={`/api/torrents/${torrent.id}/delete`} method="POST">
                            <input name="redirectTo" type="hidden" value="/admin/torrents" />
                            <button className="danger-btn tiny-btn" type="submit">
                              删除
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
