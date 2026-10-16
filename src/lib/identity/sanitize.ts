import { MULTI_CONTENTS } from "./registry";
import type { CanvasMode, Control, ParamValue, Params } from "./types";

// 他人の制作物・インポートJSONの params は信頼できない入力。
// レンダラ（canvas / toSvg の文字列組み立て）へ渡す前に、モード定義の
// defaults / controls をホワイトリストとして型・範囲・形を強制する。
// - 未知キーは捨てる（__proto__ 等もここで落ちる）
// - 不正値は既定値に置換
// - 数値はスライダー範囲へクランプ（巨大 count 等によるフリーズ防止）
// - 文字列は色 or SVG/HTML 特殊文字を含まない短い文字列のみ

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_STR_RE = /^[^<>"'&`\\]{0,200}$/;
const NUM_LIMIT = 1e6;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function safeString(v: unknown): v is string {
  return typeof v === "string" && (COLOR_RE.test(v) || SAFE_STR_RE.test(v));
}

// 既定値と同じ「形」の値だけ通す（配列は同じ長さ・要素は同じキーと型）
function sameShape(def: unknown, v: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof def === "number") return finite(v) ? clamp(v, -NUM_LIMIT, NUM_LIMIT) : undefined;
  if (typeof def === "string") return safeString(v) ? v : undefined;
  if (typeof def === "boolean") return typeof v === "boolean" ? v : undefined;
  if (Array.isArray(def)) {
    if (!Array.isArray(v) || v.length !== def.length) return undefined;
    const out: unknown[] = [];
    for (let i = 0; i < def.length; i++) {
      const r = sameShape(def[i], v[i], depth + 1);
      if (r === undefined) return undefined;
      out.push(r);
    }
    return out;
  }
  if (def && typeof def === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(def)) {
      const r = sameShape((def as Record<string, unknown>)[k], (v as Record<string, unknown>)[k], depth + 1);
      if (r === undefined) return undefined;
      out[k] = r;
    }
    return out;
  }
  return undefined;
}

function byControl(ctl: Control, v: unknown, def: ParamValue | undefined): ParamValue | undefined {
  switch (ctl[2]) {
    case "r":
      return finite(v) ? clamp(v, ctl[3], ctl[4]) : undefined;
    case "n":
      return finite(v) ? clamp(Math.round(v), -NUM_LIMIT, NUM_LIMIT) : undefined;
    case "k":
      // 空欄＝連動 を許すコントロールがあるため "" も可
      return typeof v === "string" && (v === "" || COLOR_RE.test(v)) ? v : undefined;
    case "c":
      return v === 1 || v === true ? 1 : v === 0 || v === false ? 0 : undefined;
    case "s":
      return typeof v === "string" && ctl[3].includes(v) ? v : undefined;
    case "o": {
      const hit = ctl[3].find(([value]) => value === String(v));
      if (!hit) return undefined;
      // ControlsPanel の coerce と同じく数値オプションは数値で保持
      return typeof def === "number" || typeof v === "number" ? Number(hit[0]) : hit[0];
    }
  }
}

function controlsOf(mode: CanvasMode): Map<string, Control> {
  const map = new Map<string, Control>();
  for (const [, controls] of mode.controls) for (const c of controls) map.set(c[0], c);
  return map;
}

// slug が未知、raw がオブジェクトでなければ null。戻り値には mode を含む。
export function sanitizeParams(slug: string, raw: unknown): Params | null {
  if (!Object.hasOwn(MULTI_CONTENTS, slug)) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const content = MULTI_CONTENTS[slug];
  const src = raw as Record<string, unknown>;
  const mode = content.modes.find((m) => m.value === src.mode) ?? content.modes[0];
  const controls = controlsOf(mode);

  const out: Params = {};
  const keys = new Set([...Object.keys(mode.defaults), ...controls.keys()]);
  for (const key of keys) {
    if (!Object.hasOwn(src, key)) continue;
    const def = mode.defaults[key];
    const ctl = controls.get(key);
    const v = ctl ? byControl(ctl, src[key], def) : sameShape(def, src[key]);
    if (v !== undefined) out[key] = v as ParamValue;
  }
  out.mode = mode.value;
  return out;
}
