import Link from "next/link";
import { requireAdminUser } from "@/lib/auth";
import { countUsers, getSiteBranding } from "@/lib/db";

export default async function AdminPage() {
  await requireAdminUser();
  const totalUsers = countUsers();
  const branding = getSiteBranding();

  return (
    <div className="container page-content admin-page">
      <div className="page-heading-row">
        <h1>管理员面板</h1>
      </div>

      <div className="admin-overview">
        <section className="card admin-stat">
          <span>用户总数</span>
          <strong>{totalUsers}</strong>
        </section>
        <section className="card admin-stat">
          <span>当前站点标题</span>
          <strong>{branding.titleText}</strong>
        </section>
      </div>

      <div className="admin-links">
        <Link className="card admin-link-card" href="/admin/users">
          <h2>用户管理</h2>
          <p>添加、封禁、删除用户</p>
        </Link>
        <Link className="card admin-link-card" href="/admin/site">
          <h2>站点配置</h2>
          <p>设置 LOGO 与标题文字</p>
        </Link>
      </div>
    </div>
  );
}
