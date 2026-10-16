import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMemberClaims } from "@/lib/auth/member";

// OAuth のコード交換用コールバック
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // オープンリダイレクト対策: 同一オリジンの相対パスのみ許可
  const nextRaw = searchParams.get("next") ?? "/";
  const next =
    nextRaw.startsWith("/") &&
    !nextRaw.startsWith("//") &&
    !nextRaw.startsWith("/\\")
      ? nextRaw
      : "/";

  if (!code) {
    // Auth Hook（hook_before_user_created）が登録を拒否した場合は error_description に理由が入る
    const desc = searchParams.get("error_description") ?? "";
    const reason = desc.includes("moff.jp") ? "domain" : "auth";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);

  // 許可ドメイン外はセッションを破棄して戻す
  const { data } = await supabase.auth.getClaims();
  if (!isMemberClaims(data?.claims)) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
