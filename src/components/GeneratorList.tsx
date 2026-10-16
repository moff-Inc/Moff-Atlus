"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteGenerator } from "@/lib/identity/persist";
import { downloadJson, toExchangeJson } from "@/lib/identity/exchange";
import { GROUPS, isGroup, DEFAULT_GROUP } from "@/lib/identity/groups";
import type { Params } from "@/lib/identity/types";

export interface GeneratorSummary {
  id: string;
  slug: string;
  name: string;
  grp: string;
  description: string;
  tags: string[];
  updated_at: string;
  author: string;
  canEdit: boolean; // 作成者 or 管理者（実際の可否は RLS が強制）
}

export default function GeneratorList({
  items,
  searching,
}: {
  items: GeneratorSummary[];
  searching: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState<GeneratorSummary[]>(items);
  // router.refresh() 後のサーバ側の一覧（移動・削除の反映）に追従する
  const [source, setSource] = useState(items);
  if (source !== items) {
    setSource(items);
    setList(items);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  const del = (g: GeneratorSummary) =>
    run(g.id, async () => {
      if (!confirm(`「${g.name}」を削除しますか？`)) return;
      await deleteGenerator(g.id);
      setList((prev) => prev.filter((x) => x.id !== g.id));
      router.refresh();
    });

  const move = (g: GeneratorSummary, grp: string) =>
    run(g.id, async () => {
      const { data, error } = await createClient()
        .from("generators")
        .update({ grp })
        .eq("id", g.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("移動する権限がありません");
      setList((prev) => prev.map((x) => (x.id === g.id ? { ...x, grp } : x)));
      router.refresh();
    });

  const exportJson = (g: GeneratorSummary) =>
    run(g.id, async () => {
      const { data, error } = await createClient()
        .from("generators")
        .select("slug,name,grp,description,tags,params")
        .eq("id", g.id)
        .single();
      if (error) throw error;
      downloadJson(
        data.name,
        toExchangeJson({
          slug: data.slug,
          name: data.name,
          grp: isGroup(data.grp) ? data.grp : DEFAULT_GROUP,
          description: data.description,
          tags: data.tags,
          params: data.params as unknown as Params,
        }),
      );
    });

  if (list.length === 0) {
    return (
      <p className="home-empty">
        {searching
          ? "該当する制作物はありません。別の言葉や範囲で試してください。"
          : "まだ制作物がありません。「テンプレ」から作成するか、JSON をインポートしてください。"}
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="home-error" role="alert">
          {error}
        </p>
      )}
      <ul className="home-grid">
        {list.map((g) => (
          <li key={g.id} className="home-card">
            <Link href={`/generate/${g.slug}?id=${g.id}`} className="home-card-title">
              {g.name}
            </Link>
            <div className="home-card-tag">
              {g.grp} · {g.slug}
              {g.author && ` · ${g.author}`}
            </div>
            {g.description && <p className="home-card-desc">{g.description}</p>}
            {g.tags.length > 0 && (
              <div className="home-card-tags">
                {g.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            )}
            <div className="home-card-foot">
              <span suppressHydrationWarning>{new Date(g.updated_at).toLocaleString()}</span>
              <span className="home-card-actions">
                {g.canEdit && (
                  <select
                    className="home-card-move"
                    aria-label={`「${g.name}」のグループ`}
                    value={g.grp}
                    disabled={busy === g.id}
                    onChange={(e) => move(g, e.target.value)}
                  >
                    {GROUPS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                )}
                <button onClick={() => exportJson(g)} disabled={busy === g.id} className="home-del home-act">
                  JSON
                </button>
                {g.canEdit && (
                  <button onClick={() => del(g)} disabled={busy === g.id} className="home-del">
                    削除
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
