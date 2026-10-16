"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_DOMAIN } from "@/lib/auth/member";
import "../home.css";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

const ERRORS: Record<string, string> = {
  domain: `@${ALLOWED_DOMAIN} 以外のアカウントではログインできません。別の Google アカウントを選んでください`,
  auth: "ログインに失敗しました。もう一度お試しください",
};

function LoginForm() {
  const searchParams = useSearchParams();
  // オープンリダイレクト対策: 同一オリジンの相対パスのみ許可
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTo =
    rawRedirect.startsWith("/") &&
    !rawRedirect.startsWith("//") &&
    !rawRedirect.startsWith("/\\")
      ? rawRedirect
      : "/";

  const errorKey = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    errorKey ? (ERRORS[errorKey] ?? ERRORS.auth) : null,
  );
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  // 許可ドメイン外のセッションが残っていれば破棄（middleware は未認証扱いで通す）
  useEffect(() => {
    supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }, [supabase]);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    // 成功時はブラウザが Google へリダイレクトするので、以降の処理は callback 側で行う。
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        // Google のアカウント選択を組織ドメインに寄せる（強制は callback / RLS 側）
        queryParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="home-brand-mark">
            <i />
            <i />
            <i />
          </span>
          MOFF_ATLUS
        </div>
        <p className="auth-sub">@{ALLOWED_DOMAIN} の Google アカウントでログインしてください</p>

        {error && <p className="auth-error">{error}</p>}

        <button
          type="button"
          disabled={loading}
          onClick={handleGoogle}
          className="home-btn auth-google"
        >
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
              />
            </svg>
          {loading ? "処理中..." : "Googleでログイン"}
        </button>
      </div>
    </div>
  );
}
