"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  works: number;
}

export default function AdminUsers({ me, users }: { me: string; users: AdminUser[] }) {
  const router = useRouter();
  const [list, setList] = useState(users);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setRole(u: AdminUser, role: "member" | "admin") {
    const msg =
      role === "admin"
        ? `${u.email} を管理者にしますか？`
        : `${u.email} を一般メンバーに戻しますか？${u.id === me ? "（自分の管理者権限が外れます）" : ""}`;
    if (!confirm(msg)) return;
    setBusy(u.id);
    setError(null);
    const { error } = await createClient().rpc("admin_set_role", { target: u.id, new_role: role });
    setBusy(null);
    if (error) {
      setError(error.message.includes("last admin") ? "最後の管理者は降格できません" : error.message);
      return;
    }
    setList((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
    if (u.id === me && role === "member") router.replace("/");
    else router.refresh();
  }

  return (
    <>
      {error && (
        <p className="home-error" role="alert">
          {error}
        </p>
      )}
      <table className="home-table">
        <thead>
          <tr>
            <th>ユーザー</th>
            <th>制作物</th>
            <th>ロール</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id}>
              <td>
                <div>{u.display_name || u.email}</div>
                <div className="home-card-tag">{u.email}</div>
              </td>
              <td>{u.works}</td>
              <td>{u.role === "admin" ? "管理者" : "メンバー"}</td>
              <td>
                <button
                  className="home-btn"
                  disabled={busy === u.id}
                  onClick={() => setRole(u, u.role === "admin" ? "member" : "admin")}
                >
                  {u.role === "admin" ? "メンバーに戻す" : "管理者にする"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
