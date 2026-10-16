import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EXCHANGE_FORMAT, EXCHANGE_VERSION, parseExchangeJson, toExchangeJson } from "./exchange";
import { MULTI_CONTENTS } from "./registry";
import { sanitizeParams } from "./sanitize";
import type { Control } from "./types";

const HEX = MULTI_CONTENTS["hex-liquid"];
const GLASS = HEX.modes.find((m) => m.value === "liquid-glass")!;

function firstControl(t: Control[2]) {
  for (const mode of HEX.modes)
    for (const [, cs] of mode.controls)
      for (const c of cs) if (c[2] === t) return { mode, c };
  throw new Error(`no ${t} control`);
}

test("round-trips a valid record", () => {
  const params = { ...GLASS.defaults, mode: GLASS.value };
  const json = toExchangeJson({ slug: "hex-liquid", name: "logo", grp: "HR", description: "d", tags: ["a"], params });
  const rec = parseExchangeJson(json);
  assert.equal(rec.slug, "hex-liquid");
  assert.equal(rec.grp, "HR");
  assert.deepEqual(rec.params, params);
});

test("rejects foreign format, unknown slug and oversize", () => {
  assert.throws(() => parseExchangeJson("{}"), /moff_Atlus/);
  assert.throws(() => parseExchangeJson("not json"), /JSON/);
  const base = { format: EXCHANGE_FORMAT, version: EXCHANGE_VERSION, name: "x", params: {} };
  assert.throws(() => parseExchangeJson(JSON.stringify({ ...base, slug: "constructor" })), /未対応/);
  assert.throws(() => parseExchangeJson(JSON.stringify({ ...base, slug: "__proto__" })), /未対応/);
  assert.throws(() => parseExchangeJson(" ".repeat(1024 * 1024 + 1)), /大きすぎ/);
});

test("drops unknown keys and prototype pollution keys", () => {
  const raw = JSON.parse(`{"mode":"liquid-glass","__proto__":{"polluted":1},"evil":"<script>"}`);
  const out = sanitizeParams("hex-liquid", raw)!;
  assert.equal(Object.hasOwn(out, "evil"), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
});

test("enforces control types and ranges", () => {
  const { mode: rMode, c: r } = firstControl("r");
  if (r[2] !== "r") throw new Error();
  const big = sanitizeParams("hex-liquid", { mode: rMode.value, [r[0]]: 1e12 })!;
  assert.equal(big[r[0]], r[4]);
  const nan = sanitizeParams("hex-liquid", { mode: rMode.value, [r[0]]: "1; alert(1)" })!;
  assert.equal(Object.hasOwn(nan, r[0]), false);

  const { mode: kMode, c: k } = firstControl("k");
  const color = sanitizeParams("hex-liquid", { mode: kMode.value, [k[0]]: '#fff" onload="alert(1)' })!;
  assert.equal(Object.hasOwn(color, k[0]), false);
  const ok = sanitizeParams("hex-liquid", { mode: kMode.value, [k[0]]: "#12ab34" })!;
  assert.equal(ok[k[0]], "#12ab34");
});

test("array params must keep the default shape", () => {
  const circles = GLASS.defaults.circles as Record<string, unknown>[];
  const good = sanitizeParams("hex-liquid", { mode: "liquid-glass", circles });
  assert.deepEqual(good!.circles, circles);
  const injected = circles.map((c, i) => (i === 0 ? { ...c, col: '"><script>alert(1)</script>' } : c));
  assert.equal(Object.hasOwn(sanitizeParams("hex-liquid", { mode: "liquid-glass", circles: injected })!, "circles"), false);
  const short = sanitizeParams("hex-liquid", { mode: "liquid-glass", circles: circles.slice(1) })!;
  assert.equal(Object.hasOwn(short, "circles"), false);
});

test("unknown mode falls back to the first mode", () => {
  const out = sanitizeParams("hex-liquid", { mode: "nope" })!;
  assert.equal(out.mode, HEX.modes[0].value);
});
