import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/types/database.types";
import type { Group } from "./groups";
import type { Params } from "./types";

// canvas ジェネレータの設定(params)を Supabase に保存/更新する（ブラウザ・RLS）。
// id があれば更新（自分 or 管理者のみ RLS で許可）、無ければ自分の制作物として新規作成。
// 返り値は保存レコードの id。
export async function saveGenerator(opts: {
  id?: string | null;
  slug: string;
  name: string;
  grp: Group;
  description?: string;
  tags?: string[];
  params: Params;
}): Promise<string> {
  const supabase = createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims.sub;
  if (!uid) throw new Error("未認証です");

  const fields = {
    slug: opts.slug,
    name: opts.name,
    grp: opts.grp,
    description: opts.description ?? "",
    tags: opts.tags ?? [],
    params: opts.params as unknown as NonNullable<Json>,
  };
  if (opts.id) {
    const { data, error } = await supabase
      .from("generators")
      .update(fields)
      .eq("id", opts.id)
      .select("id");
    if (error) throw error;
    // RLS で弾かれた更新はエラーにならず 0 行になる
    if (!data?.length) throw new Error("この制作物を更新する権限がありません");
    return opts.id;
  }
  const { data, error } = await supabase
    .from("generators")
    .insert({ user_id: uid, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteGenerator(id: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.from("generators").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("この制作物を削除する権限がありません");
}
