"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  updateProfileAction,
  type ProfileActionState,
} from "@/app/settings/profile/actions";

type ProfileFormsProps = {
  username: string;
  bio: string;
};

export function ProfileForms({ username, bio }: ProfileFormsProps) {
  const initialState: ProfileActionState = {
    error: null,
    success: null,
  };

  const [profileState, profileAction, profilePending] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    initialState,
  );

  const [passwordState, passwordAction, passwordPending] = useActionState<ProfileActionState, FormData>(
    changePasswordAction,
    initialState,
  );

  return (
    <div className="profile-grid">
      <section className="card profile-section">
        <h2>个人资料</h2>
        <form action={profileAction} className="stack-form">
          <div className="field-group">
            <label htmlFor="username">用户名</label>
            <input disabled id="username" value={username} />
          </div>

          <div className="field-group">
            <label htmlFor="avatarFile">头像</label>
            <input accept="image/jpeg,image/png,image/webp,image/svg+xml" id="avatarFile" name="avatarFile" type="file" />
            <small>支持 jpg/png/webp/svg，最大 2MB</small>
          </div>

          <div className="field-group">
            <label htmlFor="bio">Bio</label>
            <textarea defaultValue={bio} id="bio" name="bio" rows={6} />
            <small>最多 300 字</small>
          </div>

          {profileState.error ? <p className="form-error">{profileState.error}</p> : null}
          {profileState.success ? <p className="form-success">{profileState.success}</p> : null}

          <button className="primary-btn" disabled={profilePending} type="submit">
            {profilePending ? "保存中..." : "保存资料"}
          </button>
        </form>
      </section>

      <section className="card profile-section">
        <h2>修改密码</h2>
        <form action={passwordAction} className="stack-form">
          <div className="field-group">
            <label htmlFor="oldPassword">旧密码</label>
            <input autoComplete="current-password" id="oldPassword" name="oldPassword" required type="password" />
          </div>

          <div className="field-group">
            <label htmlFor="newPassword">新密码</label>
            <input autoComplete="new-password" id="newPassword" name="newPassword" required type="password" />
          </div>

          <div className="field-group">
            <label htmlFor="confirmPassword">确认新密码</label>
            <input autoComplete="new-password" id="confirmPassword" name="confirmPassword" required type="password" />
          </div>

          {passwordState.error ? <p className="form-error">{passwordState.error}</p> : null}
          {passwordState.success ? <p className="form-success">{passwordState.success}</p> : null}

          <button className="primary-btn" disabled={passwordPending} type="submit">
            {passwordPending ? "更新中..." : "更新密码"}
          </button>
        </form>
      </section>
    </div>
  );
}
