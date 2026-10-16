import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UploadButton from "@/components/UploadButton";
import DocumentList from "@/components/DocumentList";
import GeneratorList from "@/components/GeneratorList";
import SignOutButton from "@/components/SignOutButton";
import "./home.css";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const email = claimsData?.claims.email as string | undefined;

  const { data: docs } = await supabase
    .from("documents")
    .select("id,name,storage_path,updated_at")
    .order("updated_at", { ascending: false });

  const { data: gens } = await supabase
    .from("generators")
    .select("id,slug,name,updated_at")
    .order("updated_at", { ascending: false });

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
          {email && <span className="home-email">{email}</span>}
          <Link href="/generate" className="home-btn">
            テンプレ / TEMPLATE
          </Link>
          <UploadButton />
          <SignOutButton />
        </div>
      </header>

      <main className="home-main">
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <div className="home-eyebrow">LIBRARY</div>
              <h2>あなたのSVG</h2>
            </div>
            <span className="home-count">{docs?.length ?? 0} FILES</span>
          </div>
          <DocumentList docs={docs ?? []} />
        </section>

        <GeneratorList items={gens ?? []} />
      </main>
    </div>
  );
}
