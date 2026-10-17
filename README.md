# moff_Atlus

部門ごとのフォルダ（HR / CD / DS / AX / ID）で制作物を共有・検索するチームライブラリ。
テンプレート（ジェネレーター）で作った制作物を保存し、JSON で他のメンバーと受け渡しできる。

- **Next.js 16 (App Router, TypeScript)** — Turbopack
- **Supabase** — 認証（Google OAuth のみ）・Postgres（RLS で権限を強制）
- **Cloudflare Workers** — `@opennextjs/cloudflare` でデプロイ（配線済み）

## 仕組み（設計の要点）

- **ログインは @moff.jp の Google アカウントのみ。** 判定は DB の `public.is_member()` が正で、
  Google identity（`auth.identities`）の email が moff.jp かつセッションが OAuth 由来（JWT `amr`）であることを見る。
  middleware / `/auth/callback` / Auth Hook（`hook_before_user_created`）は UX と多重防御のための一次判定。
- **共有ライブラリ:** `generators` はメンバー全員が閲覧可。更新・削除は作成者と管理者のみ（RLS）。
  `user_id` と日時はクライアントから書き換え不可（列単位の grant）。他人の制作物を保存すると自分の複製になる。
- **グループ:** `generators.grp`（HR / CD / DS / AX / ID、既定 CD）。ALL は全グループの横断表示で、保存先ではない。
- **JSON 受け渡し:** 形式は `{ format: "moff-atlus/generator", version: 1, slug, name, grp, description, tags, params }`
  （`src/lib/identity/exchange.ts`）。読み込み時は表示中のフォルダ（ALL なら JSON の grp）へ自分の制作物として保存する。
- **他人の params は信頼しない:** DB・JSON 由来の params はレンダラへ渡す前に `sanitizeParams`
  （`src/lib/identity/sanitize.ts`）でモード定義の defaults / controls / presets をホワイトリストに再構成する。
- **あいまい検索:** RPC `search_generators(q, grp_filter)`。名前・説明・タグ・slug を NFKC＋小文字＋カタカナ→ひらがなで正規化し、
  部分一致 → `pg_trgm` の `word_similarity ≥ 0.3` の順に並べる。範囲は全体 / 表示中のグループ。
- **管理者:** `profiles.role = 'admin'`。初期管理者は `public.admin_bootstrap`（migration で `asai@moff.jp`）。
  ロール変更は `/admin` → RPC `admin_set_role` のみ（最後の管理者は降格不可）。

## 必要環境

- Node.js 22+（開発は Node 26 で確認）
- Docker Desktop（ローカルSupabase用）

## セットアップ（ローカル）

```bash
# 1) 依存インストール
npm install

# 2) ローカルSupabaseを起動（Docker必須）
npx supabase start
#   → 出力の API URL / PUBLISHABLE_KEY を控える

# 3) 環境変数ファイルを作成（下記参照）
#    .env.local を手動で作成

# 4) 開発サーバ
npm run dev   # http://localhost:3000
```

### `.env.local`

`npx supabase start` の出力値を使う（ローカル既定値は毎回同じ）:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<supabase start が表示する PUBLISHABLE_KEY>
```

> ログインには GCP の OAuth クライアントが必要（手順: [docs/google-auth-setup.md](docs/google-auth-setup.md)）。
> `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` を export してから `npx supabase start` する。
> Studio: http://127.0.0.1:54323

### DBスキーマ / 型

- スキーマは `supabase/migrations/` にあり、`supabase start` / `supabase db reset` で適用。
- 型再生成: `npx supabase gen types typescript --local > src/lib/types/database.types.ts`
- テスト: `node --import jiti/register --test src/lib/identity/*.test.ts`

## Cloudflare Workers へのデプロイ

ホスティングは `@opennextjs/cloudflare`（設定は配線済み: `open-next.config.ts` / `wrangler.jsonc`）。

```bash
# Workers向けビルド（.open-next/worker.js を生成）
npx opennextjs-cloudflare build

# ローカルでWorkersランタイム(workerd)確認
npm run preview

# デプロイ（要 Cloudflare アカウント / wrangler login）
npm run deploy
```

### 本番環境

| 項目 | 値 |
|---|---|
| アプリ | https://moff-atlus.moff-atlus.workers.dev |
| Supabase | プロジェクト `jsphlaguthpilhdiakrm`（東京 / ap-northeast-1） |

- **メンバーは URL を開いて @moff.jp の Google アカウントでログインするだけ**（環境構築は不要）。
- DB 変更: `npx supabase db push`（`supabase link --project-ref jsphlaguthpilhdiakrm` 済みであること）
- Auth 設定: `supabase/config.toml` の `[remotes.production]` を編集し、
  `source .secrets.google && npx supabase config diff` で確認 → `npx supabase config push`
- デプロイ（`NEXT_PUBLIC_*` はビルド時に埋め込まれるため、本番の値を環境変数で渡す）:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://jsphlaguthpilhdiakrm.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Dashboard → Settings → API Keys の publishable key> \
npm run deploy
```

## 主要ディレクトリ

```
src/
  middleware.ts               # 認証保護（Supabaseセッション更新, getClaims → isMemberClaims）
  app/
    page.tsx                  # ライブラリ（フォルダ・検索・JSONインポート）
    admin/page.tsx            # 管理者: ユーザーとロール
    login/page.tsx            # Google ログイン
    auth/callback/route.ts    # コード交換 + ドメイン判定
    generate/                 # テンプレート一覧 / ジェネレーター
  components/                 # GeneratorList / SearchBar / ImportButton / AdminUsers / generate/*
  lib/
    auth/member.ts            # moff.jp 判定（UX 用の一次判定）
    identity/                 # レンダラ, sanitize, exchange(JSON), groups, persist
    supabase/{client,server,middleware}.ts   # @supabase/ssr
supabase/migrations/          # generators / profiles / RLS / 検索 RPC / Auth Hook
```
