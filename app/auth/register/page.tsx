import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { getAuthCaptchaPolicy } from "@/lib/db";

export default async function RegisterPage() {
  const [user, captchaPolicy] = await Promise.all([getCurrentUser(), Promise.resolve(getAuthCaptchaPolicy())]);
  if (user) {
    redirect("/");
  }

  return (
    <div className="container page-content auth-page">
      <AuthForm captchaEnabled={captchaPolicy.enableRegisterCaptcha} mode="register" />
    </div>
  );
}
