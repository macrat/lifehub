# Vercel（Hobby）。git_repository は設定せず、デプロイは GitHub Actions が行う。

resource "vercel_project" "lifehub" {
  name      = "lifehub"
  framework = "vite"

  # VERCEL / VERCEL_ENV / VERCEL_URL などのシステム環境変数は、この設定を有効にしないと
  # ビルドにも関数にも渡らない。DB ドライバの切替（server/lib/db.ts）、通知予約を本番だけに
  # 絞る判定（server/lib/qstash.ts）、Preview で信頼するホスト（server/lib/auth.ts）、
  # 本番で必須の環境変数の検査（server/lib/env.ts）が依存する。
  automatically_expose_system_environment_variables = true

  build_command    = "pnpm build"
  install_command  = "pnpm install --frozen-lockfile"
  output_directory = "dist"

  # 関数は Neon（infra/neon.tf の aws-ap-southeast-1）と同じシンガポールで動かす。
  # HTTP ドライバは問い合わせ 1 回が DB との往復 1 回なので（server/lib/db/client.ts）、要求 1 回に
  # 1 度だけ払う利用者との往復よりも、問い合わせの数だけ払う DB との往復を縮めるほうが効く。
  # WHY NOT hnd1（東京）: 利用者との往復は縮むが、DB との往復（東京 ↔ シンガポール）を問い合わせの数だけ払う。
  # WHY NOT Neon を東京へ: Neon に日本の地域が無い。
  # WHY NOT vercel.json の regions: 地域はプロジェクトの設定で、ほかの設定と同じく Terraform に持つ。
  resource_config = {
    function_default_regions = ["sin1"]
  }

  # Preview URL を Vercel 認証で保護する
  vercel_authentication = {
    deployment_type = "standard_protection_new"
  }
}

resource "vercel_project_domain" "lifehub" {
  project_id = vercel_project.lifehub.id
  domain     = var.domain
}

locals {
  # 本番の秘密情報は Preview のビルドや実行環境に渡さない。
  env_vars = {
    DATABASE_URL               = local.database_url
    BETTER_AUTH_SECRET         = random_password.better_auth_secret.result
    CRON_SECRET                = random_password.cron_secret.result
    QSTASH_TOKEN               = var.qstash_token
    QSTASH_CURRENT_SIGNING_KEY = var.qstash_current_signing_key
    QSTASH_NEXT_SIGNING_KEY    = var.qstash_next_signing_key
    VAPID_PUBLIC_KEY           = var.vapid_public_key
    VAPID_PRIVATE_KEY          = var.vapid_private_key
    VAPID_SUBJECT              = var.vapid_subject
  }
}

resource "vercel_project_environment_variable" "shared" {
  for_each = local.env_vars

  project_id = vercel_project.lifehub.id
  key        = each.key
  value      = each.value
  target     = ["production"]
  sensitive  = true
}

# 本番だけは公開 URL を独自ドメインに固定する（Preview は VERCEL_URL から導出する）。
resource "vercel_project_environment_variable" "base_url" {
  project_id = vercel_project.lifehub.id
  key        = "APP_URL"
  value      = "https://${var.domain}"
  target     = ["production"]
  sensitive  = false
}

# Preview の DATABASE_URL は CI が PR ごとの接続先をデプロイ時に渡す。
resource "vercel_project_environment_variable" "preview_auth_secret" {
  # 同じキーの Preview 設定が重複しないよう、共有設定からの切り離しを先に行う。
  depends_on = [vercel_project_environment_variable.shared["BETTER_AUTH_SECRET"]]

  project_id = vercel_project.lifehub.id
  key        = "BETTER_AUTH_SECRET"
  value      = random_password.preview_auth_secret.result
  target     = ["preview"]
  sensitive  = true
}

# Sentry の DSN。サーバーは実行時に、ブラウザはビルド時に（vite.config.ts が埋め込む）読む。
# ビルドは CI の `vercel build` で行い、そこへは `vercel pull` が落とした値しか渡らない。sensitive な値は
# pull で読めないので、sensitive にしない（DSN は送り先を示すだけで、ブラウザに配る前提の公開値）。
# Preview には渡さない（Preview のエラーで本番の枠を使わない）。
resource "vercel_project_environment_variable" "sentry_dsn" {
  project_id = vercel_project.lifehub.id
  key        = "SENTRY_DSN"
  value      = local.sentry_dsn
  target     = ["production"]
  sensitive  = false
}
