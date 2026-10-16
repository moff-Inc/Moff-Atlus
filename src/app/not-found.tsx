import Link from "next/link";
import "./home.css";

// 存在しないページ・制作物（notFound()）の共通画面。どこからでもホームへ戻れるようにする。
export default function NotFound() {
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
        <p className="auth-sub">ページが見つかりません（削除された制作物か、URL が誤っている可能性があります）</p>
        <Link href="/" className="home-btn home-btn-primary auth-google">
          ← ホームに戻る
        </Link>
      </div>
    </div>
  );
}
