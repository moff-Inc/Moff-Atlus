"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Group } from "@/lib/identity/groups";

// 他の人が書き出した制作物 JSON を読み込み、自分の制作物として保存する。
// 表示中のグループがあればそこへ、無ければ JSON に記録されたグループへ入れる。
export default function ImportButton({ defaultGroup }: { defaultGroup: Group | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // レンダラ定義（検証に必要）は重いので押下時に読み込む
      const [{ parseExchangeJson, EXCHANGE_MAX_BYTES }, { saveGenerator }] = await Promise.all([
        import("@/lib/identity/exchange"),
        import("@/lib/identity/persist"),
      ]);
      if (file.size > EXCHANGE_MAX_BYTES) throw new Error("ファイルが大きすぎます（上限 1MB）");
      const rec = parseExchangeJson(await file.text());
      const id = await saveGenerator({ ...rec, grp: defaultGroup ?? rec.grp });
      router.push(`/generate/${rec.slug}?id=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="home-upload">
      {error && (
        <span className="home-error" role="alert">
          {error}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="home-btn home-btn-primary"
      >
        {busy ? "読み込み中..." : "JSONをインポート"}
      </button>
    </div>
  );
}
