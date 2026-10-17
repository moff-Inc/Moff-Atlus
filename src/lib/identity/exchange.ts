import { DEFAULT_GROUP, isGroup, type Group } from "./groups";
import { sanitizeParams } from "./sanitize";
import type { Params } from "./types";

// 制作物の共有用 JSON（書き出し / 読み込み）。
export const EXCHANGE_FORMAT = "moff-atlus/generator";
export const EXCHANGE_VERSION = 1;
export const EXCHANGE_MAX_BYTES = 1024 * 1024;

export interface GeneratorRecord {
  slug: string;
  name: string;
  grp: Group;
  description: string;
  tags: string[];
  params: Params;
}

export function cleanName(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim().slice(0, 200) : "";
  return s || fallback;
}

export function cleanDescription(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 1000) : "";
}

export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string") continue;
    const s = t.trim().slice(0, 40);
    if (s) out.add(s);
    if (out.size >= 20) break;
  }
  return [...out];
}

export function toExchangeJson(rec: GeneratorRecord): string {
  return JSON.stringify(
    {
      format: EXCHANGE_FORMAT,
      version: EXCHANGE_VERSION,
      slug: rec.slug,
      name: rec.name,
      grp: rec.grp,
      description: rec.description,
      tags: rec.tags,
      params: rec.params,
    },
    null,
    2,
  );
}

// 読み込み: 形式・slug・サイズを検証し、params はホワイトリストで再構成する。
export function parseExchangeJson(text: string): GeneratorRecord {
  if (new Blob([text]).size > EXCHANGE_MAX_BYTES) throw new Error("ファイルが大きすぎます（上限 1MB）");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON として読み込めません");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("形式が不正です");
  const d = data as Record<string, unknown>;
  if (d.format !== EXCHANGE_FORMAT || d.version !== EXCHANGE_VERSION) {
    throw new Error("moff_Atlus の制作物 JSON ではありません");
  }
  const slug = typeof d.slug === "string" ? d.slug : "";
  const params = sanitizeParams(slug, d.params);
  if (!params) throw new Error("未対応のテンプレートです");
  return {
    slug,
    name: cleanName(d.name, slug),
    grp: isGroup(d.grp) ? d.grp : DEFAULT_GROUP,
    description: cleanDescription(d.description),
    tags: cleanTags(d.tags),
    params,
  };
}

export function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/[\\/:*?"<>|]+/g, "_") || "generator"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
