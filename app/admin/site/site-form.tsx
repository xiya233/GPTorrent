"use client";

import { useActionState } from "react";
import {
  adminUpdateSiteBrandingAction,
  type AdminSiteActionState,
} from "@/app/admin/site/actions";

type SiteFormProps = {
  titleText: string;
  allowGuestUpload: boolean;
  allowUserDeleteTorrent: boolean;
};

export function SiteForm({ titleText, allowGuestUpload, allowUserDeleteTorrent }: SiteFormProps) {
  const initialState: AdminSiteActionState = {
    error: null,
    success: null,
  };

  const [state, formAction, isPending] = useActionState<AdminSiteActionState, FormData>(
    adminUpdateSiteBrandingAction,
    initialState,
  );

  return (
    <form action={formAction} className="card site-form">
      <h2>站点品牌配置</h2>

      <div className="field-group">
        <label htmlFor="titleText">标题文字</label>
        <input defaultValue={titleText} id="titleText" maxLength={60} name="titleText" required type="text" />
      </div>

      <div className="field-group">
        <label htmlFor="logoFile">LOGO 图片</label>
        <input accept="image/jpeg,image/png,image/webp,image/svg+xml" id="logoFile" name="logoFile" type="file" />
        <small>支持 jpg/png/webp/svg，最大 2MB</small>
      </div>

      <label className="checkbox-row" htmlFor="allowGuestUpload">
        <input defaultChecked={allowGuestUpload} id="allowGuestUpload" name="allowGuestUpload" type="checkbox" />
        <span>
          <strong>允许访客上传</strong>
          <small>关闭后，未登录用户将不能上传种子。</small>
        </span>
      </label>

      <label className="checkbox-row" htmlFor="allowUserDeleteTorrent">
        <input
          defaultChecked={allowUserDeleteTorrent}
          id="allowUserDeleteTorrent"
          name="allowUserDeleteTorrent"
          type="checkbox"
        />
        <span>
          <strong>允许用户删除自己的种子</strong>
          <small>关闭后，仅管理员可删除种子。</small>
        </span>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="form-success">{state.success}</p> : null}

      <button className="primary-btn" disabled={isPending} type="submit">
        {isPending ? "保存中..." : "保存配置"}
      </button>
    </form>
  );
}
