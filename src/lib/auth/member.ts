// ログインを許可するのは moff.jp の Google アカウントのみ。
// DB 側も同条件を public.is_member() で RLS 強制している（こちらは UX 用の一次判定）。
export const ALLOWED_DOMAIN = "moff.jp";

type Claims = {
  email?: unknown;
  amr?: unknown;
  app_metadata?: { providers?: unknown };
} | null | undefined;

export function isMemberClaims(claims: Claims): boolean {
  if (!claims) return false;
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
  const providers = Array.isArray(claims.app_metadata?.providers) ? claims.app_metadata.providers : [];
  if (!providers.includes("google")) return false;
  // 同メールで事前登録されたパスワードでのログインを通さない: セッションが OAuth 由来であること
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  return amr.some((m) => (m as { method?: unknown } | null)?.method === "oauth");
}
