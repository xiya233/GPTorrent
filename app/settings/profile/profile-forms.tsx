"use client";

import Cropper, { type Area } from "react-easy-crop";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  changePasswordAction,
  updateProfileAction,
  type ProfileActionState,
} from "@/app/settings/profile/actions";

type ProfileFormsProps = {
  username: string;
  bio: string;
  maxAvatarUploadMb: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

async function createCroppedAvatarFile(imageSrc: string, pixelCrop: Area): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas unavailable");
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("blob failed"));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return new File([blob], "avatar-cropped.png", { type: "image/png" });
}

export function ProfileForms({ username, bio, maxAvatarUploadMb }: ProfileFormsProps) {
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

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceAvatarUrl, setSourceAvatarUrl] = useState("");
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [avatarClientError, setAvatarClientError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (sourceAvatarUrl) {
        URL.revokeObjectURL(sourceAvatarUrl);
      }
      if (previewAvatarUrl) {
        URL.revokeObjectURL(previewAvatarUrl);
      }
    };
  }, [sourceAvatarUrl, previewAvatarUrl]);

  const syncAvatarInput = (file: File | null) => {
    const input = avatarInputRef.current;
    if (!input) {
      return;
    }
    const dt = new DataTransfer();
    if (file) {
      dt.items.add(file);
    }
    input.files = dt.files;
  };

  const handleAvatarPick: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    setAvatarClientError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    // Force user to apply crop result before submitting.
    syncAvatarInput(null);

    const maxBytes = maxAvatarUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setAvatarClientError(`头像超过大小限制，最大 ${maxAvatarUploadMb}MB`);
      syncAvatarInput(null);
      return;
    }

    if (sourceAvatarUrl) {
      URL.revokeObjectURL(sourceAvatarUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSourceAvatarUrl(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const applyAvatarCrop = async () => {
    if (!sourceAvatarUrl || !croppedAreaPixels) {
      return;
    }

    try {
      const croppedFile = await createCroppedAvatarFile(sourceAvatarUrl, croppedAreaPixels);
      syncAvatarInput(croppedFile);
      const preview = URL.createObjectURL(croppedFile);
      if (previewAvatarUrl) {
        URL.revokeObjectURL(previewAvatarUrl);
      }
      setPreviewAvatarUrl(preview);
      URL.revokeObjectURL(sourceAvatarUrl);
      setSourceAvatarUrl("");
    } catch {
      setAvatarClientError("头像裁剪失败，请重新选择");
      syncAvatarInput(null);
    }
  };

  const cancelAvatarCrop = () => {
    syncAvatarInput(null);
    if (sourceAvatarUrl) {
      URL.revokeObjectURL(sourceAvatarUrl);
    }
    setSourceAvatarUrl("");
  };

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
            <input
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              id="avatarFile"
              name="avatarFile"
              onChange={handleAvatarPick}
              ref={avatarInputRef}
              type="file"
            />
            <small>支持 jpg/png/webp/svg，最大 {maxAvatarUploadMb}MB，提交前可裁剪 1:1。</small>
            {previewAvatarUrl ? (
              <div className="avatar-crop-preview-wrap">
                <img alt="avatar preview" className="avatar-crop-preview" src={previewAvatarUrl} />
                <span className="muted">已应用裁剪，提交后保存为 WebP</span>
              </div>
            ) : null}
          </div>

          {sourceAvatarUrl ? (
            <div className="field-group">
              <label>头像裁剪</label>
              <div className="avatar-crop-stage">
                <Cropper
                  aspect={1}
                  crop={crop}
                  image={sourceAvatarUrl}
                  onCropChange={setCrop}
                  onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                  onZoomChange={setZoom}
                  zoom={zoom}
                />
              </div>
              <div className="avatar-crop-controls">
                <label className="muted" htmlFor="avatarZoom">
                  缩放
                </label>
                <input
                  id="avatarZoom"
                  max={3}
                  min={1}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  step={0.1}
                  type="range"
                  value={zoom}
                />
                <div className="avatar-crop-actions">
                  <button className="secondary-btn tiny-btn" onClick={cancelAvatarCrop} type="button">
                    取消
                  </button>
                  <button className="primary-btn tiny-btn" onClick={() => void applyAvatarCrop()} type="button">
                    应用裁剪
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="field-group">
            <label htmlFor="bio">Bio</label>
            <textarea defaultValue={bio} id="bio" name="bio" rows={6} />
            <small>最多 300 字</small>
          </div>

          {avatarClientError ? <p className="form-error">{avatarClientError}</p> : null}
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
