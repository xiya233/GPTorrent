"use client";

import { useActionState } from "react";
import {
  adminCreateUserAction,
  type AdminUserActionState,
} from "@/app/admin/users/actions";

export function CreateUserForm() {
  const initialState: AdminUserActionState = {
    error: null,
    success: null,
  };

  const [state, formAction, isPending] = useActionState<AdminUserActionState, FormData>(
    adminCreateUserAction,
    initialState,
  );

  return (
    <form action={formAction} className="admin-create-form card">
      <h2>添加用户</h2>

      <div className="field-group">
        <label htmlFor="username">用户名</label>
        <input id="username" name="username" placeholder="new_user" required type="text" />
      </div>

      <div className="field-group">
        <label htmlFor="password">初始密码</label>
        <input id="password" name="password" required type="password" />
      </div>

      <div className="field-group">
        <label htmlFor="role">角色</label>
        <select defaultValue="user" id="role" name="role">
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="form-success">{state.success}</p> : null}

      <button className="primary-btn" disabled={isPending} type="submit">
        {isPending ? "创建中..." : "创建用户"}
      </button>
    </form>
  );
}
