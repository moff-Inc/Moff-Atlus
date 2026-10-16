# moff_Atlus 移行プラン（一時ファイル：本変更 FIX 後に削除）

## ゴール
SVG エディタを撤去し、ジェネレーターで作った制作物を部門フォルダで共有・検索し、JSON でやり取りできるチームライブラリ「moff_Atlus」にする。

## 確定事項
- 管理者: **ロール方式**（`profiles.role`。最初の管理者は env `ADMIN_EMAILS` で指定する）
- インポート: **ジェネレーター制作物の JSON の書き出しと読み込み**（SVG/HTML ファイルの取り込みはしない）
- SVG を読み込んで編集する機能は **削除**
- ログインは **@moff.jp のみ**。制作物は **ログインした全員が閲覧可能**、編集・削除は作成者と管理者だけ

## 前提（現状コード）
- Google OAuth は実装済み。メール/パスワード認証と併存している
- `generators`（slug, name, params JSONB）が制作物の実体。RLS は本人のみ

---

## Phase 0. リネーム
- `gh repo rename moff_Atlus`（`moff-Inc/moff_Atlus`。旧 URL は自動リダイレクトされる）。あわせて `git remote set-url` とローカルディレクトリ名の変更
- `package.json` の name、`wrangler.jsonc` の name（Worker 名が変わる＝URL も変わる）、UI のブランド表記、README / 仕様.md / docs の表記

## Phase 1. 認証を Google のみにする
- `/login` からメール/パスワードのフォームと新規登録を削除する
- `config.toml`: email の signup を無効にする
- `/auth/callback`: コード交換の後、メールが `@moff.jp` でなければ signOut して `/login?error=domain` に戻す。`signInWithOAuth` に `queryParams: { hd: "moff.jp" }` を付け、Google のアカウント選択画面でも moff.jp を優先させる
- RLS 側でも同じ制限をかける（`auth.jwt()->>'email' like '%@moff.jp'`）。クライアントを経由されても他ドメインは弾かれる
- docs/google-auth-setup.md を更新する（同意画面を Internal にすることを推奨）

## Phase 2. SVG エディタの撤去
- 削除するもの: `src/app/editor/`、`EditorClient` / `SvgCanvas` / `PropertyPanel` / `SaveStatus` / `UploadButton` / `DocumentList`、`src/lib/svg/` のうちジェネレーターが使っていないもの（`exportVideo` などは依存を確認してから判断）、不要になった `dompurify`
- DB: migration で `documents` テーブルと `svgs` バケットを drop する。**実行前に `npm run db:backup` でバックアップを取る**

## Phase 3. グループ（フォルダ）
- `generators` に列を追加する: `grp text not null default 'CD' check (grp in ('HR','CD','DS','AX','ID'))`（既定値は要確認）、`description text`、`tags text[]`
- 「ALL」は全グループを横断して表示する画面（保存先ではない）
- ダッシュボード `/?group=HR`: 左側にフォルダ列（ALL・HR・CD・DS・AX・ID）と件数、カードに作成者を表示する
- 保存時と編集時にグループを選べるようにする（ControlsPanel の保存 UI）
- RLS を変更する: select は moff.jp の全員、update/delete は作成者または管理者

## Phase 4. JSON の書き出しと読み込み
- 書き出しの形式: `{ "format": "moff-atlus/generator", "version": 1, "slug", "name", "grp", "description", "tags", "params" }`
- 書き出し: 生成画面とカードの「JSON 書き出し」から `.json` をダウンロードする
- 読み込み: ダッシュボードの「インポート」から `.json` を選ぶ → 検証する（format/version、slug が `contents`/`registry` に存在するか、params がオブジェクトか、サイズ上限 1MB 程度）→ 自分の制作物として新規作成する（グループは JSON の値を初期値にして選び直せる）→ `/generate/[slug]?id=` へ移動する
- 他の人の制作物は「複製して編集」もできるようにする（JSON を経由しない共有手段。閲覧可能な RLS があれば実装は小さい）

## Phase 5. 管理者
- `profiles(id → auth.users, email, role 'member'|'admin')`。ログイン時にトリガーで行を自動作成し、`ADMIN_EMAILS` に含まれるメールは admin にする
- `is_admin()` 関数（security definer）を RLS から参照する
- `/admin`（admin 以外は 404）: ユーザー一覧とロールの付与・剥奪、全制作物の削除・グループ移動

## Phase 6. 検索（あいまい一致）
- `pg_trgm` を有効にし、`name` / `description` / タグ文字列に GIN trigram インデックスを張る
- RPC `search_generators(q text, grp text default null)`
  - 条件: `ilike '%q%'` または `word_similarity(q, 対象) > 0.3`（誤字や表記ゆれを拾う）
  - 並び順: 完全一致・部分一致を先、その後に類似度の降順
  - `grp` が null なら全体、指定があればそのグループ内
- UI: 検索ボックスと範囲切替（全体 / 現在のグループ）。300ms のデバウンス後に URL の `?q=&scope=` に反映する
- 日本語の短い語（2文字以下）は trigram が効かないため、`ilike` で補う

## 検証（完了条件）
- `npm run lint` / `npm run build` / `npm run build:cf` が通る。既存の `*.test.ts` も通る
- ローカルの Supabase で次を確認する: moff.jp 以外は拒否される → 制作物を保存（HR）→ JSON 書き出し → 別ユーザーで読み込みと閲覧ができ、他人の制作物は削除できない → 誤字入りのあいまい検索で見つかる → 全体とグループで結果が変わる → 管理者は削除できる
- 画面のスクリーンショットで確認する

## 実施順・コミット単位
ブランチ `feat/moff-atlus`。Phase 0（コード内の表記のみ。GitHub のリネームは最後に実施）→ 1 → 2 → 3 → 5 → 4 → 6。Phase ごとにコミットして PR を出し、マージ後に PLAN.md を削除する。
