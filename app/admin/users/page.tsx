import Link from "next/link";
import { CreateUserForm } from "@/app/admin/users/create-user-form";
import { adminBanUserAction, adminDeleteUserAction, adminUnbanUserAction } from "@/app/admin/users/actions";
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
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th className="align-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td className="empty-row" colSpan={6}>
                      无匹配用户
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const banAction = adminBanUserAction.bind(null, user.id);
                    const unbanAction = adminUnbanUserAction.bind(null, user.id);
                    const deleteAction = adminDeleteUserAction.bind(null, user.id);

                    return (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.username}</td>
                        <td>{user.role}</td>
                        <td>{user.status}</td>
                        <td className="muted">{new Date(user.created_at).toLocaleString("zh-CN")}</td>
                        <td className="align-right">
                          <div className="admin-actions">
                            {user.status === "active" ? (
                              <form action={banAction}>
                                <button className="secondary-btn tiny-btn" type="submit">
                                  封禁
                                </button>
                              </form>
                            ) : null}

                            {user.status === "banned" ? (
                              <form action={unbanAction}>
                                <button className="secondary-btn tiny-btn" type="submit">
                                  解封
                                </button>
                              </form>
                            ) : null}

                            {user.status !== "deleted" ? (
                              <form action={deleteAction}>
                                <button className="danger-btn tiny-btn" type="submit">
                                  删除
                                </button>
                              </form>
                            ) : null}
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
    </div>
  );
}
