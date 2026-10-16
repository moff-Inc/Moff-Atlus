import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminUsers from "@/components/AdminUsers";
import SignOutButton from "@/components/SignOutButton";
import "../home.css";

// 管理者専用。判定は DB の is_admin()（RLS / RPC 側でも同じ判定で強制）。
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const { data: claims } = await supabase.auth.getClaims();
  const [{ data: users }, { data: gens }] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,role,created_at").order("created_at"),
    supabase.from("generators").select("user_id"),
  ]);
  const works = new Map<string, number>();
  for (const g of gens ?? []) works.set(g.user_id, (works.get(g.user_id) ?? 0) + 1);

  return (
    <div className="home">
      <header className="home-topbar">
        <Link href="/" className="home-brand">
          <span className="home-brand-mark">
            <i />
            <i />
            <i />
          </span>
          MOFF_ATLUS
        </Link>
        <div className="home-top-actions">
          <Link href="/" className="home-btn">
            ライブラリ
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="home-main">
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <div className="home-eyebrow">ADMIN</div>
              <h2>ユーザーとロール</h2>
            </div>
            <span className="home-count">{users?.length ?? 0} USERS</span>
          </div>
          <p className="home-card-desc">
            管理者は全員の制作物をライブラリ上で削除・グループ移動できます。最後の管理者は降格できません。
          </p>
          <AdminUsers
            me={claims?.claims.sub ?? ""}
            users={(users ?? []).map((u) => ({ ...u, works: works.get(u.id) ?? 0 }))}
          />
        </section>
      </main>
    </div>
  );
}
