// 制作物の保存先フォルダ（部門）。DB の generators.grp check 制約と一致させること。
// 「ALL」は保存先ではなく全グループ横断の表示。
export const GROUPS = ["HR", "CD", "DS", "AX", "ID"] as const;
export type Group = (typeof GROUPS)[number];
export const DEFAULT_GROUP: Group = "CD";

export function isGroup(v: unknown): v is Group {
  return typeof v === "string" && (GROUPS as readonly string[]).includes(v);
}
