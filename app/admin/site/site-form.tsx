"use client";

import { useActionState } from "react";
import {
  adminUpdateSiteBrandingAction,
  type AdminSiteActionState,
} from "@/app/admin/site/actions";

type SiteFormProps = {
  titleText: string;
};

export function SiteForm({ titleText }: SiteFormProps) {
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

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="form-success">{state.success}</p> : null}

      <button className="primary-btn" disabled={isPending} type="submit">
        {isPending ? "保存中..." : "保存配置"}
      </button>
    </form>
  );
}
