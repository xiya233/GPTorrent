"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";
import { loginAction, registerAction, type AuthActionState } from "@/app/auth/actions";

type AuthFormProps = {
  mode: "login" | "register";
  captchaEnabled: boolean;
};

type CaptchaState = {
  captchaId: string;
  imageSvg: string;
  expiresAt: string;
};

export function AuthForm({ mode, captchaEnabled }: AuthFormProps) {
  const initialState: AuthActionState = { error: null };
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    action,
    initialState,
  );
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  const loadCaptcha = useCallback(async () => {
    if (!captchaEnabled) {
      return;
    }
    setCaptchaLoading(true);
    setCaptchaError(null);
    try {
      const resp = await fetch(`/api/captcha?purpose=${mode}`, {
        cache: "no-store",
      });
      if (!resp.ok) {
        throw new Error("load captcha failed");
      }
      const data = (await resp.json()) as CaptchaState;
      if (!data?.captchaId || !data?.imageSvg) {
        throw new Error("invalid captcha payload");
      }
      setCaptcha(data);
    } catch {
      setCaptcha(null);
      setCaptchaError("验证码加载失败，请刷新重试");
    } finally {
      setCaptchaLoading(false);
    }
  }, [captchaEnabled, mode]);

  useEffect(() => {
    if (!captchaEnabled) {
      setCaptcha(null);
      return;
    }
    void loadCaptcha();
  }, [captchaEnabled, loadCaptcha]);

  useEffect(() => {
    if (!captchaEnabled || !state.error) {
      return;
    }
    void loadCaptcha();
  }, [captchaEnabled, loadCaptcha, state.error]);

  return (
    <form action={formAction} className="auth-form card">
      <h1>{mode === "login" ? "登录" : "注册"}</h1>

      <div className="field-group">
        <label htmlFor="username">用户名</label>
        <input
          autoComplete="username"
          id="username"
          name="username"
          placeholder="例如: alice_01"
          required
          type="text"
        />
      </div>

      <div className="field-group">
        <label htmlFor="password">密码</label>
        <input autoComplete="current-password" id="password" name="password" required type="password" />
      </div>

      {mode === "register" ? (
        <div className="field-group">
          <label htmlFor="confirmPassword">确认密码</label>
          <input
            autoComplete="new-password"
            id="confirmPassword"
            name="confirmPassword"
            required
            type="password"
          />
        </div>
      ) : null}

      {captchaEnabled ? (
        <div className="field-group">
          <label htmlFor="captchaAnswer">验证码</label>
          <input name="captchaId" type="hidden" value={captcha?.captchaId ?? ""} />
          <div className="captcha-row">
            <div className="captcha-image-wrap" role="img">
              {captcha?.imageSvg ? (
                <div dangerouslySetInnerHTML={{ __html: captcha.imageSvg }} />
              ) : (
                <span className="muted">{captchaLoading ? "加载中..." : "验证码不可用"}</span>
              )}
            </div>
            <button
              className="secondary-btn tiny-btn"
              disabled={captchaLoading}
              onClick={(event) => {
                event.preventDefault();
                void loadCaptcha();
              }}
              type="button"
            >
              <RefreshCw size={14} />
              刷新
            </button>
          </div>
          <input
            autoComplete="off"
            id="captchaAnswer"
            inputMode="text"
            maxLength={6}
            name="captchaAnswer"
            placeholder="输入图中字符"
            required
            type="text"
          />
          {captchaError ? <p className="form-error">{captchaError}</p> : null}
        </div>
      ) : null}

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button className="primary-btn full-width" disabled={isPending || (captchaEnabled && !captcha)} type="submit">
        {isPending ? "提交中..." : mode === "login" ? "登录" : "创建账号"}
      </button>

      <p className="switch-hint">
        {mode === "login" ? "没有账号？" : "已有账号？"}
        <Link href={mode === "login" ? "/auth/register" : "/auth/login"}>
          {mode === "login" ? "去注册" : "去登录"}
        </Link>
      </p>
    </form>
  );
}
