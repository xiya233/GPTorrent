import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/db";

export default async function RegisterPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), Promise.resolve(getSiteSettings())]);
  if (user) {
    redirect("/");
  }

  if (!settings.allowUserRegister) {
    return (
      <div className="container page-content auth-page">
        <div className="auth-form card">
          <h1>注册已关闭</h1>
          <p className="switch-hint">管理员暂时关闭了新用户注册，请稍后再试。</p>
          <Link className="primary-btn full-width" href="/auth/login">
            去登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-content auth-page">
      <AuthForm captchaEnabled={settings.enableRegisterCaptcha} mode="register" />
    </div>
  );
}
