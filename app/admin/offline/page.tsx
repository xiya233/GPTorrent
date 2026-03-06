import Link from "next/link";
import { adminDeleteOfflineJobAction } from "@/app/admin/offline/actions";
import { requireAdminUser } from "@/lib/auth";
import { listAdminOfflineJobs, type OfflineJobStatus } from "@/lib/db";

type AdminOfflinePageProps = {
  searchParams: Promise<{
    q?: string;
    user?: string;
    status?: OfflineJobStatus | "";
  }>;
};

function formatBytes(size: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Math.max(0, Number(size) || 0);
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = idx <= 1 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

export default async function AdminOfflinePage({ searchParams }: AdminOfflinePageProps) {
  await requireAdminUser();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const byUser = params.user?.trim() ?? "";
  const status = params.status?.trim() ?? "";

  const jobs = listAdminOfflineJobs({
    q,
    user: byUser,
    status: (status as OfflineJobStatus | "") ?? "",
  });

  return (
    <div className="container page-content admin-page">
      <div className="page-heading-row">
        <h1>管理员面板 / 离线任务总览</h1>
        <Link className="primary-btn" href="/admin">
          返回后台首页
        </Link>
      </div>

      <section className="card admin-users-list">
        <h2>离线任务列表</h2>

        <form className="admin-filter-row admin-filter-wide" method="GET">
          <input defaultValue={q} name="q" placeholder="搜索种子标题" type="text" />
          <input defaultValue={byUser} name="user" placeholder="请求用户" type="text" />
          <select defaultValue={status} name="status">
            <option value="">全部状态</option>
            <option value="queued">queued</option>
            <option value="downloading">downloading</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
          <button className="secondary-btn" type="submit">
            筛选
          </button>
        </form>

        <div className="table-wrap">
          <table className="admin-offline-table">
            <thead>
              <tr>
                <th className="col-id">任务ID</th>
                <th className="col-torrent">种子</th>
                <th className="col-user">请求用户</th>
                <th className="col-status">状态</th>
                <th className="col-progress">进度</th>
                <th className="col-bindings">活跃绑定</th>
                <th className="col-updated">更新时间</th>
                <th className="align-right col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td className="empty-row" colSpan={8}>
                    无匹配任务
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const deleteAction = adminDeleteOfflineJobAction.bind(null, job.job_id);
                  return (
                    <tr key={job.job_id}>
                      <td className="col-id">{job.job_id}</td>
                      <td className="torrent-title-cell col-torrent">
                        <Link className="torrent-title-link" href={`/torrent/${job.torrent_id}`} title={job.torrent_name}>
                          {job.torrent_name}
                        </Link>
                      </td>
                      <td className="col-user">{job.requested_by_username}</td>
                      <td className="col-status">
                        <span className="text-chip">{job.status}</span>
                      </td>
                      <td className="col-progress">
                        <div className="cell-stack">
                          <span className="cell-main">
                            {Math.round(Math.max(0, Math.min(1, Number(job.progress || 0))) * 100)}%
                          </span>
                          <span className="cell-sub">
                            {formatBytes(job.downloaded_bytes)} / {formatBytes(job.total_bytes)}
                          </span>
                        </div>
                      </td>
                      <td className="col-bindings">{job.active_user_count}</td>
                      <td className="muted col-updated" title={new Date(job.updated_at).toLocaleString("zh-CN")}>
                        {new Date(job.updated_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="align-right col-actions">
                        <div className="admin-actions">
                          <form action={deleteAction}>
                            <button className="danger-btn tiny-btn table-action-btn" type="submit">
                              删除任务
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
