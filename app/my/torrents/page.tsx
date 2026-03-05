import Link from "next/link";
import { requireActiveUser } from "@/lib/auth";
import { getSiteFeatureFlags, listMyTorrents } from "@/lib/db";

export default async function MyTorrentsPage() {
  const user = await requireActiveUser();
  const torrents = listMyTorrents(user.id);
  const flags = getSiteFeatureFlags();

  return (
    <div className="container page-content">
      <div className="page-heading-row">
        <h1>我的种子</h1>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="my-torrents-table">
            <thead>
              <tr>
                <th className="col-id">ID</th>
                <th>标题</th>
                <th className="col-status">状态</th>
                <th className="col-category">分类</th>
                <th className="align-right col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {torrents.length === 0 ? (
                <tr>
                  <td className="empty-row" colSpan={5}>
                    暂无你上传的种子
                  </td>
                </tr>
              ) : (
                torrents.map((torrent) => (
                  <tr key={torrent.id}>
                    <td className="col-id">{torrent.id}</td>
                    <td className="torrent-title-cell">
                      <Link className="torrent-title-link" href={`/torrent/${torrent.id}`} title={torrent.name}>
                        {torrent.name}
                      </Link>
                    </td>
                    <td className="col-status">{torrent.status}</td>
                    <td className="col-category">{torrent.category}</td>
                    <td className="align-right col-actions">
                      <div className="admin-actions">
                        {torrent.status === "active" ? (
                          <Link
                            className="secondary-btn tiny-btn table-action-btn fixed-action-btn"
                            href={`/my/torrents/${torrent.id}/edit`}
                          >
                            编辑
                          </Link>
                        ) : null}
                        {torrent.status === "active" && flags.allowUserDeleteTorrent ? (
                          <form action={`/api/torrents/${torrent.id}/delete`} method="POST">
                            <input name="redirectTo" type="hidden" value="/my/torrents" />
                            <button className="danger-btn tiny-btn table-action-btn fixed-action-btn" type="submit">
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
