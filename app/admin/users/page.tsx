import Link from "next/link";
import { CreateUserForm } from "@/app/admin/users/create-user-form";
import {
  adminBanUserAction,
  adminDeleteUserAction,
  adminUnbanUserAction,
  adminUpdateUserOfflineQuotaAction,
} from "@/app/admin/users/actions";
import { requireAdminUser } from "@/lib/auth";
import { listUsers, type UserStatus } from "@/lib/db";

type AdminUsersPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: UserStatus | "";
  }>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  await requireAdminUser();

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const users = listUsers({ q, status: (status as UserStatus | "") ?? "" });

  return (
    <div className="container page-content admin-page">
      <div className="page-heading-row">
        <h1>管理员面板 / 用户管理</h1>
        <Link className="secondary-btn" href="/admin">
          返回后台首页
        </Link>
      </div>

      <div className="admin-grid">
        <CreateUserForm />

        <section className="card admin-users-list">
          <h2>用户列表</h2>

          <form className="admin-filter-row" method="GET">
            <input defaultValue={q} name="q" placeholder="搜索用户名" type="text" />
            <select defaultValue={status} name="status">
              <option value="">全部状态</option>
              <option value="active">active</option>
              <option value="banned">banned</option>
              <option value="deleted">deleted</option>
            </select>
            <button className="secondary-btn" type="submit">
              筛选
            </button>
          </form>

          <div className="table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-username">用户名</th>
                  <th className="col-role">角色</th>
                  <th className="col-status">状态</th>
                  <th className="col-quota">离线配额</th>
                  <th className="col-created">创建时间</th>
                  <th className="align-right col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td className="empty-row" colSpan={7}>
                      无匹配用户
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const banAction = adminBanUserAction.bind(null, user.id);
                    const unbanAction = adminUnbanUserAction.bind(null, user.id);
                    const deleteAction = adminDeleteUserAction.bind(null, user.id);
                    const updateQuotaAction = adminUpdateUserOfflineQuotaAction.bind(null, user.id);
                    const quotaGb = Math.max(1, Math.floor((user.offline_quota_bytes || 0) / (1024 * 1024 * 1024)));

                    return (
                      <tr key={user.id}>
                        <td className="col-id">{user.id}</td>
                        <td className="col-username" title={user.username}>
                          {user.username}
                        </td>
                        <td className="col-role">{user.role}</td>
                        <td className="col-status">{user.status}</td>
                        <td className="col-quota">
                          <span className="quota-value">{quotaGb} GiB</span>
                        </td>
                        <td className="muted col-created">{new Date(user.created_at).toLocaleString("zh-CN")}</td>
                        <td className="align-right col-actions">
                          <details className="user-row-menu">
                            <summary className="secondary-btn tiny-btn table-action-btn fixed-action-btn">操作</summary>
                            <div className="user-row-menu-dropdown">
                              <form action={updateQuotaAction} className="user-row-menu-quota-form">
                                <input defaultValue={quotaGb} min={1} name="offlineQuotaGb" title="离线配额(GB)" type="number" />
                                <button className="user-row-menu-item" type="submit">
                                  保存配额
                                </button>
                              </form>
                              {user.status === "active" ? (
                                <form action={banAction}>
                                  <button className="user-row-menu-item" type="submit">
                                    封禁
                                  </button>
                                </form>
                              ) : null}

                              {user.status === "banned" ? (
                                <form action={unbanAction}>
                                  <button className="user-row-menu-item" type="submit">
                                    解封
                                  </button>
                                </form>
                              ) : null}

                              {user.status !== "deleted" ? (
                                <form action={deleteAction}>
                                  <button className="user-row-menu-item is-danger" type="submit">
                                    删除
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </details>
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
    </div>
  );
}
