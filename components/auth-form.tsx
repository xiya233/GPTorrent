"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type AuthActionState } from "@/app/auth/actions";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const initialState: AuthActionState = { error: null };
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    action,
    initialState,
  );

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

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button className="primary-btn full-width" disabled={isPending} type="submit">
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
