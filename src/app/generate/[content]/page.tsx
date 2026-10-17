import { notFound } from "next/navigation";
import { getContentMeta } from "@/lib/identity/contents";
import { createClient } from "@/lib/supabase/server";
import CanvasGenerator, { type GenInitial } from "@/components/generate/CanvasGenerator";
import { DEFAULT_GROUP, isGroup } from "@/lib/identity/groups";
import type { Params } from "@/lib/identity/types";

const COLUMNS = "id,name,params,slug,grp,description,tags,user_id";

export default async function GenerateContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ content: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { content } = await params;
  const { id } = await searchParams;
  const meta = getContentMeta(content);
  if (!meta) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;

  type Row = {
    id: string;
    name: string;
    params: unknown;
    slug: string;
    grp: string;
    description: string;
    tags: string[];
    user_id: string;
  };
  let row: Row | undefined;

  // 保存済み設定の読み込み（?id=）。slug 不一致は無視。
  if (id) {
    const { data } = await supabase.from("generators").select(COLUMNS).eq("id", id).maybeSingle();
    if (data && data.slug === meta.slug) row = data;
  } else if (meta.slug === "hex-liquid" && me) {
    // 共有ライブラリ化に伴い、自動復元は自分の保存物に限定する
    const { data } = await supabase
      .from("generators")
      .select(COLUMNS)
      .eq("slug", meta.slug)
      .eq("user_id", me)
      .order("updated_at", { ascending: false })
      .limit(20);
    row = (data ?? []).find(
      (r) => (r.params as Record<string, unknown> | null)?.mode === "liquid-glass",
    );
  }

  let initial: GenInitial | undefined;
  if (row) {
    let canEdit = row.user_id === me;
    if (!canEdit) {
      const { data: isAdmin } = await supabase.rpc("is_admin");
      canEdit = Boolean(isAdmin);
    }
    initial = {
      id: row.id,
      name: row.name,
      // 未検証の値。CanvasGenerator 側で sanitizeParams を通してから使う
      params: row.params as Params,
      grp: isGroup(row.grp) ? row.grp : DEFAULT_GROUP,
      description: row.description,
      tags: row.tags,
      canEdit,
    };
  }
  return <CanvasGenerator slug={meta.slug} initial={initial} defaultGroup={meta.grp} />;
}
