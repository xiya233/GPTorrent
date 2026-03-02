import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { UploadForm } from "@/app/upload/upload-form";
import { getCurrentUserState } from "@/lib/auth";

const uploadRules = [
  "请确保您拥有分发所上传内容的权利。",
  "请勿上传虚假或受密码保护的压缩包。",
  "必须填写描述性标题，如适用请包含分辨率和编码信息。",
  "截图和详细描述有助于用户验证内容。",
];

export default async function UploadPage() {
  const { user, blocked } = await getCurrentUserState();
  if (blocked) {
    redirect("/auth/login");
  }

  return (
    <div className="container page-content upload-page">
      <div className="page-heading-row">
        <h1>上传种子</h1>
        <Link className="back-link" href="/">
          返回列表
        </Link>
      </div>

      <section className="card">
        <UploadForm isLoggedIn={Boolean(user)} />
      </section>

      <section className="card rules-card">
        <h2>
          <CircleAlert size={18} /> 上传规则
        </h2>
        <ul>
          {uploadRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
