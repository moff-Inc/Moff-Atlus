# Google ログイン セットアップ手順

**ログイン手段は Google のみ**（メール/パスワードは無効）で、**@moff.jp のアカウントだけ**が使える。
アプリ側の実装（ログイン画面、`/auth/callback`、`supabase/config.toml` の `[auth.external.google]` と
`[auth.hook.before_user_created]`）は導入済み。あとは **GCP で OAuth クライアントを申請** し、
**Client ID / Secret を Supabase に渡す** だけで動く。

moff.jp 以外を弾く仕組み（多重）:
- ログイン画面が Google に `hd=moff.jp` を渡す（アカウント選択のヒント。強制力はない）
- Auth Hook `public.hook_before_user_created` が moff.jp 以外のユーザー作成を拒否
- `/auth/callback` と middleware がドメイン外のセッションを破棄
- **DB の RLS（`public.is_member()`）が最終判定**: Google identity の email が moff.jp かつセッションが OAuth 由来であること

## 認証の流れ（誰がどこへ飛ぶか）

```
アプリ /login
  → [Googleでログイン] クリック
  → Supabase authorize (…/auth/v1/authorize?provider=google)
  → Google 同意画面
  → GCP に登録した「承認済みリダイレクトURI」= Supabase の callback
        ローカル: http://127.0.0.1:54321/auth/v1/callback
  → Supabase がセッション発行
  → アプリの redirectTo = <アプリ>/auth/callback?code=… （このURLは Supabase の許可リストに必要）
  → /auth/callback がコード交換しログイン完了
```

ポイントは2つの URL:
- **GCP に登録するのは Supabase の callback**（`…supabase…/auth/v1/callback`）
- **Supabase の許可リストに登録するのはアプリの URL**（`<アプリ>/auth/callback`、config.toml で対応済み）

---

## 手順1: GCP で OAuth を申請

1. https://console.cloud.google.com/ でプロジェクトを作成/選択。
2. **APIs & Services → OAuth consent screen**（新UIでは「Google Auth Platform」）
   - **User Type**: **Internal を推奨**（moff.jp の Google Workspace アカウントだけが同意画面を通れる。
     Google 側で組織外アカウントを確実に弾ける）。External にする場合もアプリ側で moff.jp 以外は拒否される。
   - アプリ名・ユーザーサポートメール・デベロッパー連絡先を入力。
   - **スコープ**: 追加不要（`email` / `profile` / `openid` の既定のみ）。→ 機微スコープを使わないので **Google の審査(verification)は原則不要**。
   - External のままだと「テスト中」状態。**自分たちだけで試すなら「テストユーザー」に使うGoogleアカウントを追加**。一般公開するなら「アプリを公開(PUBLISH)」。
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - **Application type: Web application**
   - 名前: 任意（例 `Supabase Auth`）
   - **Authorized redirect URIs** に以下を追加:
     - ローカル開発: `http://127.0.0.1:54321/auth/v1/callback`
     - 本番でホスト版Supabaseを使う場合: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
       （`<PROJECT_REF>` はホスト版Supabaseの Dashboard 上部やProject URLに出る文字列）
   - 「Authorized JavaScript origins」は **不要**（トークン交換はSupabaseがサーバ側で行うため）。
4. 作成後に表示される **Client ID** と **Client secret** を控える。

> ⚠️ redirect URI は **完全一致**。末尾スラッシュやスキーム(http/https)違いでも弾かれる。

---

## 手順2: ローカルSupabase に Client ID / Secret を渡して再起動

`supabase/config.toml` は環境変数で受け取る設定済み。**同じシェルに export してから起動**する
（`npx supabase start` はシェルの環境変数を参照する）。

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="＜手順1のClient ID＞"
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="＜手順1のClient secret＞"

npx supabase stop && npx supabase start   # config.toml の変更反映に再起動が必要
```

> ⚠️ この2つの環境変数を **設定せずに再起動すると**、`enabled=true` かつ client_id 空で
> Supabase の起動に失敗する。準備前に再起動したい場合は config.toml の
> `[auth.external.google]` を一時的に `enabled = false` にする。

毎回 export したくない場合は、gitignore 済みファイルに書いて起動前に読み込む運用が安全:
```bash
echo 'export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...'  >> .secrets.google
echo 'export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...'     >> .secrets.google
source .secrets.google && npx supabase stop && npx supabase start
```
（`.secrets.google` は必ず .gitignore に追加）

---

## 手順3: ローカルで動作確認

```bash
npm run preview          # http://localhost:8787
```
`http://localhost:8787/login` →「Googleでログイン」→ Google 同意 → アプリに戻ってログイン完了。

- うまくいかない時のチェック:
  - `provider is not enabled` → 手順2の env 未設定 or 再起動漏れ。
  - `redirect_uri_mismatch`（Google側画面）→ 手順1のリダイレクトURIが `http://127.0.0.1:54321/auth/v1/callback` と完全一致か。
  - アプリに戻れない/URL拒否 → config.toml の `additional_redirect_urls` にアクセス中のオリジン（`http://localhost:8787/**` 等）が入っているか。

---

## 手順4: 本番（Cloudflare + ホスト版Supabase）※本番運用する場合のみ

本番Workerはローカル(127.0.0.1)のSupabaseに到達できないため、**本番はホスト版
Supabaseプロジェクトが前提**。

0. ホスト版 Supabase に migration を適用（`supabase db push` 等）し、Dashboard → **Authentication → Providers → Email** を
   **無効化**、**Authentication → Hooks → Before User Created** に Postgres 関数 `public.hook_before_user_created` を設定する
   （config.toml の設定はローカル専用で、ホスト版には反映されない）。
1. ホスト版 Supabase Dashboard → **Authentication → Providers → Google** を有効化し、
   手順1の **Client ID / Secret** を入力して保存。
   - この画面に表示される callback（`https://<PROJECT_REF>.supabase.co/auth/v1/callback`）を、
     手順1のGCPの Authorized redirect URIs にも追加しておく。
2. **Authentication → URL Configuration** で **Site URL** と **Redirect URLs** に
   本番アプリのドメイン（例 `https://＜本番ドメイン＞/**`）を登録。
3. Cloudflare（Worker）の環境変数 `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を **ホスト版Supabaseの値** に設定してデプロイ。

---

## まとめ：申請するもの / 秘密情報
| 何を | どこで取得 | どこに設定 |
|---|---|---|
| OAuth 同意画面 | GCP Console | GCP（申請のみ） |
| OAuth Client ID / Secret | GCP Console（Credentials） | ローカル=env / 本番=Supabase Dashboard |
| Supabase callback URL | 固定（ローカル127.0.0.1:54321 / 本番は各プロジェクト） | GCP の Authorized redirect URIs |
| アプリの redirect 許可 | 設定値 | config.toml（済） / 本番はDashboard |

---

## 補足: 既存アカウント・退職者の扱い

- 以前メール/パスワードで登録した @moff.jp ユーザーは、同じメールで初めて Google ログインした時点で
  Supabase が Google identity を連携し、そのまま（制作物・ロールを引き継いで）使える。
  連携前のパスワードではログインできない（Email プロバイダ無効 + RLS が OAuth セッションを要求）。
- 退職者などのアクセス停止は Supabase Dashboard → Authentication → Users でユーザーを削除する。
  Google 側でアカウントを停止しても、発行済みセッションはリフレッシュトークンで延命されるため。
