"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Group } from "@/lib/identity/groups";

// あいまい検索（部分一致 + 類似）。範囲は 全体 / 表示中のグループ。
export default function SearchBar({
  group,
  q,
  scope,
}: {
  group: Group | null;
  q: string;
  scope: "all" | "group";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  const [range, setRange] = useState<"all" | "group">(scope);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (group) p.set("group", group);
      const v = text.trim();
      if (v) {
        p.set("q", v);
        if (range === "group" && group) p.set("scope", "group");
      }
      const s = p.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [text, range, group, pathname, router]);

  return (
    <div className="home-search" role="search">
      <input
        type="search"
        className="home-search-input"
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        placeholder="制作物を検索（名前・説明・タグ／表記ゆれ・誤字も可）"
        aria-label="制作物を検索"
      />
      <div className="home-search-scope" role="radiogroup" aria-label="検索範囲">
        <button
          type="button"
          role="radio"
          aria-checked={range === "all"}
          className={`home-chip${range === "all" ? " is-active" : ""}`}
          onClick={() => setRange("all")}
        >
          全体
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={range === "group"}
          disabled={!group}
          title={group ? undefined : "左のフォルダでグループを選ぶと指定できます"}
          className={`home-chip${range === "group" ? " is-active" : ""}`}
          onClick={() => setRange("group")}
        >
          {group ?? "グループ"}内
        </button>
      </div>
    </div>
  );
}
