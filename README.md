# SVG Property Editor

SVGを読み込み、要素をクリックで選択してプロパティ（塗り／線／不透明度／変形／アニメーション）を編集し、**自動保存**するWebアプリ。

- **Next.js 16 (App Router, TypeScript)** — Turbopack
- **Supabase** — 認証・Postgres・Storage（すべてマルチユーザー、RLSで分離）
- **Cloudflare Workers** — `@opennextjs/cloudflare` でデプロイ（配線済み）

## 仕組み（設計の要点）

- **インポート時に各SVG要素へ安定ID `data-eid` を自動採番**（DOMPurifyでサニタイズ）。これが「動的プロパティの自動付与」の実体。
- 保存は **二層**: 正規化した基底SVGを **Supabase Storage**（private + 署名URL）に、要素ごとの編集差分を **`documents.edits` (JSONB)** に。自動保存は小さなJSONのupsertのみで軽量。
- 描画は基底SVGに差分を適用。エクスポートはDOMを直列化（`data-eid`除去＋アニメkeyframes埋込）。
- SVGのparse/serializeは**クライアント限定**（Workersランタイムの制約回避）。

## 必要環境

- Node.js は `.node-version` に記載したバージョンを使用（開発・CI共通）。`package.json` の `engines.node` も同時に更新する。
- Docker Desktop（ローカルSupabase用）

## Node.js / Next.js の更新

- GitHub Actions の `Update Node.js and Next.js` が毎日 07:23（日本時間）に最新安定版を確認する。GitHub側の混雑で開始が遅れることがある。
- Node.js は公式配布一覧の最新安定版（Current、メジャー更新を含む）、Next.js は npm の `latest` を追跡する。`eslint-config-next` は Next.js と同一バージョン、`@types/node` は Node.js と同一メジャーに揃える。
- 変更がある場合、`npm ci` → lint → 型チェック → Cloudflare向け本番ビルドが成功したコミットだけ更新PRを作成し、mainへsquash mergeする。失敗時や検証中にmainが変更された場合は自動マージしない。
- 外部サービスや追加のトークンは不要。GitHub Actions のリポジトリ設定でPR作成を許可する必要がある。ブランチ保護ルールがある場合はそのルールも満たす必要がある。
- この仕組みはリポジトリとCIを更新する。Mac本体のNode.js更新や、本番環境へのデプロイは行わない。pull後は手元のバージョン管理ツールで `.node-version` のバージョンをインストール・選択し、`npm ci` を実行する。
- Supabaseの公開ダミー値でコンパイルを検証する。ログイン・DB接続など、本番サービスを使う動作テストは含まない。

手動で確認・更新する場合:

```bash
node --version
npm run update:runtime
# .node-version が変わった場合は、先にそのNode.jsへ切り替える
npm ci
npm run verify
```

GitHub の Actions 画面から `Update Node.js and Next.js` → `Run workflow` でも実行できる。

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

> ローカルは `enable_confirmations=false`（`supabase/config.toml`）のため、メール確認なしでサインアップ即ログインできる。Studio: http://127.0.0.1:54323 / メール確認UI(Mailpit): http://127.0.0.1:54324

### DBスキーマ / 型

- スキーマは `supabase/migrations/` にあり、`supabase start` / `supabase db reset` で適用。
- 型再生成: `npx supabase gen types typescript --local > src/lib/types/database.types.ts`

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

本番の秘密は `.dev.vars`（ローカルpreview用）と `wrangler secret put`（本番）で設定する。
Supabase は本番プロジェクトのURL/publishableキーに差し替える。

## 主要ディレクトリ

```
src/
  middleware.ts               # 認証保護（Supabaseセッション更新, getClaims）
  app/
    page.tsx                  # ダッシュボード（文書一覧＋アップロード）
    login/page.tsx            # ログイン/新規登録
    auth/callback/route.ts    # コード交換コールバック
    editor/[id]/page.tsx      # エディタ（基底SVGをStorageから取得）
  components/                 # SvgCanvas / PropertyPanel / EditorClient / ...
  lib/
    supabase/{client,server,middleware}.ts   # @supabase/ssr
    svg/{normalize,apply,serialize,animations}.ts
    hooks/useAutoSave.ts
supabase/migrations/          # documents テーブル + RLS + Storageポリシー
```
