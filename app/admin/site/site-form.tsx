"use client";

import { useActionState } from "react";
import {
  adminUpdateSiteBrandingAction,
  type AdminSiteActionState,
} from "@/app/admin/site/actions";

type SiteFormProps = {
  titleText: string;
  descriptionText: string;
  allowGuestUpload: boolean;
  allowUserDeleteTorrent: boolean;
  allowUserRegister: boolean;
  enableLoginCaptcha: boolean;
  enableRegisterCaptcha: boolean;
  maxAvatarUploadMb: number;
  maxTorrentImageUploadMb: number;
  allowGuestTorrentImageUpload: boolean;
  guestTorrentFileMaxMb: number;
  userTorrentFileMaxMb: number;
};

export function SiteForm({
  titleText,
  descriptionText,
  allowGuestUpload,
  allowUserDeleteTorrent,
  allowUserRegister,
  enableLoginCaptcha,
  enableRegisterCaptcha,
  maxAvatarUploadMb,
  maxTorrentImageUploadMb,
  allowGuestTorrentImageUpload,
  guestTorrentFileMaxMb,
  userTorrentFileMaxMb,
}: SiteFormProps) {
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
        <label htmlFor="descriptionText">网站描述（SEO）</label>
        <textarea
          defaultValue={descriptionText}
          id="descriptionText"
          maxLength={160}
          name="descriptionText"
          placeholder="用于页面 metadata.description，可留空使用默认描述"
          rows={3}
        />
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

      <label className="checkbox-row" htmlFor="allowGuestTorrentImageUpload">
        <input
          defaultChecked={allowGuestTorrentImageUpload}
          id="allowGuestTorrentImageUpload"
          name="allowGuestTorrentImageUpload"
          type="checkbox"
        />
        <span>
          <strong>允许访客上传种子图片</strong>
          <small>关闭后，访客可上传种子但不能附带图片。</small>
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
          <strong>允许已注册用户删除自己的种子</strong>
          <small>关闭后，仅管理员可删除种子。</small>
        </span>
      </label>

      <label className="checkbox-row" htmlFor="allowUserRegister">
        <input defaultChecked={allowUserRegister} id="allowUserRegister" name="allowUserRegister" type="checkbox" />
        <span>
          <strong>允许用户注册</strong>
          <small>关闭后，访客将无法创建新账号。</small>
        </span>
      </label>

      <label className="checkbox-row" htmlFor="enableLoginCaptcha">
        <input defaultChecked={enableLoginCaptcha} id="enableLoginCaptcha" name="enableLoginCaptcha" type="checkbox" />
        <span>
          <strong>启用登录验证码</strong>
          <small>登录页面显示图片验证码。</small>
        </span>
      </label>

      <label className="checkbox-row" htmlFor="enableRegisterCaptcha">
        <input
          defaultChecked={enableRegisterCaptcha}
          id="enableRegisterCaptcha"
          name="enableRegisterCaptcha"
          type="checkbox"
        />
        <span>
          <strong>启用注册验证码</strong>
          <small>注册页面显示图片验证码。</small>
        </span>
      </label>

      <div className="field-group">
        <label htmlFor="maxAvatarUploadMb">头像最大上传大小 (MB)</label>
        <input
          defaultValue={maxAvatarUploadMb}
          id="maxAvatarUploadMb"
          max={20}
          min={1}
          name="maxAvatarUploadMb"
          required
          type="number"
        />
      </div>

      <div className="field-group">
        <label htmlFor="maxTorrentImageUploadMb">种子图片最大上传大小 (MB)</label>
        <input
          defaultValue={maxTorrentImageUploadMb}
          id="maxTorrentImageUploadMb"
          max={20}
          min={1}
          name="maxTorrentImageUploadMb"
          required
          type="number"
        />
      </div>

      <div className="field-group">
        <label htmlFor="guestTorrentFileMaxMb">游客种子文件最大上传大小 (MB)</label>
        <input
          defaultValue={guestTorrentFileMaxMb}
          id="guestTorrentFileMaxMb"
          max={100}
          min={1}
          name="guestTorrentFileMaxMb"
          required
          type="number"
        />
      </div>

      <div className="field-group">
        <label htmlFor="userTorrentFileMaxMb">登录用户种子文件最大上传大小 (MB)</label>
        <input
          defaultValue={userTorrentFileMaxMb}
          id="userTorrentFileMaxMb"
          max={100}
          min={1}
          name="userTorrentFileMaxMb"
          required
          type="number"
        />
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="form-success">{state.success}</p> : null}

      <button className="primary-btn" disabled={isPending} type="submit">
        {isPending ? "保存中..." : "保存配置"}
      </button>
    </form>
  );
}
