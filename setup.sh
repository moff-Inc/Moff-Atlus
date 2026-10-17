#!/usr/bin/env bash
# 環境0（未構築の macOS）から、コピペのみでサーバーを起動する一括セットアップ。
# 使い方: プロジェクトフォルダ内で   bash setup.sh
# 実行内容: Homebrew/Node/Docker を導入 → Docker起動 → npm install →
#           ローカルSupabase起動 → 環境変数作成 → http://localhost:8787 で起動。
set -uo pipefail
cd "$(dirname "$0")"
say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }

# --- Homebrew ---
if ! command -v brew >/dev/null 2>&1; then
  say "Homebrew をインストール"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"

# --- Node ---
command -v node >/dev/null 2>&1 || { say "Node をインストール"; brew install node; }

# --- Docker Desktop ---
if ! command -v docker >/dev/null 2>&1; then say "Docker Desktop をインストール"; brew install --cask docker; fi

say "Docker を起動して待機（初回はライセンス同意のGUIが出る場合あり）"
open -a Docker >/dev/null 2>&1 || true
for _ in $(seq 1 150); do docker info >/dev/null 2>&1 && break; sleep 2; done
if ! docker info >/dev/null 2>&1; then
  echo "Docker が起動しませんでした。Docker Desktop を手動で起動し、再度 bash setup.sh を実行してください。"
  exit 1
fi

say "依存パッケージをインストール"
[ -d node_modules ] || npm install

# Google OAuth（唯一のログイン手段）の Client ID / Secret。gitignore 済みの .secrets.google から読む。
# 未作成でも起動はできるようプレースホルダを入れる（その場合ログインは不可。docs/google-auth-setup.md 参照）。
if [ -f .secrets.google ]; then
  # shellcheck disable=SC1091
  . ./.secrets.google
fi
if [ -z "${SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:-}" ] || [ -z "${SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:-}" ]; then
  echo "⚠ .secrets.google が無いため Google ログインは使えません（docs/google-auth-setup.md の手順2）"
  export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="${SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:-unset}"
  export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="${SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:-unset}"
fi

say "ローカル Supabase を起動（初回はイメージ取得で数分）"
npx --yes supabase start >/dev/null 2>&1 || npx --yes supabase start || true

# 既存データを保持したまま、未適用のマイグレーションだけ当てる（db reset は使わない）。
# 初回は start 時に全適用済みのため no-op。pull 後の再実行で新規分のみ反映される。
say "DBマイグレーションを適用（新規分のみ・既存データは保持）"
npx --yes supabase migration up 2>/dev/null || true

say "環境変数ファイルを作成（既にあればスキップ / 値は supabase status から自動取得）"
if [ ! -f .dev.vars ]; then
  STATUS="$(npx --yes supabase status 2>/dev/null || true)"
  API_URL="$(printf '%s' "$STATUS" | grep -oE 'http://(127\.0\.0\.1|localhost):54321' | head -1)"
  API_URL="${API_URL:-http://127.0.0.1:54321}"
  PUB_KEY="$(printf '%s' "$STATUS" | grep -oE 'sb_publishable_[A-Za-z0-9_-]+' | head -1)"
  [ -z "$PUB_KEY" ] && PUB_KEY="$(printf '%s' "$STATUS" | grep -oE 'eyJ[A-Za-z0-9._-]+' | head -1)"
  cat > .dev.vars <<EOF
NEXTJS_ENV=development
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUB_KEY
EOF
fi
[ -f .env.local ] || cp .dev.vars .env.local

say "サーバー起動中… 準備でき次第ブラウザを開きます（http://localhost:8787）"
( for _ in $(seq 1 180); do
    curl -sf -o /dev/null "http://localhost:8787/login" && { open "http://localhost:8787" || true; break; }
    sleep 2
  done ) &

npm run preview
