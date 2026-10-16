import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { GENERATE_CONTENTS } from "@/lib/identity/contents";
import "../home.css";

export default function GeneratePickerPage() {
  return (
    <div className="home">
      <header className="home-topbar">
        <Link href="/" className="home-brand">
          <span className="home-brand-mark">
            <i />
            <i />
            <i />
          </span>
          MOFF_ATLUS
        </Link>
        <div className="home-top-actions">
          <SignOutButton />
        </div>
      </header>

      <main className="home-main">
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <div className="home-eyebrow">TEMPLATE</div>
              <h2>テンプレ</h2>
            </div>
            <span className="home-count">{GENERATE_CONTENTS.length} CONTENTS</span>
          </div>
          <div className="home-grid">
            {GENERATE_CONTENTS.map((c) => (
              <Link
                key={c.slug}
                href={`/generate/${c.slug}`}
                className="home-card"
              >
                <div>
                  <div className="home-card-tag">{c.no}</div>
                  <div className="home-card-title">{c.title}</div>
                  <p className="home-card-desc">{c.blurb}</p>
                </div>
                <span className="home-card-cta">SVG / MP4 / PNG で書き出し →</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
