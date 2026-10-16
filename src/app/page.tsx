import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GeneratorList, { type GeneratorSummary } from "@/components/GeneratorList";
import ImportButton from "@/components/ImportButton";
import SearchBar from "@/components/SearchBar";
import SignOutButton from "@/components/SignOutButton";
import { GROUPS, isGroup, type Group } from "@/lib/identity/groups";
import "./home.css";

const COLUMNS = "id,slug,name,grp,description,tags,user_id,updated_at";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const group: Group | null = isGroup(sp.group) ? sp.group : null;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const scopeGroup = sp.scope === "group" && group ? group : null;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const email = claimsData?.claims.email as string | undefined;
  const me = claimsData?.claims.sub as string | undefined;

  const [{ data: isAdmin }, { data: grpRows }, { data: profiles }, listRes] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.from("generators").select("grp"),
    supabase.from("profiles").select("id,email,display_name"),
    q
      ? supabase.rpc("search_generators", { q, grp_filter: scopeGroup ?? undefined })
      : group
        ? supabase.from("generators").select(COLUMNS).eq("grp", group).order("updated_at", { ascending: false })
        : supabase.from("generators").select(COLUMNS).order("updated_at", { ascending: false }),
  ]);

  const counts = new Map<string, number>();
  for (const r of grpRows ?? []) counts.set(r.grp, (counts.get(r.grp) ?? 0) + 1);
  const total = grpRows?.length ?? 0;

  const authors = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.email]));
  const items: GeneratorSummary[] = (listRes.data ?? []).map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    grp: g.grp,
    description: g.description,
    tags: g.tags,
    updated_at: g.updated_at,
    author: authors.get(g.user_id) ?? "",
    canEdit: g.user_id === me || Boolean(isAdmin),
  }));

  const folderHref = (g: Group | null) => {
    const p = new URLSearchParams();
    if (g) p.set("group", g);
    if (q) {
      p.set("q", q);
      if (sp.scope === "group") p.set("scope", "group");
    }
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const heading = q
    ? `「${q}」の検索結果${scopeGroup ? `（${scopeGroup}）` : "（全体）"}`
    : (group ?? "ALL");

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
          {isAdmin && (
            <Link href="/admin" className="home-btn">
              管理 / ADMIN
            </Link>
          )}
          <Link href="/generate" className="home-btn">
            テンプレ / TEMPLATE
          </Link>
          <ImportButton defaultGroup={group} />
          <SignOutButton />
        </div>
      </header>

      <main className="home-main home-layout">
        <nav className="home-folders" aria-label="グループ">
          <Link
            href={folderHref(null)}
            className={`home-folder${group === null ? " is-active" : ""}`}
            aria-current={group === null ? "page" : undefined}
          >
            <span>ALL</span>
            <span className="home-count">{total}</span>
          </Link>
          {GROUPS.map((g) => (
            <Link
              key={g}
              href={folderHref(g)}
              className={`home-folder${group === g ? " is-active" : ""}`}
              aria-current={group === g ? "page" : undefined}
            >
              <span>{g}</span>
              <span className="home-count">{counts.get(g) ?? 0}</span>
            </Link>
          ))}
        </nav>

        <div className="home-content">
          <SearchBar group={group} q={q} scope={sp.scope === "group" ? "group" : "all"} />
          <section className="home-section">
            <div className="home-section-head">
              <div>
                <div className="home-eyebrow">{q ? "SEARCH" : "LIBRARY"}</div>
                <h2>{heading}</h2>
              </div>
              <span className="home-count">{items.length} ITEMS</span>
            </div>
            {listRes.error && <p className="home-error">読み込みに失敗しました</p>}
            <GeneratorList key={`${group}|${q}|${sp.scope}`} items={items} searching={Boolean(q)} />
          </section>
        </div>
      </main>
    </div>
  );
}
